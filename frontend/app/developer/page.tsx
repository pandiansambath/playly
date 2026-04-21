'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, MapPin, Award, Briefcase, GraduationCap, Code2,
  X, ChevronLeft, ChevronRight, Volume2, VolumeX, Download,
  Github, Mail, Sparkles, Heart, Camera, Sun, Moon, Coffee, Mountain, Smile,
  Volume1, VolumeOff,
} from 'lucide-react'

// ══════════════════════════════════════════════════════════════
// PHOTO MANIFEST — 46 photos, mood-tagged by filename time
// Heuristic: hour of day captured correlates with mood.
//   dawn (05–09)    → "Dawn"     — early light, nature, farm
//   day  (10–15)    → "Focus"    — work, library, office, indoor
//   golden (16–18)  → "Wander"   — outdoors, golden hour, travel
//   evening (19–21) → "Joy"      — food, celebration, friends
//   night (22–04)   → "Stories"  — late, festive, portraits
// ══════════════════════════════════════════════════════════════
type Mood = 'dawn' | 'focus' | 'wander' | 'joy' | 'stories' | 'essence'

const MOODS: { id: Mood; label: string; emoji: string; Icon: any; hint: string; accent: string }[] = [
  { id: 'essence', label: 'Essence', emoji: '✦', Icon: Sparkles, hint: 'Moments that define', accent: '139,92,246' },
  { id: 'dawn', label: 'Dawn', emoji: '🌅', Icon: Sun, hint: 'Early light & fresh starts', accent: '251,146,60' },
  { id: 'focus', label: 'Focus', emoji: '💻', Icon: Coffee, hint: 'Library, laptop, deep work', accent: '14,165,233' },
  { id: 'wander', label: 'Wander', emoji: '🏔', Icon: Mountain, hint: 'Outdoors & golden hour', accent: '34,197,94' },
  { id: 'joy', label: 'Joy', emoji: '🍜', Icon: Smile, hint: 'Food, friends, laughter', accent: '236,72,153' },
  { id: 'stories', label: 'Stories', emoji: '🌙', Icon: Moon, hint: 'Late nights, celebrations', accent: '168,85,247' },
]

function moodFromFilename(name: string): Mood {
  // Try IMG_YYYYMMDD_HHMMSS
  let m = name.match(/_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})/)
  if (!m) m = name.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})/)
  if (!m) m = name.match(/^IMG(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/)
  const hour = m ? parseInt(m[4], 10) : -1
  if (hour === -1) return 'essence'
  if (hour >= 5 && hour <= 9) return 'dawn'
  if (hour >= 10 && hour <= 15) return 'focus'
  if (hour >= 16 && hour <= 18) return 'wander'
  if (hour >= 19 && hour <= 21) return 'joy'
  return 'stories'
}

// Display uses bundled compressed copies (/public/me/, ~11MB) — loads fast
// from the frontend pod. Downloads grab the full-resolution original from
// the public `dev-photos` Supabase bucket so visitors can save the real
// thing. See scripts/upload_dev_photos.py for the upload flow.
const PHOTO_CDN = 'https://koagwifcrrkojeowevqn.supabase.co/storage/v1/object/public/dev-photos'

// Three filenames contain '~' which Supabase storage rejects. When we built
// the CDN URL we swap them for '_' (matches scripts/upload_dev_photos.py).
function cdnKey(file: string): string {
  return file.replace(/[^A-Za-z0-9._-]/g, '_')
}

const PHOTO_FILES = [
  '1734150453655.jpeg', '20251225_204404.jpg',
  'IMG20260211112715.jpg', 'IMG20260219175738.jpg',
  'IMG20260404192937.jpg', 'IMG20260404194231.jpg', 'IMG20260404194921.jpg',
  'IMG20260407140332.jpg', 'IMG20260407140738.jpg',
  'IMG_20240808_124043.jpg', 'IMG_20240808_124108.jpg', 'IMG_20240808_165021.jpg',
  'IMG_20240813_185103.jpg', 'IMG_20240819_180812.jpg',
  'IMG_20240820_175624.jpg', 'IMG_20240820_175639.jpg',
  'IMG_20240911_161204.jpg', 'IMG_20240927_164821.jpg',
  'IMG_20241102_084941.jpg', 'IMG_20241115_170000.jpg',
  'IMG_20250414_122037.jpg',
  'IMG_20250416_124445.jpg', 'IMG_20250416_124502.jpg', 'IMG_20250416_124513.jpg',
  'IMG_20250416_124515.jpg', 'IMG_20250416_124517.jpg', 'IMG_20250416_124537.jpg',
  'IMG_20250418_175647.jpg', 'IMG_20250419_181821~2.jpg', 'IMG_20250427_174630~2.jpg',
  'IMG_20250502_065936.jpg',
  'IMG_20250614_182531.jpg', 'IMG_20250615_064446.jpg', 'IMG_20250615_065557.jpg', 'IMG_20250615_065611.jpg',
  'IMG_20250615_065912.jpg', 'IMG_20250622_181149.jpg', 'IMG_20250623_181705.jpg', 'IMG_20250623_181918.jpg',
  'IMG_20250627_131958.jpg', 'IMG_20250627_150408.jpg', 'IMG_20250628_075710.jpg', 'IMG_20250629_091053.jpg',
  'IMG_20250629_092729.jpg',
  'IMG_20250703_142128.jpg', 'IMG_20250704_180334.jpg',
  'IMG_20250705_114006.jpg', 'IMG_20250706_170941.jpg', 'IMG_20250707_163625_1.jpg',
  'IMG_20250713_174417.jpg',
  'IMG_20250810_175040.jpg', 'IMG_20250811_171252.jpg', 'IMG_20250814_135100.jpg', 'IMG_20250814_143957.jpg',
  'IMG_20250927_061610.jpg',
  'IMG_20251015_134137.jpg', 'IMG_20251015_150959.jpg',
  'IMG_20251016_111256.jpg', 'IMG_20251016_114757.jpg', 'IMG_20251017_174155.jpg',
  'IMG_20251027_114914~2.jpg', 'IMG_20251105_175206.jpg', 'IMG_20251112_170717.jpg', 'IMG_20251204_152630.jpg',
  'IMG_20251216_142948~2.jpg',
  'IMG_20251222_134912.jpg', 'IMG_20251222_134937.jpg', 'IMG_20251222_135309.jpg',
  'IMG_20251225_124733.jpg', 'IMG_20251231_123325.jpg',
  'IMG_20260104_155646~3.jpg', 'IMG_20260105_172508.jpg', 'IMG_20260118_130053~2.jpg', 'IMG_20260122_182600.jpg',
  'IMG_20260129_220319.jpg', 'IMG_20260416_162050_726.jpg', 'photo_2026-04-16_16-24-53.jpg',
]

