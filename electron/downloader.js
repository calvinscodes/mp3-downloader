const { spawn } = require('child_process')
const path = require('path')
const { getBinaryPath, ensureExecutable } = require('./utils')

// Map of active child processes keyed by download id
const activeProcesses = new Map()

/**
 * Quality label → yt-dlp audio quality value (VBR scale 0=best, 9=worst)
 */
const QUALITY_MAP = {
  best: '0',
  high: '2',
  medium: '5',
  low: '9'
}

/**
 * Fetch metadata for a URL without downloading.
 * @param {string} url
 * @returns {Promise<{ title: string, thumbnail: string, uploader: string, duration: string, platform: string }>}
 */
function fetchInfo(url) {
  return new Promise((resolve, reject) => {
    const ytdlpPath = getBinaryPath('yt-dlp')
    ensureExecutable(ytdlpPath)

    const args = [
      '--dump-json',
      '--no-download',
      '--no-playlist',
      url
    ]

    let stdout = ''
    let stderr = ''

    const proc = spawn(ytdlpPath, args)

    proc.stdout.on('data', (d) => { stdout += d.toString() })
    proc.stderr.on('data', (d) => { stderr += d.toString() })

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(stderr || `yt-dlp exited with code ${code}`))
      }
      try {
        // yt-dlp may output multiple JSON objects for playlists; take the first
        const firstLine = stdout.trim().split('\n')[0]
        const info = JSON.parse(firstLine)
        resolve({
          title: info.title || 'Unknown Title',
          thumbnail: info.thumbnail || null,
          uploader: info.uploader || info.channel || 'Unknown',
          duration: info.duration_string || formatDuration(info.duration),
          platform: detectPlatformFromInfo(url)
        })
      } catch (e) {
        reject(new Error('Failed to parse yt-dlp output'))
      }
    })

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn yt-dlp: ${err.message}`))
    })
  })
}

/**
 * Search for a Topic-channel upload (official studio audio) for a given search term.
 * YouTube auto-generates "Artist - Topic" channels that contain only official audio.
 * Returns a direct youtube.com URL if found, or null if not found.
 *
 * @param {string} searchTerm  e.g. "All Things Break - Gravity"
 * @returns {Promise<string|null>}
 */
function findTopicChannelVideo(searchTerm) {
  return new Promise((resolve) => {
    const ytdlpPath = getBinaryPath('yt-dlp')
    ensureExecutable(ytdlpPath)

    const args = [
      '--dump-json',
      '--flat-playlist',
      '--no-warnings',
      `ytsearch15:${searchTerm}`
    ]

    console.log('[topic-search] scanning 15 results for Topic channel:', searchTerm)

    const proc = spawn(ytdlpPath, args)
    let output = ''
    let resolved = false

    const done = (val) => {
      if (!resolved) { resolved = true; resolve(val) }
    }

    proc.stdout.on('data', (d) => {
      output += d.toString()
      // Parse line-by-line so we can resolve early on first match
      const lines = output.split('\n')
      output = lines.pop() // keep incomplete last line buffered
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const entry = JSON.parse(line)
          const channel = (entry.channel || entry.uploader || '').toLowerCase()
          if (channel.endsWith('- topic')) {
            console.log(`[topic-search] found: "${entry.channel}" → ${entry.id}`)
            proc.kill()
            done(`https://www.youtube.com/watch?v=${entry.id}`)
            return
          }
        } catch (_) {}
      }
    })

    proc.on('close', () => {
      console.log('[topic-search] no Topic channel found, using fallback search')
      done(null)
    })

    proc.on('error', () => done(null))

    // Safety timeout
    setTimeout(() => { proc.kill(); done(null) }, 20000)
  })
}

/**
 * Start a download using yt-dlp.
 * @param {{ id: string, url: string, quality: string, outputPath: string, onProgress: Function, onComplete: Function, onError: Function, isSearch?: boolean, searchTerm?: string }} opts
 */
