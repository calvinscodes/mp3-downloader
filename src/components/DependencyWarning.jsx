import React from 'react'

export default function DependencyWarning({ deps }) {
  const missing = []
  if (!deps.ytdlp) missing.push('yt-dlp')
  if (!deps.ffmpeg) missing.push('ffmpeg')

  if (missing.length === 0) return null

  return (
    <div className="dep-warning">
      <span className="dep-warning-icon">
        <WarnIcon />
      </span>
      <div className="dep-warning-body">
        <strong>Missing: {missing.join(', ')}</strong>
        <span className="dep-warning-hint">
          {' '}— Place the binaries in{' '}
          <code>resources/</code>. See the README for setup instructions.
        </span>
      </div>
    </div>
  )
}

function WarnIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  )
}
