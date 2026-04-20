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
    // Warm CDN edges and kick off blob downloads immediately — the 5s delay
    // caused a 3-4s cold start on site entry because the current song's
    // CDN edge was never pre-warmed before the audio element fetched it.
    api.getLibrary().then(d => {
      const songs = d.songs.map((e: any) => e.songs)
      preloadSongs(songs)
    }).catch(() => {})
  }, [user?.id])

  return null
}