function startDownload({ id, url, quality, outputPath, onProgress, onComplete, onError, isSearch = false, searchTerm = null }) {
  // For search-based downloads, first try to find the official Topic channel upload
  if (isSearch && searchTerm) {
    findTopicChannelVideo(searchTerm).then((topicUrl) => {
      _startDownload({ id, url: topicUrl || url, quality, outputPath, onProgress, onComplete, onError, isSearch: !topicUrl })
    })
    return
  }
  _startDownload({ id, url, quality, outputPath, onProgress, onComplete, onError, isSearch })
}

function _startDownload({ id, url, quality, outputPath, onProgress, onComplete, onError, isSearch = false }) {
  const ytdlpPath = getBinaryPath('yt-dlp')
  const ffmpegPath = getBinaryPath('ffmpeg')
  ensureExecutable(ytdlpPath)
  ensureExecutable(ffmpegPath)

  const qualityValue = QUALITY_MAP[quality] || '0'
  const outputTemplate = path.join(outputPath, '%(title)s.%(ext)s')

  const args = [
    '--extract-audio',
    '--audio-format', 'mp3',
    '--audio-quality', qualityValue,
    '--ffmpeg-location', ffmpegPath,
    '--output', outputTemplate,
    '--newline',
    // --no-playlist is only for direct URLs, not search queries
    ...(isSearch ? [] : ['--no-playlist']),
    url
  ]

  let stderr = ''
  let stdout = ''

  console.log('[yt-dlp] command:', ytdlpPath, args.join(' '))

  const proc = spawn(ytdlpPath, args)
  activeProcesses.set(id, proc)

  proc.stdout.on('data', (data) => {
    const text = data.toString()
    stdout += text
    const lines = text.split('\n')
    for (const line of lines) {
      if (!line.trim()) continue
      console.log('[yt-dlp stdout]', line)
      parseProgressLine(line, id, onProgress)
    }
  })

  proc.stderr.on('data', (data) => {
    const text = data.toString()
    stderr += text
    console.log('[yt-dlp stderr]', text.trim())
  })

  proc.on('close', (code) => {
    activeProcesses.delete(id)
    console.log('[yt-dlp] exit code:', code)
    if (code === 0) {
      onComplete({ id })
    } else {
      // Surface friendly messages for common errors
      const msg = buildErrorMessage(stderr, url)
      onError({ id, message: msg })
    }
  })

  proc.on('error', (err) => {
    activeProcesses.delete(id)
    onError({ id, message: `Failed to start download: ${err.message}` })
  })
}

/**
 * Cancel an active download.
 * @param {string} id
 */
function cancelDownload(id) {
  const proc = activeProcesses.get(id)
  if (proc) {
    proc.kill('SIGTERM')
    activeProcesses.delete(id)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a yt-dlp progress line and call onProgress if it contains percent info.
 * Example line: "[download]  45.3% of ~12.34MiB at  1.23MiB/s ETA 00:05"
 */
function parseProgressLine(line, id, onProgress) {
  if (!line.includes('%')) return

  const percentMatch = line.match(/([\d.]+)%/)
  const speedMatch = line.match(/at\s+([\d.]+\w+\/s)/)
  const etaMatch = line.match(/ETA\s+([\d:]+)/)

  if (percentMatch) {
    onProgress({
      id,
      percent: parseFloat(percentMatch[1]),
      speed: speedMatch ? speedMatch[1] : null,
      eta: etaMatch ? etaMatch[1] : null
    })
  }
}

function formatDuration(seconds) {
  if (!seconds) return ''
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function detectPlatformFromInfo(url) {
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube'
  if (url.includes('soundcloud.com')) return 'soundcloud'
  return 'unknown'
}

function buildErrorMessage(stderr, url) {
  if (stderr.includes('Private video') || stderr.includes('private track')) {
    return 'This track is private and cannot be downloaded.'
  }
  if (stderr.includes('Video unavailable') || stderr.includes('not available')) {
    return 'This content is unavailable or has been removed.'
  }
  if (stderr.includes('geo')) {
    return 'This content is geo-restricted in your region.'
  }
  if (url.includes('soundcloud.com') && stderr.includes('403')) {
    return 'SoundCloud: This track may be private or require login.'
  }
  return stderr.trim().split('\n').pop() || 'Download failed.'
}

module.exports = { fetchInfo, startDownload, cancelDownload }
