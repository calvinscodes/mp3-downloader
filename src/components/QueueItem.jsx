import React, { useState } from 'react'

const PLATFORM_COLORS = {
  youtube: 'var(--youtube)',
  soundcloud: 'var(--soundcloud)',
  spotify: 'var(--spotify)',
  unknown: 'var(--text-muted)'
}

const STATUS_LABELS = {
  'fetching-info': 'Fetching Info',
  queued: 'Queued',
  downloading: 'Downloading',
  complete: 'Complete',
  error: 'Error',
  cancelled: 'Cancelled'
}

export default function QueueItem({ download, onCancel, onRemove, onOpenFolder }) {
  const {
    id, title, thumbnail, uploader, duration, platform,
    status, percent, speed, eta, message, error,
    tracksDownloaded, tracksTotal
  } = download

  const platformColor = PLATFORM_COLORS[platform] || PLATFORM_COLORS.unknown
  const isActive = status === 'downloading'
  const isDone = status === 'complete'
  const isFailed = status === 'error' || status === 'cancelled'
  const isFetching = status === 'fetching-info'

  return (
    <div className={`queue-item queue-item--${status}`}>
      {/* Thumbnail */}
      <div className="queue-item-thumb">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={title}
            className="queue-item-thumb-img"
            onError={(e) => { e.currentTarget.style.display = 'none' }}
          />
        ) : (
          <div className="queue-item-thumb-placeholder" style={{ background: platformColor + '22' }}>
            <PlatformIcon platform={platform} color={platformColor} />
          </div>
        )}
        <span className="queue-item-platform-dot" style={{ background: platformColor }} />
      </div>

      {/* Info */}
      <div className="queue-item-info">
        <div className="queue-item-meta">
          <span className="queue-item-title" title={title}>{title}</span>
          <div className="queue-item-sub">
            {uploader && <span className="queue-item-uploader">{uploader}</span>}
            {duration && <span className="queue-item-duration">{duration}</span>}
          </div>
        </div>

        {/* Progress bar */}
        {(isActive || isDone) && (
          <div className="queue-item-progress-bar">
            <div
              className="queue-item-progress-fill"
              style={{ width: `${Math.min(100, percent || 0)}%` }}
            />
          </div>
        )}

        {/* Status line */}
        <div className="queue-item-status-row">
          <span className={`queue-item-badge queue-item-badge--${status}`}>
            {STATUS_LABELS[status] || status}
          </span>

          {isActive && (
            <span className="queue-item-stats">
              {tracksTotal != null ? (
                <span>{tracksDownloaded ?? 0} / {tracksTotal} tracks</span>
              ) : (
                <>
                  {percent != null && <span>{Math.round(percent)}%</span>}
                  {speed && <span>{speed}</span>}
                  {eta && <span>ETA {eta}</span>}
                </>
              )}
            </span>
          )}

          {isFetching && (
            <span className="queue-item-stats">
              <span className="queue-item-spinner" />
            </span>
          )}

          {isFailed && error && (
            <span className="queue-item-error-msg" title={error}>
              {truncate(error, 60)}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="queue-item-actions">
        {isActive && (
          <button
            className="queue-action-btn queue-action-btn--cancel"
            onClick={() => onCancel(id)}
            title="Cancel"
          >
            <XIcon />
          </button>
        )}
        {isDone && (
          <button
            className="queue-action-btn queue-action-btn--folder"
            onClick={() => onOpenFolder(id)}
            title="Show in Finder"
          >
            <FolderIcon />
          </button>
        )}
        {isFailed && (
          <button
            className="queue-action-btn queue-action-btn--remove"
            onClick={() => onRemove(id)}
            title="Remove"
          >
            <XIcon />
          </button>
        )}
      </div>
    </div>
  )
}

function truncate(str, max) {
  if (!str) return ''
  return str.length > max ? str.slice(0, max) + '…' : str
}

function PlatformIcon({ platform, color }) {
  const props = { width: 18, height: 18, fill: color, viewBox: '0 0 24 24' }
  if (platform === 'youtube') {
    return (
      <svg {...props}>
        <path d="M23.5 6.2s-.2-1.6-.9-2.3c-.9-.9-1.9-.9-2.3-1C17.4 2.7 12 2.7 12 2.7s-5.4 0-8.3.2c-.5.1-1.5.1-2.3 1C.7 4.6.5 6.2.5 6.2S.3 8.1.3 10v1.8c0 1.9.2 3.8.2 3.8s.2 1.6.9 2.3c.9.9 2 .9 2.6 1 1.9.2 7.9.2 7.9.2s5.4 0 8.3-.2c.5-.1 1.5-.1 2.3-1 .7-.7.9-2.3.9-2.3s.2-1.9.2-3.8V10c0-1.9-.1-3.8-.1-3.8zM9.7 14.8V8.8l6.3 3-6.3 3z"/>
      </svg>
    )
  }
  if (platform === 'soundcloud') {
    return (
      <svg {...props}>
        <path d="M1.2 13.5c-.1.5.3.9.8.9s.9-.4.9-.9l.2-2.3-.2-2.5c0-.5-.4-.9-.9-.9s-.9.4-.8.9l-.2 2.5.2 2.3zm2.4.5c0 .6.5 1 1 1s1-.5 1-1l.2-2.8-.2-3.3c0-.6-.5-1-1-1s-1 .5-1 1l-.2 3.3.2 2.8zm2.6.3c0 .7.6 1.2 1.2 1.2s1.2-.5 1.2-1.2l.2-3.1-.2-4.2c0-.7-.6-1.2-1.2-1.2s-1.2.5-1.2 1.2l-.2 4.2.2 3.1zm2.7.2c0 .8.6 1.4 1.4 1.4s1.4-.6 1.4-1.4l.2-3.3V5.9c0-.8-.6-1.4-1.4-1.4s-1.4.6-1.4 1.4v5.3l-.2 3.3zm2.8.1c0 .8.7 1.5 1.5 1.5s1.5-.7 1.5-1.5l.2-3.4-.2-6.8c0-.8-.7-1.5-1.5-1.5s-1.5.7-1.5 1.5l-.2 6.8.2 3.4zm10.8-7.1C22 5 19.8 3 17.1 3c-.8 0-1.6.2-2.3.6V14.6c0 .8.7 1.5 1.5 1.5H22c1.1 0 2-.9 2-2v-.4c0-2.3-1.8-4.2-4.1-4.3z"/>
      </svg>
    )
  }
  if (platform === 'spotify') {
    return (
      <svg {...props}>
        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
      </svg>
    )
  }
  return (
    <svg {...props} stroke={color} fill="none" strokeWidth="1.5">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function FolderIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}
