'use client'
import { usePlayerStore } from '@/store/playerStore'

/** Subtle full-page ambient gradient that shifts color with the current song */
export function DynamicBackground() {
  const accentColor = usePlayerStore(s => s.accentColor)
  return (
    <div
      className="fixed inset-0 pointer-events-none z-0 transition-all duration-[2000ms] ease-out"
      style={{
        background: `
          radial-gradient(ellipse at 30% 0%,   rgba(${accentColor},0.08) 0%, transparent 50%),
          radial-gradient(ellipse at 70% 100%, rgba(${accentColor},0.06) 0%, transparent 50%)
        `,
      }}
    />
  )
}
