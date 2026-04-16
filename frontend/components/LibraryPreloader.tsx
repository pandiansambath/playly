'use client'
import { useEffect } from 'react'
import { useAuth } from './AuthProvider'
import { api } from '@/lib/api'
import { preloadSongs } from '@/store/playerStore'

// Runs silently in the background — no UI rendered
// On login: fetches entire library and preloads all audio into browser cache
// This is why songs play instantly — by the time user clicks, audio is already cached
export function LibraryPreloader() {
  const { user } = useAuth()

  useEffect(() => {
    if (!user) return
    const t = setTimeout(() => {
      api.getLibrary().then(d => {
        const songs = d.songs.map((e: any) => e.songs)
        preloadSongs(songs)
      }).catch(() => {})  // silently ignore — backend may not be ready yet
    }, 5000)  // 5s — give user time to click a song first before flooding network
    return () => clearTimeout(t)
  }, [user?.id])

  return null
}
