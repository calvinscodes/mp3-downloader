const { app } = require('electron')
const path = require('path')
const { execFile, exec } = require('child_process')
const fs = require('fs')

/**
 * Detect which platform a URL belongs to.
 * @param {string} url
 * @returns {'youtube' | 'soundcloud' | 'spotify' | 'unknown'}
 */
function detectPlatform(url) {
  if (!url) return 'unknown'
  try {
    const u = new URL(url)
    const host = u.hostname.replace('www.', '')
    if (host === 'youtube.com' || host === 'youtu.be' || host === 'm.youtube.com') return 'youtube'
    if (host === 'soundcloud.com') return 'soundcloud'
    if (host === 'open.spotify.com') return 'spotify'
  } catch (_) {
    // not a valid URL
  }
  return 'unknown'
}

/**
 * Get the absolute path to a binary inside resources/.
 * Works both in dev and packaged builds.
 * @param {'yt-dlp' | 'ffmpeg' | 'spotdl'} name
 * @returns {string}
 */
function getBinaryPath(name) {
  if (name === 'spotdl') {
    // spotdl is a system install — try known locations including pip user installs
    const home = process.env.HOME || ''
    const candidates = [
      // python.org framework installs — prefer known-stable 3.12/3.13 over bleeding-edge 3.14
      ...['3.12', '3.13', '3.11', '3.10', '3.14'].map(
        (v) => `/Library/Frameworks/Python.framework/Versions/${v}/bin/spotdl`
      ),
      '/opt/homebrew/bin/spotdl',
      '/usr/local/bin/spotdl',
      path.join(home, '.local/bin/spotdl'),
      // macOS pip user install: ~/Library/Python/3.x/bin/ — stable first
      ...['3.12', '3.13', '3.11', '3.10', '3.14', '3.9'].map(
        (v) => path.join(home, `Library/Python/${v}/bin/spotdl`)
      )
    ]
    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) return candidate
      } catch (_) {}
    }
    return 'spotdl' // last resort: rely on PATH
  }

  const basePath = app.isPackaged
    ? process.resourcesPath
    : path.join(__dirname, '../resources')

  return path.join(basePath, name)
}

/**
 * Ensure bundled binaries are executable.
 * @param {string} binaryPath
 */
function ensureExecutable(binaryPath) {
  try {
    if (fs.existsSync(binaryPath)) {
      fs.chmodSync(binaryPath, '755')
    }
  } catch (_) {}
}

/**
 * Check availability of required dependencies.
 * @returns {Promise<{ ytdlp: boolean, ffmpeg: boolean, spotdl: boolean, python3: boolean }>}
 */
function checkDependencies() {
  const ytdlpPath = getBinaryPath('yt-dlp')
  const ffmpegPath = getBinaryPath('ffmpeg')

  const ytdlp = fs.existsSync(ytdlpPath)
  const ffmpeg = fs.existsSync(ffmpegPath)

  if (ytdlp) ensureExecutable(ytdlpPath)
  if (ffmpeg) ensureExecutable(ffmpegPath)

  const checkSpotdl = new Promise((resolve) => {
    // Reuse getBinaryPath which already knows all candidate locations
    const resolved = getBinaryPath('spotdl')
    if (resolved !== 'spotdl' && fs.existsSync(resolved)) {
      resolve(true)
      return
    }
    // Try running it via PATH as a last resort
    exec('spotdl --version', { timeout: 5000 }, (err) => {
      resolve(!err)
    })
  })

  const checkPython3 = new Promise((resolve) => {
    exec('python3 --version', { timeout: 5000 }, (err) => {
      resolve(!err)
    })
  })

  return Promise.all([checkSpotdl, checkPython3]).then(([spotdl, python3]) => ({
    ytdlp,
    ffmpeg,
    spotdl,
    python3
  }))
}

/**
 * Generate a short unique ID.
 * @returns {string}
 */
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

module.exports = { detectPlatform, getBinaryPath, ensureExecutable, checkDependencies, generateId }