interface Photo { src: string; full: string; mood: Mood }

const PHOTOS: Photo[] = PHOTO_FILES.map(f => ({
  src: `/me/${f}`,
  full: `${PHOTO_CDN}/${cdnKey(f)}`,
  mood: moodFromFilename(f),
}))

const PROFILE_PIC = '/me/profile_pic.jpeg'

const ESSENCE_PICKS = new Set([
  'IMG_20250627_131958.jpg',
  'IMG20260404194231.jpg',
  'IMG_20260122_182600.jpg',
  'IMG_20260416_162050_726.jpg',
])
PHOTOS.forEach(p => {
  const f = p.src.split('/').pop() || ''
  if (ESSENCE_PICKS.has(f)) p.mood = 'essence'
})

// ══════════════════════════════════════════════════════════════
// TIMELINE — real journey
// ══════════════════════════════════════════════════════════════
const TIMELINE = [
  { icon: GraduationCap, color: '#FBBF24', title: 'B.Tech · Anna University', sub: '17th Rank · Gold Medal · 2019 – 2023' },
  { icon: Briefcase, color: '#8B5CF6', title: 'Systems Engineer · Tata Consultancy Services', sub: 'Cloud · DevOps · Full-stack · 2024 →' },
  { icon: Award, color: '#06B6D4', title: 'TCS Digital', sub: 'Completed Digital cadre · 2025' },
  { icon: Award, color: '#EC4899', title: 'TCS Innovator', sub: 'Completed Innovator cadre · 2026' },
  { icon: Sparkles, color: '#F59E0B', title: 'Star of the Month', sub: 'Recognition for impact & ownership · TCS' },
  { icon: Code2, color: '#34D399', title: 'Builder, by heart', sub: 'PlayLy · Apache Camel · Supabase · AKS' },
]

const TECH = [
  { name: 'Python', hot: true }, { name: 'FastAPI', hot: true },
  { name: 'Next.js', hot: true }, { name: 'TypeScript', hot: false },
  { name: 'AWS', hot: true }, { name: 'Azure AKS', hot: false },
  { name: 'Kubernetes', hot: false }, { name: 'Docker', hot: false },
  { name: 'Terraform', hot: false }, { name: 'ArgoCD', hot: false },
  { name: 'Supabase', hot: false }, { name: 'PostgreSQL', hot: false },
  { name: 'Apache Camel', hot: false }, { name: 'GitHub Actions', hot: false },
]

// ══════════════════════════════════════════════════════════════
// AMBIENT MUSIC — module-level singleton so the file starts
// downloading as soon as this JS is parsed (before React mounts).
// ══════════════════════════════════════════════════════════════

// Preload immediately at module evaluation time — NOT inside useEffect
const _preloadedAudio: HTMLAudioElement | null = typeof window !== 'undefined' ? (() => {
  const a = new Audio('/page_song.mp3')
  a.loop = true
  a.volume = 0
  a.preload = 'auto'
  return a
})() : null

function createAmbient() {
  const audio = _preloadedAudio
  let running = false
  let _volume = 0.45

  function start() {
    if (running || !audio) return
    try {
      audio.volume = 0
      audio.play().then(() => {
        // Fade in over 1.5s so it doesn't slam
        if (!audio) return
        let v = 0
        const target = _volume
        const steps = 30
        const t = setInterval(() => {
          v += target / steps
          if (audio) audio.volume = Math.min(target, v)
          if (v >= target) clearInterval(t)
        }, 50)
      }).catch(() => { })
      running = true
    } catch { }
  }

  function stop() {
    if (!running || !audio) return
    // Fade out by stepping down volume over 800ms
    const steps = 16
    const startVol = audio.volume
    let step = 0
    const timer = setInterval(() => {
      step++
      if (audio) audio.volume = Math.max(0, startVol * (1 - step / steps))
      if (step >= steps) {
        clearInterval(timer)
        audio?.pause()
        if (audio) audio.currentTime = 0
        if (audio) audio.volume = _volume
        running = false
      }
    }, 50)
  }

  function setVolume(v: number) {
    _volume = Math.max(0, Math.min(1, v))
    if (audio) audio.volume = _volume
  }

  function getVolume() { return _volume }

  return { start, stop, setVolume, getVolume, isRunning: () => running }
}

