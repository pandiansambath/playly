'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, ListMusic, Plus, Play, Shuffle, X } from 'lucide-react'
import { api } from '@/lib/api'
import { Song } from '@/lib/supabase'
import { SongCard } from '@/components/SongCard'
import { preloadSongs, usePlayerStore } from '@/store/playerStore'

export default function PlaylistDetailPage() {
  const { id }  = useParams<{ id: string }>()
  const router  = useRouter()

  const [playlist,   setPlaylist]   = useState<any>(null)
  const [songs,      setSongs]      = useState<Song[]>([])
  const [library,    setLibrary]    = useState<Song[]>([])
  const [showPicker, setShowPicker] = useState(false)
  const [addingId,   setAddingId]   = useState<string | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [libSearch,  setLibSearch]  = useState('')

  const setCurrentSong = usePlayerStore(s => s.setCurrentSong)

  useEffect(() => {
    Promise.all([
      api.getPlaylistSongs(id),
      api.getPlaylists(),
      api.getLibrary(),
    ]).then(([psongs, pls, lib]) => {
      setSongs(psongs.songs.map((s: any) => s.songs))
      const pl = pls.playlists.find((p: any) => p.id === id)
      setPlaylist(pl || { name: 'Playlist', id })
      setLibrary(lib.songs.map((e: any) => e.songs))
      setLoading(false)
      preloadSongs(psongs.songs.map((s: any) => s.songs))
    })
  }, [id])

  async function addSong(song: Song) {
    setAddingId(song.id)
    await api.addToPlaylist(id, song.id)
    setSongs(prev => [...prev, song])
    setAddingId(null)
  }

  function playAll() {
    if (songs.length) setCurrentSong(songs[0], songs, playlist?.name || 'Playlist')
  }
  function playShuffle() {
    if (!songs.length) return
    const s = [...songs].sort(() => Math.random() - 0.5)
    setCurrentSong(s[0], s, playlist?.name || 'Playlist')
  }

  const filteredLibrary = library.filter(s =>
    !songs.find(ps => ps.id === s.id) &&
    (s.title.toLowerCase().includes(libSearch.toLowerCase()) ||
     (s.movie_name || '').toLowerCase().includes(libSearch.toLowerCase()))
  )

  if (loading) return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-9 h-9 rounded-lg shimmer" />
        <div className="h-6 shimmer rounded w-40" />
      </div>
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1">
          <div className="w-11 h-11 rounded-lg shimmer flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 rounded shimmer w-3/4" />
            <div className="h-2.5 rounded shimmer w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 fade-in">
        <button
          onClick={() => router.push('/playlists')}
          className="p-2 hover:bg-white/10 rounded-xl transition-colors text-white/60 hover:text-white"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <ListMusic size={20} className="text-purple-400 flex-shrink-0" />
          <h1 className="text-xl font-bold truncate">{playlist?.name}</h1>
          <span className="text-sm text-white/30 font-normal flex-shrink-0">({songs.length})</span>
        </div>
        <button
          onClick={() => setShowPicker(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium
            text-white transition-all hover:opacity-90"
          style={{ background: 'rgba(139,92,246,0.8)' }}
        >
          <Plus size={14} /> Add
        </button>
      </div>

      {/* Play controls */}
      {songs.length > 0 && (
        <div className="flex gap-2 mb-5">
          <button onClick={playShuffle}
            className="flex items-center gap-1.5 px-4 py-2 glass glass-hover rounded-xl text-xs font-medium text-white/70 hover:text-white transition-all">
            <Shuffle size={13} /> Shuffle
          </button>
          <button onClick={playAll}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium text-white transition-all hover:opacity-90"
            style={{ background: 'rgba(139,92,246,0.8)' }}>
            <Play size={13} fill="white" /> Play All
          </button>
        </div>
      )}

      {/* Songs */}
      {songs.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-white/20">
          <ListMusic size={52} className="mb-4 opacity-30" />
          <p className="text-sm">No songs yet — tap <strong className="text-white/40">Add</strong> to add from your library!</p>
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {songs.map(song => (
            <SongCard
              key={song.id}
              song={song}
              queue={songs}
              queueSource={playlist?.name || 'Playlist'}
            />
          ))}
        </div>
      )}

      {/* Song Picker Modal */}
      {showPicker && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center p-4">
          <div
            className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl expand-in"
            style={{
              background: 'rgba(18,18,26,0.98)',
              border: '1px solid rgba(255,255,255,0.08)',
              backdropFilter: 'blur(30px)',
            }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <h2 className="font-bold text-sm">Add songs from library</h2>
              <button
                onClick={() => { setShowPicker(false); setLibSearch('') }}
                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-white/50"
              >
                <X size={16} />
              </button>
            </div>
            <div className="px-4 py-3 border-b border-white/[0.06]">
              <input
                value={libSearch}
                onChange={e => setLibSearch(e.target.value)}
                placeholder="Search library…"
                autoFocus
                className="w-full bg-white/[0.05] border border-transparent rounded-xl
                  px-3 py-2 text-sm focus:outline-none focus:border-purple-500/30 placeholder-white/20"
              />
            </div>
            <div className="overflow-y-auto flex-1 p-3">
              {filteredLibrary.length === 0 && (
                <p className="text-center text-white/20 py-10 text-sm">
                  {library.length === songs.length ? 'All songs already in playlist!' : 'No results'}
                </p>
              )}
              {filteredLibrary.map(song => (
                <div key={song.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.05] transition-colors">
                  <img src={song.thumbnail_url} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{song.title}</p>
                    <p className="text-xs text-white/30 truncate">{song.movie_name || 'Unknown'}</p>
                  </div>
                  <button
                    onClick={() => addSong(song)}
                    disabled={addingId === song.id}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium
                      transition-all hover:opacity-90 disabled:opacity-40"
                    style={{ background: 'rgba(139,92,246,0.7)' }}
                  >
                    <Plus size={11} />
                    {addingId === song.id ? '…' : 'Add'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
