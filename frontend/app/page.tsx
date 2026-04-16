'use client'
import { useState, useEffect, useRef } from 'react'
import {
  Search, Link as LinkIcon, Sparkles, Zap, Download,
  Smartphone, Mail, Lock, User, Eye, EyeOff,
  Music, Play, Headphones, Radio, Mic2,
} from 'lucide-react'
import { api } from '@/lib/api'
import { SearchResult, YTResult } from '@/components/SearchResult'
import { useAuth } from '@/components/AuthProvider'
import { supabase } from '@/lib/supabase'
import { usePlayerStore } from '@/store/playerStore'

function extractYoutubeId(input: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/,
    /^([A-Za-z0-9_-]{11})$/,
  ]
  for (const p of patterns) {
    const m = input.match(p)
    if (m) return m[1]
  }
  return null
}

// ── Floating music note ────────────────────────────────────────────────────────
function MusicNote({ style }: { style: React.CSSProperties }) {
  const notes = ['♪', '♫', '♩', '♬']
  const note = notes[Math.floor(Math.random() * notes.length)]
  return (
    <span className="absolute text-2xl pointer-events-none select-none music-note"
      style={{ color: `rgba(var(--accent-rgb),0.4)`, ...style }}>
      {note}
    </span>
  )
}

// ── Animated waveform visualizer ──────────────────────────────────────────────
function Waveform() {
  const heights = [20, 45, 30, 60, 40, 70, 35, 55, 25, 50, 38, 65, 28, 48, 32]
  return (
    <div className="flex items-end gap-[3px] h-16">
      {heights.map((h, i) => (
        <div key={i}
          className="w-1.5 rounded-full"
          style={{
            height: `${h}%`,
            background: `linear-gradient(to top, var(--accent), var(--accent-alt))`,
            opacity: 0.7 + (i % 3) * 0.1,
            animation: `wave-rise ${0.6 + (i % 5) * 0.15}s ease-in-out infinite`,
            animationDelay: `${i * 0.08}s`,
          }} />
      ))}
    </div>
  )
}

