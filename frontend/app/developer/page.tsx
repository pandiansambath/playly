'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, MapPin, Award, Briefcase, GraduationCap, Code2, X, ChevronLeft, ChevronRight } from 'lucide-react'

const PHOTOS = [
  { src: '/dev-photo1.jpg',  label: 'Pandian'      },
  { src: '/dev-photo3.jpg',  label: 'Recent'       },
  { src: '/dev-photo2.jpg',  label: 'At Work'      },
  { src: '/dev-photo4.jpg',  label: 'Jan 2026'     },
]

const TECH = [
  { name: 'Python',     hot: true  },
  { name: 'AWS',        hot: true  },
  { name: 'FastAPI',    hot: false },
  { name: 'Next.js',    hot: false },
  { name: 'Kubernetes', hot: false },
  { name: 'Docker',     hot: false },
  { name: 'Supabase',   hot: false },
  { name: 'Terraform',  hot: false },
  { name: 'ArgoCD',     hot: false },
  { name: 'React',      hot: false },
]

const TIMELINE = [
  { icon: GraduationCap, color: '#FBBF24', title: 'Gold Medal — Anna University', sub: '17th Convocation · 2024' },
  { icon: Briefcase,     color: '#8B5CF6', title: 'Systems Engineer · TCS',       sub: 'Tata Consultancy Services · 2024' },
  { icon: Award,         color: '#EC4899', title: 'Innovator Award',              sub: 'Best Performance · TCS · 2025' },
  { icon: Code2,         color: '#06B6D4', title: 'Building cool things',          sub: 'PlayLy & beyond · 2026 →' },
]

function Lightbox({ photos, index, onClose, onNav }: {
  photos: typeof PHOTOS; index: number; onClose: () => void; onNav: (dir: 1 | -1) => void
}) {
  const p = photos[index]
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape')      onClose()
      if (e.key === 'ArrowRight')  onNav(1)
      if (e.key === 'ArrowLeft')   onNav(-1)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(24px)' }}
      onClick={onClose}>
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 60% 60% at 50% 50%, rgba(139,92,246,0.18) 0%, rgba(236,72,153,0.08) 55%, transparent 80%)',
      }} />
      <button onClick={onClose}
        className="absolute top-5 right-5 z-10 w-10 h-10 rounded-2xl flex items-center justify-center"
        style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.15)', color: 'white' }}>
        <X size={18} />
      </button>
      <button onClick={e => { e.stopPropagation(); onNav(-1) }}
        className="absolute left-4 z-10 w-11 h-11 rounded-2xl flex items-center justify-center transition-all hover:scale-110"
        style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: 'white' }}>
        <ChevronLeft size={22} />
      </button>
      <div onClick={e => e.stopPropagation()} className="relative z-10 flex flex-col items-center">
        <img src={p.src} alt={p.label} style={{
          maxWidth: '80vw', maxHeight: '72vh',
          borderRadius: 20, objectFit: 'contain',
          boxShadow: '0 40px 120px rgba(0,0,0,0.9), 0 0 80px rgba(139,92,246,0.35)',
          border: '1px solid rgba(255,255,255,0.12)',
        }} />
        <p className="mt-4 text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.5)' }}>
          {p.label} · {index + 1} / {photos.length}
        </p>
        <div className="flex gap-2 mt-3">
          {photos.map((_, i) => (
            <div key={i} style={{
              width: i === index ? 20 : 6, height: 6, borderRadius: 3,
              background: i === index ? '#8B5CF6' : 'rgba(255,255,255,0.2)',
              transition: 'all 0.3s ease',
            }} />
          ))}
        </div>
      </div>
      <button onClick={e => { e.stopPropagation(); onNav(1) }}
        className="absolute right-4 z-10 w-11 h-11 rounded-2xl flex items-center justify-center transition-all hover:scale-110"
        style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: 'white' }}>
        <ChevronRight size={22} />
      </button>
    </div>
  )
}

