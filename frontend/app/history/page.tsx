'use client'
import { useEffect, useState } from 'react'
import { Clock, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import { api } from '@/lib/api'
import { SongCard } from '@/components/SongCard'
import { Song } from '@/lib/supabase'

function timeAgo(dateStr: string) {
  const d = new Date(dateStr)
  const diff = Date.now() - d.getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins < 1)   return 'Just now'
  if (mins < 60)  return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7)   return `${days}d ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function HistoryPage() {
  const [history, setHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [page,    setPage]    = useState(1)

  function load(p: number) {
    setLoading(true)
    api.getHistory(p).then(d => { setHistory(d.history); setLoading(false) })
  }

  useEffect(() => { load(page) }, [page])

  async function clear() {
    if (!confirm('Clear all history?')) return
    await api.clearHistory()
    setHistory([])
  }

  const songs: Song[] = history.map(h => h.songs)

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">

      {/* Header */}
      <div className="flex items-start justify-between mb-7 fade-in">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(var(--accent-rgb),0.12)', border: '1px solid rgba(var(--accent-rgb),0.2)' }}>
              <Clock size={20} style={{ color: 'var(--accent)' }} />
            </div>
            <h1 className="text-2xl font-black">History</h1>
          </div>
          <p className="text-xs pl-[52px]" style={{ color: 'var(--text-muted)' }}>Recently played songs</p>
        </div>
        {history.length > 0 && (
          <button onClick={clear}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all"
            style={{ color: '#f87171', background: 'rgba(239,68,68,0.08)' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.15)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.08)'}>
            <Trash2 size={13} /> Clear all
          </button>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col gap-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl">
              <div className="w-11 h-11 rounded-xl shimmer flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 rounded-lg shimmer w-3/4" />
                <div className="h-2.5 rounded-lg shimmer w-1/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* History timeline */}
      {!loading && history.length > 0 && (
        <div className="glass rounded-3xl overflow-hidden fade-in" style={{ border: '1px solid var(--border)' }}>
          {history.map((h, i) => (
            <div key={i} className="border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
              {/* Timestamp */}
              <div className="flex items-center gap-2 px-4 pt-3 pb-1">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent)', opacity: 0.5 }} />
                <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  {timeAgo(h.played_at)}
                </span>
              </div>
              <SongCard song={h.songs} queue={songs} queueSource="History" />
            </div>
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && history.length === 0 && (
        <div className="flex flex-col items-center py-24 fade-in">
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-5"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <Clock size={36} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
          </div>
          <p className="text-base font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>No history yet</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Songs you play will appear here</p>
        </div>
      )}

      {/* Pagination */}
      {history.length === 20 && (
        <div className="flex gap-3 justify-center mt-6">
          {page > 1 && (
            <button onClick={() => setPage(p => p - 1)}
              className="btn-ghost flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium">
              <ChevronLeft size={15} /> Previous
            </button>
          )}
          <button onClick={() => setPage(p => p + 1)}
            className="btn-accent flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium">
            Next <ChevronRight size={15} />
          </button>
        </div>
      )}
    </div>
  )
}
