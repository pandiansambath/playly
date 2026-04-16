import { supabase } from './supabase'

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// ── Simple in-memory cache ──────────────────────────────────────────────────────────────────
// Stores API responses so navigating Library → Favorites → Library is instant
const cache = new Map<string, { data: any; ts: number }>()
const TTL = 60_000 // 60 seconds

function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.ts < TTL) return Promise.resolve(hit.data)
  return fetcher().then(data => { cache.set(key, { data, ts: Date.now() }); return data })
}

export function invalidateCache(key?: string) {
  if (key) cache.delete(key)
  else cache.clear()
}

async function headers() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')
  return {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  }
}

async function get(path: string) {
  try {
    const res = await fetch(`${BASE}${path}`, { headers: await headers() })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  } catch (e: any) {
    if (e.message === 'Not authenticated') throw e
    throw new Error(e.message || 'Network error — is the backend running?')
  }
}

async function post(path: string, body?: object) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: await headers(),
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

async function put(path: string, body?: object) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: await headers(),
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

async function del(path: string) {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE', headers: await headers() })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export const api = {
  search:             (q: string)                             => get(`/search?q=${encodeURIComponent(q)}`),
  download:           (youtube_id: string, quality = '192')   => post('/download', { youtube_id, quality }).then(d => { invalidateCache('library'); return d }),
  getLibrary:         (page = 1)                              => cached(`library_${page}`, () => get(`/songs?page=${page}`)),
  removeSong:         (id: string)                            => del(`/songs/${id}`).then(d => { invalidateCache('library_1'); return d }),
  getFavorites:       ()                                      => cached('favorites', () => get('/favorites')),
  addFavorite:        (id: string)                            => post(`/favorites/${id}`).then(d => { invalidateCache('favorites'); return d }),
  removeFavorite:     (id: string)                            => del(`/favorites/${id}`).then(d => { invalidateCache('favorites'); return d }),
  getPlaylists:       ()                                      => cached('playlists', () => get('/playlists')),
  createPlaylist:     (name: string)                          => post('/playlists', { name }).then(d => { invalidateCache('playlists'); return d }),
  deletePlaylist:     (id: string)                            => del(`/playlists/${id}`).then(d => { invalidateCache('playlists'); return d }),
  getPlaylistSongs:   (pid: string)                           => cached(`playlist_${pid}`, () => get(`/playlists/${pid}/songs`)),
  addToPlaylist:      (pid: string, song_id: string)          => post(`/playlists/${pid}/songs`, { song_id }).then(d => { invalidateCache(`playlist_${pid}`); return d }),
  removeFromPlaylist: (pid: string, song_id: string)          => del(`/playlists/${pid}/songs/${song_id}`).then(d => { invalidateCache(`playlist_${pid}`); return d }),
  getHistory:         (page = 1)                              => get(`/history?page=${page}`),
  logPlay:            (song_id: string)                       => post('/history', { song_id }),
  clearHistory:       ()                                      => del('/history'),
  getPreferences:     ()                                      => get('/preferences'),
  updatePreferences:  (data: object)                          => put('/preferences', data),
}
