import React from 'react'
import QueueItem from './QueueItem'
import useDownloadStore from '../store/useDownloadStore'

export default function DownloadQueue() {
  const downloads = useDownloadStore((s) => s.downloads)
  const cancelDownload = useDownloadStore((s) => s.cancelDownload)
  const removeDownload = useDownloadStore((s) => s.removeDownload)
  const clearCompleted = useDownloadStore((s) => s.clearCompleted)
  const outputPath = useDownloadStore((s) => s.outputPath)

  const hasCompleted = downloads.some(
    (d) => d.status === 'complete' || d.status === 'cancelled' || d.status === 'error'
  )

  const handleOpenFolder = (id) => {
    window.electronAPI.openOutputFolder(outputPath)
  }

  if (downloads.length === 0) {
    return (
      <div className="queue-empty">
        <div className="queue-empty-icon">
          <WaveIcon />
        </div>
        <p className="queue-empty-title">Drop a link above to get started</p>
        <p className="queue-empty-sub">Supports YouTube, SoundCloud &amp; Spotify</p>
      </div>
    )
  }

  return (
    <div className="queue-container">
      {hasCompleted && (
        <div className="queue-header">
          <button className="queue-clear-btn" onClick={clearCompleted}>
            Clear finished
          </button>
        </div>
      )}
      <div className="queue-list">
        {downloads.map((d) => (
          <QueueItem
            key={d.id}
            download={d}
            onCancel={cancelDownload}
            onRemove={removeDownload}
            onOpenFolder={handleOpenFolder}
          />
        ))}
      </div>
    </div>
  )
}

function WaveIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" opacity="0.3">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  )
}