export default function DeveloperPage() {
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [hovered,  setHovered]  = useState<number | null>(null)

  const navLightbox = (dir: 1 | -1) =>
    setLightbox(prev => prev === null ? 0 : (prev + dir + PHOTOS.length) % PHOTOS.length)

  return (
    <div className="fixed inset-0 overflow-hidden" style={{ background: 'var(--bg-base)', fontFamily: 'Inter, sans-serif' }}>

      {/* Ambient blobs */}
      <div className="aurora-blob pointer-events-none" style={{ width: 480, height: 480, top: '-15%', left: '-8%', background: 'rgba(139,92,246,0.16)', animationDelay: '0s' }} />
      <div className="aurora-blob pointer-events-none" style={{ width: 360, height: 360, bottom: '-12%', right: '-6%', background: 'rgba(236,72,153,0.12)', animationDelay: '3s' }} />

      {/* Stars */}
      {Array.from({ length: 28 }, (_, i) => (
        <div key={i} className="landing-star pointer-events-none" style={{
          top: `${i * 37 % 97}%`, left: `${i * 61 % 97}%`,
          width: 2 + (i % 2), height: 2 + (i % 2), background: 'white',
          opacity: 0.07 + (i * 0.01 % 0.18),
          animationDuration: `${2 + i * 0.15}s`, animationDelay: `${i * 0.12}s`,
        }} />
      ))}

      {/* Back link */}
      <Link href="/" className="absolute top-5 left-5 z-20 flex items-center gap-2 px-3 py-2 rounded-xl transition-all hover:scale-105"
        style={{ color: 'rgba(255,255,255,0.45)', textDecoration: 'none', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', fontSize: 12 }}>
        <ArrowLeft size={13} /> back to PlayLy
      </Link>

      {/* Main layout */}
      <div className="flex h-full w-full items-center justify-center gap-8 px-6"
        style={{ maxWidth: 1080, margin: '0 auto', paddingTop: 56, paddingBottom: 16 }}>

        {/* LEFT: Info */}
        <div className="flex-shrink-0 fade-in" style={{ width: 268 }}>

          {/* Avatar */}
          <div className="flex justify-center mb-4">
            <div className="relative cursor-pointer transition-transform hover:scale-105"
              onClick={() => setLightbox(0)}
              style={{ width: 92, height: 92, borderRadius: '50%', overflow: 'hidden',
                boxShadow: '0 0 0 3px rgba(139,92,246,0.5), 0 0 32px rgba(139,92,246,0.28)',
              }}>
              <img src="/dev-photo1.jpg" alt="Pandian" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          </div>

          {/* Name */}
          <div className="text-center mb-4">
            <h1 className="text-lg font-black tracking-tight" style={{
              background: 'linear-gradient(135deg, #a78bfa, #ec4899)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>Pandian Sambath</h1>
            <p className="text-xs mt-0.5 font-medium" style={{ color: 'var(--text-secondary)' }}>Systems Engineer</p>
            <p className="flex items-center justify-center gap-1 text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              <MapPin size={10} /> India
            </p>
          </div>

          <div style={{ height: 1, background: 'var(--border)', marginBottom: 14 }} />

          {/* Timeline */}
          <p className="text-[9px] uppercase tracking-widest font-bold mb-2.5" style={{ color: 'var(--text-muted)' }}>Journey</p>
          <div className="flex flex-col gap-2 mb-4">
            {TIMELINE.map((item, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className="flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center mt-0.5"
                  style={{ background: `${item.color}18`, border: `1px solid ${item.color}30` }}>
                  <item.icon size={11} style={{ color: item.color }} />
                </div>
                <div>
                  <p className="text-xs font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>{item.title}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{item.sub}</p>
                </div>
              </div>
            ))}
          </div>

          <div style={{ height: 1, background: 'var(--border)', marginBottom: 12 }} />

          {/* Tech */}
          <p className="text-[9px] uppercase tracking-widest font-bold mb-2" style={{ color: 'var(--text-muted)' }}>Tech</p>
          <div className="flex flex-wrap gap-1.5">
            {TECH.map((t, i) => (
              <span key={i} style={{
                fontWeight: t.hot ? 700 : 500, fontSize: t.hot ? 11 : 10,
                background: t.hot ? 'rgba(139,92,246,0.18)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${t.hot ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.08)'}`,
                color: t.hot ? '#c4b5fd' : 'var(--text-secondary)',
                padding: '3px 9px', borderRadius: 99,
              }}>
                {t.hot && '★ '}{t.name}
              </span>
            ))}
          </div>

          <p className="mt-3 text-center text-[10px]" style={{ color: 'rgba(255,255,255,0.12)' }}>
            built PlayLy ·{' '}
            <a href="https://github.com/pandiansambath" target="_blank" rel="noopener"
              className="hover:text-purple-400 transition-colors"
              style={{ color: 'rgba(255,255,255,0.20)', textDecoration: 'none' }}>github</a>
          </p>
        </div>

        {/* RIGHT: Gallery */}
        <div className="flex-1 fade-in" style={{ minWidth: 0, animationDelay: '0.15s' }}>
          <p className="text-[9px] uppercase tracking-widest font-bold mb-3" style={{ color: 'var(--text-muted)' }}>
            Photos · click to view
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, maxWidth: 500 }}>
            {PHOTOS.map((photo, i) => (
              <div
                key={i}
                onClick={() => setLightbox(i)}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  position: 'relative', cursor: 'pointer', borderRadius: 18, overflow: 'hidden',
                  aspectRatio: (i === 0 || i === 3) ? '4/5' : '4/3',
                  transition: 'transform 0.35s cubic-bezier(0.16,1,0.3,1), box-shadow 0.35s ease',
                  transform: hovered === i ? 'scale(1.04)' : 'scale(1)',
                  boxShadow: hovered === i
                    ? '0 24px 60px rgba(0,0,0,0.7), 0 0 40px rgba(139,92,246,0.3)'
                    : '0 8px 24px rgba(0,0,0,0.5)',
                  border: hovered === i ? '1px solid rgba(139,92,246,0.4)' : '1px solid rgba(255,255,255,0.07)',
                }}>
                <img src={photo.src} alt={photo.label} style={{
                  width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                  transition: 'transform 0.5s ease',
                  transform: hovered === i ? 'scale(1.09)' : 'scale(1)',
                }} />
                {/* Overlay */}
                <div style={{
                  position: 'absolute', inset: 0,
                  background: hovered === i
                    ? 'linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 55%)'
                    : 'linear-gradient(to top, rgba(0,0,0,0.3) 0%, transparent 70%)',
                  transition: 'all 0.3s ease',
                }} />
                {/* Label on hover */}
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0, padding: '8px 10px',
                  opacity: hovered === i ? 1 : 0,
                  transform: hovered === i ? 'translateY(0)' : 'translateY(5px)',
                  transition: 'all 0.28s ease',
                }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>{photo.label}</p>
                  <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>tap to expand</p>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-2.5 text-[9px]" style={{ color: 'rgba(255,255,255,0.14)' }}>
            ← → arrow keys to navigate in fullscreen
          </p>
        </div>
      </div>

      {/* Lightbox */}
      {lightbox !== null && (
        <Lightbox photos={PHOTOS} index={lightbox} onClose={() => setLightbox(null)} onNav={navLightbox} />
      )}
    </div>
  )
}