// ── Landing Page ───────────────────────────────────────────────────────────────
function LandingPage() {
  const [tab,      setTab]      = useState<'signin' | 'signup'>('signin')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [name,     setName]     = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [animating,setAnimating]= useState(false)
  const [msg,      setMsg]      = useState<{ text: string; ok: boolean } | null>(null)

  const notes = [
    { top: '15%', left: '5%',  animationDuration: '4s',  animationDelay: '0s'   },
    { top: '60%', left: '8%',  animationDuration: '5s',  animationDelay: '1.5s' },
    { top: '35%', left: '18%', animationDuration: '4.5s',animationDelay: '0.8s' },
    { top: '75%', left: '22%', animationDuration: '6s',  animationDelay: '2.2s' },
    { top: '20%', left: '30%', animationDuration: '3.5s',animationDelay: '1s'   },
  ]

  const features = [
    { icon: <Zap size={18} />,        title: 'Instant Stream',  desc: 'Zero buffering MP3', color: '#F59E0B' },
    { icon: <Download size={18} />,   title: 'Free Downloads',  desc: 'Keep forever',        color: '#10B981' },
    { icon: <Smartphone size={18} />, title: 'Background Play', desc: 'Lock screen controls', color: '#3B82F6' },
    { icon: <Sparkles size={18} />,   title: 'Zero Ads',        desc: 'Clean forever',        color: '#EC4899' },
  ]

  function switchTab(t: 'signin' | 'signup') {
    setAnimating(true)
    setTimeout(() => { setTab(t); setMsg(null); setAnimating(false) }, 180)
  }

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setMsg(null)
    try {
      if (tab === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        if (data.user && name.trim()) {
          await supabase.from('users').update({ name: name.trim() }).eq('id', data.user.id)
        }
        setMsg({ text: '✅ Account created! You are now signed in.', ok: true })
      }
    } catch (err: any) {
      setMsg({ text: err.message || 'Something went wrong', ok: false })
    } finally {
      setLoading(false)
    }
  }

  function googleLogin() {
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/` : '/' }
    })
  }

  return (
    <div className="fixed inset-0 flex overflow-hidden" style={{ background: 'var(--bg-base)' }}>

      {/* Aurora blobs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="aurora-blob" style={{ width:'600px',height:'600px',top:'-150px',left:'-150px',background:'radial-gradient(circle,rgba(var(--accent-rgb),0.25),transparent 70%)',opacity:0.8 }} />
        <div className="aurora-blob" style={{ width:'500px',height:'500px',bottom:'-100px',right:'-100px',background:'radial-gradient(circle,rgba(var(--accent-alt-rgb),0.2),transparent 70%)',opacity:0.7,animationDelay:'3s' }} />
        <div className="aurora-blob" style={{ width:'400px',height:'400px',top:'40%',left:'35%',background:'radial-gradient(circle,rgba(59,130,246,0.12),transparent 70%)',animationDelay:'1.5s' }} />
      </div>

      {/* Left hero panel — overflow-y-auto so feature grid isn't cut on small screens */}
      <div className="landing-left hidden md:flex flex-col px-12 flex-1 relative z-10 overflow-y-auto py-4">
        <div className="relative">

          {/* Floating notes */}
          {notes.map((n, i) => <MusicNote key={i} style={n} />)}

          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-4 mt-auto fade-in"
            style={{ background: 'rgba(var(--accent-rgb),0.1)', border: '1px solid rgba(var(--accent-rgb),0.25)' }}>
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              Free forever · No ads · YouTube-powered
            </span>
          </div>

          {/* Hero headline */}
          <h1 className="text-6xl lg:text-8xl font-black tracking-tight mb-3 leading-none fade-in delay-100">
            <span className="gradient-text-animated">Play</span>
            <span style={{ color: 'var(--text-primary)' }}>Ly</span>
          </h1>
          <p className="text-xl mb-2 leading-relaxed max-w-xs fade-in delay-200"
            style={{ color: 'var(--text-secondary)' }}>
            Your personal music universe.
          </p>
          <p className="text-base mb-5 max-w-sm fade-in delay-300"
            style={{ color: 'var(--text-muted)' }}>
            Search any song. Stream instantly. Download free. Build your library — forever.
          </p>

          {/* Waveform */}
          <div className="mb-5 fade-in delay-300">
            <Waveform />
          </div>

          {/* Feature grid */}
          <div className="grid grid-cols-2 gap-3 max-w-sm fade-in delay-400">
            {features.map((f) => (
              <div key={f.title}
                className="glass glass-hover rounded-2xl p-4 card-lift"
                style={{ borderColor: `${f.color}22` }}>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: `${f.color}18`, color: f.color }}>
                  {f.icon}
                </div>
                <p className="text-sm font-bold mb-0.5">{f.title}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="mb-auto" />
      </div>

      {/* Right auth panel */}
      <div className="flex flex-col justify-center items-center w-full md:w-[440px] md:flex-shrink-0 px-6 relative z-10">

        {/* Mobile hero */}
        <div className="md:hidden text-center mb-8 fade-in">
          <div className="flex justify-center mb-3">
            <Waveform />
          </div>
          <h1 className="text-6xl font-black tracking-tight mb-2">
            <span className="gradient-text-animated">PlayLy</span>
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Free music · No ads · Forever</p>
        </div>

        <div className="w-full max-w-sm">
          <div className="rounded-3xl p-7 shadow-2xl fade-in"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', backdropFilter: 'blur(40px)' }}>

            {/* Google button */}
            <button onClick={googleLogin}
              className="w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl font-semibold text-sm
                transition-all duration-200 mb-6 hover:scale-[1.02] active:scale-[0.98]"
              style={{ background: 'white', color: '#111', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" className="w-4 h-4" />
              Continue with Google
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>or continue with email</span>
              <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
            </div>

            {/* Tab switcher */}
            <div className="flex rounded-xl overflow-hidden mb-5 p-1" style={{ background: 'var(--bg-raised)' }}>
              {(['signin', 'signup'] as const).map(t => (
                <button key={t} onClick={() => switchTab(t)}
                  className="flex-1 py-2.5 text-xs font-bold rounded-lg transition-all duration-200"
                  style={tab === t
                    ? { background: 'var(--accent)', color: 'white', boxShadow: `0 4px 12px rgba(var(--accent-rgb),0.4)` }
                    : { color: 'var(--text-muted)' }}>
                  {t === 'signin' ? 'Sign In' : 'Sign Up'}
                </button>
              ))}
            </div>

            {/* Form */}
            <form onSubmit={handleEmailAuth}
              className={`flex flex-col gap-3 transition-all duration-200 ${animating ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'}`}>
              {tab === 'signup' && (
                <div className="relative">
                  <User size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                  <input value={name} onChange={e => setName(e.target.value)}
                    placeholder="Display name"
                    className="input-field w-full pl-9 pr-4 py-3.5 rounded-xl text-sm" />
                </div>
              )}
              <div className="relative">
                <Mail size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="Email address" required
                  className="input-field w-full pl-9 pr-4 py-3.5 rounded-xl text-sm" />
              </div>
              <div className="relative">
                <Lock size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="Password" required
                  className="input-field w-full pl-9 pr-10 py-3.5 rounded-xl text-sm" />
                <button type="button" onClick={() => setShowPass(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: 'var(--text-muted)' }}>
                  {showPass ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>

              {msg && (
                <p className={`text-xs px-1 ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</p>
              )}

              <button type="submit" disabled={loading}
                className="btn-accent w-full py-3.5 rounded-xl text-sm font-bold mt-1 disabled:opacity-50">
                {loading ? '…' : tab === 'signin' ? 'Sign In →' : 'Create Account →'}
              </button>
            </form>
        </div>

          {/* Mobile feature badges */}
          <div className="md:hidden grid grid-cols-4 gap-2 mt-4">
            {features.map(f => (
              <div key={f.title} className="glass rounded-xl p-2.5 text-center">
                <div className="flex justify-center mb-1" style={{ color: f.color }}>{f.icon}</div>
                <p className="text-[9px] font-bold leading-tight">{f.title}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Search Page ────────────────────────────────────────────────────────────────
export default function HomePage() {
  const { user, loading } = useAuth()
  const [query,     setQuery]     = useState('')
  const [results,   setResults]   = useState<YTResult[]>([])
  const [searching, setSearching] = useState(false)
  const [busy,      setBusy]      = useState<string | null>(null)
  const [done,      setDone]      = useState<Record<string, any>>({})
  const [msg,       setMsg]       = useState('')
  const [pasteMode, setPasteMode] = useState(false)
  const [pasteUrl,  setPasteUrl]  = useState('')
  const setCurrentSong = usePlayerStore(s => s.setCurrentSong)

  async function search(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setSearching(true); setResults([]); setMsg('')
    try { setResults((await api.search(query)).results) }
    catch (err: any) { setMsg('Search failed: ' + err.message) }
    finally { setSearching(false) }
  }

  async function download(r: YTResult) {
    setBusy(r.youtube_id); setMsg('')
    try {
      const res = await api.download(r.youtube_id)
      setDone(prev => ({ ...prev, [r.youtube_id]: res.song }))
    } catch (err: any) { setMsg('❌ ' + err.message) }
    finally { setBusy(null) }
  }

  function playDownloaded(r: YTResult) {
    const song = done[r.youtube_id]
    if (song) setCurrentSong(song, [song], 'Search')
  }

  async function downloadFromUrl() {
    const ytId = extractYoutubeId(pasteUrl.trim())
    if (!ytId) { setMsg('❌ Invalid YouTube URL'); return }
    setBusy(ytId); setMsg('')
    try {
      await api.download(ytId)
      setMsg('✅ Song added to your library!')
      setPasteUrl('')
    } catch (err: any) { setMsg('❌ ' + err.message) }
    finally { setBusy(null) }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-72">
      <div className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: `var(--accent) transparent transparent transparent` }} />
    </div>
  )

  if (!user) return <LandingPage />

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">

      {/* Header */}
      <div className="mb-8 fade-in">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(var(--accent-rgb),0.15)', border: '1px solid rgba(var(--accent-rgb),0.25)' }}>
            <Headphones size={20} style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <h1 className="text-2xl font-black">Search Music</h1>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Search by song, movie, singer, mood…</p>
          </div>
        </div>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2 mb-4 p-1 rounded-2xl" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        {[
          { id: false, label: 'Search', icon: <Search size={14} /> },
          { id: true,  label: 'Paste URL', icon: <LinkIcon size={14} /> },
        ].map(({ id, label, icon }) => (
          <button key={String(id)} onClick={() => setPasteMode(id as boolean)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all duration-200"
            style={pasteMode === id ? {
              background: 'var(--accent)',
              color: 'white',
              boxShadow: `0 4px 12px rgba(var(--accent-rgb),0.3)`,
            } : { color: 'var(--text-muted)' }}>
            {icon} {label}
          </button>
        ))}
      </div>

      {/* Search/Paste form */}
      {!pasteMode ? (
        <form onSubmit={search} className="flex gap-2 mb-5">
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="e.g. Kesariya, Deva Deva, Raataan Lambiyan…"
            className="input-field flex-1 rounded-2xl px-4 py-3.5 text-sm" />
          <button type="submit" disabled={searching}
            className="btn-accent px-5 py-3.5 rounded-2xl text-sm font-bold disabled:opacity-50">
            {searching ? (
              <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
            ) : <Search size={18} />}
          </button>
        </form>
      ) : (
        <div className="flex gap-2 mb-5">
          <input value={pasteUrl} onChange={e => setPasteUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=..."
            className="input-field flex-1 rounded-2xl px-4 py-3.5 text-sm" />
          <button onClick={downloadFromUrl} disabled={!!busy || !pasteUrl.trim()}
            className="btn-accent px-5 py-3.5 rounded-2xl text-sm font-bold disabled:opacity-50">
            {busy ? '…' : 'Add'}
          </button>
        </div>
      )}

      {/* Error/success message */}
      {msg && (
        <div className="mb-4 px-4 py-3 rounded-2xl text-sm fade-in"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          {msg}
        </div>
      )}

      {/* Searching spinner */}
      {searching && (
        <div className="flex flex-col items-center py-14 gap-4">
          <div className="relative">
            <div className="w-12 h-12 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: `var(--accent) transparent transparent transparent` }} />
            <Music size={16} className="absolute inset-0 m-auto" style={{ color: 'var(--accent)' }} />
          </div>
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Searching YouTube…</span>
        </div>
      )}

      {/* Results — scrolls INSIDE this box, site stays fixed */}
      {results.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
              {results.length} results for &quot;{query}&quot;
            </p>
            <span className="text-xs px-2 py-1 rounded-lg"
              style={{ background: 'rgba(var(--accent-rgb),0.1)', color: 'var(--accent)' }}>
              Scroll to see all
            </span>
          </div>
          {/* Fixed-height scroll container — site scroll unaffected */}
          <div className="search-results-scroll rounded-2xl"
            style={{ border: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
            <div className="flex flex-col divide-y" style={{ borderColor: 'var(--border)' }}>
              {results.map((r, i) => (
                <div key={r.youtube_id} className="fade-in" style={{ animationDelay: `${i * 0.03}s` }}>
                  <SearchResult
                    result={r}
                    onDownload={download}
                    onPlay={playDownloaded}
                    isDownloading={busy === r.youtube_id}
                    isDone={!!done[r.youtube_id]}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!searching && results.length === 0 && !pasteMode && (
        <div className="flex flex-col items-center py-24 fade-in">
          <div className="relative mb-6">
            <div className="w-20 h-20 rounded-3xl flex items-center justify-center"
              style={{ background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.15)' }}>
              <Radio size={36} style={{ color: 'var(--accent)', opacity: 0.5 }} />
            </div>
            <div className="absolute -top-2 -right-2 w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(var(--accent-alt-rgb),0.15)', border: '1px solid rgba(var(--accent-alt-rgb),0.2)' }}>
              <Mic2 size={14} style={{ color: 'var(--accent-alt)' }} />
            </div>
          </div>
          <p className="text-base font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Discover any song</p>
          <p className="text-sm text-center max-w-xs" style={{ color: 'var(--text-muted)' }}>
            Search by name, movie, singer, actor — or any mood hint
          </p>
        </div>
      )}
    </div>
  )
}
