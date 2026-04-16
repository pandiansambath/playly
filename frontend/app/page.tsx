'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Search, Music, Sparkles, Zap, Download,
  Clock, Play, BookOpen, LayoutGrid, Heart,
} from 'lucide-react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { SearchResult, YTResult } from '@/components/SearchResult'
import { useAuth } from '@/components/AuthProvider'
import { supabase } from '@/lib/supabase'
import { usePlayerStore } from '@/store/playerStore'
import { Song } from '@/lib/supabase'

// ─────────────────────────────────────────────────────────
// STARS CONFIG (fixed seed so no hydration mismatch)
// ─────────────────────────────────────────────────────────
const STARS = Array.from({ length: 55 }, (_, i) => ({
  w:    2 + (i * 17 % 3),
  top:  (i * 37 % 97) + '%',
  left: (i * 61 % 97) + '%',
  dur:  2.2 + (i * 0.13 % 2.4) + 's',
  del:  (i * 0.19 % 2.5) + 's',
  op:   0.15 + (i * 0.11 % 0.45),
}))

// ─────────────────────────────────────────────────────────
// WAVEFORM LOGO ICON (animated bars)
// ─────────────────────────────────────────────────────────
function PlayLyLogo({ size = 'xl' }: { size?: 'sm' | 'xl' }) {
  const heights = [38, 70, 55, 90, 42, 78, 52, 95, 60, 80]
  const scale   = size === 'xl' ? 1 : 0.55
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size === 'xl' ? 12 : 6 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: size === 'xl' ? 3 : 2 }}>
        {heights.map((h, i) => (
          <div key={i} className="logo-bar"
            style={{
              width:   Math.round(4 * scale),
              height:  Math.round(h * scale * 0.36),
              borderRadius: 99,
              background: 'linear-gradient(to top, var(--accent), var(--accent-alt))',
              transformOrigin: 'bottom',
              animationDuration: `${0.48 + i * 0.08}s`,
              animationDelay:    `${i * 0.045}s`,
            }} />
        ))}
      </div>
      <span style={{
        fontSize:   size === 'xl' ? 36 : 18,
        fontWeight: 900,
        letterSpacing: '-0.02em',
        background: 'var(--gradient-text)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor:  'transparent',
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
  const [error,   setError]   = useState('')

  async function signIn() {
    setLoading(true); setError('')
    const { error: e } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (e) { setError(e.message); setLoading(false) }
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
            animationDelay:    s.del,
          }} />
      ))}

      {/* ─── Aurora blobs ─── */}
      <div className="aurora-blob" style={{ width: 500, height: 500, top: '-10%', left: '-5%',  background: 'rgba(139,92,246,0.22)', animationDelay: '0s' }} />
      <div className="aurora-blob" style={{ width: 420, height: 420, top: '40%',  right: '-8%', background: 'rgba(236,72,153,0.18)', animationDelay: '2s' }} />
      <div className="aurora-blob" style={{ width: 360, height: 360, bottom: '-5%', left: '25%', background: 'rgba(99,102,241,0.15)', animationDelay: '4s' }} />

      {/* ─── LEFT PANEL ─── */}
      <div className="landing-left">

        {/* Logo */}
        <div className="mb-5 fade-in">
          <PlayLyLogo size="xl" />
        </div>

        {/* Hero */}
        <div className="mb-4 fade-in delay-100">
          <h1 className="landing-hero-title fade-in"
            style={{
              fontSize:    'clamp(2.2rem, 5vw, 3.8rem)',
              fontWeight:  900,
              lineHeight:  1.08,
              letterSpacing: '-0.03em',
              color: 'var(--text-primary)',
            }}>
            Your music,{' '}
            <span style={{
              background: 'linear-gradient(120deg, var(--accent), var(--accent-alt), #f97316)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor:  'transparent',
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
            [Zap,       'Instant play'],
            [Download,  'Offline ready'],
            [Sparkles,  'Smart discover'],
            [Heart,     'Build playlists'],
          ] as const).map(([Icon, lbl], i) => (
            <div key={i}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
              style={{
                background:  'rgba(255,255,255,0.06)',
                border:      '1px solid rgba(255,255,255,0.1)',
                fontSize:    12,
                color:       'var(--text-secondary)',
              }}>
              {/* @ts-ignore */}
              <Icon size={12} style={{ color: 'var(--accent)' }} />
              {lbl}
            </div>
          ))}
        </div>

        {/* ── Google OAuth button (animated border — Issue 3) ── */}
        <div className="fade-in delay-300">
          <button onClick={signIn} disabled={loading}
            id="google-signin-btn"
            className="oauth-google-btn w-full flex items-center justify-center gap-3 py-3.5 px-6 font-semibold text-sm disabled:opacity-60"
            style={{ maxWidth: 340 }}>
            {loading ? (
              <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            ) : (
              <svg width="20" height="20" viewBox="0 0 48 48">
                <path fill="#4285F4" d="M44.5 20H24v8.5h11.8C34.7 33.9 29.9 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.6 20-21 0-1.4-.1-2.7-.5-4z"/>
                <path fill="#34A853" d="M6.3 14.7l7 5.1C15.1 16 19.2 13 24 13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3 16.3 3 9.7 7.9 6.3 14.7z"/>
                <path fill="#FBBC05" d="M24 45c5.9 0 11-1.9 14.9-5.3l-6.9-5.7C29.9 36.1 27.1 37 24 37c-5.8 0-10.7-3.9-12.5-9.3l-7 5.4C7.9 41.2 15.4 45 24 45z"/>
                <path fill="#EA4335" d="M43.6 20H24v8.5h11.8c-.8 2.4-2.3 4.4-4.3 5.7l6.9 5.7C43 36 45 30.5 45 24c0-1.4-.2-2.7-.4-4z"/>
              </svg>
            )}
            <span style={{ color: '#ffffff' }}>
              {loading ? 'Signing in…' : 'Continue with Google'}
            </span>
          </button>
          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
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
              left:   `${18 + (i % 3) * 28}%`,
              animationDuration: `${2.5 + i * 0.5}s`,
              animationDelay:    `${i * 0.6}s`,
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
              animationDelay:    `${i * 0.04}s`,
            }} />
          ))}
        </div>
      </div>

      {/* ─── Subtle easter egg link — developer page ─── */}
      <Link href="/developer" className="dev-egg-link">
        made with ♪
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
  const [query,        setQuery]        = useState('')
  const [results,      setResults]      = useState<YTResult[]>([])
  const [searching,    setSearching]    = useState(false)
  const [downloading,  setDownloading]  = useState<Set<string>>(new Set())
  const [done,         setDone]         = useState<Set<string>>(new Set())
  const [error,        setError]        = useState('')
  const setCurrentSong = usePlayerStore(s => s.setCurrentSong)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

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
      await api.download(r.youtube_id)
      setDone(d => new Set([...d, r.youtube_id]))
    } catch {}
    finally { setDownloading(d => { const s = new Set(d); s.delete(r.youtube_id); return s }) }
  }

  function handlePlay(r: YTResult) {
    // Create a minimal Song object for immediate playback from search
    const song: Song = {
      id:               r.youtube_id,
      youtube_id:       r.youtube_id,
      title:            r.title,
      movie_name:       r.channel,
      thumbnail_url:    r.thumbnail_url,
      duration_seconds: r.duration_seconds,
      supabase_url:     '',
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
// ROOT PAGE
// ─────────────────────────────────────────────────────────
export default function HomePage() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <div className="flex flex-col items-center gap-5">
          <div className="flex items-end gap-1">
            {[40, 75, 55, 90, 45, 80, 52, 95, 62].map((h, i) => (
              <div key={i} className="eq-bar rounded-full"
                style={{
                  width: 5, height: `${h * 0.48}px`,
                  background: 'linear-gradient(to top, var(--accent), var(--accent-alt))',
                  transformOrigin: 'bottom',
                  animationDuration: `${0.5 + i * 0.08}s`,
                  animationDelay: `${i * 0.05}s`,
                }} />
            ))}
          </div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading PlayLy…</p>
        </div>
      </div>
    )
  }

  if (!user) return <LandingPage />
  return <SearchPage />
}
