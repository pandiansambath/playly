'use client'
import { useEffect, useRef, useState } from 'react'
import {
  Play, Pause, SkipBack, SkipForward,
  Volume2, VolumeX, ChevronDown, Repeat, Repeat1, Shuffle,
  MonitorPlay, Sparkles, Download, Loader2, Check, X, Maximize2,
} from 'lucide-react'
import { usePlayerStore, getAudio } from '@/store/playerStore'
import { formatDuration, supabase } from '@/lib/supabase'
import { api } from '@/lib/api'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// ═══════════════════════════════════════════════════════════
// WEB AUDIO ANALYSER — Module-level singleton
// createMediaElementSource can only be called once per element
// Pipeline: src → analyser → boost → destination
// `boost` lets us push past the 1.0 browser ceiling so songs feel loud.
// ═══════════════════════════════════════════════════════════
let _audioCtx: AudioContext | null = null
let _analyser: AnalyserNode | null = null
let _boost:    GainNode | null = null
let _analyserReady = false
const MAX_BOOST = 1.8   // 1.0 = native, 1.8 = +5dB headroom

function initAnalyser(): AnalyserNode | null {
  if (_analyserReady) return _analyser
  _analyserReady = true
  const audio = getAudio()
  if (!audio || typeof window === 'undefined') return null
  try {
    _audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
    _analyser = _audioCtx.createAnalyser()
    _analyser.fftSize = 512          // 256 frequency bins
    _analyser.smoothingTimeConstant = 0.78
    _boost = _audioCtx.createGain()
    _boost.gain.value = MAX_BOOST    // constant boost — slider scales via audio.volume
    // Resume context BEFORE wiring createMediaElementSource.
    // createMediaElementSource immediately reroutes audio through the AudioContext;
    // if the context is still suspended at that point, audio goes silent.
    // By connecting only after resume(), audio never interrupts.
    _audioCtx.resume().then(() => {
      if (!_audioCtx || !_analyser || !_boost) return
      const src = _audioCtx.createMediaElementSource(audio)
      src.connect(_analyser)
      _analyser.connect(_boost)
      _boost.connect(_audioCtx.destination)
    }).catch(() => {
      // Resume rejected (browser blocked) — reset so next user gesture can retry
      _analyserReady = false; _analyser = null; _boost = null; _audioCtx = null
    })
    return _analyser
  } catch { return null }
}

function resumeCtx() {
  if (_audioCtx?.state === 'suspended') _audioCtx.resume()
}

// ═══════════════════════════════════════════════════════════
// CANVAS EQUALIZER BARS — actual frequency data
// ═══════════════════════════════════════════════════════════
function EqCanvas({ isPlaying, accentColor }: { isPlaying: boolean; accentColor: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef    = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const W = canvas.width  = 260
    const H = canvas.height = 48
    const BAR_COUNT = 26
    const analyser = _analyser

    function drawStatic() {
      ctx.clearRect(0, 0, W, H)
      const bw = W / BAR_COUNT - 2
      for (let i = 0; i < BAR_COUNT; i++) {
        const x = i * (W / BAR_COUNT)
        const h = 3 + Math.sin(i * 0.7) * 3
        ctx.fillStyle = `rgba(${accentColor},0.2)`
        ctx.beginPath(); ctx.roundRect(x, H - h, bw, h, 2); ctx.fill()
      }
    }

    if (!analyser || !isPlaying) { drawStatic(); return }

    const data = new Uint8Array(analyser.frequencyBinCount)
    function draw() {
      rafRef.current = requestAnimationFrame(draw)
      analyser!.getByteFrequencyData(data)
      ctx.clearRect(0, 0, W, H)
      const bw = W / BAR_COUNT - 2
      for (let i = 0; i < BAR_COUNT; i++) {
        const bin = 1 + Math.floor(i * 80 / BAR_COUNT)
        const v   = data[bin] / 255
        const h   = Math.max(3, v * H)
        const x   = i * (W / BAR_COUNT)
        const grad = ctx.createLinearGradient(0, H, 0, H - h)
        grad.addColorStop(0, `rgba(${accentColor},0.95)`)
        grad.addColorStop(0.5, `rgba(${accentColor},0.6)`)
        grad.addColorStop(1, 'rgba(236,72,153,0.8)')
        ctx.fillStyle = grad
        ctx.beginPath(); ctx.roundRect(x, H - h, bw, h, 2); ctx.fill()
      }
    }
    draw()
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [isPlaying]) // eslint-disable-line

  return (
    <canvas ref={canvasRef}
      style={{ width: 260, height: 48, display: 'block', margin: '0 auto' }} />
  )
}

// ═══════════════════════════════════════════════════════════
// MAGIC VISUALIZER CANVAS — full-screen beat-reactive aura
// Layers: drifting orbs, waveform at bottom, ambient bubble stream,
//         beat-triggered ring-burst that flies all the way to edges
// ═══════════════════════════════════════════════════════════
type Bubble = {
  x: number; y: number; vx: number; vy: number; r: number; life: number; hue: number;
  // burst   = beat-spawned edge-flyer
  // ambient = slow floater steered by gravity point
  // missile = high-beat comet with a streaking trail
  kind: 'burst' | 'ambient' | 'missile'
  trail?: { x: number; y: number }[]
}

