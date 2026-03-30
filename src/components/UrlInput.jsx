import React, { useState, useRef } from 'react'

function detectPlatform(url) {
  if (!url) return null
  // Not a URL → treat as a search query
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return url.trim().length > 0 ? 'search' : null
  }
  try {
    const u = new URL(url)
    const host = u.hostname.replace('www.', '')
    if (host === 'youtube.com' || host === 'youtu.be' || host === 'm.youtube.com') return 'youtube'
    if (host === 'soundcloud.com') return 'soundcloud'
    if (host === 'open.spotify.com') return 'spotify'
  } catch (_) {}
  return null
}

const PLATFORM_CONFIG = {
  youtube: { label: 'YouTube', color: 'var(--youtube)', icon: <YtIcon /> },
  soundcloud: { label: 'SoundCloud', color: 'var(--soundcloud)', icon: <ScIcon /> },
  spotify: { label: 'Spotify', color: 'var(--spotify)', icon: <SpotifyIcon /> },
  search: { label: 'Search', color: '#a78bfa', icon: <SearchIcon /> }
}

export default function UrlInput({ onSubmit, disabled }) {
  const [value, setValue] = useState('')
  const [platform, setPlatform] = useState(null)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  const handleChange = (e) => {
    const val = e.target.value
    setValue(val)
    setError('')
    setPlatform(detectPlatform(val.trim()))
  }

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text').trim()
    const detected = detectPlatform(pasted)
    setPlatform(detected)
    setError('')
  }

  const handleSubmit = () => {
    const url = value.trim()
    if (!url) return

    const detected = detectPlatform(url)
    if (!detected) {
      setError('Unrecognised URL. Paste a link or type an artist and song name.')
      return
    }

    onSubmit(url)
    setValue('')
    setPlatform(null)
    setError('')
    inputRef.current?.blur()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSubmit()
    if (e.key === 'Escape') {
      setValue('')
      setPlatform(null)
      setError('')
    }
  }

  const cfg = platform ? PLATFORM_CONFIG[platform] : null

  return (
    <div className="url-input-wrapper">
      <div className={`url-input-container ${error ? 'has-error' : ''} ${platform ? 'has-platform' : ''}`}>
        {/* Platform badge */}
        {cfg && (
          <span className="url-platform-badge" style={{ color: cfg.color }}>
            {cfg.icon}
            <span className="url-platform-label">{cfg.label}</span>
          </span>
        )}

        <input
          ref={inputRef}
          type="text"
          className="url-input"
          placeholder="Paste a link or type Artist — Song Name..."
          value={value}
          onChange={handleChange}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          spellCheck={false}
          autoComplete="off"
        />

        {value && (
          <button
            className="url-submit-btn"
            onClick={handleSubmit}
            disabled={disabled}
            style={cfg ? { '--btn-color': cfg.color } : {}}
            title="Download"
          >
            <DownloadArrow />
          </button>
        )}
      </div>

      {error && <p className="url-error">{error}</p>}
    </div>
  )
}

function YtIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.5 6.2s-.2-1.6-.9-2.3c-.9-.9-1.9-.9-2.3-1C17.4 2.7 12 2.7 12 2.7s-5.4 0-8.3.2c-.5.1-1.5.1-2.3 1C.7 4.6.5 6.2.5 6.2S.3 8.1.3 10v1.8c0 1.9.2 3.8.2 3.8s.2 1.6.9 2.3c.9.9 2 .9 2.6 1 1.9.2 7.9.2 7.9.2s5.4 0 8.3-.2c.5-.1 1.5-.1 2.3-1 .7-.7.9-2.3.9-2.3s.2-1.9.2-3.8V10c0-1.9-.1-3.8-.1-3.8zM9.7 14.8V8.8l6.3 3-6.3 3z"/>
    </svg>
  )
}

function ScIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M1.2 13.5c-.1.5.3.9.8.9s.9-.4.9-.9l.2-2.3-.2-2.5c0-.5-.4-.9-.9-.9s-.9.4-.8.9l-.2 2.5.2 2.3zm2.4.5c0 .6.5 1 1 1s1-.5 1-1l.2-2.8-.2-3.3c0-.6-.5-1-1-1s-1 .5-1 1l-.2 3.3.2 2.8zm2.6.3c0 .7.6 1.2 1.2 1.2s1.2-.5 1.2-1.2l.2-3.1-.2-4.2c0-.7-.6-1.2-1.2-1.2s-1.2.5-1.2 1.2l-.2 4.2.2 3.1zm2.7.2c0 .8.6 1.4 1.4 1.4s1.4-.6 1.4-1.4l.2-3.3V5.9c0-.8-.6-1.4-1.4-1.4s-1.4.6-1.4 1.4v5.3l-.2 3.3zm2.8.1c0 .8.7 1.5 1.5 1.5s1.5-.7 1.5-1.5l.2-3.4-.2-6.8c0-.8-.7-1.5-1.5-1.5s-1.5.7-1.5 1.5l-.2 6.8.2 3.4zm10.8-7.1C22 5 19.8 3 17.1 3c-.8 0-1.6.2-2.3.6V14.6c0 .8.7 1.5 1.5 1.5H22c1.1 0 2-.9 2-2v-.4c0-2.3-1.8-4.2-4.1-4.3z"/>
    </svg>
  )
}

function SpotifyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function DownloadArrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}
