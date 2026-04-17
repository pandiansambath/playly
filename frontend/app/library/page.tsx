'use client'
import { useEffect, useState, useMemo } from 'react'
import { Library, Search, Clock, AlignLeft, Shuffle, Play, Grid3X3, List } from 'lucide-react'
import { api, invalidateCache } from '@/lib/api'
import { SongCard } from '@/components/SongCard'
import { Song, UserSong } from '@/lib/supabase'
import { preloadSongs, usePlayerStore } from '@/store/playerStore'
import { showToast } from '@/components/Toast'

type SortKey = 'added' | 'alpha'

export default function LibraryPage() {
  const [entries,  setEntries]  = useState<UserSong[]>([])
  const [loading,  setLoading]  = useState(true)
  const [filter,   setFilter]   = useState('')
  const [sort,     setSort]     = useState<SortKey>('added')
  const setCurrentSong = usePlayerStore(s => s.setCurrentSong)

  useEffect(() => {
    function fetchLibrary() {
      // Always invalidate so we never show stale data after a download
      invalidateCache('library')
      setLoading(true)
      api.getLibrary().then(d => {
        setEntries(d.songs)
        setLoading(false)
        // Kick off background preloading immediately — blob URLs = instant play
        preloadSongs(d.songs.map((e: any) => e.songs))
      }).catch(() => setLoading(false))
    }

    fetchLibrary() // Initial fetch

    // Re-fetch whenever the tab becomes visible again (handles back-navigation
    // where Next.js may restore this component from cache without remounting)
    const onVisible = () => { if (document.visibilityState === 'visible') fetchLibrary() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  async function toggleFav(songId: string) {
    const e = entries.find(x => x.songs.id === songId)
    if (!e) return
    e.is_favorite ? await api.removeFavorite(songId) : await api.addFavorite(songId)
    setEntries(prev => prev.map(x => x.songs.id === songId ? { ...x, is_favorite: !x.is_favorite } : x))
  }

  async function deleteSong(songId: string) {
    if (!confirm('Remove this song from your library?')) return
    try {
      await api.removeSong(songId)
      setEntries(prev => prev.filter(x => x.songs.id !== songId))
      showToast('Removed from library')
    } catch {
      showToast('Failed to remove', false)
    }
  }

  const filtered = useMemo(() => {
    let list = [...entries]
    if (filter.trim()) {
      const q = filter.toLowerCase()
      list = list.filter(e =>
        e.songs.title.toLowerCase().includes(q) ||
        (e.songs.movie_name || '').toLowerCase().includes(q)
      )
    }
    if (sort === 'alpha') list.sort((a, b) => a.songs.title.localeCompare(b.songs.title))
    if (sort === 'added') list.sort((a, b) => new Date(b.added_at).getTime() - new Date(a.added_at).getTime())
    return list
  }, [entries, filter, sort])

  const songs: Song[] = filtered.map(e => e.songs)
  function playAll()     { if (songs.length) setCurrentSong(songs[0], songs, 'My Library') }
  function playShuffle() {
    if (!songs.length) return
    const shuffled = [...songs].sort(() => Math.random() - 0.5)
    setCurrentSong(shuffled[0], shuffled, 'My Library')
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">

      {/* Header */}
      <div className="flex items-start justify-between mb-7 fade-in">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(var(--accent-rgb),0.12)', border: '1px solid rgba(var(--accent-rgb),0.2)' }}>
              <Library size={20} style={{ color: 'var(--accent)' }} />
            </div>
            <h1 className="text-2xl font-black">My Library</h1>
          </div>
          <p className="text-xs pl-[52px]" style={{ color: 'var(--text-muted)' }}>
            {loading ? 'Loading…' : `${entries.length} songs`}
          </p>
        </div>
        {songs.length > 0 && !loading && (
          <div className="flex gap-2">
            <button onClick={playShuffle}
              className="btn-ghost flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold">
              <Shuffle size={13} /> Shuffle
            </button>
            <button onClick={playAll}
              className="btn-accent flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold">
              <Play size={13} fill="white" /> Play All
            </button>
          </div>
        )}
      </div>

      {/* Filter + Sort bar */}
      {entries.length > 0 && !loading && (
        <div className="flex gap-2 mb-5 fade-in">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
            <input value={filter} onChange={e => setFilter(e.target.value)}
              placeholder="Filter songs…"
              className="input-field w-full pl-9 pr-4 py-2.5 rounded-xl text-sm" />
          </div>
          <div className="flex rounded-xl overflow-hidden p-1" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            {([
              { k: 'added', Icon: Clock,     label: 'Recent' },
              { k: 'alpha', Icon: AlignLeft,  label: 'A–Z'    },
            ] as const).map(({ k, Icon, label }) => (
              <button key={k} onClick={() => setSort(k)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200"
                style={sort === k ? {
                  background: 'var(--accent)', color: 'white',
                  boxShadow: '0 2px 8px rgba(var(--accent-rgb),0.35)',
                } : { color: 'var(--text-muted)' }}>
                <Icon size={12} />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="flex flex-col gap-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ animationDelay: `${i * 0.05}s` }}>
              <div className="w-11 h-11 rounded-xl shimmer flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 rounded-lg shimmer w-3/4" />
                <div className="h-2.5 rounded-lg shimmer w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Song list */}
      {!loading && (
        <div className="glass rounded-3xl overflow-hidden fade-in"
          style={{ border: '1px solid var(--border)' }}>
          {filtered.map((e, i) => (
            <div key={e.id} className="border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
              <SongCard
                song={e.songs}
                queue={songs}
                queueSource="My Library"
                isFavorite={e.is_favorite}
                onFavoriteToggle={toggleFav}
                onDelete={deleteSong}
              />
            </div>
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center py-24 fade-in">
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-5"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <Library size={36} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
          </div>
          <p className="text-base font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
            {filter ? 'No matches found' : 'Library is empty'}
          </p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {filter ? 'Try a different search term' : 'Search for songs and add them!'}
          </p>
        </div>
      )}
    </div>
  )
}
