'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Search, Music, Sparkles, Zap, Download,
  Clock, Play, BookOpen, LayoutGrid, Heart,
} from 'lucide-react'
import Link from 'next/link'
import { api, invalidateCache } from '@/lib/api'
import { SearchResult, YTResult } from '@/components/SearchResult'
import { useAuth } from '@/components/AuthProvider'
import { showToast } from '@/components/Toast'
import { supabase } from '@/lib/supabase'
import { usePlayerStore } from '@/store/playerStore'
import { Song } from '@/lib/supabase'

// ─────────────────────────────────────────────────────────
// STARS CONFIG (fixed seed so no hydration mismatch)
// ─────────────────────────────────────────────────────────
const STARS = Array.from({ length: 55 }, (_, i) => ({
  w: 2 + (i * 17 % 3),
  top: (i * 37 % 97) + '%',
  left: (i * 61 % 97) + '%',
  dur: 2.2 + (i * 0.13 % 2.4) + 's',
  del: (i * 0.19 % 2.5) + 's',
  op: 0.15 + (i * 0.11 % 0.45),
}))

// ─────────────────────────────────────────────────────────
// WAVEFORM LOGO ICON (animated bars)
// ─────────────────────────────────────────────────────────
function PlayLyLogo({ size = 'xl' }: { size?: 'sm' | 'xl' }) {
  const heights = [38, 70, 55, 90, 42, 78, 52, 95, 60, 80]
  const scale = size === 'xl' ? 1 : 0.55
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size === 'xl' ? 12 : 6 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: size === 'xl' ? 3 : 2 }}>
        {heights.map((h, i) => (
          <div key={i} className="logo-bar"
            style={{
              width: Math.round(4 * scale),
              height: Math.round(h * scale * 0.36),
              borderRadius: 99,
              background: 'linear-gradient(to top, var(--accent), var(--accent-alt))',
              transformOrigin: 'bottom',
              animationDuration: `${0.48 + i * 0.08}s`,
              animationDelay: `${i * 0.045}s`,
            }} />
        ))}
      </div>
      <span style={{
        fontSize: size === 'xl' ? 36 : 18,
        fontWeight: 900,
        letterSpacing: '-0.02em',
        background: 'var(--gradient-text)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
      }}>PlayLy</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// LANDING PAGE
