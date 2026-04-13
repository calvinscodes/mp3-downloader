const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron')
const path = require('path')
const fs = require('fs')
const https = require('https')

const { detectPlatform, checkDependencies } = require('./utils')
const { fetchInfo, startDownload, cancelDownload } = require('./downloader')
const { startSpotifyDownload, cancelSpotifyDownload, fetchSpotifyTrackInfo } = require('./spotdl')

// Persist settings in a simple JSON file
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json')

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'))
  } catch (_) {
    return {}
  }
}

function saveSettings(data) {
  try {
    const existing = loadSettings()
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify({ ...existing, ...data }, null, 2))
  } catch (_) {}
}

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 920,
    height: 660,
    minWidth: 780,
    minHeight: 550,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0e0e0e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // In dev: load Vite dev server; in prod: load built index.html
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173')
    // mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => { mainWindow = null })
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  createWindow()
  buildAppMenu()
  setupAutoUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ---------------------------------------------------------------------------
// IPC Handlers
// ---------------------------------------------------------------------------

// Fetch info for a URL
ipcMain.handle('info:fetch', async (_event, url) => {
  const platform = detectPlatform(url)
  if (platform === 'spotify') {
    try {
      const info = await fetchSpotifyTrackInfo(url)
      return {
        title: info.title || extractSpotifyTitle(url),
        thumbnail: info.thumbnail || null,
        uploader: info.artist || 'Spotify',
        duration: info.duration || '',
        platform: 'spotify'
      }
    } catch (_) {
      return {
        title: extractSpotifyTitle(url),
        thumbnail: null,
        uploader: 'Spotify',
        duration: '',
        platform: 'spotify'
      }
    }
  }
  return fetchInfo(url)
})

// Start a download — routes to yt-dlp or spotdl based on platform
ipcMain.handle('download:start', async (_event, { id, url, quality, outputPath, searchTerm, durationSeconds }) => {
  const platform = detectPlatform(url)

  const sendProgress = (data) => {
    if (mainWindow) mainWindow.webContents.send('download:progress', data)
  }
  const sendComplete = (data) => {
    if (mainWindow) mainWindow.webContents.send('download:complete', data)
  }
  const sendError = (data) => {
    if (mainWindow) mainWindow.webContents.send('download:error', data)
  }

  if (platform === 'spotify') {
    startSpotifyDownload({
      id, url, quality, outputPath,
      onProgress: sendProgress,
      onComplete: sendComplete,
      onError: sendError
    })
  } else {
    startDownload({
      id, url, quality, outputPath,
      onProgress: sendProgress,
      onComplete: sendComplete,
      onError: sendError,
      isSearch: !!searchTerm,
      searchTerm: searchTerm || null,
      durationSeconds: durationSeconds || 0
    })
  }

  return { ok: true }
})

// Cancel a download
ipcMain.handle('download:cancel', async (_event, { id, platform }) => {
  if (platform === 'spotify') {
    cancelSpotifyDownload(id)
  } else {
    cancelDownload(id)
  }
  return { ok: true }
})

// Get saved output path (defaults to ~/Downloads)
ipcMain.handle('settings:getOutputPath', async () => {
  const settings = loadSettings()
  return settings.outputPath || app.getPath('downloads')
})

// Open folder picker and save selected path
ipcMain.handle('settings:setOutputPath', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Choose Download Folder'
  })
  if (result.canceled || !result.filePaths.length) return null
  const selected = result.filePaths[0]
  saveSettings({ outputPath: selected })
  return selected
})

// Total downloaded counter — persists across sessions and queue clears
ipcMain.handle('stats:getTotalDownloaded', async () => {
  const settings = loadSettings()
  return settings.totalDownloaded || 0
})

ipcMain.handle('stats:incrementTotalDownloaded', async () => {
  const settings = loadSettings()
  const newCount = (settings.totalDownloaded || 0) + 1
  saveSettings({ totalDownloaded: newCount })
  return newCount
})

// Check all dependencies
ipcMain.handle('deps:check', async () => {
  return checkDependencies()
})

// Open file location in Finder
ipcMain.handle('shell:openFolder', async (_event, filePath) => {
  shell.showItemInFolder(filePath)
  return { ok: true }
})

// Open output folder directly
ipcMain.handle('shell:openOutputFolder', async (_event, folderPath) => {
  shell.openPath(folderPath)
  return { ok: true }
})

// ---------------------------------------------------------------------------
// App menu
// ---------------------------------------------------------------------------

function buildAppMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { label: `About ${app.name}`, role: 'about' },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'Cmd+Q', click: () => app.quit() }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Auto-updater  (GitHub API version check — works without code signing)
// ---------------------------------------------------------------------------

function setupAutoUpdater() {
  // Only run in packaged app — not during npm run dev
  if (!app.isPackaged) return

  // Check 4 seconds after launch to give the window time to fully load
  setTimeout(checkForUpdates, 4000)
}

function checkForUpdates() {
  const options = {
    hostname: 'api.github.com',
    path: '/repos/calvinscodes/mp3-downloader/releases/latest',
    headers: { 'User-Agent': 'Wavdrop-Updater' }
  }

  https.get(options, (res) => {
    let body = ''
    res.on('data', (chunk) => { body += chunk })
    res.on('end', () => {
      try {
        const release = JSON.parse(body)
        const latest = (release.tag_name || '').replace(/^v/, '')
        const current = app.getVersion()

        if (latest && isNewerVersion(latest, current)) {
          const releaseUrl = release.html_url || 'https://github.com/calvinscodes/mp3-downloader/releases/latest'
          dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Update Available',
            message: `Wavdrop ${latest} is available`,
            detail: `You're running ${current}. Download the new DMG, open it and drag Wavdrop to Applications to update.`,
            buttons: ['Download Now', 'Later'],
            defaultId: 0
          }).then(({ response }) => {
            if (response === 0) shell.openExternal(releaseUrl)
          })
        }
      } catch (e) {
        console.error('[updater] parse error:', e.message)
      }
    })
  }).on('error', (e) => {
    console.error('[updater] network error:', e.message)
  })
}

// Returns true if `a` is a higher semver than `b`
function isNewerVersion(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0)
    if (diff > 0) return true
    if (diff < 0) return false
  }
  return false
}

function extractSpotifyTitle(url) {
  try {
    const u = new URL(url)
    const parts = u.pathname.split('/')
    const type = parts[1] // track, album, playlist
    return type ? `Spotify ${type.charAt(0).toUpperCase() + type.slice(1)}` : 'Spotify Track'
  } catch (_) {
    return 'Spotify Track'
  }
}
