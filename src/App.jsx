import React, { useEffect, useState } from 'react'
import TitleBar from './components/TitleBar'
import UrlInput from './components/UrlInput'
import DownloadQueue from './components/DownloadQueue'
import Settings from './components/Settings'
import DependencyWarning from './components/DependencyWarning'
import { ToastContainer, showToast } from './components/Toast'
import useDownloadStore from './store/useDownloadStore'

export default function App() {
  const [showSettings, setShowSettings] = useState(false)

  const initListeners = useDownloadStore((s) => s.initListeners)
  const setOutputPath = useDownloadStore((s) => s.setOutputPath)
  const setDeps = useDownloadStore((s) => s.setDeps)
  const deps = useDownloadStore((s) => s.deps)
  const addDownload = useDownloadStore((s) => s.addDownload)
  const outputPath = useDownloadStore((s) => s.outputPath)
  const downloads = useDownloadStore((s) => s.downloads)

  // Watch for completed/error downloads to show toasts
  const prevDownloads = React.useRef({})
  useEffect(() => {
    const prev = prevDownloads.current
    downloads.forEach((d) => {
      const wasDownloading = prev[d.id] === 'downloading' || prev[d.id] === 'queued' || prev[d.id] === 'fetching-info'
      if (wasDownloading && d.status === 'complete') {
        showToast(`Downloaded: ${d.title}`, 'success')
      }
      if (wasDownloading && d.status === 'error') {
        showToast(d.error || 'Download failed', 'error')
      }
      prev[d.id] = d.status
    })
    prevDownloads.current = { ...prev }
  }, [downloads])

  useEffect(() => {
    // Register IPC listeners
    initListeners()

    // Load saved output path
    window.electronAPI.getOutputPath().then((p) => {
      if (p) setOutputPath(p)
    })

    // Check dependencies
    window.electronAPI.checkDeps().then((result) => {
      setDeps(result)
    })
  }, [])

  const handleSubmit = (url) => {
    addDownload(url)
  }

  return (
    <div className="app">
      <TitleBar onSettingsClick={() => setShowSettings(true)} />

      <div className="app-body">
        {/* URL input */}
        <div className="app-input-area">
          <UrlInput onSubmit={handleSubmit} />
        </div>

        {/* Dependency warning */}
        <DependencyWarning deps={deps} />

        {/* Download queue */}
        <div className="app-queue-area">
          <DownloadQueue />
        </div>

        {/* Bottom bar */}
        <div className="app-bottom-bar">
          <button
            className="bottom-bar-folder"
            onClick={() => window.electronAPI.openOutputFolder(outputPath)}
            title={outputPath || 'Downloads folder'}
          >
            <FolderSmallIcon />
            <span className="bottom-bar-path">{outputPath || '~/Downloads'}</span>
          </button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}

      {/* Toasts */}
      <ToastContainer />
    </div>
  )
}

function FolderSmallIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}