// ─────────────────────────────────────────────────────────
function LandingPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'google' | 'email'>('google')
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)

  async function signInGoogle() {
    setLoading(true); setError('')
    const { error: e } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (e) { setError(e.message); setLoading(false) }
  }

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password.trim()) { setError('Please fill in all fields'); return }
    setLoading(true); setError('')
    try {
      if (authMode === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password })
        if (err) setError(err.message)
      } else {
        const { error: err } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        })
        if (err) setError(err.message)
        else setError('Check your email to confirm your account ✓')
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally { setLoading(false) }
  }

  return (
    <div className="landing-root" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* ─── Star field ─── */}
      {STARS.map((s, i) => (
        <div key={i} className="landing-star pointer-events-none"
          style={{
            top: s.top, left: s.left,
            width: s.w, height: s.w,
            background: 'white',
            opacity: s.op,
            animationDuration: s.dur,
            animationDelay: s.del,
          }} />
      ))}

      {/* ─── Aurora blobs ─── */}
      <div className="aurora-blob" style={{ width: 500, height: 500, top: '-10%', left: '-5%', background: 'rgba(139,92,246,0.22)', animationDelay: '0s' }} />
      <div className="aurora-blob" style={{ width: 420, height: 420, top: '40%', right: '-8%', background: 'rgba(236,72,153,0.18)', animationDelay: '2s' }} />
      <div className="aurora-blob" style={{ width: 360, height: 360, bottom: '-5%', left: '25%', background: 'rgba(99,102,241,0.15)', animationDelay: '4s' }} />

      {/* ─── LEFT PANEL ─── */}
      <div className="landing-left">

        {/* Logo + mobile music disc */}
        <div className="mb-5 fade-in flex items-center justify-between gap-3">
          <PlayLyLogo size="xl" />
          <div className="landing-mobile-disc">
            <div className="landing-mobile-disc-inner">
              <Music size={28} style={{ color: 'rgba(196,181,253,0.9)' }} />
            </div>
          </div>
        </div>

        {/* Hero */}
        <div className="mb-4 fade-in delay-100">
          <h1 className="landing-hero-title fade-in"
            style={{
              fontSize: 'clamp(2.2rem, 5vw, 3.8rem)',
              fontWeight: 900,
              lineHeight: 1.08,
              letterSpacing: '-0.03em',
              color: 'var(--text-primary)',
            }}>
            Your music,{' '}
            <span style={{
              background: 'linear-gradient(120deg, var(--accent), var(--accent-alt), #f97316)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>beautifully</span>
            <br />streamed.
          </h1>
          <p className="landing-subtitle mt-3 text-sm leading-relaxed"
            style={{ color: 'var(--text-secondary)', maxWidth: 360 }}>
            Search millions of songs, build playlists, and listen instantly — all powered by YouTube.
          </p>
        </div>

        {/* Feature chips (compact) */}
        <div className="landing-feature-grid flex flex-wrap gap-2 mb-6 fade-in delay-200">
          {([
            [Zap, 'Instant play'],
            [Download, 'Offline ready'],
            [Sparkles, 'Smart discover'],
            [Heart, 'Build playlists'],
          ] as const).map(([Icon, lbl], i) => (
            <div key={i}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                fontSize: 12,
                color: 'var(--text-secondary)',
              }}>
              {/* @ts-ignore */}
              <Icon size={12} style={{ color: 'var(--accent)' }} />
              {lbl}
            </div>
          ))}
        </div>

        {/* ── Auth section ── */}
        <div className="fade-in delay-300" style={{ maxWidth: 340 }}>

          {/* Tab switcher */}
          <div className="flex gap-2 mb-4 p-1 rounded-2xl" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <button onClick={() => { setMode('google'); setError('') }}
              className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
              style={mode === 'google' ? {
                background: 'rgba(139,92,246,0.25)', color: 'rgba(255,255,255,0.9)',
                border: '1px solid rgba(139,92,246,0.4)',
              } : { color: 'rgba(255,255,255,0.4)' }}>
              Google
            </button>
            <button onClick={() => { setMode('email'); setError('') }}
              className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
              style={mode === 'email' ? {
                background: 'rgba(139,92,246,0.25)', color: 'rgba(255,255,255,0.9)',
                border: '1px solid rgba(139,92,246,0.4)',
              } : { color: 'rgba(255,255,255,0.4)' }}>
              Email
            </button>
          </div>

          {mode === 'google' ? (
            /* Google OAuth button */
            <button onClick={signInGoogle} disabled={loading}
              id="google-signin-btn"
              className="oauth-google-btn w-full flex items-center justify-center gap-3 py-3.5 px-6 font-semibold text-sm disabled:opacity-60">
              {loading ? (
                <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : (
                <svg width="20" height="20" viewBox="0 0 48 48">
                  <path fill="#4285F4" d="M44.5 20H24v8.5h11.8C34.7 33.9 29.9 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.6 20-21 0-1.4-.1-2.7-.5-4z" />
                  <path fill="#34A853" d="M6.3 14.7l7 5.1C15.1 16 19.2 13 24 13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3 16.3 3 9.7 7.9 6.3 14.7z" />
                  <path fill="#FBBC05" d="M24 45c5.9 0 11-1.9 14.9-5.3l-6.9-5.7C29.9 36.1 27.1 37 24 37c-5.8 0-10.7-3.9-12.5-9.3l-7 5.4C7.9 41.2 15.4 45 24 45z" />
                  <path fill="#EA4335" d="M43.6 20H24v8.5h11.8c-.8 2.4-2.3 4.4-4.3 5.7l6.9 5.7C43 36 45 30.5 45 24c0-1.4-.2-2.7-.4-4z" />
                </svg>
              )}
              <span style={{ color: '#ffffff' }}>
                {loading ? 'Signing in…' : 'Continue with Google'}
              </span>
            </button>
          ) : (
            /* Email / Password form */
            <form onSubmit={handleEmailAuth} className="flex flex-col gap-3">
              {/* Sign in / Sign up toggle */}
              <div className="flex gap-3 mb-1">
                <button type="button" onClick={() => { setAuthMode('signin'); setError('') }}
                  className="text-xs font-bold transition-all pb-1"
                  style={{
                    color: authMode === 'signin' ? 'var(--accent)' : 'rgba(255,255,255,0.35)',
                    borderBottom: authMode === 'signin' ? '2px solid var(--accent)' : '2px solid transparent',
                  }}>Sign In</button>
                <button type="button" onClick={() => { setAuthMode('signup'); setError('') }}
                  className="text-xs font-bold transition-all pb-1"
                  style={{
                    color: authMode === 'signup' ? 'var(--accent)' : 'rgba(255,255,255,0.35)',
                    borderBottom: authMode === 'signup' ? '2px solid var(--accent)' : '2px solid transparent',
                  }}>Sign Up</button>
              </div>

              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="Email address"
                required autoComplete="email"
                className="input-field w-full px-4 py-3 rounded-2xl text-sm"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
              />
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="Password"
                  required autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'}
                  className="input-field w-full px-4 py-3 pr-12 rounded-2xl text-sm"
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
                />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
                  style={{ color: 'var(--text-muted)' }}>
                  {showPass ? 'hide' : 'show'}
                </button>
              </div>

              <button type="submit" disabled={loading}
                className="w-full py-3.5 rounded-2xl text-sm font-bold text-white transition-all hover:opacity-90 active:scale-98 disabled:opacity-50"
                style={{
                  background: 'linear-gradient(135deg, var(--accent), var(--accent-alt))',
                  boxShadow: '0 8px 24px rgba(139,92,246,0.35)',
                }}>
                {loading
                  ? <div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin mx-auto" />
                  : authMode === 'signin' ? 'Sign In' : 'Create Account'
                }
              </button>
            </form>
          )}

          {error && (
            <p className={`mt-2 text-xs ${error.includes('✓') ? 'text-green-400' : 'text-red-400'}`}>{error}</p>
          )}
        </div>

        {/* Tiny note */}
        <p className="mt-4 fade-in delay-400" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Free forever · No credit card
        </p>
      </div>

      {/* ─── RIGHT PANEL — animated notes visual ─── */}
      <div className="hidden md:flex flex-col items-center justify-center flex-1 relative overflow-hidden"
        style={{ zIndex: 1 }}>
        {/* Big glowing disc */}
        <div className="relative flex items-center justify-center" style={{
          width: 260, height: 260,
          borderRadius: '50%',
          background: `radial-gradient(circle, rgba(139,92,246,0.18) 0%, transparent 70%)`,
        }}>
          {/* Outer ring */}
          <div style={{
            position: 'absolute', inset: -2,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(139,92,246,0.45), rgba(236,72,153,0.35), transparent)',
            animation: 'spin-disc 18s linear infinite',
          }} />
          {/* Album art mock */}
          <div style={{
            width: 200, height: 200, borderRadius: '50%',
            background: 'linear-gradient(135deg, #1a0a3a, #0f0715)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 20px 80px rgba(139,92,246,0.35)',
            border: '1px solid rgba(139,92,246,0.2)',
            position: 'relative',
          }}>
            <Music size={64} style={{ color: 'rgba(139,92,246,0.5)' }} />
            {/* Center dot */}
            <div style={{
              position: 'absolute', width: 16, height: 16, borderRadius: '50%',
              background: 'var(--accent)', top: '50%', left: '50%',
              transform: 'translate(-50%,-50%)',
              boxShadow: '0 0 12px rgba(139,92,246,0.8)',
            }} />
          </div>
        </div>

        {/* Floating notes */}
        {[...Array(6)].map((_, i) => (
          <div key={i}
            className="absolute text-2xl select-none pointer-events-none music-note"
            style={{
              bottom: `${15 + i * 12}%`,
              left: `${18 + (i % 3) * 28}%`,
              animationDuration: `${2.5 + i * 0.5}s`,
              animationDelay: `${i * 0.6}s`,
              opacity: 0,
              fontSize: 20 - i,
              color: i % 2 === 0 ? 'rgba(139,92,246,0.8)' : 'rgba(236,72,153,0.7)',
            }}>
            {i % 3 === 0 ? '♪' : i % 3 === 1 ? '♫' : '🎵'}
          </div>
        ))}

        {/* Waveform at bottom of right panel */}
        <div className="absolute bottom-10 flex items-end gap-1" style={{ opacity: 0.4 }}>
          {[...Array(18)].map((_, i) => (
            <div key={i} className="eq-bar" style={{
              width: 4,
              height: Math.round(8 + Math.sin(i * 0.9) * 20),
              borderRadius: 4,
              background: `linear-gradient(to top, var(--accent), var(--accent-alt))`,
              transformOrigin: 'bottom',
              animationDuration: `${0.5 + i * 0.06}s`,
              animationDelay: `${i * 0.04}s`,
            }} />
          ))}
        </div>
      </div>

      {/* Developer page — subtle but findable avatar badge bottom-right */}
      <Link href="/developer"
        style={{
          position: 'absolute', bottom: 18, right: 18,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 10px 6px 6px',
          borderRadius: 99,
          background: 'rgba(139,92,246,0.10)',
          border: '1px solid rgba(139,92,246,0.25)',
          backdropFilter: 'blur(10px)',
          textDecoration: 'none',
          opacity: 0.7,
          transition: 'opacity 0.25s, transform 0.25s',
          cursor: 'pointer',
          zIndex: 20,
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; (e.currentTarget as HTMLElement).style.transform = 'scale(1.05)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0.7'; (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}>
        <div style={{
          width: 26, height: 26, borderRadius: '50%',
          background: 'linear-gradient(135deg,#8B5CF6,#EC4899)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 900, color: 'white',
          boxShadow: '0 0 10px rgba(139,92,246,0.5)',
          flexShrink: 0,
        }}>PS</div>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap' }}>
          built by me ✦
        </span>
      </Link>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// SEARCH BAR
// ─────────────────────────────────────────────────────────
function SearchBar({ value, onChange, loading }: {
  value: string
  onChange: (v: string) => void
  loading: boolean
}) {
  return (
    <div className="relative">
      <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
        {loading
          ? <div className="w-4 h-4 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
          : <Search size={17} style={{ color: 'var(--text-muted)' }} />
        }
      </div>
      <input
        id="main-search"
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Search songs, artists, movies…"
        className="input-field w-full pl-11 pr-4 py-3.5 rounded-2xl text-sm font-medium"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        autoComplete="off"
        autoFocus
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// MAIN SEARCH / APP PAGE
// ─────────────────────────────────────────────────────────
function SearchPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<YTResult[]>([])
  const [searching, setSearching] = useState(false)
  const [downloading, setDownloading] = useState<Set<string>>(new Set())
  const [done, setDone] = useState<Set<string>>(new Set())
  const [downloadedSongs, setDownloadedSongs] = useState<Map<string, Song>>(new Map())
  const [error, setError] = useState('')
  const setCurrentSong = usePlayerStore(s => s.setCurrentSong)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Pre-load library on mount so already-downloaded songs show Play instead of Download
  useEffect(() => {
    api.getLibrary().then(d => {
      const doneIds = new Set<string>()
      const songsMap = new Map<string, Song>()
        ; (d.songs || []).forEach((e: any) => {
          const song: Song = e.songs
          if (song?.youtube_id) {
            doneIds.add(song.youtube_id)
            songsMap.set(song.youtube_id, song)
          }
        })
      setDone(doneIds)
      setDownloadedSongs(songsMap)
    }).catch(() => {/* silently ignore — user just won't see pre-marked songs */ })
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = query.trim()
    if (!q) { setResults([]); return }
    debounceRef.current = setTimeout(async () => {
      setSearching(true); setError('')
      try {
        const d = await api.search(q)
        setResults(d.results || [])
      } catch (e: any) {
        setError(e.message || 'Search failed')
      } finally { setSearching(false) }
    }, 420)
    return () => clearTimeout(debounceRef.current)
  }, [query])

  async function handleDownload(r: YTResult) {
    if (downloading.has(r.youtube_id)) return
    setDownloading(d => new Set([...d, r.youtube_id]))
    try {
      const result = await api.download(r.youtube_id)
      // Store the real song data (with supabase_url) for immediate playback
      if (result?.song) {
        setDownloadedSongs(prev => new Map(prev).set(r.youtube_id, result.song))
      }
      setDone(d => new Set([...d, r.youtube_id]))
      showToast('Added to library ✓')
    } catch (e: any) {
      const raw: string = e?.message || ''
      const friendly = raw.includes('cookie') || raw.includes('sign in') || raw.includes('bot') || raw.includes('authentication')
        ? 'YouTube blocked this download. Try another song or contact the admin.'
        : raw.includes('private') || raw.includes('unavailable')
          ? 'This video is private or unavailable.'
          : 'Download failed. Please try again.'
      showToast(friendly, false)
    } finally { setDownloading(d => { const s = new Set(d); s.delete(r.youtube_id); return s }) }
  }

  function handlePlay(r: YTResult) {
    // Use the real song data (with supabase_url) if we downloaded it this session
    const downloadedSong = downloadedSongs.get(r.youtube_id)
    const song: Song = downloadedSong ?? {
      id: r.youtube_id,
      youtube_id: r.youtube_id,
      title: r.title,
      movie_name: r.channel,
      thumbnail_url: r.thumbnail_url,
      duration_seconds: r.duration_seconds,
      supabase_url: '',
    }
    setCurrentSong(song, [song], 'Search')
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-6 page-pad">

      {/* Welcome header */}
      <div className="mb-5 fade-in">
        <div className="flex items-center gap-3 mb-1.5">
          <PlayLyLogo size="sm" />
        </div>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          What are you in the mood for?
        </p>
      </div>

      {/* Search bar */}
      <div className="mb-4 fade-in delay-100">
        <SearchBar value={query} onChange={setQuery} loading={searching} />
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-red-400 mb-3 px-1 fade-in">{error}</p>
      )}

      {/* Search results */}
      {results.length > 0 && (
        <div className="glass rounded-3xl overflow-hidden fade-in search-results-scroll"
          style={{ border: '1px solid var(--border)' }}>
          <div className="px-4 py-3 flex items-center justify-between border-b"
            style={{ borderColor: 'var(--border)' }}>
            <span className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
              {results.length} results
            </span>
          </div>
          {results.map((r) => (
            <div key={r.youtube_id} className="border-b last:border-b-0"
              style={{ borderColor: 'var(--border)' }}>
              <SearchResult
                result={r}
                onDownload={handleDownload}
                onPlay={handlePlay}
                isDownloading={downloading.has(r.youtube_id)}
                isDone={done.has(r.youtube_id)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!query && !searching && (
        <div className="flex flex-col items-center py-16 fade-in">
          <div className="w-16 h-16 rounded-3xl flex items-center justify-center mb-4"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <Search size={28} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
          </div>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Search to discover music</p>
        </div>
      )}

      {/* Subtle dev link */}
      <Link href="/developer" className="dev-egg-link">
        made with ♪
      </Link>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// INTRO / PRE-APP LOADING SCREEN
// Beautiful music-themed loader — shown between auth check and app entry.
// Auth + library pre-fetch happens elsewhere; this just makes the wait soothing.
// ─────────────────────────────────────────────────────────
function PlayLyIntroScreen() {
  const phrases = useMemo(() => [
    'tuning the strings…',
    'warming the speakers…',
    'dusting off the discs…',
    'loading your rhythm…',
    'almost there…',
  ], [])
  const [phraseIdx, setPhraseIdx] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setPhraseIdx(i => (i + 1) % phrases.length), 1400)
    return () => clearInterval(t)
  }, [phrases.length])

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden"
      style={{
        background:
          'radial-gradient(ellipse at 30% 20%, rgba(139,92,246,0.22) 0%, transparent 55%),' +
          'radial-gradient(ellipse at 75% 85%, rgba(236,72,153,0.18) 0%, transparent 55%),' +
          'var(--bg-base)',
      }}>
      {/* Aurora blobs */}
      <div className="aurora-blob" style={{ width: 420, height: 420, top: '-10%', left: '-8%', background: 'rgba(139,92,246,0.22)' }} />
      <div className="aurora-blob" style={{ width: 360, height: 360, bottom: '-10%', right: '-8%', background: 'rgba(236,72,153,0.18)', animationDelay: '1.5s' }} />

      {/* Stars */}
      {Array.from({ length: 40 }, (_, i) => (
        <div key={i} className="landing-star pointer-events-none" style={{
          top: `${i * 41 % 97}%`, left: `${i * 67 % 97}%`,
          width: 1 + (i % 3), height: 1 + (i % 3), background: 'white',
          opacity: 0.08 + (i * 0.01 % 0.25),
          animationDuration: `${1.8 + i * 0.14}s`, animationDelay: `${i * 0.1}s`,
        }} />
      ))}

      {/* Floating music notes rising */}
      {[...Array(8)].map((_, i) => (
        <div key={`note-${i}`} className="music-note pointer-events-none absolute select-none"
          style={{
            bottom: `${8 + (i * 11) % 35}%`,
            left: `${10 + (i * 13) % 80}%`,
            fontSize: 18 + (i % 3) * 4,
            color: i % 2 === 0 ? 'rgba(196,181,253,0.75)' : 'rgba(236,72,153,0.7)',
            animationDuration: `${2.8 + (i % 4) * 0.4}s`,
            animationDelay: `${i * 0.25}s`,
          }}>
          {i % 3 === 0 ? '♪' : i % 3 === 1 ? '♫' : '♬'}
        </div>
      ))}

      <div className="relative z-10 flex flex-col items-center gap-7">
        {/* Breathing vinyl disc with counter-rotating ring */}
        <div className="relative flex items-center justify-center"
          style={{ width: 148, height: 148 }}>
          {/* Outer blurred conic ring */}
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: 'conic-gradient(from 0deg, #8B5CF6, #EC4899, #F97316, #06B6D4, #8B5CF6)',
            filter: 'blur(14px)', opacity: 0.55,
            animation: 'spin-disc 5s linear infinite',
          }} />
          {/* Counter-rotating sharp ring */}
          <div style={{
            position: 'absolute', inset: 6, borderRadius: '50%',
            border: '1.5px dashed rgba(196,181,253,0.25)',
            animation: 'spin-disc 11s linear infinite reverse',
          }} />
          {/* Vinyl grooves */}
          <div style={{
            position: 'relative', width: 110, height: 110, borderRadius: '50%',
            background: 'radial-gradient(circle at 40% 40%, rgba(139,92,246,0.3) 0%, #1a0a3a 35%, #0f0715 70%)',
            border: '1px solid rgba(139,92,246,0.3)',
            boxShadow: '0 20px 60px rgba(139,92,246,0.5), inset 0 0 40px rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
            animation: 'spin-disc 3.2s linear infinite',
          }}>
            {/* Concentric groove lines */}
            {[0.78, 0.62, 0.46, 0.3].map((s, i) => (
              <div key={i} style={{
                position: 'absolute', inset: `${(1 - s) * 50}%`, borderRadius: '50%',
                border: '1px solid rgba(255,255,255,0.04)',
              }} />
            ))}
            <Music size={38} style={{ color: 'rgba(196,181,253,0.88)', position: 'relative', zIndex: 1 }} />
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              width: 10, height: 10, borderRadius: '50%',
              background: '#fff',
              transform: 'translate(-50%,-50%)',
              boxShadow: '0 0 10px rgba(255,255,255,0.9)',
              zIndex: 2,
            }} />
          </div>
        </div>

        {/* EQ bars */}
        <div className="flex items-end gap-1">
          {[40, 75, 55, 90, 45, 80, 52, 95, 62, 68, 82].map((h, i) => (
            <div key={i} className="eq-bar rounded-full"
              style={{
                width: 5, height: `${h * 0.5}px`,
                background: 'linear-gradient(to top, var(--accent), var(--accent-alt))',
                transformOrigin: 'bottom',
                animationDuration: `${0.45 + i * 0.06}s`,
                animationDelay: `${i * 0.04}s`,
                boxShadow: '0 0 6px rgba(139,92,246,0.6)',
              }} />
          ))}
        </div>

        {/* Wordmark */}
        <div style={{
          fontSize: 26, fontWeight: 900, letterSpacing: '-0.02em',
          background: 'linear-gradient(120deg, #a78bfa, #ec4899, #f97316)',
          WebkitBackgroundClip: 'text', backgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}>PlayLy</div>

        {/* Rotating phrase */}
        <p key={phraseIdx} className="fade-in text-xs font-medium"
          style={{ color: 'rgba(255,255,255,0.45)', letterSpacing: '0.02em' }}>
          {phrases[phraseIdx]}
        </p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// ROOT PAGE — shows the PlayLy intro for 2.2s after sign-in
// so the app entry always feels like a curtain rising
// ─────────────────────────────────────────────────────────
export default function HomePage() {
  const { user, loading } = useAuth()
  const [postLoginLinger, setPostLoginLinger] = useState(false)
  const prevUser = useRef<string | null>(null)

  useEffect(() => {
    const id = user?.id ?? null
    if (prevUser.current === null && id) {
      // Transition from signed-out/loading → signed-in: show intro 2.2s
      setPostLoginLinger(true)
      const t = setTimeout(() => setPostLoginLinger(false), 2200)
      return () => clearTimeout(t)
    }
    prevUser.current = id
  }, [user?.id])

  if (loading || postLoginLinger) {
    return <PlayLyIntroScreen />
  }

  if (!user) return <LandingPage />
  return <SearchPage />
}