// ══════════════════════════════════════════════════════════════
// LIGHTBOX
// ══════════════════════════════════════════════════════════════
function Lightbox({ photos, index, onClose, onNav }: {
  photos: Photo[]; index: number; onClose: () => void; onNav: (dir: 1 | -1) => void
}) {
  const p = photos[index]
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') onNav(1)
      if (e.key === 'ArrowLeft') onNav(-1)
    }
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = '' }
  }, [onClose, onNav])

  const mood = MOODS.find(m => m.id === p.mood)!

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center fade-in-fast"
      style={{ background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(28px)' }}
      onClick={onClose}>
      <div className="absolute inset-0 pointer-events-none" style={{
        background: `radial-gradient(ellipse 60% 60% at 50% 50%, rgba(${mood.accent},0.22) 0%, rgba(${mood.accent},0.05) 55%, transparent 80%)`,
      }} />
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <button
          onClick={async e => {
            e.stopPropagation()
            try {
              const res = await fetch(p.full)
              const blob = await res.blob()
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = p.full.split('/').pop() || 'photo.jpg'
              document.body.appendChild(a); a.click(); document.body.removeChild(a)
              URL.revokeObjectURL(url)
            } catch {
              // cross-origin fetch failed — fall back to open-in-tab
              window.open(p.full, '_blank', 'noopener')
            }
          }}
          className="w-10 h-10 rounded-2xl flex items-center justify-center transition-all hover:scale-110"
          style={{ background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.4)', color: '#c4b5fd' }}
          title="Download full-resolution photo">
          <Download size={16} />
        </button>
        <button onClick={onClose}
          className="w-10 h-10 rounded-2xl flex items-center justify-center transition-all hover:scale-110"
          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: 'white' }}>
          <X size={18} />
        </button>
      </div>
      <button onClick={e => { e.stopPropagation(); onNav(-1) }}
        className="absolute left-3 sm:left-5 z-10 w-11 h-11 rounded-2xl flex items-center justify-center transition-all hover:scale-110"
        style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: 'white' }}>
        <ChevronLeft size={22} />
      </button>
      <div onClick={e => e.stopPropagation()} className="relative z-10 flex flex-col items-center">
        <img src={p.src} alt="" style={{
          maxWidth: '86vw', maxHeight: '78vh',
          borderRadius: 22, objectFit: 'contain',
          boxShadow: `0 40px 120px rgba(0,0,0,0.9), 0 0 80px rgba(${mood.accent},0.35)`,
          border: '1px solid rgba(255,255,255,0.12)',
        }} />
        <div className="mt-4 flex items-center gap-3">
          <span className="text-xs font-bold px-3 py-1 rounded-full" style={{
            background: `rgba(${mood.accent},0.18)`,
            border: `1px solid rgba(${mood.accent},0.35)`,
            color: `rgb(${mood.accent})`,
          }}>
            {mood.emoji} {mood.label}
          </span>
          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {index + 1} / {photos.length}
          </span>
        </div>
      </div>
      <button onClick={e => { e.stopPropagation(); onNav(1) }}
        className="absolute right-3 sm:right-5 z-10 w-11 h-11 rounded-2xl flex items-center justify-center transition-all hover:scale-110"
        style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: 'white' }}>
        <ChevronRight size={22} />
      </button>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// PAGE
