import { createBrowserClient } from '@supabase/ssr'

// Singleton — one client shared across entire app
// createBrowserClient called multiple times = session state lost
let _supabase: ReturnType<typeof createBrowserClient> | null = null

export function getSupabaseClient() {
  if (!_supabase) {
    _supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return _supabase
}

export const supabase = getSupabaseClient()

export type Song = {
  id: string
  youtube_id: string
  title: string
  movie_name: string
  thumbnail_url: string
  duration_seconds: number
  supabase_url: string
}

export type UserSong = {
  id: string
  is_favorite: boolean
  added_at: string
  songs: Song
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
