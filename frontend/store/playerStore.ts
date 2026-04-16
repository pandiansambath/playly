import { create } from 'zustand'
import { Song } from '@/lib/supabase'
import { getSongColor } from '@/lib/colorExtract'

// ─── Global Audio Element (single, persistent) ────────────────────────────────
let globalAudio: HTMLAudioElement | null = null

export function getAudio(): HTMLAudioElement {
  if (typeof window === 'undefined') return null as any
  if (!globalAudio) {
    globalAudio = new Audio()
    globalAudio.preload = 'auto'
  }
  return globalAudio
}

// ─── Background preload cache ─────────────────────────────────────────────────
const preloadCache  = new Map<string, HTMLAudioElement>()
const blobUrlCache  = new Map<string, string>()   // supabase_url → blob:// URL
const fetchingCache = new Set<string>()            // prevent duplicate fetches

// Download full MP3 into memory as Blob URL
// blob:// URLs are 100% local — seek is always instant, no network needed
async function downloadToBlob(url: string) {
  if (blobUrlCache.has(url) || fetchingCache.has(url)) return
  fetchingCache.add(url)
  try {
    const res  = await fetch(url)
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    blobUrlCache.set(url, blobUrl)
  } catch {}
  finally { fetchingCache.delete(url) }
}

// Returns blob URL if downloaded, otherwise original URL
export function getPlayUrl(supabaseUrl: string): string {
  return blobUrlCache.get(supabaseUrl) ?? supabaseUrl
}

export function preloadSongs(songs: Song[]) {
  const currentUrl = getAudio()?.src
  songs.forEach((song, i) => {
    const url = song.supabase_url
    if (url === currentUrl) return
    if (blobUrlCache.has(url) || fetchingCache.has(url)) return
    if (!preloadCache.has(url)) {
      const a = new Audio()
      a.preload = 'none'  // don't double-fetch, we handle it below
      preloadCache.set(url, a)
    }
    // Stagger downloads 800ms apart — first song downloads immediately
    setTimeout(() => downloadToBlob(url), i * 800)
  })
}

// ─── Media Session ─────────────────────────────────────────────────────────────
function updateMediaSession(song: Song | null, isPlaying: boolean) {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
  if (!song) { navigator.mediaSession.metadata = null; return }
  navigator.mediaSession.metadata = new MediaMetadata({
    title: song.title,
    artist: song.movie_name || 'PlayLy',
    artwork: [{ src: song.thumbnail_url, sizes: '512x512', type: 'image/jpeg' }],
  })
  navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'
}

// ─── Types ─────────────────────────────────────────────────────────────────────
export type RepeatMode = 'none' | 'one' | 'all'

interface PlayerState {
  currentSong: Song | null
  queue:       Song[]
  isPlaying:   boolean
  buffering:   boolean
  currentTime: number
  duration:    number
  volume:      number
  shuffle:     boolean
  repeat:      RepeatMode
  accentColor: string
  expanded:    boolean
  showVideo:   boolean
  queueSource: string

  setCurrentSong: (song: Song, queue?: Song[], source?: string) => void
  setIsPlaying:   (v: boolean) => void
  setBuffering:   (v: boolean) => void
  setCurrentTime: (v: number) => void
  setDuration:    (v: number) => void
  setVolume:      (v: number) => void
  clearPlayer:    () => void
  next:           () => void
  prev:           () => void
  toggleShuffle:  () => void
  cycleRepeat:    () => void
  setExpanded:    (v: boolean) => void
  setShowVideo:   (v: boolean) => void
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentSong: null,
  queue:       [],
  isPlaying:   false,
  buffering:   false,
  currentTime: 0,
  duration:    0,
  volume:      0.8,
  shuffle:     false,
  repeat:      'none',
  accentColor: '139,92,246',
  expanded:    false,
  showVideo:   false,
  queueSource: '',

  setCurrentSong: (song, queue = [], source = '') => {
    const audio = getAudio()
    if (!audio) return

    const oldHandler = (audio as any)._playHandler
    if (oldHandler) {
      audio.removeEventListener('canplay', oldHandler)
      delete (audio as any)._playHandler
    }

    set({ currentSong: song, queue, isPlaying: false, buffering: true,
          currentTime: 0, showVideo: false,
          accentColor: getSongColor(song.youtube_id), queueSource: source })
    updateMediaSession(song, false)

    // Use blob URL if already downloaded — instant seek, no network
    const playUrl = getPlayUrl(song.supabase_url)

    if (audio.src === playUrl) {
      audio.currentTime = 0
      audio.volume = get().volume
      audio.play().catch(console.error)
      return
    }

    audio.src    = playUrl
    audio.volume = get().volume

    // If blob URL — data is local, play immediately
    if (playUrl.startsWith('blob:')) {
      audio.play().catch(console.error)
      return
    }

    // Original URL — wait for canplay, also start downloading to blob in background
    downloadToBlob(song.supabase_url)
    audio.load()
    const onCanPlay = () => {
      audio.removeEventListener('canplay', onCanPlay)
      delete (audio as any)._playHandler
      if (usePlayerStore.getState().currentSong?.id === song.id) {
        audio.play().catch(console.error)
      }
    }
    ;(audio as any)._playHandler = onCanPlay
    audio.addEventListener('canplay', onCanPlay)
  },

