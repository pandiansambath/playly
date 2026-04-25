import { create } from 'zustand'
import { Song, UserSong } from '@/lib/supabase'
import { api, invalidateCache } from '@/lib/api'

// Single source of truth for the user's library.
// Optimistic updates on add/remove/fav so UI reflects changes the instant the
// server call resolves — no cache invalidation guessing across pages.
interface LibraryState {
  entries: UserSong[]
  loaded: boolean
  loading: boolean
  fetch: (force?: boolean) => Promise<void>
  addSong: (song: Song, isFavorite?: boolean) => void
  removeSong: (songId: string) => void
  setFavorite: (songId: string, fav: boolean) => void
  reset: () => void
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  entries: [],
  loaded: false,
  loading: false,

  fetch: async (force = false) => {
    if (get().loading) return
    if (!force && get().loaded) return
    set({ loading: true })
    if (force) invalidateCache('library')
    try {
      const d = await api.getLibrary()
      set({ entries: d.songs || [], loaded: true, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  addSong: (song, isFavorite = false) => {
    set(state => {
      if (state.entries.some(e => e.songs.id === song.id)) return state
      const optimistic: UserSong = {
        id: `optimistic-${song.id}`,
        is_favorite: isFavorite,
        added_at: new Date().toISOString(),
        songs: song,
      }
      return { entries: [optimistic, ...state.entries] }
    })
    // Background reconcile so the optimistic entry gets the real DB id/timestamp
    invalidateCache('library')
    api.getLibrary().then(d => {
      if (d?.songs) set({ entries: d.songs, loaded: true })
    }).catch(() => {})
  },

  removeSong: (songId) => {
    set(state => ({ entries: state.entries.filter(e => e.songs.id !== songId) }))
  },

  setFavorite: (songId, fav) => {
    set(state => ({
      entries: state.entries.map(e =>
        e.songs.id === songId ? { ...e, is_favorite: fav } : e
      ),
    }))
  },

  reset: () => set({ entries: [], loaded: false, loading: false }),
}))
