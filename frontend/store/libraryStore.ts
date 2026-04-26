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
  lastError: string | null
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
  lastError: null,

  fetch: async (force = false) => {
    // Never block force=true. Worst case we have a duplicate request in flight;
    // the latest response wins. Blocking force=true caused the "library shows
    // empty after navigation" bug — if a previous fetch silently failed and
    // left loading=true, every subsequent call was a no-op.
    if (!force && (get().loaded || get().loading)) return

    set({ loading: true, lastError: null })
    if (force) invalidateCache('library')
    try {
      const d = await api.getLibrary()
      const entries: UserSong[] = (d?.songs || []) as UserSong[]
      // Only overwrite if non-empty OR if we genuinely had no entries before.
      // Defensive against transient empty responses wiping a populated list.
      const prev = get().entries
      const next = entries.length === 0 && prev.length > 0 ? prev : entries
      set({ entries: next, loaded: true, loading: false })
      if (typeof window !== 'undefined') {
        // helpful one-liner when the user opens DevTools to debug
        console.log(`[libraryStore] fetched ${entries.length} entries`)
      }
    } catch (e: any) {
      console.error('[libraryStore] fetch failed:', e)
      set({ loading: false, lastError: String(e?.message || e) })
    }
  },

  addSong: (song, isFavorite = false) => {
    // Optimistic — show in UI immediately
    set(state => {
      if (state.entries.some(e => e.songs.id === song.id)) return state
      const optimistic: UserSong = {
        id: `optimistic-${song.id}`,
        is_favorite: isFavorite,
        added_at: new Date().toISOString(),
        songs: song,
      }
      return { entries: [optimistic, ...state.entries], loaded: true }
    })
    // Background reconcile so the optimistic entry gets the real DB id/timestamp.
    // If server returns empty list (auth blip, transient error), DON'T wipe
    // the optimistic add — that was the source of "song disappears after click".
    invalidateCache('library')
    api.getLibrary().then(d => {
      if (d?.songs && d.songs.length > 0) {
        set({ entries: d.songs, loaded: true })
      }
    }).catch(e => console.error('[libraryStore] addSong refresh failed:', e))
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

  reset: () => set({ entries: [], loaded: false, loading: false, lastError: null }),
}))
