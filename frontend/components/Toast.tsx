'use client'
import { useState, useEffect } from 'react'
import { CheckCircle2 } from 'lucide-react'

interface ToastMsg { id: number; text: string; ok: boolean }

// Module-level listeners — no context needed, works everywhere
let _nextId = 0
let _listeners: ((m: ToastMsg) => void)[] = []

export function showToast(text: string, ok = true) {
  const msg: ToastMsg = { id: ++_nextId, text, ok }
  _listeners.forEach(fn => fn(msg))
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMsg[]>([])

  useEffect(() => {
    const handler = (msg: ToastMsg) => {
      setToasts(p => [...p, msg])
      setTimeout(() => setToasts(p => p.filter(t => t.id !== msg.id)), 3200)
    }
    _listeners.push(handler)
    return () => { _listeners = _listeners.filter(l => l !== handler) }
  }, [])

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 pointer-events-none"
      style={{ minWidth: 200 }}>
      {toasts.map(t => (
        <div key={t.id}
          className="fade-in flex items-center gap-2.5 px-4 py-2.5 rounded-2xl shadow-2xl pointer-events-auto"
          style={{
            background:     t.ok ? 'rgba(16,185,129,0.13)' : 'rgba(239,68,68,0.13)',
            border:         `1px solid ${t.ok ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.35)'}`,
            backdropFilter: 'blur(30px)',
            boxShadow:      t.ok ? '0 8px 32px rgba(16,185,129,0.2)' : '0 8px 32px rgba(239,68,68,0.2)',
            animation:      'bounce-in 0.35s cubic-bezier(0.16,1,0.3,1) forwards',
          }}>
          {t.ok
            ? <CheckCircle2 size={15} style={{ color: '#10b981', flexShrink: 0 }} />
            : <span style={{ fontSize: 15 }}>⚠️</span>
          }
          <span className="text-sm font-semibold whitespace-nowrap"
            style={{ color: t.ok ? 'rgb(209,250,229)' : 'rgb(254,202,202)' }}>
            {t.text}
          </span>
        </div>
      ))}
    </div>
  )
}
