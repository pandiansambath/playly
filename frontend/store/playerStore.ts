import { create } from 'zustand'
import { Song } from '@/lib/supabase'
import { getSongColor } from '@/lib/colorExtract'

// ─── Global Audio Element (single, persistent) ────────────────────────────────
let globalAudio: HTMLAudioElement | null = null

export function getAudio(): HTMLAudioElement {
  if (typeof window === 'undefined') return null as any
  if (!globalAudio) {
    globalAudio = new Audio()
    // CRITICAL: must be set BEFORE assigning src. Without this,
    // (a) MediaElementAudioSource (used by the magic visualizer + video toggle)
    //     emits ZEROES — Chrome console literally says "MediaElementAudioSource
    //     outputs zeroes due to CORS access restrictions". This was the
    //     root cause of "audio plays in mute until reload".
    // (b) fetch() of the same MP3 URL gets blocked by CORS preflight.
    // R2's bucket CORS rules now allow our origins (see scripts/setup_r2_cors.py).
    globalAudio.crossOrigin = 'anonymous'
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

// Warm CDN edge by sending a cheap HEAD request (no body transfer).
// Subsequent GETs from any client hit the warm edge cache.
async function warmCdn(url: string) {
  try { await fetch(url, { method: 'HEAD', cache: 'force-cache' }) } catch {}
}

export function preloadSongs(songs: Song[]) {
  const currentUrl = getAudio()?.src
  // 1) Warm ALL song URLs at the CDN edge immediately — HEAD is tiny.
  //    This fixes the "3-4s cold start" when a user revisits the site.
  songs.forEach(s => {
    if (s.supabase_url && s.supabase_url !== currentUrl) warmCdn(s.supabase_url)
  })
  // 2) Full blob download — more aggressive than before so revisits feel
  //    instant: first 5 in parallel, rest staggered 150 ms.
  songs.forEach((song, i) => {
    const url = song.supabase_url
    if (!url || url === currentUrl) return
    if (blobUrlCache.has(url) || fetchingCache.has(url)) return
    if (!preloadCache.has(url)) preloadCache.set(url, new Audio())
    const delay = i < 5 ? 0 : (i - 4) * 150
    setTimeout(() => downloadToBlob(url), delay)
  })
}

// Register an already-fetched blob (e.g. the bytes we just downloaded from
// cnv.cx during a V2 add) so the user can play that song instantly without a
// second round-trip to R2. Called from handleDownload after upload succeeds.
export function registerBlob(url: string, mp3: Blob) {
  if (!url || blobUrlCache.has(url)) return
  blobUrlCache.set(url, URL.createObjectURL(mp3))
}

// Eagerly download a specific song's blob now — no stagger.
// Used when a new song starts so the FOLLOWING song is always ready.
export function preloadNow(url: string) {
  if (!url) return
  if (blobUrlCache.has(url) || fetchingCache.has(url)) return
  warmCdn(url)
  downloadToBlob(url)
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
  volume:      1.0,
  shuffle:     false,
  repeat:      'none',
  accentColor: '139,92,246',
  expanded:    false,
  showVideo:   false,
  queueSource: '',

  setCurrentSong: (song, queue = [], source = '') => {
    const audio = getAudio()
    if (!audio) return

    set({ currentSong: song, queue, isPlaying: false, buffering: true,
          currentTime: 0, showVideo: false,
          accentColor: getSongColor(song.youtube_id), queueSource: source })
    // Tell the OS media session we're playing — keeps the session active
    // in the background so subsequent auto-advances aren't blocked.
    updateMediaSession(song, true)

    const playUrl = getPlayUrl(song.supabase_url)

    // Browser will play automatically as soon as data is buffered.
    // This works reliably in background (screen off) where explicit
    // play() calls on canplay can be throttled or rejected.
    audio.autoplay = true
    audio.volume   = get().volume

    if (audio.src !== playUrl) {
      audio.src = playUrl
      audio.load()
    } else {
      audio.currentTime = 0
    }
    // Best-effort explicit play — falls back to autoplay if rejected
    audio.play().catch(() => {})

    // If we're on the original URL, keep downloading the blob in the background.
    if (!playUrl.startsWith('blob:')) downloadToBlob(song.supabase_url)

    // Eagerly cache the NEXT song(s) so auto-advance past song 2 is instant,
    // even when the tab is backgrounded and the network is throttled.
    if (queue.length > 1) {
      const idx = queue.findIndex(s => s.id === song.id)
      for (let i = 1; i <= 2; i++) {
        const nxt = queue[(idx + i) % queue.length]
        if (nxt) preloadNow(nxt.supabase_url)
      }
    }
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