// ══════════════════════════════════════════════════════════════
export default function DeveloperPage() {
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [activeMood, setActiveMood] = useState<Mood | 'all'>('all')
  const [musicOn, setMusicOn] = useState(true)
  const [musicStarted, setMusicStarted] = useState(false)
  const [showVolPanel, setShowVolPanel] = useState(false)
  const [volume, setVolume] = useState(0.45)
  const ambientRef = useRef<ReturnType<typeof createAmbient> | null>(null)
  const volPanelRef = useRef<HTMLDivElement>(null)

  // Initialize ambient music lazily after first interaction (browser autoplay policies)
  useEffect(() => {
    ambientRef.current = createAmbient()
    const kick = () => {
      if (musicOn && !musicStarted) {
        ambientRef.current?.start()
        setMusicStarted(true)
      }
      window.removeEventListener('pointerdown', kick)
      window.removeEventListener('keydown', kick)
    }
    window.addEventListener('pointerdown', kick)
    window.addEventListener('keydown', kick)
    return () => {
      window.removeEventListener('pointerdown', kick)
      window.removeEventListener('keydown', kick)
      ambientRef.current?.stop()
    }
  }, []) // eslint-disable-line

  useEffect(() => {
    if (!ambientRef.current) return
    // Only act on user-driven toggles (musicStarted = already had first interaction)
    if (!musicStarted) return
    if (musicOn) ambientRef.current.start()
    else ambientRef.current.stop()
  }, [musicOn, musicStarted])

  // Close volume panel when clicking outside
  useEffect(() => {
    if (!showVolPanel) return
    const close = (e: MouseEvent) => {
      if (volPanelRef.current && !volPanelRef.current.contains(e.target as Node)) {
        setShowVolPanel(false)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [showVolPanel])


  const filtered = useMemo(() =>
    activeMood === 'all' ? PHOTOS : PHOTOS.filter(p => p.mood === activeMood),
    [activeMood])

  const moodCounts = useMemo(() => {
    const c: Record<string, number> = { all: PHOTOS.length }
    MOODS.forEach(m => c[m.id] = PHOTOS.filter(p => p.mood === m.id).length)
    return c
  }, [])

  const navLightbox = (dir: 1 | -1) =>
    setLightbox(prev => prev === null ? 0 : (prev + dir + filtered.length) % filtered.length)

  // Scroll-reveal: add is-visible once each section enters viewport
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>('.reveal')
    if (!els.length) return
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { (e.target as HTMLElement).classList.add('is-visible'); io.unobserve(e.target) } })
    }, { threshold: 0.12 })
    els.forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [])

  return (
    <div className="dev-root">
      {/* ── Ambient background ─────────────────────────── */}
      <div className="dev-aurora">
        <div className="aurora-blob" style={{ width: 560, height: 560, top: '-18%', left: '-10%', background: 'rgba(139,92,246,0.18)', animationDelay: '0s' }} />
        <div className="aurora-blob" style={{ width: 420, height: 420, top: '35%', right: '-8%', background: 'rgba(236,72,153,0.14)', animationDelay: '2s' }} />
        <div className="aurora-blob" style={{ width: 380, height: 380, bottom: '-10%', left: '30%', background: 'rgba(6,182,212,0.10)', animationDelay: '4s' }} />
      </div>
      {Array.from({ length: 38 }, (_, i) => (
        <div key={i} className="landing-star pointer-events-none" style={{
          top: `${i * 41 % 97}%`, left: `${i * 67 % 97}%`,
          width: 1 + (i % 3), height: 1 + (i % 3), background: 'white',
          opacity: 0.06 + (i * 0.01 % 0.2),
          animationDuration: `${1.8 + i * 0.16}s`, animationDelay: `${i * 0.11}s`,
        }} />
      ))}

      {/* ── Top bar ─────────────────────────────────────── */}
      <div className="dev-topbar">
        <Link href="/" className="dev-back" aria-label="Back to PlayLy">
          <span className="dev-back-icon"><ArrowLeft size={15} /></span>
          <span className="dev-back-label">PlayLy</span>
          <span className="dev-back-shine" aria-hidden />
        </Link>
        <div className="dev-topbar-right">
          {/* Music button + volume panel */}
          <div ref={volPanelRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowVolPanel(v => !v)}
              className="dev-music-btn"
              title="Music controls"
              style={{
                background: musicOn ? 'linear-gradient(135deg,rgba(139,92,246,0.25),rgba(236,72,153,0.22))' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${musicOn ? 'rgba(139,92,246,0.45)' : 'rgba(255,255,255,0.10)'}`,
              }}>
              {musicOn
                ? <Volume2 size={14} style={{ color: '#c4b5fd' }} />
                : <VolumeX size={14} style={{ color: 'rgba(255,255,255,0.45)' }} />}
              <span>{musicOn ? 'Music on' : 'Muted'}</span>
              {musicOn && (
                <span className="dev-music-eq">
                  <i /><i /><i />
                </span>
              )}
            </button>

            {/* Volume control panel */}
            {showVolPanel && (
              <div className="dev-vol-panel" onClick={e => e.stopPropagation()}>
                <div className="dev-vol-title">Volume</div>
                {/* Mute toggle */}
                <button
                  className="dev-vol-btn"
                  onClick={() => {
                    const next = !musicOn
                    setMusicOn(next)
                    if (!next) { ambientRef.current?.stop() }
                    else { ambientRef.current?.start(); setMusicStarted(true) }
                  }}>
                  {musicOn ? <VolumeX size={13} /> : <Volume2 size={13} />}
                  <span>{musicOn ? 'Mute' : 'Unmute'}</span>
                </button>
                {/* Volume up */}
                <button
                  className="dev-vol-btn"
                  onClick={() => {
                    const v = Math.min(1, volume + 0.15)
                    setVolume(v)
                    ambientRef.current?.setVolume(v)
                    if (!musicOn) { setMusicOn(true); ambientRef.current?.start(); setMusicStarted(true) }
                  }}>
                  <Volume2 size={13} />
                  <span>Vol +</span>
                </button>
                {/* Volume down */}
                <button
                  className="dev-vol-btn"
                  onClick={() => {
                    const v = Math.max(0, volume - 0.15)
                    setVolume(v)
                    ambientRef.current?.setVolume(v)
                    if (v === 0) setMusicOn(false)
                  }}>
                  <Volume1 size={13} />
                  <span>Vol -</span>
                </button>
                {/* Visual bar */}
                <div className="dev-vol-bar-wrap">
                  <div className="dev-vol-bar" style={{ width: `${Math.round(volume * 100)}%` }} />
                </div>
                <span className="dev-vol-pct">{Math.round(volume * 100)}%</span>
              </div>
            )}
          </div>
          <a href="/Pandian_Sambath_Resume.docx" download className="dev-resume-btn">
            <Download size={13} /> <span>Resume</span>
          </a>
        </div>
      </div>

      {/* ── HERO ────────────────────────────────────────── */}
      <section className="dev-hero reveal">
        <div className="dev-hero-inner">
          <div className="dev-hero-avatar-wrap" onClick={() => setLightbox(PHOTOS.findIndex(p => p.mood === 'essence'))}>
            <div className="dev-hero-avatar-glow" />
            <img src={PROFILE_PIC} alt="Pandian" className="dev-hero-avatar" />
          </div>

          <div className="dev-hero-text">
            <p className="dev-hero-eyebrow">
              <Sparkles size={11} /> systems engineer · india
            </p>
            <h1 className="dev-hero-name">
              <span className="dev-hero-firstname">Pandian</span>{' '}
              <span className="dev-hero-lastname">Sambath</span>
            </h1>
            <p className="dev-hero-tagline">
              Gold medalist turned cloud builder. I make things that load fast,
              feel soft, and stay out of your way.
            </p>
            <div className="dev-hero-cta-row">
              <a href="mailto:pandian2pandi@gmail.com" className="dev-cta-primary">
                <Mail size={13} /> Say hi
              </a>
              <a href="https://github.com/pandiansambath" target="_blank" rel="noopener" className="dev-cta-ghost">
                <Github size={13} /> GitHub
              </a>
            </div>
            <div className="dev-hero-metrics">
              <div><b>17th</b><span>Anna University · Gold Medal</span></div>
              <div><b>TCS</b><span>Digital · Innovator</span></div>
              <div><b>2024 →</b><span>Systems Engineer</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* ── JOURNEY + TECH ───────────────────────────────── */}
      <section className="dev-panels reveal">
        <div className="dev-panel">
          <p className="dev-panel-eyebrow">Journey</p>
          <div className="dev-timeline">
            {TIMELINE.map((item, i) => (
              <div key={i} className="dev-timeline-item" style={{ animationDelay: `${i * 0.09}s` }}>
                <div className="dev-timeline-icon"
                  style={{ background: `${item.color}18`, border: `1px solid ${item.color}40`, color: item.color }}>
                  <item.icon size={13} />
                </div>
                <div>
                  <p className="dev-timeline-title">{item.title}</p>
                  <p className="dev-timeline-sub">{item.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="dev-panel">
          <p className="dev-panel-eyebrow">Stack</p>
          <div className="dev-tech-grid">
            {TECH.map((t, i) => (
              <span key={i} className={`dev-chip ${t.hot ? 'dev-chip-hot' : ''}`}
                style={{ animationDelay: `${i * 0.04}s` }}>
                {t.hot && '★ '}{t.name}
              </span>
            ))}
          </div>
          <p className="dev-panel-note">
            <Heart size={10} /> Currently building: PlayLy · Apache Camel integrations · AKS playbooks
          </p>
        </div>
      </section>

      {/* ── GALLERY ─────────────────────────────────────── */}
      <section className="dev-gallery-section reveal">
        <div className="dev-gallery-header">
          <div>
            <p className="dev-panel-eyebrow">The human file</p>
            <h2 className="dev-gallery-title">Moments, grouped by mood</h2>
            <p className="dev-gallery-sub">
              <Camera size={11} /> click any photo to open · keyboard arrows to navigate
            </p>
          </div>
        </div>

        {/* Mood filter pills */}
        <div className="dev-mood-bar">
          <button
            onClick={() => setActiveMood('all')}
            className={`dev-mood-pill ${activeMood === 'all' ? 'dev-mood-active' : ''}`}>
            <span>All</span>
            <i>{moodCounts.all}</i>
          </button>
          {MOODS.map(m => (
            <button key={m.id}
              onClick={() => setActiveMood(m.id)}
              className={`dev-mood-pill ${activeMood === m.id ? 'dev-mood-active' : ''}`}
              style={activeMood === m.id ? {
                background: `linear-gradient(135deg, rgba(${m.accent},0.28), rgba(${m.accent},0.12))`,
                borderColor: `rgba(${m.accent},0.5)`,
                color: `rgb(${m.accent})`,
                boxShadow: `0 4px 22px rgba(${m.accent},0.3)`,
              } : undefined}>
              <m.Icon size={12} /> <span>{m.label}</span>
              <i>{moodCounts[m.id]}</i>
            </button>
          ))}
        </div>

        {/* Masonry grid */}
        <div className="dev-masonry">
          {filtered.map((p, i) => {
            const m = MOODS.find(x => x.id === p.mood)!
            return (
              <div key={p.src}
                className="dev-tile"
                onClick={() => setLightbox(i)}
                style={{ animationDelay: `${Math.min(i, 24) * 0.04}s` }}>
                <img src={p.src} alt="" loading={i < 12 ? 'eager' : 'lazy'} fetchPriority={i < 6 ? 'high' : 'auto'} className="dev-tile-img" />
                <div className="dev-tile-overlay" />
                <div className="dev-tile-meta">
                  <span className="dev-tile-mood" style={{
                    background: `rgba(${m.accent},0.22)`,
                    border: `1px solid rgba(${m.accent},0.4)`,
                    color: `rgb(${m.accent})`,
                  }}>{m.emoji} {m.label}</span>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────── */}
      <footer className="dev-footer">
        <p>
          built with love · <a href="https://github.com/pandiansambath" target="_blank" rel="noopener">pandiansambath</a>
          {' '} · {new Date().getFullYear()}
        </p>
      </footer>

      {/* Lightbox */}
      {lightbox !== null && (
        <Lightbox photos={filtered} index={Math.min(lightbox, filtered.length - 1)}
          onClose={() => setLightbox(null)} onNav={navLightbox} />
      )}

      {/* ── Page-scoped CSS ─────────────────────────────── */}
      <style jsx>{`
        .dev-root {
          min-height: 100dvh;
          background: var(--bg-base);
          color: var(--text-primary);
          font-family: 'Inter', -apple-system, sans-serif;
          position: relative;
          overflow-x: hidden;
          padding-bottom: 60px;
        }
        .dev-aurora { position: fixed; inset: 0; pointer-events: none; z-index: 0; }

        /* Top bar */
        .dev-topbar {
          position: sticky; top: 0; z-index: 30;
          display: flex; justify-content: space-between; align-items: center;
          padding: 14px 20px;
          backdrop-filter: blur(24px) saturate(1.4);
          -webkit-backdrop-filter: blur(24px) saturate(1.4);
          background: rgba(7,7,15,0.55);
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .dev-back {
          position: relative; overflow: hidden;
          display: inline-flex; align-items: center; gap: 10px;
          padding: 6px 18px 6px 6px; border-radius: 999px;
          background: linear-gradient(135deg, rgba(139,92,246,0.18), rgba(236,72,153,0.10));
          border: 1px solid rgba(255,255,255,0.10);
          color: rgba(255,255,255,0.95);
          text-decoration: none;
          transition: transform 0.25s cubic-bezier(0.16,1,0.3,1),
                      box-shadow  0.25s cubic-bezier(0.16,1,0.3,1),
                      border-color 0.25s ease;
          box-shadow: 0 4px 18px rgba(139,92,246,0.18), inset 0 0 0 1px rgba(255,255,255,0.04);
        }
        .dev-back-icon {
          display: inline-flex; align-items: center; justify-content: center;
          width: 30px; height: 30px; border-radius: 999px;
          background: linear-gradient(135deg, #8B5CF6, #EC4899);
          color: #fff;
          transition: transform 0.35s cubic-bezier(0.16,1,0.3,1);
          box-shadow: 0 4px 14px rgba(139,92,246,0.5);
        }
        .dev-back-label {
          font-size: 13px; font-weight: 700; letter-spacing: 0.01em;
          background: linear-gradient(120deg, #fff 0%, #c4b5fd 90%);
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
          line-height: 1;
        }
        .dev-back-shine {
          position: absolute; inset: 0;
          background: linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.22) 50%, transparent 70%);
          transform: translateX(-120%);
          pointer-events: none;
        }
        .dev-back:hover {
          transform: translateX(-2px);
          border-color: rgba(139,92,246,0.55);
          box-shadow: 0 8px 28px rgba(139,92,246,0.35), inset 0 0 0 1px rgba(255,255,255,0.08);
        }
        .dev-back:hover .dev-back-icon { transform: translateX(-3px) rotate(-8deg); }
        .dev-back:hover .dev-back-shine { animation: dev-back-shine 0.9s ease; }
        @keyframes dev-back-shine {
          0%   { transform: translateX(-120%); }
          100% { transform: translateX(120%);  }
        }
        .dev-topbar-right { display: flex; gap: 8px; align-items: center; }
        .dev-music-btn {
          display: flex; align-items: center; gap: 6px;
          padding: 7px 12px; border-radius: 12px;
          color: rgba(255,255,255,0.7);
          font-size: 11px; font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .dev-music-btn:hover { transform: scale(1.03); }

        /* Volume panel */
        .dev-vol-panel {
          position: absolute; top: calc(100% + 8px); right: 0;
          background: rgba(15,7,30,0.92);
          border: 1px solid rgba(139,92,246,0.35);
          border-radius: 14px;
          padding: 10px 12px;
          min-width: 130px;
          backdrop-filter: blur(16px);
          display: flex; flex-direction: column; gap: 4px;
          z-index: 100;
          box-shadow: 0 8px 32px rgba(0,0,0,0.6);
          animation: fade-down 0.15s ease;
        }
        @keyframes fade-down {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .dev-vol-title {
          font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
          color: rgba(196,181,253,0.6); text-transform: uppercase;
          margin-bottom: 2px;
        }
        .dev-vol-btn {
          display: flex; align-items: center; gap: 7px;
          padding: 7px 10px; border-radius: 9px;
          color: rgba(255,255,255,0.8); font-size: 12px; font-weight: 600;
          cursor: pointer; transition: background 0.15s;
          background: rgba(255,255,255,0.04);
          border: 1px solid transparent;
          width: 100%;
        }
        .dev-vol-btn:hover { background: rgba(139,92,246,0.2); border-color: rgba(139,92,246,0.3); }
        .dev-vol-bar-wrap {
          margin-top: 4px; height: 4px; border-radius: 99px;
          background: rgba(255,255,255,0.1); overflow: hidden;
        }
        .dev-vol-bar {
          height: 100%; border-radius: 99px;
          background: linear-gradient(90deg, #8B5CF6, #EC4899);
          transition: width 0.2s;
        }
        .dev-vol-pct {
          text-align: center; font-size: 10px; color: rgba(255,255,255,0.35);
          margin-top: 1px;
        }
        .dev-music-eq { display: inline-flex; gap: 2px; align-items: end; height: 10px; }
        .dev-music-eq i {
          display: block; width: 2px; background: #c4b5fd;
          border-radius: 1px;
          animation: eq-bounce 0.7s ease-in-out infinite;
        }
        .dev-music-eq i:nth-child(1) { height: 6px; animation-delay: 0s; }
        .dev-music-eq i:nth-child(2) { height: 9px; animation-delay: 0.15s; }
        .dev-music-eq i:nth-child(3) { height: 5px; animation-delay: 0.3s; }
        @keyframes eq-bounce {
          0%, 100% { transform: scaleY(0.4); }
          50%       { transform: scaleY(1);   }
        }
        .dev-resume-btn {
          display: flex; align-items: center; gap: 6px;
          padding: 7px 12px; border-radius: 12px;
          background: linear-gradient(135deg,#8B5CF6,#EC4899);
          color: white; font-size: 11px; font-weight: 700;
          text-decoration: none;
          box-shadow: 0 4px 16px rgba(139,92,246,0.4);
          transition: all 0.2s;
        }
        .dev-resume-btn:hover { transform: scale(1.05); box-shadow: 0 6px 22px rgba(139,92,246,0.55); }

        /* Hero */
        .dev-hero { position: relative; z-index: 5; padding: 48px 24px 28px; }
        .dev-hero-inner {
          display: flex; gap: 32px; align-items: center;
          max-width: 1080px; margin: 0 auto;
        }
        .dev-hero-avatar-wrap {
          position: relative; flex-shrink: 0;
          width: 168px; height: 168px; border-radius: 50%;
          cursor: pointer;
          transition: transform 0.4s cubic-bezier(0.16,1,0.3,1);
          animation: avatar-float 6s ease-in-out infinite;
        }
        @keyframes avatar-float {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50%       { transform: translateY(-10px) rotate(1.5deg); }
        }
        .dev-hero-avatar-wrap:hover { animation-play-state: paused; transform: scale(1.06) rotate(-2deg); }
        .dev-hero-avatar-glow {
          position: absolute; inset: -8px; border-radius: 50%;
          background: conic-gradient(from 0deg, #8B5CF6, #EC4899, #F97316, #06B6D4, #8B5CF6);
          filter: blur(18px);
          opacity: 0.65;
          animation: spin-disc 10s linear infinite;
        }
        .dev-hero-avatar {
          position: relative; z-index: 2;
          width: 100%; height: 100%; border-radius: 50%;
          object-fit: cover; object-position: center 28%;
          border: 3px solid rgba(255,255,255,0.08);
          box-shadow: 0 20px 60px rgba(0,0,0,0.6);
          transition: box-shadow 0.3s;
        }
        .dev-hero-avatar-wrap:hover .dev-hero-avatar {
          box-shadow: 0 24px 80px rgba(139,92,246,0.6);
        }
        /* Outer orbit ring */
        .dev-hero-avatar-wrap::after {
          content: '';
          position: absolute; inset: -18px; border-radius: 50%;
          border: 1.5px dashed rgba(139,92,246,0.3);
          animation: spin-disc 22s linear infinite reverse;
          pointer-events: none;
        }
        .dev-hero-text { flex: 1; min-width: 0; }
        .dev-hero-eyebrow {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 4px 10px; border-radius: 99px;
          background: rgba(139,92,246,0.14);
          border: 1px solid rgba(139,92,246,0.3);
          color: #c4b5fd;
          font-size: 10px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.12em;
          margin-bottom: 10px;
          animation: fade-in 0.6s both;
        }
        .dev-hero-name {
          font-size: clamp(2.4rem, 5.6vw, 4rem);
          font-weight: 900; line-height: 1.02;
          letter-spacing: -0.04em;
          margin-bottom: 10px;
          animation: fade-in 0.8s 0.2s both;
        }
        @keyframes name-shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        .dev-hero-firstname {
          background: linear-gradient(120deg, #a78bfa 0%, #ec4899 55%, #f97316 100%);
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .dev-hero-lastname { color: #fff; }
        .dev-hero-tagline {
          max-width: 480px;
          font-size: 14px; line-height: 1.55;
          color: rgba(255,255,255,0.62);
          margin-bottom: 16px;
        }
        .dev-hero-cta-row { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
        .dev-cta-primary {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 9px 16px; border-radius: 14px;
          background: linear-gradient(135deg,#8B5CF6,#EC4899);
          color: white; font-size: 12px; font-weight: 700;
          text-decoration: none;
          box-shadow: 0 6px 22px rgba(139,92,246,0.45);
          transition: transform 0.2s;
        }
        .dev-cta-primary:hover { transform: translateY(-2px) scale(1.03); }
        .dev-cta-ghost {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 9px 16px; border-radius: 14px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.12);
          color: rgba(255,255,255,0.78); font-size: 12px; font-weight: 700;
          text-decoration: none;
          transition: all 0.2s;
        }
        .dev-cta-ghost:hover {
          background: rgba(255,255,255,0.1);
          border-color: rgba(255,255,255,0.22);
          transform: translateY(-2px);
        }
        .dev-hero-metrics {
          display: flex; gap: 24px; flex-wrap: wrap;
          padding-top: 16px;
          border-top: 1px solid rgba(255,255,255,0.06);
        }
        .dev-hero-metrics > div { display: flex; flex-direction: column; }
        .dev-hero-metrics b {
          font-size: 18px; font-weight: 800; letter-spacing: -0.02em;
          background: linear-gradient(135deg,#a78bfa,#ec4899);
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .dev-hero-metrics span {
          font-size: 10px; color: rgba(255,255,255,0.45);
          text-transform: uppercase; letter-spacing: 0.08em;
          font-weight: 600;
        }

        /* Panels */
        .dev-panels {
          position: relative; z-index: 5;
          max-width: 1080px; margin: 0 auto;
          padding: 16px 24px;
          display: grid; gap: 16px;
          grid-template-columns: 1fr 1fr;
        }
        .dev-panel {
          background: rgba(255,255,255,0.03);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 22px;
          padding: 20px;
        }
        .dev-panel-eyebrow {
          font-size: 10px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.14em;
          color: rgba(255,255,255,0.38);
          margin-bottom: 14px;
        }
        .dev-timeline { display: flex; flex-direction: column; gap: 12px; }
        .dev-timeline-item {
          display: flex; gap: 12px; align-items: flex-start;
          animation: slide-right 0.5s cubic-bezier(0.16,1,0.3,1) both;
        }
        .dev-timeline-icon {
          width: 30px; height: 30px; border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; margin-top: 1px;
        }
        .dev-timeline-title {
          font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.95);
          line-height: 1.3;
        }
        .dev-timeline-sub {
          font-size: 11px; color: rgba(255,255,255,0.45);
          margin-top: 2px;
        }
        .dev-tech-grid { display: flex; flex-wrap: wrap; gap: 6px; }
        .dev-chip {
          padding: 4px 10px; border-radius: 99px;
          font-size: 11px; font-weight: 600;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          color: rgba(255,255,255,0.58);
          animation: tag-pop 0.35s cubic-bezier(0.34,1.56,0.64,1) both;
          transition: all 0.2s;
        }
        .dev-chip:hover {
          background: rgba(255,255,255,0.08);
          color: #fff; transform: translateY(-1px);
        }
        .dev-chip-hot {
          background: rgba(139,92,246,0.18);
          border-color: rgba(139,92,246,0.4);
          color: #c4b5fd;
          font-weight: 700;
        }
        .dev-panel-note {
          display: inline-flex; align-items: center; gap: 5px;
          margin-top: 16px; padding-top: 12px;
          font-size: 10px; color: rgba(255,255,255,0.35);
          border-top: 1px solid rgba(255,255,255,0.05);
          width: 100%;
        }

        /* Gallery */
        .dev-gallery-section {
          position: relative; z-index: 5;
          max-width: 1120px; margin: 0 auto;
          padding: 32px 24px 8px;
        }
        .dev-gallery-header { margin-bottom: 18px; }
        .dev-gallery-title {
          font-size: clamp(1.4rem, 3vw, 2rem);
          font-weight: 900; letter-spacing: -0.02em;
          margin-top: 2px; margin-bottom: 6px;
          background: linear-gradient(120deg, #fff 0%, rgba(255,255,255,0.6) 100%);
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .dev-gallery-sub {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 11px; color: rgba(255,255,255,0.4);
        }
        .dev-mood-bar {
          display: flex; flex-wrap: wrap; gap: 8px;
          margin-bottom: 20px;
        }
        .dev-mood-pill {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 7px 13px; border-radius: 99px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          color: rgba(255,255,255,0.55);
          font-size: 12px; font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .dev-mood-pill:hover {
          background: rgba(255,255,255,0.08);
          border-color: rgba(255,255,255,0.16);
          color: rgba(255,255,255,0.85);
          transform: translateY(-1px);
        }
        .dev-mood-pill i {
          display: inline-block;
          padding: 1px 6px;
          border-radius: 99px;
          background: rgba(255,255,255,0.08);
          font-size: 10px; font-weight: 700;
          color: rgba(255,255,255,0.5);
          font-style: normal;
        }
        .dev-mood-active {
          background: linear-gradient(135deg, rgba(139,92,246,0.28), rgba(236,72,153,0.16));
          border-color: rgba(139,92,246,0.5);
          color: #c4b5fd;
          box-shadow: 0 4px 22px rgba(139,92,246,0.3);
        }

        /* ── Scroll-reveal ── */
        .reveal {
          opacity: 0;
          transform: translateY(36px);
          transition: opacity 0.75s cubic-bezier(0.16,1,0.3,1),
                      transform 0.75s cubic-bezier(0.16,1,0.3,1);
        }
        .reveal.is-visible { opacity: 1; transform: translateY(0); }

        /* Masonry (CSS columns) */
        .dev-masonry {
          column-count: 4; column-gap: 12px;
          padding-bottom: 40px;
          perspective: 1400px;
        }
        @media (max-width: 980px) { .dev-masonry { column-count: 3; } }
        @media (max-width: 680px) { .dev-masonry { column-count: 2; } }
        @media (max-width: 420px) { .dev-masonry { column-count: 2; column-gap: 8px; } }

        @keyframes tile-flip-in {
          0%   { opacity: 0; transform: perspective(700px) rotateX(22deg) translateY(28px) scale(0.94); }
          100% { opacity: 1; transform: perspective(700px) rotateX(0)     translateY(0)    scale(1);    }
        }

        .dev-tile {
          break-inside: avoid;
          position: relative;
          margin-bottom: 12px;
          border-radius: 16px;
          overflow: hidden;
          cursor: pointer;
          box-shadow: 0 8px 24px rgba(0,0,0,0.4);
          transition: transform 0.38s cubic-bezier(0.16,1,0.3,1),
                      box-shadow 0.38s ease,
                      border-color 0.3s ease;
          animation: tile-flip-in 0.6s cubic-bezier(0.16,1,0.3,1) both;
          border: 1px solid rgba(255,255,255,0.05);
        }
        .dev-tile:hover {
          transform: translateY(-6px) scale(1.02) rotate(-0.4deg);
          box-shadow:
            0 28px 64px rgba(0,0,0,0.7),
            0 0 0 1.5px rgba(139,92,246,0.5),
            0 0 32px rgba(139,92,246,0.25);
          z-index: 2;
          border-color: rgba(139,92,246,0.4);
        }

        /* Rotating border glow on hover */
        .dev-tile::before {
          content: '';
          position: absolute; inset: 0; z-index: 3;
          border-radius: 16px;
          padding: 1.5px;
          background: conic-gradient(from var(--angle, 0deg),
            rgba(139,92,246,0.9), rgba(236,72,153,0.8),
            rgba(249,115,22,0.7), rgba(6,182,212,0.8),
            rgba(139,92,246,0.9));
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude;
          opacity: 0;
          transition: opacity 0.3s;
          pointer-events: none;
          animation: border-angle 4s linear infinite;
        }
        .dev-tile:hover::before { opacity: 1; }
        @property --angle { syntax: '<angle>'; initial-value: 0deg; inherits: false; }
        @keyframes border-angle { to { --angle: 360deg; } }

        /* Shimmer sweep on hover */
        .dev-tile::after {
          content: '';
          position: absolute; inset: 0; z-index: 4;
          background: linear-gradient(115deg,
            transparent 30%, rgba(255,255,255,0.12) 50%, transparent 70%);
          transform: translateX(-100%);
          transition: none;
          pointer-events: none;
        }
        .dev-tile:hover::after {
          animation: tile-shimmer 0.65s ease forwards;
        }
        @keyframes tile-shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(120%);  }
        }

        .dev-tile-img {
          display: block; width: 100%; height: auto;
          transition: transform 0.7s cubic-bezier(0.16,1,0.3,1);
        }
        .dev-tile:hover .dev-tile-img { transform: scale(1.07); }
        .dev-tile-overlay {
          position: absolute; inset: 0;
          background: linear-gradient(to top,
            rgba(0,0,0,0.78) 0%,
            rgba(0,0,0,0.18) 35%,
            transparent 65%);
          opacity: 0.75;
          transition: opacity 0.3s;
        }
        .dev-tile:hover .dev-tile-overlay { opacity: 0.95; }
        .dev-tile-meta {
          position: absolute; bottom: 10px; left: 10px; right: 10px;
          display: flex; align-items: flex-end; gap: 6px;
          opacity: 0;
          transition: transform 0.35s cubic-bezier(0.16,1,0.3,1), opacity 0.35s;
          transform: translateY(8px);
          z-index: 5;
        }
        .dev-tile:hover .dev-tile-meta {
          opacity: 1; transform: translateY(0);
        }
        .dev-tile-mood {
          font-size: 10px; font-weight: 700;
          padding: 3px 8px; border-radius: 99px;
          white-space: nowrap;
          backdrop-filter: blur(8px);
        }

        /* Footer */
        .dev-footer {
          position: relative; z-index: 5;
          text-align: center;
          padding: 20px 24px 30px;
          color: rgba(255,255,255,0.25);
          font-size: 11px;
        }
        .dev-footer a { color: rgba(255,255,255,0.4); text-decoration: none; }
        .dev-footer a:hover { color: #c4b5fd; }

        /* Responsive */
        @media (max-width: 760px) {
          .dev-hero { padding: 32px 20px 16px; }
          .dev-hero-inner { flex-direction: column; align-items: flex-start; gap: 20px; }
          .dev-hero-avatar-wrap { width: 128px; height: 128px; align-self: center; }
          .dev-hero-name { text-align: center; width: 100%; }
          .dev-hero-eyebrow, .dev-hero-tagline, .dev-hero-cta-row, .dev-hero-metrics { align-self: center; }
          .dev-hero-tagline { text-align: center; }
          .dev-hero-metrics { justify-content: center; }
          .dev-panels { grid-template-columns: 1fr; }
          .dev-topbar { padding: 10px 14px; }
          .dev-resume-btn span, .dev-music-btn span { display: none; }
          .dev-back { padding: 5px 14px 5px 5px; gap: 8px; }
          .dev-back-icon { width: 26px; height: 26px; }
          .dev-back-label { font-size: 12px; }
        }
      `}</style>
    </div>
  )
}