function MagicCanvas({ accentColor, onBeat, overVideo = false }: {
  accentColor: string
  onBeat?: (strength: number) => void
  overVideo?: boolean
}) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const rafRef     = useRef<number>(0)
  const prevEnergy = useRef(0)
  const avgEnergy  = useRef(0)
  const beatTime   = useRef(0)
  const hueShift   = useRef(270)
  const breathe    = useRef(0)
  const wavePhase  = useRef(0)
  const ambSpawn   = useRef(0)
  const beatCount  = useRef(0)
  const lastSplit  = useRef(0)
  const lastMissile = useRef(0)
  const missileSeen = useRef(0) // beat number at last missile fire
  const initialFired = useRef(false)
  // Slow-drifting gravity point the ambient bubbles coalesce toward.
  // Moves on a Lissajous path so groups re-form in different spots.
  const gravity    = useRef({ x: 0, y: 0, t: 0 })

  const bubbles = useRef<Bubble[]>([])
  const ripples = useRef<{ r: number; maxR: number; alpha: number; hue: number; cx: number; cy: number }[]>([])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const el  = canvas

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      el.width  = el.offsetWidth  * dpr
      el.height = el.offsetHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const analyser = _analyser
    const bufLen   = analyser?.frequencyBinCount ?? 128
    const dataArr  = analyser ? new Uint8Array(bufLen) : null

    function draw() {
      rafRef.current = requestAnimationFrame(draw)
      const W = el.offsetWidth
      const H = el.offsetHeight
      if (!W || !H) return

      if (analyser && dataArr) analyser.getByteFrequencyData(dataArr)

      // ── Frequency bands ─────────────────────────────────────────
      const bass = dataArr ? (dataArr[1]+dataArr[2]+dataArr[3]+dataArr[4]+dataArr[5]) / (5*255) : 0.12
      const mid  = dataArr ? (dataArr[8]+dataArr[12]+dataArr[16]+dataArr[20]) / (4*255) : 0.08
      const high = dataArr ? (dataArr[40]+dataArr[60]+dataArr[80]) / (3*255) : 0.04
      const energy = bass * 0.66 + mid * 0.28 + high * 0.06

      // ── Adaptive beat detection ─────────────────────────────────
      avgEnergy.current = avgEnergy.current * 0.985 + energy * 0.015
      const now = performance.now()
      const threshold = Math.max(0.05, avgEnergy.current * 1.32)
      const strength = energy / Math.max(0.001, avgEnergy.current)
      const isBeat = energy > threshold && energy > prevEnergy.current * 1.10 && now - beatTime.current > 120
      const cx = W / 2
      const cy = H / 2
      const maxD = Math.hypot(cx, cy) // distance to corner

      // Fire a missile barrage — comets with streaking trails that shoot from
      // center to the edges. Reused by the initial burst AND by high-beat hits.
      const fireMissiles = (count: number, strengthBoost = 0) => {
        const baseSpeed = (maxD / 70) * (1 + strengthBoost * 0.35)
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2 + Math.random() * 0.08
          const sp = baseSpeed * (0.92 + Math.random() * 0.3)
          bubbles.current.push({
            x: cx, y: cy,
            vx: Math.cos(angle) * sp, vy: Math.sin(angle) * sp,
            r: 3.5 + Math.random() * 2.5 + strengthBoost * 1.5, life: 1,
            hue: (hueShift.current + (Math.random()*80-40)) % 360,
            kind: 'missile',
            trail: [],
          })
        }
      }

      // ── Initial dramatic burst on first frame (magic click opens with a bang) ──
      if (!initialFired.current) {
        initialFired.current = true
        ripples.current.push({
          r: 0, maxR: maxD * 1.05, alpha: 0.55, hue: hueShift.current, cx, cy,
        })
        fireMissiles(22, 0.2)
      }

      if (isBeat) {
        beatTime.current = now
        beatCount.current++
        const beatStrength = Math.min(1.4, Math.max(0.5, strength - 1))

        // Missile barrage — fires on any decent beat, ~every 0.7s minimum.
        // beatStrength > 0.7 means the beat is at least 70% of avg energy (most beats).
        const isMissileHit =
          beatStrength > 0.7 &&
          now - lastMissile.current > 700 &&
          beatCount.current - missileSeen.current >= 2
        if (isMissileHit) {
          lastMissile.current = now
          missileSeen.current = beatCount.current
          fireMissiles(Math.round(12 + beatStrength * 8), beatStrength)
          // Bright leading shockwave that races out with the missiles
          ripples.current.push({
            r: 0, maxR: maxD * 1.12, alpha: 0.45,
            hue: hueShift.current, cx, cy,
          })
        }

        // Weak beats: just a small inner ripple + bubbles get a gentle push
        // toward the gravity point so the group tightens rhythmically.
        // Strong beats (or every 5th): EXPLOSION — ambient swarm converts to
        // burst and flies out to the edges, plus fresh bubbles fire.
        const isExplosion =
          (beatStrength > 0.95 || beatCount.current - lastSplit.current >= 5) &&
          now - lastSplit.current > 1800

        // Always emit a ripple on beat, size scaled by strength
        ripples.current.push({
          r: 0,
          maxR: maxD * (isExplosion ? 1.05 : 0.45 + beatStrength * 0.3),
          alpha: 0.25 + beatStrength * 0.22,
          hue: hueShift.current,
          cx, cy,
        })
        if (ripples.current.length > 6) ripples.current.shift()

        if (isExplosion) {
          lastSplit.current = beatCount.current
          // Convert every ambient bubble into a burst, fired outward from the
          // gravity point so the grouped swarm suddenly explodes apart.
          const gx = gravity.current.x, gy = gravity.current.y
          const baseSpeed = (maxD / 80) * (1.0 + beatStrength * 0.6)
          bubbles.current.forEach(b => {
            if (b.kind !== 'ambient') return
            const dx = b.x - gx, dy = b.y - gy
            const dist = Math.max(1, Math.hypot(dx, dy))
            const sp = baseSpeed * (0.7 + Math.random() * 0.5)
            b.vx = (dx / dist) * sp
            b.vy = (dy / dist) * sp
            b.kind = 'burst'
            b.life = 1
            b.r = b.r + 1.5
          })
          // Plus fresh radial ring from center so it feels choreographed
          const count = Math.round(16 + beatStrength * 10)
          for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2 + Math.random() * 0.14
            const sp = baseSpeed * (0.85 + Math.random() * 0.35)
            bubbles.current.push({
              x: cx, y: cy,
              vx: Math.cos(angle) * sp, vy: Math.sin(angle) * sp,
              r: 2.5 + Math.random() * 3 + beatStrength * 2,
              life: 1,
              hue: (hueShift.current + (Math.random()*80-40)) % 360,
              kind: 'burst',
            })
          }
        } else {
          // Mild beat: nudge ambient bubbles outward slightly for texture,
          // and spawn a small handful of soft pulses
          bubbles.current.forEach(b => {
            if (b.kind !== 'ambient') return
            const dx = b.x - cx, dy = b.y - cy
            const dist = Math.max(1, Math.hypot(dx, dy))
            const kick = 0.6 + beatStrength * 0.4
            b.vx += (dx / dist) * kick
            b.vy += (dy / dist) * kick
          })
        }
        onBeat?.(beatStrength)
      }

      prevEnergy.current = energy * 0.55 + prevEnergy.current * 0.45
      hueShift.current   = (hueShift.current + 0.25 + energy * 1.4) % 360
      breathe.current    = (breathe.current + 0.011 + energy * 0.04) % (Math.PI * 2)
      wavePhase.current  = (wavePhase.current + 0.018 + high * 0.22) % (Math.PI * 2)

      // Lissajous drift for the gravity point — bubbles group around it,
      // and because it wanders, groups re-form in different parts of canvas
      gravity.current.t += 0.004 + energy * 0.01
      gravity.current.x = cx + Math.cos(gravity.current.t * 0.7) * W * 0.26
      gravity.current.y = cy + Math.sin(gravity.current.t * 1.1) * H * 0.22

      // ── Ambient bubbles: spawn from random edges, drift toward gravity ──
      ambSpawn.current += 1 + high * 1.6 + bass * 1.2
      const spawnGate = 12 - energy * 4 // higher energy → faster spawn rate
      if (ambSpawn.current > spawnGate) {
        ambSpawn.current = 0
        if (bubbles.current.filter(b => b.kind === 'ambient').length < 42) {
          // Pick an edge so they enter from all four sides
          const edge = Math.floor(Math.random() * 4)
          let sx = 0, sy = 0
          if (edge === 0)      { sx = Math.random() * W; sy = H + 8 }
          else if (edge === 1) { sx = Math.random() * W; sy = -8 }
          else if (edge === 2) { sx = -8; sy = Math.random() * H }
          else                 { sx = W + 8; sy = Math.random() * H }
          bubbles.current.push({
            x: sx, y: sy,
            vx: (Math.random() - 0.5) * 0.3,
            vy: (Math.random() - 0.5) * 0.3,
            r: 1.5 + Math.random() * 2.5,
            life: 1,
            hue: (hueShift.current + (Math.random()*50-25)) % 360,
            kind: 'ambient',
          })
        }
      }

      // ── Background wash: trail + base ambience ───────────────────
      ctx.fillStyle = 'rgba(4,4,14,0.22)'
      ctx.fillRect(0, 0, W, H)

      // ── Layer 1: Big drifting aurora orbs (cover whole canvas) ───
      for (let o = 0; o < 3; o++) {
        const phase = breathe.current + o * (Math.PI * 2 / 3)
        const ox = cx + Math.cos(phase * 0.33 + o * 2.1) * W * 0.42
        const oy = cy + Math.sin(phase * 0.27 + o * 1.8) * H * 0.38
        const r  = Math.max(W, H) * (0.38 + energy * 0.18 + Math.sin(phase) * 0.06)
        const hue = (hueShift.current + o * 60) % 360
        const g  = ctx.createRadialGradient(ox, oy, 0, ox, oy, r)
        g.addColorStop(0,   `hsla(${hue},90%,66%,${0.09 + energy * 0.10})`)
        g.addColorStop(0.5, `hsla(${(hue+30)%360},85%,55%,${0.04 + energy * 0.05})`)
        g.addColorStop(1,   'transparent')
        ctx.beginPath(); ctx.arc(ox, oy, r, 0, Math.PI*2)
        ctx.fillStyle = g; ctx.fill()
      }

      // ── Layer 2: Breathing center core ──────────────────────────
      const minD = Math.min(cx, cy)
      const coreR = minD * (0.09 + bass * 0.15 + Math.sin(breathe.current) * 0.03)
      const gc = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR)
      gc.addColorStop(0,    `hsla(${hueShift.current},100%,92%,${0.55 + bass * 0.25})`)
      gc.addColorStop(0.5,  `hsla(${hueShift.current},95%,70%,${0.30 + bass * 0.18})`)
      gc.addColorStop(1,    'transparent')
      ctx.beginPath(); ctx.arc(cx, cy, coreR, 0, Math.PI*2)
      ctx.fillStyle = gc; ctx.fill()

      // ── Layer 3: Beat ripples (reach edge) ──────────────────────
      ripples.current = ripples.current.filter(rp => rp.alpha > 0.01)
      ripples.current.forEach(rp => {
        rp.r     += (rp.maxR - rp.r) * 0.045
        rp.alpha *= 0.962
        const width = rp.maxR * 0.035
        const gr2 = ctx.createRadialGradient(rp.cx, rp.cy, Math.max(0, rp.r - width), rp.cx, rp.cy, rp.r + width)
        gr2.addColorStop(0,   'transparent')
        gr2.addColorStop(0.5, `hsla(${rp.hue},100%,82%,${rp.alpha})`)
        gr2.addColorStop(1,   'transparent')
        ctx.beginPath(); ctx.arc(rp.cx, rp.cy, rp.r, 0, Math.PI*2)
        ctx.fillStyle = gr2; ctx.fill()
      })

      // ── Layer 4: Bubbles (burst + ambient) ──────────────────────
      bubbles.current = bubbles.current.filter(b => {
        if (b.life <= 0.02) return false
        const outOfBounds = b.x < -40 || b.x > W + 40 || b.y < -40 || b.y > H + 40
        if (outOfBounds) return false
        return true
      })
      const gx = gravity.current.x, gy = gravity.current.y
      bubbles.current.forEach(b => {
        b.x += b.vx
        b.y += b.vy
        if (b.kind === 'missile') {
          // Almost no drag — fly straight to the edge like a comet.
          b.vx *= 0.998; b.vy *= 0.998
          b.life *= 0.985
          if (b.trail) {
            b.trail.push({ x: b.x, y: b.y })
            if (b.trail.length > 14) b.trail.shift()
          }
        } else if (b.kind === 'burst') {
          // Mild drag so they decelerate near the edge — looks like swimming
          b.vx *= 0.994; b.vy *= 0.994
          b.life *= 0.993
        } else {
          // Ambient bubble: steer toward gravity point (grouping behaviour).
          // Pull strength ramps with energy, so in a loud chorus bubbles
          // cluster tighter. When silent the pull is gentle and they drift.
          const dx = gx - b.x, dy = gy - b.y
          const dist = Math.max(1, Math.hypot(dx, dy))
          const pull = 0.012 + energy * 0.06
          b.vx += (dx / dist) * pull
          b.vy += (dy / dist) * pull
          // Orbital swirl so they don't just piling into the point — they
          // circle it in a loose swarm.
          b.vx += -(dy / dist) * 0.08
          b.vy +=  (dx / dist) * 0.08
          // Cap max speed (low at rest, higher on energy)
          const maxV = 0.7 + energy * 2.2
          const v = Math.hypot(b.vx, b.vy)
          if (v > maxV) { b.vx *= maxV / v; b.vy *= maxV / v }
          // Gentle damping
          b.vx *= 0.96; b.vy *= 0.96
          b.life *= 0.996
        }
        // Streaking trail behind missiles — fades from head to tail
        if (b.kind === 'missile' && b.trail && b.trail.length > 1) {
          ctx.lineCap = 'round'
          for (let i = 1; i < b.trail.length; i++) {
            const a = b.trail[i - 1], c = b.trail[i]
            const t = i / b.trail.length            // 0..1 along trail
            ctx.strokeStyle = `hsla(${b.hue},100%,75%,${b.life * t * 0.7})`
            ctx.lineWidth   = b.r * (0.6 + t * 0.9)
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke()
          }
        }
        const rad = b.r * (2.4 + (b.kind === 'burst' ? 0.4 : b.kind === 'missile' ? 0.7 : 0))
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, rad)
        g.addColorStop(0,   `hsla(${b.hue},100%,${b.kind === 'missile' ? 92 : 80}%,${b.life})`)
        g.addColorStop(0.4, `hsla(${b.hue},95%,62%,${b.life * 0.5})`)
        g.addColorStop(1,   'transparent')
        ctx.beginPath(); ctx.arc(b.x, b.y, rad, 0, Math.PI*2)
        ctx.fillStyle = g; ctx.fill()
      })

      // ── Layer 5: Full-width waveform at bottom ──────────────────
      // Mirrors frequency data — breathes with the song across the whole screen
      if (dataArr) {
        const steps = 96
        const waveTop = H * 0.86
        const waveH = H * 0.14
        ctx.beginPath()
        ctx.moveTo(0, H)
        for (let i = 0; i <= steps; i++) {
          const bin = 1 + Math.floor((i / steps) * 80)
          const v = (dataArr[bin] || 0) / 255
          const x = (i / steps) * W
          // Combine FFT with a slow sine so the wave always has motion
          const swell = Math.sin(wavePhase.current + i * 0.21) * 0.12
          const y = waveTop + waveH - v * waveH * 0.9 - swell * waveH * 0.5
          ctx.lineTo(x, y)
        }
        ctx.lineTo(W, H); ctx.closePath()
        const wg = ctx.createLinearGradient(0, waveTop, 0, H)
        wg.addColorStop(0, `hsla(${hueShift.current},95%,70%,${0.14 + energy * 0.18})`)
        wg.addColorStop(1, `hsla(${(hueShift.current+30)%360},90%,55%,${0.02})`)
        ctx.fillStyle = wg; ctx.fill()
      }
    }
    draw()

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', resize)
    }
  }, []) // eslint-disable-line

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{
        // When video is playing, float canvas ABOVE the iframe with additive
        // blending so orbs/missiles paint as light over the video without
        // hiding it. pointer-events:none keeps controls clickable.
        zIndex: overVideo ? 200 : 2,
        mixBlendMode: overVideo ? 'screen' : 'normal',
        pointerEvents: 'none',
      }}
    />
  )
}

