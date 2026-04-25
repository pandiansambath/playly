'use client'
import { useEffect } from 'react'
import { useAuth } from './AuthProvider'
import { preloadSongs } from '@/store/playerStore'
import { useLibraryStore } from '@/store/libraryStore'

// Runs silently in the background — no UI rendered
// On login: hydrates the library store + preloads audio for instant playback
export function LibraryPreloader() {
  const { user } = useAuth()

  useEffect(() => {
    if (!user) {
      useLibraryStore.getState().reset()
      return
    }
    useLibraryStore.getState().fetch(true).then(() => {
      const songs = useLibraryStore.getState().entries.map(e => e.songs)
      preloadSongs(songs)
    })
  }, [user?.id])

  return null
}
