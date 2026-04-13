const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')
const https = require('https')
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
 * Find the best YouTube match for a Spotify track using two strategies:
 *
 * 1. Topic channel scan (fast, flat-playlist): look for an "Artist - Topic"
 *    channel upload in the top 15 results — these are auto-generated official
 *    audio uploads and are always the correct studio recording.
 *
 * 2. Duration matching (if no Topic channel): fetch full metadata for the top
 *    10 results one-by-one and return the first whose duration is within ±8s
 *    of the Spotify track's known duration.
 *
 * @param {string} searchTerm       e.g. "All Things Break - Gravity"
 * @param {number} durationSeconds  Spotify track duration (0 = unknown)
 * @returns {Promise<string|null>}  YouTube URL or null (triggers fallback)
 */
function findBestYouTubeMatch(searchTerm, durationSeconds = 0) {
  const ytdlpPath = getBinaryPath('yt-dlp')
  ensureExecutable(ytdlpPath)

  // --- Phase 1: fast Topic channel scan ---
  const phase1 = new Promise((resolve) => {
    const args = ['--dump-json', '--flat-playlist', '--no-warnings', `ytsearch15:${searchTerm}`]
    console.log('[yt-match] phase 1: scanning for Topic channel:', searchTerm)
    const proc = spawn(ytdlpPath, args)
    let buf = ''
    let done = false

    const finish = (val) => { if (!done) { done = true; proc.kill(); resolve(val) } }

    proc.stdout.on('data', (d) => {
      buf += d.toString()
      const lines = buf.split('\n')
      buf = lines.pop()
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const e = JSON.parse(line)
          const ch = (e.channel || e.uploader || '').toLowerCase()
          if (ch.endsWith('- topic')) {
            console.log(`[yt-match] Topic channel found: "${e.channel}" → ${e.id}`)
            finish(`https://www.youtube.com/watch?v=${e.id}`)
            return
          }
        } catch (_) {}
      }
    })

    proc.on('close', () => finish(null))
    proc.on('error', () => finish(null))
    setTimeout(() => finish(null), 15000)
  })

  // --- Phase 2: duration matching (only if we have a known duration) ---
  const phase2 = durationSeconds > 0
    ? new Promise((resolve) => {
        const args = ['--dump-json', '--skip-download', '--no-warnings', '--no-playlist', `ytsearch10:${searchTerm}`]
        console.log(`[yt-match] phase 2: duration matching (target: ${durationSeconds}s)`)
        const proc = spawn(ytdlpPath, args)
        let buf = ''
        let done = false

        const finish = (val) => { if (!done) { done = true; proc.kill(); resolve(val) } }

        proc.stdout.on('data', (d) => {
          buf += d.toString()
          const lines = buf.split('\n')
          buf = lines.pop()
          for (const line of lines) {
            if (!line.trim()) continue
            try {
              const e = JSON.parse(line)
              const ytDuration = e.duration // seconds
              if (ytDuration && Math.abs(ytDuration - durationSeconds) <= 8) {
                console.log(`[yt-match] duration match: ${ytDuration}s ≈ ${durationSeconds}s → ${e.id} "${e.title}"`)
                finish(`https://www.youtube.com/watch?v=${e.id}`)
                return
              } else if (ytDuration) {
                console.log(`[yt-match] duration miss: ${ytDuration}s vs ${durationSeconds}s — "${e.title}"`)
              }
            } catch (_) {}
          }
        })

        proc.on('close', () => finish(null))
        proc.on('error', () => finish(null))
        setTimeout(() => finish(null), 30000)
      })
    : Promise.resolve(null)

  // Run phase 1 first; only run phase 2 if phase 1 found nothing
  return phase1.then((topicUrl) => topicUrl || phase2)
}

/**
 * Start a download using yt-dlp.
 * @param {{ id: string, url: string, quality: string, outputPath: string, onProgress: Function, onComplete: Function, onError: Function, isSearch?: boolean, searchTerm?: string }} opts
 */