// ═══════════════════════════════════════════════════════════
// SEEK BAR — works for both audio and video
// ═══════════════════════════════════════════════════════════
function SeekBar({
  pct, accent, onSeek
}: { pct: number; accent: string; onSeek?: (pct: number) => void }) {
  const { duration } = usePlayerStore()
  const dragging = useRef(false)
  const barRef   = useRef<HTMLDivElement>(null)

  function calcPct(clientX: number): number {
    const r = barRef.current!.getBoundingClientRect()
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width))
  }

  function handleClick(e: React.MouseEvent) {
    const p = calcPct(e.clientX)
    if (onSeek) {
      onSeek(p)
    } else {
      const audio = getAudio()
      if (audio) audio.currentTime = p * (duration || 0)
    }
  }

  return (
    <div ref={barRef} onClick={handleClick} className="w-full group cursor-pointer py-2">
      <div className="w-full h-1.5 rounded-full relative transition-all group-hover:h-2.5"
        style={{ background: 'rgba(255,255,255,0.1)' }}>
        <div className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg,rgb(${accent}),rgba(${accent},0.65))` }} />
        <div className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white shadow-lg
          opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ left: `calc(${pct}% - 8px)`, boxShadow: `0 0 12px rgba(${accent},0.9)` }} />
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// VOLUME CONTROL — smooth, visually pleasing
// Drag across the entire bar. Shows animated fill + glowing thumb.
// ═══════════════════════════════════════════════════════════
function VolumeControl({ value, accentColor, onChange }: {
  value: number; accentColor: string; onChange: (v: number) => void
}) {
  const barRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const [showTip, setShowTip] = useState(false)

  function pctFromX(clientX: number): number {
    const el = barRef.current
    if (!el) return value
    const r = el.getBoundingClientRect()
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width))
  }

  function onDown(e: React.PointerEvent) {
    dragging.current = true
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    onChange(pctFromX(e.clientX))
    setShowTip(true)
  }
  function onMove(e: React.PointerEvent) {
    if (!dragging.current) return
    onChange(pctFromX(e.clientX))
  }
  function onUp() { dragging.current = false; setShowTip(false) }

  const pct = Math.round(value * 100)
  const muted = value <= 0.001

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => onChange(muted ? 0.8 : 0)}
        className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-90"
        style={{
          background: muted ? 'rgba(255,255,255,0.04)' : `rgba(${accentColor},0.14)`,
          border: `1px solid ${muted ? 'rgba(255,255,255,0.1)' : `rgba(${accentColor},0.3)`}`,
          color: muted ? 'rgba(255,255,255,0.35)' : `rgb(${accentColor})`,
        }}>
        {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
      </button>
      <div
        ref={barRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={() => setShowTip(false)}
        onPointerEnter={() => setShowTip(true)}
        className="flex-1 relative cursor-pointer group"
        style={{ padding: '10px 0', touchAction: 'none' }}>
        {/* track */}
        <div className="relative h-1.5 rounded-full transition-all group-hover:h-2.5"
          style={{ background: 'rgba(255,255,255,0.08)' }}>
          {/* fill */}
          <div className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${pct}%`,
              background: `linear-gradient(90deg, rgba(${accentColor},0.5), rgb(${accentColor}))`,
              boxShadow: `0 0 14px rgba(${accentColor},0.5)`,
              transition: dragging.current ? 'none' : 'width 0.15s ease-out',
            }} />
          {/* thumb */}
          <div
            className="absolute top-1/2 -translate-y-1/2 rounded-full bg-white transition-all"
            style={{
              left: `calc(${pct}% - 8px)`,
              width: 16, height: 16,
              boxShadow: `0 0 0 2px rgba(${accentColor},0.5), 0 2px 10px rgba(0,0,0,0.6), 0 0 18px rgba(${accentColor},0.6)`,
              transform: `translateY(-50%) scale(${showTip ? 1.15 : 1})`,
            }} />
          {/* tooltip */}
          {showTip && (
            <div className="absolute -top-7 left-0 pointer-events-none" style={{ left: `calc(${pct}% - 16px)` }}>
              <div className="px-2 py-0.5 rounded-md text-[10px] font-bold text-white"
                style={{
                  background: `rgba(${accentColor},0.9)`,
                  boxShadow: `0 2px 10px rgba(${accentColor},0.5)`,
                  minWidth: 32, textAlign: 'center',
                }}>{pct}</div>
            </div>
          )}
        </div>
      </div>
      <span className="text-[10px] font-bold flex-shrink-0 tabular-nums"
        style={{ color: muted ? 'rgba(255,255,255,0.25)' : `rgba(${accentColor},0.75)`, width: 28, textAlign: 'right' }}>
        {pct}
      </span>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// DOWNLOAD BUTTON (in expanded player)
