'use client'
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Play, Heart, MoreHorizontal, ListPlus, Trash2, Music, Download, Loader2, Check } from 'lucide-react'
import { Song } from '@/lib/supabase'
import { usePlayerStore } from '@/store/playerStore'
import { api } from '@/lib/api'
import { showToast } from '@/components/Toast'

function EqBars({ playing }: { playing: boolean }) {
  return (
    <div className={`flex items-end gap-[2px] h-4 ${!playing ? 'eq-paused' : ''}`}>
      <div className="eq-bar eq-bar-1 w-[3px] rounded-full" style={{ height: '60%', background: 'var(--accent)' }} />
      <div className="eq-bar eq-bar-2 w-[3px] rounded-full" style={{ height: '100%', background: 'var(--accent)' }} />
      <div className="eq-bar eq-bar-3 w-[3px] rounded-full" style={{ height: '70%', background: 'var(--accent)' }} />
    </div>
  )
}

interface Props {
  song: Song
  queue?: Song[]
  queueSource?: string
  isFavorite?: boolean
  onFavoriteToggle?: (id: string) => void
  onDelete?: (id: string) => void   // Library only — permanent delete
  showRemove?: boolean
  onRemove?: (id: string) => void   // Playlists / Favorites — remove
}

export function SongCard({ song, queue = [], queueSource = '', isFavorite = false, onFavoriteToggle, onDelete, showRemove, onRemove }: Props) {
  const { currentSong, isPlaying, setCurrentSong } = usePlayerStore()
  const [showMenu,    setShowMenu]    = useState(false)
  const [menuAnchor,  setMenuAnchor]  = useState<{ top: number; right: number } | null>(null)
  const [playlists,   setPlaylists]   = useState<any[]>([])
  const [downloading, setDownloading] = useState(false)
  const [downloaded,  setDownloaded]  = useState(false)
  const menuRef   = useRef<HTMLDivElement>(null)
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const isActive = currentSong?.id === song.id
  const mins = Math.floor(song.duration_seconds / 60)
  const secs = String(song.duration_seconds % 60).padStart(2, '0')

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showMenu) return
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        menuBtnRef.current && !menuBtnRef.current.contains(e.target as Node)
      ) {
        setShowMenu(false)
        setMenuAnchor(null)
      }
    }
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 50)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler) }
  }, [showMenu])

  function play() {
    const q = queue.length ? queue : [song]
    setCurrentSong(song, q, queueSource)
  }

  async function openMenu(e: React.MouseEvent) {
    e.stopPropagation()
    if (showMenu) { setShowMenu(false); setMenuAnchor(null); return }
    const btn = e.currentTarget as HTMLElement
    const rect = btn.getBoundingClientRect()
    // Position: below button, right-aligned. Flip up if too close to bottom
    const spaceBelow = window.innerHeight - rect.bottom
    const dropdownH  = 220
    const top  = spaceBelow > dropdownH ? rect.bottom + 8 : rect.top - dropdownH - 4
    const right = window.innerWidth - rect.right
    setMenuAnchor({ top, right })
    setShowMenu(true)
    if (!playlists.length) {
      try { const d = await api.getPlaylists(); setPlaylists(d.playlists || []) } catch {}
    }
  }

  async function addToPlaylist(pid: string, plName: string) {
    try {
      await api.addToPlaylist(pid, song.id)
      showToast(`Added to "${plName}" ✓`)
    } catch {
      showToast('Failed to add to playlist', false)
    }
    setShowMenu(false)
    setMenuAnchor(null)
  }

  async function downloadToDevice(e: React.MouseEvent) {
    e.stopPropagation()
    if (downloading || downloaded) return
    setDownloading(true)
    try {
      const res  = await fetch(song.supabase_url)
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      const name = song.title.replace(/[^\w\s\-]/g, '').trim().slice(0, 80) || 'song'
      a.href     = url
      a.download = `${name}.mp3`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setDownloaded(true)
      setTimeout(() => setDownloaded(false), 4000)
    } catch {}
    finally { setDownloading(false) }
  }

  return (
    <div
      className="group relative flex items-center gap-3 px-3 py-2.5 rounded-xl song-row transition-all duration-150"
      style={{ background: isActive ? 'rgba(var(--accent-rgb),0.08)' : 'transparent' }}
      onClick={play}
    >
      {/* Thumbnail */}
      <div className="relative w-11 h-11 flex-shrink-0 rounded-xl overflow-hidden"
        style={{ boxShadow: isActive ? `0 4px 16px rgba(var(--accent-rgb),0.35)` : 'none' }}>
        {song.thumbnail_url ? (
          <img src={song.thumbnail_url} alt={song.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--bg-raised)' }}>
            <Music size={18} style={{ color: 'var(--text-muted)' }} />
          </div>
        )}
        <div className={`absolute inset-0 flex items-center justify-center transition-all duration-200
          ${isActive ? 'bg-black/20' : 'bg-black/0 group-hover:bg-black/45'}`}>
          {isActive
            ? <EqBars playing={isPlaying} />
            : <Play size={15} fill="white" className="text-white opacity-0 group-hover:opacity-100 transition-opacity ml-0.5" />
          }
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate leading-tight"
          style={{ color: isActive ? 'var(--accent)' : 'var(--text-primary)' }}>
          {song.title}
        </p>
        <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {song.movie_name || 'Unknown'} · {mins}:{secs}
        </p>
      </div>

      {/* Duration (hidden on hover) */}
      <span className="text-xs flex-shrink-0 group-hover:hidden" style={{ color: 'var(--text-muted)' }}>
        {mins}:{secs}
      </span>

      {/* Action buttons (shown on hover) */}
      <div className="hidden group-hover:flex items-center gap-0.5">
        {/* Download to device */}
        <button onClick={downloadToDevice}
          className="p-2 rounded-xl transition-all hover:scale-110 active:scale-95"
          style={{ color: downloaded ? '#10b981' : 'var(--text-muted)' }}
          title="Download MP3">
          {downloading ? <Loader2 size={15} className="animate-spin" /> : downloaded ? <Check size={15} /> : <Download size={15} />}
        </button>

        {onFavoriteToggle && (
          <button onClick={e => { e.stopPropagation(); onFavoriteToggle(song.id) }}
            className="p-2 rounded-xl transition-all hover:scale-110 active:scale-95"
            style={{ color: isFavorite ? '#f43f5e' : 'var(--text-muted)' }}
            title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}>
            <Heart size={15} fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
        )}

        <button
          ref={menuBtnRef}
          onClick={openMenu}
          className="p-2 rounded-xl transition-all hover:bg-white/10"
          style={{ color: 'var(--text-muted)' }}
          title="More options">
          <MoreHorizontal size={15} />
        </button>

        {showRemove && onRemove && (
          <button onClick={e => { e.stopPropagation(); onRemove(song.id) }}
            className="p-2 rounded-xl transition-all"
            style={{ color: 'var(--text-muted)' }}
            title="Remove">
            <Trash2 size={15} />
          </button>
        )}
      </div>

      {/* Playlist dropdown — rendered in portal to escape overflow:hidden containers */}
      {showMenu && menuAnchor && mounted && createPortal(
        <div
          ref={menuRef}
          className="fade-in-fast rounded-2xl overflow-hidden shadow-2xl"
          style={{
            position: 'fixed',
            top: menuAnchor.top,
            right: menuAnchor.right,
            zIndex: 9999,
            minWidth: 200,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-strong)',
            backdropFilter: 'blur(40px)',
          }}
          onClick={e => e.stopPropagation()}
        >
          <div className="px-3 py-2.5 flex items-center gap-2 border-b" style={{ borderColor: 'var(--border)' }}>
            <ListPlus size={13} style={{ color: 'var(--accent)' }} />
            <span className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>Add to Playlist</span>
          </div>
          {playlists.length === 0 ? (
            <div className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>No playlists yet</div>
          ) : playlists.map((pl: any) => (
            <button key={pl.id} onClick={() => addToPlaylist(pl.id, pl.name)}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-left transition-all hover:bg-white/5"
              style={{ color: 'var(--text-primary)' }}>
              <div className="w-6 h-6 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(var(--accent-rgb),0.12)' }}>
                <Music size={11} style={{ color: 'var(--accent)' }} />
              </div>
              {pl.name}
            </button>
          ))}

          {/* Remove / Delete actions */}
          {(onRemove || onDelete) && (
            <div className="border-t" style={{ borderColor: 'var(--border)' }}>
              {onRemove && (
                <button onClick={() => { onRemove(song.id); setShowMenu(false); setMenuAnchor(null) }}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-left transition-all hover:bg-orange-500/10"
                  style={{ color: '#fb923c' }}>
                  <Trash2 size={13} /> Remove
                </button>
              )}
              {onDelete && (
                <button onClick={() => { onDelete(song.id); setShowMenu(false); setMenuAnchor(null) }}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-left transition-all hover:bg-red-500/10"
                  style={{ color: '#f87171' }}>
                  <Trash2 size={13} /> Delete from Library
                </button>
              )}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
