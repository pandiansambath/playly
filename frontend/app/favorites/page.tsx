'use client'
import { useEffect, useState } from 'react'
import { Heart, Play, Shuffle } from 'lucide-react'
import { api } from '@/lib/api'
import { SongCard } from '@/components/SongCard'
import { Song } from '@/lib/supabase'
import { usePlayerStore } from '@/store/playerStore'

export default function FavoritesPage() {
  const [favs,    setFavs]    = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const setCurrentSong = usePlayerStore(s => s.setCurrentSong)

  useEffect(() => {
    api.getFavorites().then(d => { setFavs(d.favorites); setLoading(false) })
  }, [])

  async function remove(id: string) {
    await api.removeFavorite(id)
    setFavs(p => p.filter(f => f.songs.id !== id))
  }

  const songs: Song[] = favs.map(f => f.songs)
  function playAll()     { if (songs.length) setCurrentSong(songs[0], songs, 'Favorites') }
  function playShuffle() {
    if (!songs.length) return
    const s = [...songs].sort(() => Math.random() - 0.5)
    setCurrentSong(s[0], s, 'Favorites')
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-start justify-between mb-7 fade-in">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(244,63,94,0.12)', border: '1px solid rgba(244,63,94,0.2)' }}>
              <Heart size={20} style={{ color: '#f43f5e' }} fill="#f43f5e" />
            </div>
            <h1 className="text-2xl font-black">Favorites</h1>
          </div>
          <p className="text-xs pl-[52px]" style={{ color: 'var(--text-muted)' }}>
            {loading ? 'Loading…' : `${favs.length} songs`}
          </p>
        </div>
        {songs.length > 0 && !loading && (
          <div className="flex gap-2">
            <button onClick={playShuffle}
              className="btn-ghost flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold">
              <Shuffle size={13} /> Shuffle
            </button>
            <button onClick={playAll}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90"
              style={{ background: '#f43f5e' }}>
              <Play size={13} fill="white" /> Play All
            </button>
          </div>
        )}
      </div>

      {loading && (
        <div className="flex flex-col gap-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl">
              <div className="w-11 h-11 rounded-xl shimmer flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 rounded-lg shimmer w-3/4" />
                <div className="h-2.5 rounded-lg shimmer w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && (
        <div className="glass rounded-3xl overflow-hidden fade-in" style={{ border: '1px solid var(--border)' }}>
          {favs.map(f => (
            <div key={f.id} className="border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
              <SongCard
                song={f.songs}
                queue={songs}
                queueSource="Favorites"
                isFavorite
                onFavoriteToggle={remove}
                showRemove
                onRemove={remove}
              />
            </div>
          ))}
        </div>
      )}

      {!loading && favs.length === 0 && (
        <div className="flex flex-col items-center py-24 fade-in">
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-5"
            style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.15)' }}>
            <Heart size={36} style={{ color: '#f43f5e', opacity: 0.5 }} />
          </div>
          <p className="text-base font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>No favorites yet</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Heart songs from your library to see them here</p>
        </div>
      )}
    </div>
  )
}