// ═══════════════════════════════════════════════════════════
function DownloadSection({ accentColor }: { accentColor: string }) {
  const { currentSong } = usePlayerStore()
  const [dlAudio, setDlAudio] = useState<'idle' | 'loading' | 'done'>('idle')
  const [dlVideo, setDlVideo] = useState<'idle' | 'loading' | 'done'>('idle')

  async function handleAudioDl() {
    if (!currentSong || dlAudio !== 'idle') return
    setDlAudio('loading')
    try {
      const res  = await fetch(currentSong.supabase_url)
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `${currentSong.title.replace(/[^\w\s\-]/g, '').trim().slice(0, 60) || 'song'}.mp3`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setDlAudio('done')
      setTimeout(() => setDlAudio('idle'), 4000)
    } catch { setDlAudio('idle') }
  }

  async function handleVideoDl() {
    if (!currentSong || dlVideo !== 'idle') return
    setDlVideo('loading')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not signed in')
      const res = await fetch(
        `${API_BASE}/download/video/${currentSong.youtube_id}?quality=720&token=${encodeURIComponent(session.access_token)}`,
      )
      if (!res.ok) throw new Error(await res.text())
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `${currentSong.title.replace(/[^\w\s\-]/g, '').trim().slice(0, 60) || 'video'}.mp4`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setDlVideo('done')
      setTimeout(() => setDlVideo('idle'), 4000)
    } catch { setDlVideo('idle') }
  }

  function handleYouTubeOpen() {
    if (!currentSong) return
    window.open(`https://www.youtube.com/watch?v=${currentSong.youtube_id}`, '_blank', 'noopener')
  }

  return (
    <div className="flex gap-2 mb-4 flex-shrink-0">
      {/* Audio download */}
      <button onClick={handleAudioDl} disabled={dlAudio === 'loading'}
        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-xs font-bold transition-all hover:scale-105 active:scale-95 disabled:opacity-60"
        style={{
          background: dlAudio === 'done' ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.07)',
          border: `1px solid ${dlAudio === 'done' ? 'rgba(16,185,129,0.35)' : 'rgba(255,255,255,0.12)'}`,
          color: dlAudio === 'done' ? '#10b981' : 'rgba(255,255,255,0.65)',
        }}>
        {dlAudio === 'loading' ? <Loader2 size={13} className="animate-spin" />
          : dlAudio === 'done'   ? <Check size={13} />
          : <Download size={13} />}
        MP3
      </button>

      {/* Video download — streams MP4 from backend, never stored */}
      <button onClick={handleVideoDl} disabled={dlVideo === 'loading'}
        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-xs font-bold transition-all hover:scale-105 active:scale-95 disabled:opacity-60"
        style={{
          background: dlVideo === 'done' ? 'rgba(16,185,129,0.15)' : `rgba(${accentColor},0.12)`,
          border: `1px solid ${dlVideo === 'done' ? 'rgba(16,185,129,0.35)' : `rgba(${accentColor},0.28)`}`,
          color: dlVideo === 'done' ? '#10b981' : `rgba(${accentColor},0.95)`,
        }}
        title="Download 720p MP4 (streamed, not stored)">
        {dlVideo === 'loading' ? <Loader2 size={13} className="animate-spin" />
          : dlVideo === 'done'   ? <Check size={13} />
          : <MonitorPlay size={13} />}
        MP4
      </button>

      {/* Open on YouTube */}
      <button onClick={handleYouTubeOpen}
        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-xs font-bold transition-all hover:scale-105 active:scale-95"
        style={{
          background: 'rgba(255,50,50,0.10)',
          border: '1px solid rgba(255,50,50,0.22)',
          color: 'rgba(255,180,180,0.9)',
        }}
        title="Open on YouTube">
        <span>YouTube ↗</span>
      </button>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// EXPANDED PLAYER