function startDownload({ id, url, quality, outputPath, onProgress, onComplete, onError, isSearch = false, searchTerm = null, durationSeconds = 0, customFilename = null, thumbnailUrl = null, trackTitle = null, trackArtist = null }) {
  // For search-based downloads, find the best YouTube match first
  if (isSearch && searchTerm) {
    findBestYouTubeMatch(searchTerm, durationSeconds).then((matchUrl) => {
      _startDownload({ id, url: matchUrl || url, quality, outputPath, onProgress, onComplete, onError, isSearch: !matchUrl, customFilename, thumbnailUrl, trackTitle, trackArtist })
    })
    return
  }
  _startDownload({ id, url, quality, outputPath, onProgress, onComplete, onError, isSearch, customFilename, thumbnailUrl, trackTitle, trackArtist })
}

function _startDownload({ id, url, quality, outputPath, onProgress, onComplete, onError, isSearch = false, customFilename = null, thumbnailUrl = null, trackTitle = null, trackArtist = null }) {
  const ytdlpPath = getBinaryPath('yt-dlp')
  const ffmpegPath = getBinaryPath('ffmpeg')
  ensureExecutable(ytdlpPath)
  ensureExecutable(ffmpegPath)

  const qualityValue = QUALITY_MAP[quality] || '0'
  // Use custom filename (e.g. "Song - Artist") when provided, otherwise use YouTube title
  const filenameTemplate = customFilename ? `${customFilename}.%(ext)s` : '%(title)s.%(ext)s'
  const outputTemplate = path.join(outputPath, filenameTemplate)

  const args = [
    '--extract-audio',
    '--audio-format', 'mp3',
    '--audio-quality', qualityValue,
    '--ffmpeg-location', ffmpegPath,
    '--output', outputTemplate,
    '--newline',
    '--embed-thumbnail',   // embed cover art (YouTube thumbnail for YT/SC downloads)
    '--add-metadata',      // embed title/artist metadata tags
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
      // For Spotify downloads: replace the YouTube thumbnail with the real album art
      if (thumbnailUrl && customFilename) {
        const mp3Path = path.join(outputPath, `${customFilename}.mp3`)
        embedAlbumArt(mp3Path, thumbnailUrl, ffmpegPath, trackTitle, trackArtist)
          .then(() => onComplete({ id }))
          .catch((err) => {
            console.warn('[album-art] failed to embed, continuing anyway:', err.message)
            onComplete({ id })
          })
      } else {
        onComplete({ id })
      }
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
 * Download a URL to a local file path, following redirects.
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath)
    const get = (u) => {
      https.get(u, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return get(res.headers.location)
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`))
        res.pipe(file)
        file.on('finish', () => { file.close(); resolve() })
      }).on('error', reject)
    }
    get(url)
  })
}

/**
 * Embed album art + correct ID3 tags into an existing MP3 file using ffmpeg.
 * Replaces YouTube thumbnail and metadata with the real Spotify track info.
 */
function embedAlbumArt(mp3Path, thumbnailUrl, ffmpegPath, title = null, artist = null) {
  const tmpImg = path.join(os.tmpdir(), `wavdrop-art-${Date.now()}.jpg`)
  const tmpMp3 = path.join(os.tmpdir(), `wavdrop-mp3-${Date.now()}.mp3`)

  return downloadFile(thumbnailUrl, tmpImg)
    .then(() => new Promise((resolve, reject) => {
      console.log('[album-art] embedding Spotify art + metadata into:', mp3Path)
      const metadataArgs = []
      if (title)  metadataArgs.push('-metadata', `title=${title}`)
      if (artist) metadataArgs.push('-metadata', `artist=${artist}`)

      const proc = spawn(ffmpegPath, [
        '-i', mp3Path,
        '-i', tmpImg,
        '-map', '0:a',          // audio only from MP3
        '-map', '1:0',          // new cover image
        '-c:a', 'copy',         // don't re-encode audio
        '-id3v2_version', '3',  // ID3v2.3 — widest compatibility
        ...metadataArgs,
        '-metadata:s:v', 'title=Album cover',
        '-metadata:s:v', 'comment=Cover (front)',
        '-y', tmpMp3
      ])
      proc.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`ffmpeg exited with code ${code}`))
      })
      proc.on('error', reject)
    }))
    .then(() => {
      fs.renameSync(tmpMp3, mp3Path)
      console.log('[album-art] done')
    })
    .finally(() => {
      try { fs.unlinkSync(tmpImg) } catch (_) {}
      try { fs.unlinkSync(tmpMp3) } catch (_) {}
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
