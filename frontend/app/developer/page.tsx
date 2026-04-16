'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Award, Briefcase, GraduationCap, Code2, MapPin } from 'lucide-react'

// ─── Tech stack ────────────────────────────────────────
const TECH = [
  { name: 'Python',     color: 'orange', strong: true  },
  { name: 'AWS',        color: 'orange', strong: true  },
  { name: 'FastAPI',    color: 'green',  strong: false },
  { name: 'Next.js',    color: 'purple', strong: false },
  { name: 'Kubernetes', color: 'cyan',   strong: false },
  { name: 'Docker',     color: 'cyan',   strong: false },
  { name: 'Supabase',   color: 'green',  strong: false },
  { name: 'Terraform',  color: 'purple', strong: false },
  { name: 'ArgoCD',     color: 'pink',   strong: false },
  { name: 'React',      color: 'cyan',   strong: false },
]

// ─── Timeline ─────────────────────────────────────────
const TIMELINE = [
  {
    year: '2024',
    icon: GraduationCap,
    color: '#FBBF24',
    title: 'Gold Medal — Anna University',
    sub: '17th Convocation',
  },
  {
    year: '2024',
    icon: Briefcase,
    color: '#8B5CF6',
    title: 'Systems Engineer',
    sub: 'Tata Consultancy Services',
  },
  {
    year: '2025',
    icon: Award,
    color: '#EC4899',
    title: 'Innovator Award',
    sub: 'Best Performance · TCS',
  },
  {
    year: '2026 →',
    icon: Code2,
    color: '#06B6D4',
    title: 'Building cool things',
    sub: 'PlayLy & beyond',
  },
]

export default function DeveloperPage() {
  const [photo, setPhoto] = useState<1 | 2>(1)

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10"
      style={{
        background: 'var(--bg-base)',
        fontFamily: 'Inter, sans-serif',
      }}>

      {/* Stars */}
      {[...Array(30)].map((_, i) => (
        <div key={i} className="landing-star pointer-events-none"
          style={{
            top:  `${(i * 37 % 97)}%`,
            left: `${(i * 61 % 97)}%`,
            width: 2 + (i % 2),
            height: 2 + (i % 2),
            background: 'white',
            opacity: 0.1 + (i * 0.01 % 0.2),
            animationDuration: `${2 + i * 0.15}s`,
            animationDelay:    `${i * 0.12}s`,
          }} />
      ))}

      {/* Back link */}
      <Link href="/"
        className="flex items-center gap-2 mb-8 text-xs fade-in"
        style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
        <ArrowLeft size={13} />
        back to PlayLy
      </Link>

      {/* Card */}
      <div className="glass rounded-3xl p-8 w-full max-w-sm fade-in delay-100"
        style={{ border: '1px solid var(--border-strong)', position: 'relative' }}>

        {/* Glow bg blob */}
        <div className="aurora-blob pointer-events-none" style={{
          width: 260, height: 260,
          top: -60, right: -60,
          background: 'rgba(139,92,246,0.13)',
          animationDelay: '0s',
        }} />

        {/* Avatar — hover to swap photo */}
        <div className="flex flex-col items-center mb-5">
          <div
            className="dev-avatar-wrap mb-4 cursor-pointer"
            onMouseEnter={() => setPhoto(2)}
            onMouseLeave={() => setPhoto(1)}>
            <img
              src="/dev-photo1.jpg"
              alt="Pandian Sambath"
              className="dev-photo-1"
            />
            <img
              src="/dev-photo2.jpg"
              alt="Pandian at work"
              className="dev-photo-2"
            />
          </div>

          {/* Name */}
          <h1 className="text-xl font-black tracking-tight"
            style={{
              background: 'linear-gradient(135deg, #a78bfa, #ec4899)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
            Pandian Sambath
          </h1>

          {/* Role + location */}
          <p className="text-xs mt-1 font-medium" style={{ color: 'var(--text-secondary)' }}>
            Systems Engineer
          </p>
          <p className="flex items-center gap-1 text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            <MapPin size={10} />
            India
          </p>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--border)', margin: '0 -8px 20px' }} />

        {/* Timeline */}
        <div className="mb-5">
          <p className="text-[10px] uppercase tracking-widest font-bold mb-3" style={{ color: 'var(--text-muted)' }}>
            Journey
          </p>
          <div className="flex flex-col gap-3">
            {TIMELINE.map((item, i) => (
              <div key={i} className="flex items-start gap-3 fade-in" style={{ animationDelay: `${0.15 + i * 0.08}s` }}>
                {/* Icon */}
                <div className="flex-shrink-0 w-7 h-7 rounded-xl flex items-center justify-center mt-0.5"
                  style={{ background: `${item.color}18`, border: `1px solid ${item.color}35` }}>
                  <item.icon size={13} style={{ color: item.color }} />
                </div>
                {/* Text */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {item.title}
                    </span>
                  </div>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {item.sub} · {item.year}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--border)', margin: '0 -8px 16px' }} />

        {/* Tech stack */}
        <div>
          <p className="text-[10px] uppercase tracking-widest font-bold mb-3" style={{ color: 'var(--text-muted)' }}>
            Tech
          </p>
          <div className="flex flex-wrap gap-1.5">
            {TECH.map((t, i) => (
              <span key={i}
                className={`dev-tag ${
                  t.color === 'orange' ? 'dev-tag-orange' :
                  t.color === 'pink'   ? 'dev-tag-pink'   :
                  t.color === 'cyan'   ? 'dev-tag-cyan'   :
                  t.color === 'green'  ? 'dev-tag-green'  : ''
                }`}
                style={{
                  animationDelay: `${0.2 + i * 0.05}s`,
                  fontWeight: t.strong ? 700 : 500,
                  fontSize: t.strong ? 12 : 11,
                }}>
                {t.strong && '★ '}
                {t.name}
              </span>
            ))}
          </div>
        </div>

        {/* Footer note */}
        <p className="mt-5 text-center text-[10px]" style={{ color: 'rgba(255,255,255,0.12)' }}>
          built PlayLy ·{' '}
          <a href="https://github.com/pandiansambath" target="_blank" rel="noopener"
            className="hover:text-purple-400 transition-colors"
            style={{ color: 'rgba(255,255,255,0.18)', textDecoration: 'none' }}>
            github
          </a>
        </p>
      </div>
    </div>
  )
}