// ═══════════════════════════════════════════════════════════
function ExpandedPlayer({ accentColor }: { accentColor: string }) {
  const {
    currentSong, isPlaying, buffering, currentTime, duration, volume,
    shuffle, repeat, queueSource, showVideo,
    setIsPlaying, setVolume, toggleShuffle, cycleRepeat, setExpanded, setShowVideo, next, prev,
  } = usePlayerStore()

  // ── Refs ─────────────────────────────────────────────
  const iframeRef           = useRef<HTMLIFrameElement>(null)
  const videoContainerRef   = useRef<HTMLDivElement>(null)
  const prevShowVideo       = useRef(false)   // ← FIX 4a: guard mount effect
  const videoStartAudioTime = useRef(0)
  const videoStartWall      = useRef(0)
  const latestVideoTime     = useRef(0)
  const [magicOn, setMagicOn] = useState(false)
  const [beatPulse, setBeatPulse] = useState(0)
  const [isVideoPlaying, setIsVideoPlaying] = useState(false)
  const [isVideoLoaded, setIsVideoLoaded]   = useState(false)  // ← FIX 11
  const [vidTime, setVidTime]               = useState(0)      // ← FIX 4d
  const [analyserReady, setAnalyserReady] = useState(!!_analyser)
  const magicBtnRef = useRef<HTMLButtonElement>(null)

  function onMagicBeat(strength: number) {
    // Drive button pulse via CSS animation
    const btn = magicBtnRef.current
    if (btn) {
      btn.classList.remove('magic-btn-beat')
      // Force reflow so animation re-triggers
      void btn.offsetWidth
      btn.classList.add('magic-btn-beat')
    }
    setBeatPulse(strength)
  }

  function ensureAnalyser() {
    if (!_analyser) {
      initAnalyser()
      setAnalyserReady(!!_analyser)
    } else if (_audioCtx?.state === 'suspended') {
      // Context auto-suspended by browser (mobile inactivity) — resume and restore,
      // but only unmute audio if we're NOT in video mode (video sets audio.muted=true on purpose).
      _audioCtx.resume().then(() => {
        const { showVideo, volume } = usePlayerStore.getState()
        if (_boost) _boost.gain.value = showVideo ? 0 : MAX_BOOST
        const audio = getAudio()
        if (audio && !showVideo) { audio.muted = false; audio.volume = volume }
      })
    }
  }

  // ── YT postMessage listener ─────────────────────────
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return
      try {
        const d = JSON.parse(typeof e.data === 'string' ? e.data : '{}')
        if (d.event === 'infoDelivery' && d.info?.currentTime != null) {
          latestVideoTime.current = d.info.currentTime
          setVidTime(d.info.currentTime)  // ← drive seek bar
        }
      } catch {}
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  // ── Reset when video iframe should reload ─────────────
  useEffect(() => { if (showVideo) setIsVideoLoaded(false) }, [showVideo, currentSong?.youtube_id])

  // ── VIDEO turns ON ────────────────────────────────────
  // FIX 4c: we pause audio immediately in the button handler, not here
  useEffect(() => {
    if (!showVideo) return
    prevShowVideo.current = true
    videoStartAudioTime.current = usePlayerStore.getState().currentTime
    videoStartWall.current = Date.now()
    latestVideoTime.current = videoStartAudioTime.current
    setIsVideoPlaying(false)
  }, [showVideo]) // eslint-disable-line

  // ── VIDEO turns OFF — resume audio ────────────────────
  // FIX 4a: only run when actually transitioning from showVideo=true → false
  useEffect(() => {
    if (showVideo) return                     // video just turned on — skip
    if (!prevShowVideo.current) return        // ← GUARD: skip on initial mount
    prevShowVideo.current = false
    const audio = getAudio()
    if (!audio) return
    const elapsed     = (Date.now() - videoStartWall.current) / 1000
    const wallEst     = videoStartAudioTime.current + elapsed
    const bestTime    = Math.abs(latestVideoTime.current - wallEst) < 30
      ? latestVideoTime.current
      : wallEst
    audio.currentTime = Math.max(0, Math.min(bestTime, audio.duration || 9999))
    audio.muted       = false
    audio.volume      = usePlayerStore.getState().volume
    if (_boost) _boost.gain.value = MAX_BOOST
    audio.play().catch(console.error)
    usePlayerStore.getState().setIsPlaying(true)
    setIsVideoPlaying(false)
    setVidTime(0)
  }, [showVideo]) // eslint-disable-line

  // ── While VIDEO is on, keep the audio element silently in sync with the
  // YouTube player so the analyser feeds visuals from the same moment in
  // the song the user is hearing. Resync every 4s (~1s of drift is fine).
  useEffect(() => {
    if (!showVideo) return
    const audio = getAudio()
    if (!audio) return
    const id = setInterval(() => {
      const drift = Math.abs(audio.currentTime - latestVideoTime.current)
      if (latestVideoTime.current > 0 && drift > 1.0) {
        audio.currentTime = latestVideoTime.current
      }
      if (audio.paused) audio.play().catch(() => {})
    }, 4000)
    return () => clearInterval(id)
  }, [showVideo])

  // ── Tab hidden while VIDEO ON → switch to audio ───────
  useEffect(() => {
    if (!showVideo) return
    const onVis = () => {
      if (!document.hidden) return
      const audio   = getAudio()
      const elapsed = (Date.now() - videoStartWall.current) / 1000
      const best    = latestVideoTime.current > videoStartAudioTime.current
        ? latestVideoTime.current
        : videoStartAudioTime.current + elapsed
      if (audio) {
        audio.currentTime = Math.max(0, best)
        audio.muted       = false
        audio.volume      = usePlayerStore.getState().volume
        if (_boost) _boost.gain.value = MAX_BOOST
        audio.play().catch(console.error)
        usePlayerStore.getState().setIsPlaying(true)
      }
      usePlayerStore.getState().setShowVideo(false)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [showVideo])

  // ── Subscribe to YT events after iframe loads ─────────
  function onIframeLoad() {
    setIsVideoLoaded(true)    // ← FIX 11: crossfade on load
    setIsVideoPlaying(true)
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'listening', id: 1 }), '*'
    )
  }

  // ── VIDEO toggle handler ──
  // When entering video mode we DON'T pause the audio element — instead we
  // silence the WebAudio graph by setting the gain to 0. The MediaElement →
  // analyser → gain → destination chain still feeds frequency data to the
  // analyser, so the magic visualizer keeps reacting to beats while the
  // YouTube iframe handles user-audible playback.
  function handleVideoToggle() {
    ensureAnalyser()
    const audio = getAudio()
    if (!showVideo) {
      // Turning video ON: silence audio output but keep the element playing
      // so the analyser still sees real-time frequency data for visuals.
      if (_boost) _boost.gain.value = 0
      if (audio) { audio.muted = true; audio.play().catch(() => {}) }
      usePlayerStore.getState().setIsPlaying(false)
    } else {
      // Turning video OFF: restore audible audio
      if (_boost) _boost.gain.value = MAX_BOOST
      if (audio) audio.muted = false
    }
    setShowVideo(!showVideo)
  }

  // ── Seek in VIDEO mode via postMessage — FIX 4d ───────
  function handleVideoSeek(pct: number) {
    const t = pct * (duration || 0)
    latestVideoTime.current = t
    setVidTime(t)
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func: 'seekTo', args: [t, true] }), '*'
    )
  }

  // ── Master play/pause ────────────────────────────────
  function handlePlayPause() {
    if (showVideo) {
      const cmd = isVideoPlaying ? 'pauseVideo' : 'playVideo'
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func: cmd, args: [] }), '*'
      )
      setIsVideoPlaying(!isVideoPlaying)
    } else {
      if (!buffering) setIsPlaying(!isPlaying)
    }
  }

  if (!currentSong) return null

  const pct     = duration ? (currentTime / duration) * 100 : 0
  const vidPct  = duration ? (vidTime     / duration) * 100 : 0
  const videoStart = Math.floor(videoStartAudioTime.current > 0
    ? videoStartAudioTime.current : currentTime)

  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  return (
    <>
      {/* ── Expanded player backdrop ──────────────────────── */}
      <div className="fixed inset-0 z-[150] flex flex-col overflow-hidden slide-up-full"
        style={{
          height: '100dvh',
          background: magicOn
            ? 'rgba(3,3,12,0.15)'    // near-transparent when magic — canvas shows through
            : `radial-gradient(ellipse at 50% -10%, rgba(${accentColor},0.45) 0%, transparent 55%),
               radial-gradient(ellipse at 85% 110%, rgba(${accentColor},0.18) 0%, transparent 45%),
               var(--bg-base)`,
        }}>

        {/* MAGIC CANVAS — sits behind UI in audio mode, floats above iframe
            (with screen blending) in video mode so visuals stay alive. */}
        {magicOn && <MagicCanvas accentColor={accentColor} onBeat={onMagicBeat} overVideo={showVideo} />}

        {/* Soft edge vignette when magic is on — lets bubbles breathe at edges */}
        {magicOn && (
          <div className="absolute inset-0 pointer-events-none" style={{
            zIndex: 3,
            background: 'radial-gradient(ellipse 85% 90% at 50% 52%, transparent 55%, rgba(0,0,0,0.28) 88%, rgba(0,0,0,0.55) 100%)',
            animation: 'spotlight-appear 0.6s ease forwards',
          }} />
        )}

        {/* Blurred album art bg (audio mode) */}
        {!magicOn && (
          <>
            <div className="absolute inset-0 opacity-20 bg-center bg-cover pointer-events-none"
              style={{ backgroundImage: `url(${currentSong.thumbnail_url})`, filter: 'blur(100px) saturate(2)', transform: 'scale(1.2)', zIndex: 1 }} />
            <div className="absolute inset-0 bg-black/30 pointer-events-none" style={{ zIndex: 2 }} />
          </>
        )}

        {/* Main content — fits to screen, no scroll
            Mobile: single column.  Desktop (lg+): two columns — album art on
            the left, title/seek/controls/volume/downloads on the right. */}
        <div className="relative flex flex-col h-full max-w-md sm:max-w-lg lg:max-w-none xl:max-w-7xl mx-auto w-full px-4 sm:px-5 lg:px-10 xl:px-16 no-scrollbar" style={{ zIndex: 10, overscrollBehavior: 'contain', overflow: 'hidden' }}>

          {/* Top bar */}
          <div className="flex items-center justify-between pt-4 pb-3 flex-shrink-0 lg:px-6">
            <button onClick={() => setExpanded(false)}
              className="w-10 h-10 rounded-2xl flex items-center justify-center transition-all hover:scale-110 active:scale-95"
              style={{ background: 'rgba(255,255,255,0.08)' }}>
              <ChevronDown size={22} />
            </button>
            <div className="text-center">
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Now Playing</p>
              {queueSource && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{queueSource}</p>}
            </div>
            <div className="flex items-center gap-2">
              {/* Magic button — beat-reactive when magic mode is on */}
              <button
                ref={magicBtnRef}
                onClick={() => { ensureAnalyser(); setMagicOn(v => !v) }}
                className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all hover:scale-110 active:scale-95 ${magicOn ? 'magic-btn-active' : 'magic-btn-idle'}`}
                title="Magic Mode">
                <Sparkles size={15}
                  style={{
                    color: magicOn ? 'white' : 'rgba(255,255,255,0.45)',
                    transform: magicOn ? `scale(${1 + beatPulse * 0.2})` : 'none',
                    transition: 'transform 0.15s ease-out',
                  }}
                  strokeWidth={magicOn ? 2 : 1.5}
                />
              </button>
              {/* Video toggle */}
              <button onClick={handleVideoToggle}
                className="flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-bold transition-all duration-300"
                style={showVideo ? {
                  background: `linear-gradient(135deg,rgb(${accentColor}),rgba(${accentColor},0.7))`,
                  color: 'white',
                  boxShadow: `0 4px 16px rgba(${accentColor},0.55)`,
                } : {
                  background: 'rgba(255,255,255,0.08)',
                  color: 'rgba(255,255,255,0.45)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}>
                <MonitorPlay size={13} />
                VIDEO
              </button>
            </div>
          </div>

          {/* Two-column shell on lg+ ; stacks on mobile */}
          <div className="flex-1 min-h-0 flex flex-col lg:flex-row lg:items-stretch lg:justify-center lg:gap-12 xl:gap-20">

          {/* Art / Video — flexible, never pushes content off-screen */}
          <div className="flex items-center justify-center flex-1 min-h-0 py-1 lg:flex-1 lg:py-0 lg:min-h-0">
            <div
              className={`relative overflow-hidden shadow-2xl ${showVideo
                ? 'w-[min(92vw,620px)] max-h-[min(52vw,36dvh)] rounded-[22px] lg:w-[min(56dvw,780px)] lg:max-h-[min(34dvw,62dvh)]'
                : 'w-[min(60vw,360px)] max-h-[min(60vw,38dvh)] rounded-[26px] lg:w-[min(40dvw,520px)] lg:max-h-[min(40dvw,68dvh)]'
              }`}
              style={{
                aspectRatio: showVideo ? '16/9' : '1/1',
                boxShadow: `0 30px 80px rgba(${accentColor},0.4), 0 8px 30px rgba(0,0,0,0.8)`,
                transition: 'all 0.45s cubic-bezier(0.16,1,0.3,1)',
              }}>

              {showVideo ? (
                // Show album art behind iframe while loading, then crossfade
                <div ref={videoContainerRef} className="relative w-full h-full">
                  {/* Album art loading overlay */}
                  {!isVideoLoaded && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center"
                      style={{ borderRadius: 18 }}>
                      <img src={currentSong.thumbnail_url} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ filter: 'blur(8px) brightness(0.5)', borderRadius: 18 }} />
                      <div className="relative z-10 flex flex-col items-center gap-2">
                        <div className="w-8 h-8 rounded-full border-2 border-white/50 border-t-transparent animate-spin" />
                        <span className="text-xs text-white/50">Loading video…</span>
                      </div>
                    </div>
                  )}
                  {/* iframe — FIX 4d: controls=0, our UI dominates */}
                  <iframe
                    key={`${currentSong.youtube_id}-${videoStart}`}
                    ref={iframeRef}
                    src={`https://www.youtube.com/embed/${currentSong.youtube_id}?autoplay=1&start=${videoStart}&rel=0&modestbranding=1&iv_load_policy=3&enablejsapi=1&controls=0&origin=${origin}`}
                    allow="autoplay; encrypted-media; fullscreen"
                    allowFullScreen
                    className="w-full h-full"
                    style={{
                      border: 'none',
                      opacity: isVideoLoaded ? 1 : 0,
                      transition: 'opacity 0.5s ease',
                    }}
                    onLoad={onIframeLoad}
                  />
                  {/* Fullscreen button — bottom-right corner of video */}
                  <button
                    onClick={() => videoContainerRef.current?.requestFullscreen?.()}
                    title="Fullscreen"
                    style={{
                      position: 'absolute', bottom: 10, right: 10, zIndex: 20,
                      background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.18)',
                      borderRadius: 8, padding: '6px 8px', cursor: 'pointer',
                      color: 'white', backdropFilter: 'blur(6px)',
                      opacity: isVideoLoaded ? 0.7 : 0,
                      transition: 'opacity 0.3s',
                      display: 'flex', alignItems: 'center',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '0.7')}
                  >
                    <Maximize2 size={14} />
                  </button>
                </div>
              ) : (
                // Album art (audio mode) — contain so YT 16:9 thumbs are never cropped
                <div className="relative w-full h-full overflow-hidden">
                  {/* Blurred background fills the letterbox gaps */}
                  <img src={currentSong.thumbnail_url} alt=""
                    style={{
                      position: 'absolute', inset: 0, width: '100%', height: '100%',
                      objectFit: 'cover',
                      filter: 'blur(18px) brightness(0.55) saturate(1.4)',
                      transform: 'scale(1.12)',
                    }} />
                  {/* Actual thumbnail — fully visible, no crop */}
                  <img src={currentSong.thumbnail_url} alt={currentSong.title}
                    style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%', objectFit: 'contain' }} />
                  {isPlaying && (
                    <div className="absolute inset-0 glow-pulse pointer-events-none" style={{ zIndex: 2,
                      background: `radial-gradient(circle at center, rgba(${accentColor},0.18), transparent 70%)` }} />
                  )}
                  {!isPlaying && !buffering && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/25" style={{ zIndex: 2 }}>
                      <div className="w-14 h-14 rounded-full flex items-center justify-center"
                        style={{ background: `rgba(${accentColor},0.9)` }}>
                        <Play size={24} fill="white" className="ml-1 text-white" />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN (lg+) / stack (mobile) */}
          <div className="flex flex-col flex-shrink-0 lg:flex-1 lg:max-w-xl lg:justify-center lg:py-6">

          {/* EQ bars — hidden on short viewports to keep player on one screen */}
          {!showVideo && !magicOn && (
            <div className="flex-shrink-0 hidden eq-compact:block">
              <EqCanvas isPlaying={isPlaying} accentColor={accentColor} />
            </div>
          )}

          {/* Song info */}
          <div className="text-center mb-2 flex-shrink-0 fade-in lg:text-left lg:mb-4" key={currentSong.id}>
            <h2 className="text-base font-bold leading-snug line-clamp-2 mb-0.5">{currentSong.title}</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{currentSong.movie_name || 'Unknown'}</p>
          </div>

          {/* Seek bar — edge-to-edge on desktop, FIX 4d shown in BOTH audio/video */}
          <div className="mb-2 flex-shrink-0 -mx-4 sm:-mx-5 lg:mx-0 px-4 sm:px-5 lg:px-2">
            <SeekBar
              pct={showVideo ? vidPct : pct}
              accent={accentColor}
              onSeek={showVideo ? handleVideoSeek : undefined}
            />
            <div className="flex justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
              <span>{formatDuration(Math.floor(showVideo ? vidTime : currentTime))}</span>
              <span>{formatDuration(Math.floor(duration))}</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between mb-4 flex-shrink-0 lg:px-6">
            <button onClick={toggleShuffle} className="p-2.5 rounded-full transition-all hover:scale-110 active:scale-95"
              style={{ color: shuffle ? `rgb(${accentColor})` : 'rgba(255,255,255,0.3)' }}>
              <Shuffle size={19} />
            </button>
            <button onClick={prev} className="p-2.5 transition-all hover:scale-110 active:scale-95"
              style={{ color: 'rgba(255,255,255,0.85)' }}>
              <SkipBack size={28} fill="currentColor" />
            </button>

            <button onClick={handlePlayPause}
              className="rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95"
              style={{
                width: 66, height: 66,
                background: `linear-gradient(135deg,rgb(${accentColor}),rgba(${accentColor},0.7))`,
                boxShadow: `0 10px 40px rgba(${accentColor},0.6)`,
              }}>
              {(showVideo ? false : buffering)
                ? <div className="w-6 h-6 rounded-full border-2 border-white border-t-transparent animate-spin" />
                : (showVideo ? !isVideoPlaying : !isPlaying)
                  ? <Play  size={28} fill="white" className="text-white ml-1" />
                  : <Pause size={28} fill="white" className="text-white" />
              }
            </button>

            <button onClick={next} className="p-2.5 transition-all hover:scale-110 active:scale-95"
              style={{ color: 'rgba(255,255,255,0.85)' }}>
              <SkipForward size={28} fill="currentColor" />
            </button>
            <button onClick={cycleRepeat} className="p-2.5 rounded-full transition-all hover:scale-110 active:scale-95"
              style={{ color: repeat !== 'none' ? `rgb(${accentColor})` : 'rgba(255,255,255,0.3)' }}>
              {repeat === 'one' ? <Repeat1 size={19} /> : <Repeat size={19} />}
            </button>
          </div>

          {/* Volume — smooth visual bar (FX5).
              In video mode the audio element is muted; we forward the value
              to the YouTube iframe so the slider still controls what the
              user hears. */}
          <div className="flex-shrink-0 mb-3 lg:px-6">
            <VolumeControl accentColor={accentColor} value={volume} onChange={(v) => {
              setVolume(v)
              if (showVideo) {
                iframeRef.current?.contentWindow?.postMessage(
                  JSON.stringify({ event: 'command', func: 'setVolume', args: [Math.round(v * 100)] }),
                  '*',
                )
              }
            }} />
          </div>

          {/* Download section */}
          <div className="lg:px-6 flex-shrink-0">
            <DownloadSection accentColor={accentColor} />
          </div>

          </div>{/* /right column */}
          </div>{/* /two-column shell */}
        </div>
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════
// MINI PLAYER BAR
// ═══════════════════════════════════════════════════════════
export function Player() {
  const {
    currentSong, isPlaying, buffering, currentTime, duration, volume, accentColor,
    expanded, setIsPlaying, setCurrentTime, setDuration, setVolume, setExpanded, next, prev,
  } = usePlayerStore()

  useEffect(() => {
    const audio = getAudio()
    if (!audio) return
    // Watchdog: if a song never starts progressing (stalled CDN fetch
    // while the tab is backgrounded), auto-skip so the queue keeps moving.
    let stallTimer: ReturnType<typeof setTimeout> | null = null
    const armStallTimer = () => {
      if (stallTimer) clearTimeout(stallTimer)
      stallTimer = setTimeout(() => {
        if (audio.readyState < 2 && !audio.paused) usePlayerStore.getState().next()
      }, 20000)
    }
    const clearStall = () => { if (stallTimer) { clearTimeout(stallTimer); stallTimer = null } }

    const onTime    = () => setCurrentTime(audio.currentTime)
    const onDur     = () => setDuration(audio.duration)
    const onEnded   = () => { clearStall(); usePlayerStore.getState().next() }
    const onPlaying = () => { clearStall(); setIsPlaying(true); usePlayerStore.getState().setBuffering(false) }
    const onWaiting = () => { armStallTimer(); usePlayerStore.getState().setBuffering(true) }
    const onCanPlay = () => { clearStall(); usePlayerStore.getState().setBuffering(false) }
    const onLoadStart = () => armStallTimer()
    const onError     = () => usePlayerStore.getState().next()
    audio.addEventListener('timeupdate',     onTime)
    audio.addEventListener('durationchange', onDur)
    audio.addEventListener('ended',          onEnded)
    audio.addEventListener('playing',        onPlaying)
    audio.addEventListener('waiting',        onWaiting)
    audio.addEventListener('canplay',        onCanPlay)
    audio.addEventListener('loadstart',      onLoadStart)
    audio.addEventListener('error',          onError)
    return () => {
      clearStall()
      audio.removeEventListener('timeupdate',     onTime)
      audio.removeEventListener('durationchange', onDur)
      audio.removeEventListener('ended',          onEnded)
      audio.removeEventListener('playing',        onPlaying)
      audio.removeEventListener('waiting',        onWaiting)
      audio.removeEventListener('canplay',        onCanPlay)
      audio.removeEventListener('loadstart',      onLoadStart)
      audio.removeEventListener('error',          onError)
    }
  }, [])

  useEffect(() => {
    if (currentSong) api.logPlay(currentSong.id).catch(() => {})
  }, [currentSong?.id])

  if (!currentSong) return null

  const pct = duration ? (currentTime / duration) * 100 : 0

  return (
    <>
      {expanded && <ExpandedPlayer accentColor={accentColor} />}

      {/* Mini player bar — sits above the mobile tab bar so tabs remain tappable */}
      <div className="fixed inset-x-0 z-40 slide-up"
        style={{
          bottom: 'var(--tab-bar-offset, 0px)',
          background: 'var(--player-bg)',
          backdropFilter: 'blur(40px) saturate(1.6)',
          WebkitBackdropFilter: 'blur(40px) saturate(1.6)',
          borderTop: `1px solid rgba(${accentColor},0.2)`,
          boxShadow: `0 -4px 40px rgba(${accentColor},0.1)`,
        }}>
        {/* Progress bar */}
        <div className="w-full h-[2px]" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <div className="h-full transition-[width] duration-300"
            style={{ width: `${pct}%`, background: `linear-gradient(90deg,rgb(${accentColor}),rgba(${accentColor},0.6))` }} />
        </div>

        <div className="flex items-center gap-3 px-4 py-2.5 max-w-screen-xl mx-auto"
          style={{ paddingBottom: 'max(10px, env(safe-area-inset-bottom, 0px))' }}>

          {/* Thumbnail */}
          <button onClick={() => setExpanded(true)}
            className="relative w-11 h-11 flex-shrink-0 rounded-xl overflow-hidden hover:scale-105 transition-transform"
            style={{ boxShadow: `0 4px 16px rgba(${accentColor},0.4)` }}>
            <img src={currentSong.thumbnail_url} alt="" className="w-full h-full object-cover" />
          </button>

          {/* Song info */}
          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpanded(true)}>
            <p className="text-sm font-semibold truncate" style={{ color: `rgb(${accentColor})` }}>
              {currentSong.title}
            </p>
            <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
              {currentSong.movie_name || 'Unknown'}
            </p>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1">
            <button onClick={prev} className="p-2 hidden sm:flex" style={{ color: 'var(--text-secondary)' }}>
              <SkipBack size={18} />
            </button>
            <button onClick={() => {
              if (!buffering) { initAnalyser(); resumeCtx(); setIsPlaying(!isPlaying) }
            }}
              className="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
              style={{
                background: `linear-gradient(135deg,rgb(${accentColor}),rgba(${accentColor},0.7))`,
                boxShadow: `0 4px 20px rgba(${accentColor},0.45)`,
              }}>
              {buffering
                ? <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                : isPlaying
                  ? <Pause size={17} fill="white" className="text-white" />
                  : <Play  size={17} fill="white" className="text-white ml-0.5" />
              }
            </button>
            <button onClick={next} className="p-2" style={{ color: 'var(--text-secondary)' }}>
              <SkipForward size={18} />
            </button>
          </div>

          {/* Volume (desktop) */}
          <div className="hidden lg:flex items-center gap-2">
            <button onClick={() => setVolume(volume > 0 ? 0 : 0.8)} style={{ color: 'var(--text-muted)' }}>
              {volume > 0 ? <Volume2 size={15} /> : <VolumeX size={15} />}
            </button>
            <input type="range" min={0} max={1} step={0.02} value={volume}
              onChange={e => setVolume(parseFloat(e.target.value))} className="w-20"
              style={{ background: `linear-gradient(to right,rgb(${accentColor}) 0%,rgb(${accentColor}) ${volume*100}%,rgba(255,255,255,0.12) ${volume*100}%,rgba(255,255,255,0.12) 100%)` }} />
          </div>
        </div>
      </div>
    </>
  )
}
