const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  fetchInfo: (url) =>
    ipcRenderer.invoke('info:fetch', url),

  startDownload: (opts) =>
    ipcRenderer.invoke('download:start', opts),

  cancelDownload: (id, platform) =>
    ipcRenderer.invoke('download:cancel', { id, platform }),

  getOutputPath: () =>
    ipcRenderer.invoke('settings:getOutputPath'),

  setOutputPath: () =>
    ipcRenderer.invoke('settings:setOutputPath'),

  checkDeps: () =>
    ipcRenderer.invoke('deps:check'),

  getTotalDownloaded: () =>
    ipcRenderer.invoke('stats:getTotalDownloaded'),

  incrementTotalDownloaded: () =>
    ipcRenderer.invoke('stats:incrementTotalDownloaded'),

  openFolder: (filePath) =>
    ipcRenderer.invoke('shell:openFolder', filePath),

  openOutputFolder: (folderPath) =>
    ipcRenderer.invoke('shell:openOutputFolder', folderPath),

  onProgress: (cb) =>
    ipcRenderer.on('download:progress', (_event, data) => cb(data)),

  onComplete: (cb) =>
    ipcRenderer.on('download:complete', (_event, data) => cb(data)),

  onError: (cb) =>
    ipcRenderer.on('download:error', (_event, data) => cb(data)),

  removeListeners: (channel) =>
    ipcRenderer.removeAllListeners(channel)
})
