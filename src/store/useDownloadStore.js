import { create } from 'zustand'

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function detectPlatform(url) {
  if (!url) return 'unknown'
  try {
    const u = new URL(url)
    const host = u.hostname.replace('www.', '')
    if (host === 'youtube.com' || host === 'youtu.be' || host === 'm.youtube.com') return 'youtube'
    if (host === 'soundcloud.com') return 'soundcloud'
    if (host === 'open.spotify.com') return 'spotify'
  } catch (_) {}
  return 'unknown'
}

const useDownloadStore = create((set, get) => ({
  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------
  downloads: [],
  outputPath: '',
  quality: 'best',
  deps: { ytdlp: false, ffmpeg: false, spotdl: false, python3: false },
  listenersInitialized: false,
  totalDownloaded: 0,

  // -------------------------------------------------------------------------
  // Download object shape:
  // {
  //   id: string,
  //   url: string,
  //   platform: 'youtube' | 'soundcloud' | 'spotify' | 'unknown',
  //   title: string,
  //   thumbnail: string | null,
  //   uploader: string,
  //   duration: string,
  //   status: 'fetching-info' | 'queued' | 'downloading' | 'complete' | 'error' | 'cancelled',
  //   percent: number,
  //   speed: string | null,
  //   eta: string | null,
  //   message: string,
  //   tracksDownloaded: number | null,
  //   tracksTotal: number | null,
  //   error: string | null
  // }
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  addDownload: async (url) => {
    const id = generateId()
    const platform = detectPlatform(url)

    // Add skeleton item immediately
    set((state) => ({
      downloads: [
        {
          id,
          url,
          platform,
          title: url,
          thumbnail: null,
          uploader: '',
          duration: '',
          status: 'fetching-info',
          percent: 0,
          speed: null,
          eta: null,
          message: 'Fetching info...',
          tracksDownloaded: null,
          tracksTotal: null,
          error: null
        },
        ...state.downloads
      ]
    }))

    // Fetch metadata
    try {
      const info = await window.electronAPI.fetchInfo(url)
      set((state) => ({
        downloads: state.downloads.map((d) =>
          d.id === id
            ? {
                ...d,
                title: info.title || url,
                thumbnail: info.thumbnail || null,
                uploader: info.uploader || '',
                duration: info.duration || '',
                platform: info.platform || platform,
                status: 'queued',
                message: 'Queued'
              }
            : d
        )
      }))
    } catch (err) {
      set((state) => ({
        downloads: state.downloads.map((d) =>
          d.id === id
            ? { ...d, status: 'error', error: err.message, message: err.message }
            : d
        )
      }))
      return
    }

    // Start the download
    const { outputPath, quality } = get()
    try {
      await window.electronAPI.startDownload({ id, url, quality, outputPath })
      set((state) => ({
        downloads: state.downloads.map((d) =>
          d.id === id ? { ...d, status: 'downloading', message: 'Downloading...' } : d
        )
      }))
    } catch (err) {
      set((state) => ({
        downloads: state.downloads.map((d) =>
          d.id === id
            ? { ...d, status: 'error', error: err.message, message: err.message }
            : d
        )
      }))
    }
  },

  updateDownload: (id, patch) => {
    set((state) => ({
      downloads: state.downloads.map((d) => (d.id === id ? { ...d, ...patch } : d))
    }))
  },

  removeDownload: (id) => {
    set((state) => ({
      downloads: state.downloads.filter((d) => d.id !== id)
    }))
  },

  cancelDownload: async (id) => {
    const download = get().downloads.find((d) => d.id === id)
    if (!download) return
    try {
      await window.electronAPI.cancelDownload(id, download.platform)
    } catch (_) {}
    set((state) => ({
      downloads: state.downloads.map((d) =>
        d.id === id ? { ...d, status: 'cancelled', message: 'Cancelled' } : d
      )
    }))
  },

  clearCompleted: () => {
    set((state) => ({
      downloads: state.downloads.filter(
        (d) => d.status !== 'complete' && d.status !== 'cancelled' && d.status !== 'error'
      )
    }))
  },

  setOutputPath: (outputPath) => set({ outputPath }),

  setQuality: (quality) => set({ quality }),

  setDeps: (deps) => set({ deps }),

  setTotalDownloaded: (totalDownloaded) => set({ totalDownloaded }),

  // Register IPC listeners exactly once
  initListeners: () => {
    if (get().listenersInitialized) return
    set({ listenersInitialized: true })

    window.electronAPI.onProgress((data) => {
      const { id, percent, speed, eta, message, tracksDownloaded, tracksTotal } = data
      get().updateDownload(id, {
        percent: percent ?? undefined,
        speed: speed ?? null,
        eta: eta ?? null,
        message: message || (percent != null ? `${Math.round(percent)}%` : 'Downloading...'),
        ...(tracksDownloaded != null ? { tracksDownloaded } : {}),
        ...(tracksTotal != null ? { tracksTotal } : {})
      })
    })

    window.electronAPI.onComplete((data) => {
      const { id } = data
      const { outputPath } = get()
      get().updateDownload(id, {
        status: 'complete',
        percent: 100,
        message: 'Complete',
        speed: null,
        eta: null,
        outputPath
      })
      // Persist counter and update UI
      window.electronAPI.incrementTotalDownloaded().then((newCount) => {
        set({ totalDownloaded: newCount })
      })
    })

    window.electronAPI.onError((data) => {
      const { id, message } = data
      get().updateDownload(id, {
        status: 'error',
        error: message,
        message: message || 'Download failed'
      })
    })
  }
}))

export default useDownloadStore