  setBuffering: (v) => set({ buffering: v }),

  setIsPlaying: (v) => {
    const audio = getAudio()
    if (!audio) return
    if (v) {
      // Just call play() — browser handles buffering automatically
      // Never call audio.load() on resume — it clears the buffer = 30s cold start
      audio.play().catch(console.error)
    } else {
      audio.pause()
    }
    updateMediaSession(get().currentSong, v)
    set({ isPlaying: v })
  },

  setCurrentTime: (v) => set({ currentTime: v }),
  setDuration:    (v) => set({ duration: v }),

  setVolume: (v) => {
    const audio = getAudio()
    if (audio) audio.volume = v
    set({ volume: v })
  },

  clearPlayer: () => {
    const audio = getAudio()
    if (audio) { audio.pause(); audio.src = '' }
    set({ currentSong: null, queue: [], isPlaying: false, currentTime: 0,
          expanded: false, showVideo: false })
  },

  next: () => {
    const { queue, currentSong, repeat, shuffle, queueSource } = get()
    if (!currentSong || queue.length === 0) return
    if (repeat === 'one') {
      const audio = getAudio()
      if (audio) { audio.currentTime = 0; audio.play().catch(console.error) }
      set({ currentTime: 0 }); return
    }
    const idx = queue.findIndex(s => s.id === currentSong.id)
    let nextIdx: number
    if (shuffle) {
      const pool = queue.map((_, i) => i).filter(i => i !== idx)
      if (!pool.length) return
      nextIdx = pool[Math.floor(Math.random() * pool.length)]
    } else {
      nextIdx = idx + 1
      if (nextIdx >= queue.length) {
        if (repeat === 'all') nextIdx = 0
        else return
      }
    }
    get().setCurrentSong(queue[nextIdx], queue, queueSource)
  },

  prev: () => {
    const { queue, currentSong, currentTime, queueSource } = get()
    if (!currentSong) return
    const audio = getAudio()
    if (currentTime > 3) {
      if (audio) audio.currentTime = 0
      set({ currentTime: 0 }); return
    }
    if (!queue.length) return
    const idx = queue.findIndex(s => s.id === currentSong.id)
    get().setCurrentSong(queue[(idx - 1 + queue.length) % queue.length], queue, queueSource)
  },

  toggleShuffle: () => set(s => ({ shuffle: !s.shuffle })),
  cycleRepeat:   () => set(s => ({
    repeat: s.repeat === 'none' ? 'all' : s.repeat === 'all' ? 'one' : 'none'
  })),
  setExpanded:   (v) => set({ expanded: v }),
  setShowVideo:  (v) => set({ showVideo: v }),
}))

// ─── Keyboard shortcuts ────────────────────────────────────────────────────────
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    const tag = (document.activeElement as HTMLElement)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    const s = usePlayerStore.getState()
    if (!s.currentSong) return
    const audio = getAudio()
    switch (e.code) {
      case 'Space':      e.preventDefault(); s.setIsPlaying(!s.isPlaying); break
      case 'ArrowRight': e.preventDefault(); if (audio) audio.currentTime = Math.min(audio.currentTime + 10, audio.duration || 0); break
      case 'ArrowLeft':  e.preventDefault(); if (audio) audio.currentTime = Math.max(audio.currentTime - 10, 0); break
      case 'ArrowUp':    e.preventDefault(); s.setVolume(Math.min(s.volume + 0.1, 1)); break
      case 'ArrowDown':  e.preventDefault(); s.setVolume(Math.max(s.volume - 0.1, 0)); break
      case 'KeyN':       s.next(); break
      case 'KeyP':       s.prev(); break
    }
  })

  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play',          () => usePlayerStore.getState().setIsPlaying(true))
    navigator.mediaSession.setActionHandler('pause',         () => usePlayerStore.getState().setIsPlaying(false))
    navigator.mediaSession.setActionHandler('nexttrack',     () => usePlayerStore.getState().next())
    navigator.mediaSession.setActionHandler('previoustrack', () => usePlayerStore.getState().prev())
  }
}
