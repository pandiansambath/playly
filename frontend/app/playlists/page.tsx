'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ListMusic, Plus, Trash2, ChevronRight, Music, PlayCircle } from 'lucide-react'
import { api } from '@/lib/api'

const COVER_GRADIENTS = [
  'linear-gradient(135deg,#8B5CF6,#EC4899)',
  'linear-gradient(135deg,#3B82F6,#06B6D4)',
  'linear-gradient(135deg,#10B981,#22C55E)',
  'linear-gradient(135deg,#F59E0B,#F97316)',
  'linear-gradient(135deg,#EF4444,#EC4899)',
  'linear-gradient(135deg,#6366F1,#8B5CF6)',
]

export default function PlaylistsPage() {
  const router = useRouter()
  const [playlists, setPlaylists] = useState<any[]>([])
  const [name,      setName]      = useState('')
  const [loading,   setLoading]   = useState(true)
  const [creating,  setCreating]  = useState(false)

  useEffect(() => {
    api.getPlaylists().then(d => { setPlaylists(d.playlists); setLoading(false) })
  }, [])

  async function create() {
    if (!name.trim()) return
    setCreating(true)
    const d = await api.createPlaylist(name.trim())
    setPlaylists(p => [d.playlist, ...p])
    setName('')
    setCreating(false)
  }

  async function del(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    if (!confirm('Delete this playlist?')) return
    await api.deletePlaylist(id)
    setPlaylists(p => p.filter(x => x.id !== id))
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">

      {/* Header */}
      <div className="mb-7 fade-in">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(var(--accent-rgb),0.12)', border: '1px solid rgba(var(--accent-rgb),0.2)' }}>
            <ListMusic size={20} style={{ color: 'var(--accent)' }} />
          </div>
          <h1 className="text-2xl font-black">Playlists</h1>
        </div>
        <p className="text-xs pl-[52px]" style={{ color: 'var(--text-muted)' }}>
          {loading ? 'Loading…' : `${playlists.length} playlists`}
        </p>
      </div>

      {/* Create new playlist */}
      <div className="flex gap-2 mb-7 fade-in">
        <input value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && create()}
          placeholder="New playlist name…"
          className="input-field flex-1 rounded-2xl px-4 py-3.5 text-sm" />
        <button onClick={create} disabled={creating || !name.trim()}
          className="btn-accent px-5 rounded-2xl font-bold flex items-center gap-2 disabled:opacity-40">
          {creating ? <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    : <Plus size={18} />}
          Create
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4 glass rounded-2xl">
              <div className="w-14 h-14 rounded-2xl shimmer flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 rounded-lg shimmer w-1/2" />
                <div className="h-2.5 rounded-lg shimmer w-1/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Playlists */}
      {!loading && (
        <div className="flex flex-col gap-2 fade-in">
          {playlists.map((pl, i) => (
            <div key={pl.id} onClick={() => router.push(`/playlists/${pl.id}`)}
              className="group glass glass-hover flex items-center gap-4 p-4 rounded-2xl cursor-pointer card-lift">
              {/* Cover */}
              <div className="w-14 h-14 rounded-2xl flex-shrink-0 flex items-center justify-center relative overflow-hidden"
                style={{ background: COVER_GRADIENTS[i % COVER_GRADIENTS.length] }}>
                <Music size={22} className="text-white/70 group-hover:opacity-0 transition-opacity" />
                <PlayCircle size={24} className="absolute text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate">{pl.name}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Created {new Date(pl.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <ChevronRight size={16} className="transition-transform group-hover:translate-x-1"
                style={{ color: 'var(--text-muted)' }} />
              <button onClick={e => del(e, pl.id)}
                className="p-2 rounded-xl opacity-0 group-hover:opacity-100 transition-all"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#f87171'; (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.1)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.background = '' }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && playlists.length === 0 && (
        <div className="flex flex-col items-center py-24 fade-in">
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-5"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <ListMusic size={36} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
          </div>
          <p className="text-base font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>No playlists yet</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Create your first playlist above!</p>
        </div>
      )}
    </div>
  )
}
