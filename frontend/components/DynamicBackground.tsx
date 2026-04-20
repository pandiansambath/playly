'use client'
import { useEffect, useState } from 'react'
import { usePlayerStore } from '@/store/playerStore'
import { useTheme } from './ThemeProvider'

// Pre-computed star positions — stable across renders, cheap to paint.
const STARS = Array.from({ length: 80 }, (_, i) => ({
  x: (i * 131) % 100 + (Math.random() * 6 - 3),
  y: ((i * 271) % 100) + (Math.random() * 6 - 3),
  r: 0.4 + Math.random() * 1.2,
  tw: Math.random() * 4,                // twinkle phase offset (s)
  bright: 0.35 + Math.random() * 0.55,
}))

/**
 * Full-page ambient background.
 *  • Dark themes — starfield + moon glow + aurora sweeps
 *  • Light theme — soft sun glow + sky sheen
 *  • Sunset / forest — themed colored mesh
 *  • When a song is playing, the current thumbnail is painted as a
 *    heavily blurred iOS-Music-style backdrop tinted by the accent.
 */
export function DynamicBackground() {
  const accentColor = usePlayerStore(s => s.accentColor)
  const song        = usePlayerStore(s => s.currentSong)
  const { theme }   = useTheme()

  // Stars only rendered on dark-family themes (skip for light/sunset/forest
  // where they look out of place).
  const isDark = theme === 'dark' || theme === 'amoled' || theme === 'ocean'
  const isLight = theme === 'light'

  // Slow gradient-position animation tick (very cheap: updates every 8s)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => (t + 1) % 360), 8000)
    return () => clearInterval(id)
  }, [])

  const thumbUrl = song?.thumbnail_url

  return (
    <>
      {/* ── Thumbnail-dominant blurred backdrop (site-wide, behind content) ── */}
      {thumbUrl && (
        <div
          key={song.id}
          aria-hidden
          className="fixed inset-0 pointer-events-none z-0"
          style={{
            backgroundImage: `url(${thumbUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(110px) saturate(1.8) brightness(0.55)',
            transform: 'scale(1.3)',
            opacity: isLight ? 0.22 : 0.32,
            transition: 'opacity 1.8s ease',
            animation: 'bg-breathe 14s ease-in-out infinite alternate',
          }}
        />
      )}

      {/* ── Accent-tinted ambient mesh (always present) ── */}
      <div
        className="fixed inset-0 pointer-events-none z-0 transition-all duration-[2000ms] ease-out"
        style={{
          background: `
            radial-gradient(ellipse 70% 60% at ${30 + (tick % 10)}% 0%,   rgba(${accentColor},0.14) 0%, transparent 55%),
            radial-gradient(ellipse 70% 60% at ${70 - (tick % 10)}% 100%, rgba(${accentColor},0.10) 0%, transparent 55%)
          `,
        }}
      />

      {/* ── Dark themes: starfield + moon glow + aurora ── */}
      {isDark && (
        <>
          {/* Starfield (SVG, static positions, CSS twinkle) */}
          <svg
            className="fixed inset-0 pointer-events-none z-0"
            width="100%" height="100%" viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden
          >
            {STARS.map((s, i) => (
              <circle
                key={i}
                cx={s.x} cy={s.y} r={s.r / 30}
                fill="white"
                style={{
                  opacity: s.bright,
                  animation: `star-twinkle ${3 + s.tw}s ease-in-out ${s.tw}s infinite`,
                }}
              />
            ))}
          </svg>

          {/* Moon glow — top-right */}
          <div
            aria-hidden
            className="fixed pointer-events-none z-0"
            style={{
              top: '-6%', right: '-4%',
              width: 260, height: 260,
              background: 'radial-gradient(circle, rgba(230,230,255,0.18) 0%, rgba(180,180,220,0.05) 45%, transparent 70%)',
              borderRadius: '50%',
              filter: 'blur(8px)',
            }}
          />

          {/* Aurora sweep — bottom, shifts with accent */}
          <div
            aria-hidden
            className="fixed inset-x-0 bottom-0 pointer-events-none z-0 h-[55vh]"
            style={{
              background: `
                radial-gradient(ellipse 90% 60% at 20% 100%, rgba(${accentColor},0.16) 0%, transparent 60%),
                radial-gradient(ellipse 80% 50% at 85% 100%, rgba(${accentColor},0.10) 0%, transparent 65%)
              `,
              filter: 'blur(40px)',
              animation: 'aurora-shift 18s ease-in-out infinite alternate',
            }}
          />
        </>
      )}

      {/* ── Light theme: sun + soft sky ── */}
      {isLight && (
        <>
          <div
            aria-hidden
            className="fixed pointer-events-none z-0"
            style={{
              top: '-10%', right: '-6%',
              width: 320, height: 320,
              background: 'radial-gradient(circle, rgba(255,220,120,0.55) 0%, rgba(255,180,90,0.15) 40%, transparent 70%)',
              borderRadius: '50%',
              filter: 'blur(12px)',
              animation: 'sun-drift 24s ease-in-out infinite alternate',
            }}
          />
          <div
            aria-hidden
            className="fixed inset-0 pointer-events-none z-0"
            style={{
              background: `
                radial-gradient(ellipse 140% 70% at 50% -10%, rgba(180,220,255,0.35) 0%, transparent 55%),
                radial-gradient(ellipse 80% 50% at 20% 100%, rgba(255,200,220,0.18) 0%, transparent 60%)
              `,
            }}
          />
        </>
      )}

      {/* ── Sunset theme: warm horizon ── */}
      {theme === 'sunset' && (
        <div
          aria-hidden
          className="fixed inset-0 pointer-events-none z-0"
          style={{
            background: `
              radial-gradient(ellipse 120% 60% at 50% 100%, rgba(251,146,60,0.28) 0%, transparent 60%),
              radial-gradient(ellipse 80% 40% at 30% 110%, rgba(236,72,153,0.22) 0%, transparent 65%)
            `,
            animation: 'aurora-shift 20s ease-in-out infinite alternate',
          }}
        />
      )}

      {/* ── Forest theme: green aurora ── */}
      {theme === 'forest' && (
        <div
          aria-hidden
          className="fixed inset-0 pointer-events-none z-0"
          style={{
            background: `
              radial-gradient(ellipse 80% 50% at 30% 100%, rgba(34,197,94,0.22) 0%, transparent 60%),
              radial-gradient(ellipse 70% 40% at 80% 0%,  rgba(132,204,22,0.14) 0%, transparent 60%)
            `,
            animation: 'aurora-shift 22s ease-in-out infinite alternate',
          }}
        />
      )}
    </>
  )
}
