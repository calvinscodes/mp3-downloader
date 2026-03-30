import React, { useState, useEffect, useCallback } from 'react'

let toastIdCounter = 0

// Simple singleton event emitter for toasts
const listeners = new Set()

export function showToast(message, type = 'success') {
  const id = ++toastIdCounter
  listeners.forEach((fn) => fn({ id, message, type }))
}

export function ToastContainer() {
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    const handler = (toast) => {
      setToasts((prev) => [...prev, toast])
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id))
      }, 4000)
    }
    listeners.add(handler)
    return () => listeners.delete(handler)
  }, [])

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.type}`} onClick={() => dismiss(t.id)}>
          <span className="toast-icon">
            {t.type === 'success' ? <CheckIcon /> : <XIcon />}
          </span>
          <span className="toast-msg">{t.message}</span>
        </div>
      ))}
    </div>
  )
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <polyline points="20 6 9 17 4 12" />
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
