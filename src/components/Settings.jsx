import React from 'react'
import useDownloadStore from '../store/useDownloadStore'

const QUALITY_OPTIONS = [
  { value: 'best', label: 'Best', desc: 'Highest available quality' },
  { value: 'high', label: 'High', desc: '~320kbps equivalent' },
  { value: 'medium', label: 'Medium', desc: '~192kbps' },
  { value: 'low', label: 'Low', desc: '~128kbps' }
]

export default function Settings({ onClose }) {
  const outputPath = useDownloadStore((s) => s.outputPath)
  const quality = useDownloadStore((s) => s.quality)
  const deps = useDownloadStore((s) => s.deps)
  const setOutputPath = useDownloadStore((s) => s.setOutputPath)
  const setQuality = useDownloadStore((s) => s.setQuality)

  const handleChangeFolder = async () => {
    const selected = await window.electronAPI.setOutputPath()
    if (selected) setOutputPath(selected)
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2 className="settings-title">Settings</h2>
          <button className="settings-close" onClick={onClose} aria-label="Close settings">
            <XIcon />
          </button>
        </div>

        {/* Output folder */}
        <section className="settings-section">
          <h3 className="settings-section-title">Download Folder</h3>
          <div className="settings-folder-row">
            <span className="settings-folder-path" title={outputPath}>
              {outputPath || '~/Downloads'}
            </span>
            <button className="settings-btn" onClick={handleChangeFolder}>
              Change
            </button>
          </div>
        </section>

        {/* Quality */}
        <section className="settings-section">
          <h3 className="settings-section-title">Audio Quality</h3>
          <div className="settings-quality-grid">
            {QUALITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`settings-quality-btn ${quality === opt.value ? 'active' : ''}`}
                onClick={() => setQuality(opt.value)}
              >
                <span className="settings-quality-label">{opt.label}</span>
                <span className="settings-quality-desc">{opt.desc}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Dependencies */}
        <section className="settings-section">
          <h3 className="settings-section-title">Dependencies</h3>
          <div className="settings-deps">
            <DepRow name="yt-dlp" ok={deps.ytdlp} missing="Binary missing from resources/" />
            <DepRow name="ffmpeg" ok={deps.ffmpeg} missing="Binary missing from resources/" />
            <DepRow
              name="spotdl"
              ok={deps.spotdl}
              missing={
                <span>
                  Not installed —{' '}
                  <code className="settings-dep-cmd" onClick={() => navigator.clipboard.writeText('pip3 install spotdl')}>
                    pip3 install spotdl
                  </code>
                  {' '}(click to copy)
                </span>
              }
            />
          </div>
        </section>
      </div>
    </div>
  )
}

function DepRow({ name, ok, missing }) {
  return (
    <div className="settings-dep-row">
      <span className={`settings-dep-indicator ${ok ? 'ok' : 'missing'}`}>
        {ok ? <CheckIcon /> : <XIcon size={12} />}
      </span>
      <span className="settings-dep-name">{name}</span>
      <span className="settings-dep-status">
        {ok ? 'Found' : missing}
      </span>
    </div>
  )
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function XIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}
