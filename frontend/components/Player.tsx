'use client'
import { useEffect, useRef, useState } from 'react'
import {
  Play, Pause, SkipBack, SkipForward,
  Volume2, VolumeX, ChevronDown, Repeat, Repeat1, Shuffle,
  MonitorPlay, Sparkles, Download, Loader2, Check, X,
} from 'lucide-react'
import { usePlayerStore, getAudio } from '@/store/playerStore'
import { formatDuration } from '@/lib/supabase'
import { api } from '@/lib/api'

// ═══════════════════════════════════════════════════════════
// WEB AUDIO ANALYSER — Module-level singleton
// createMediaElementSource can only be called once per element
// ═══════════════════════════════════════════════════════════
let _audioCtx: AudioContext | null = null
let _analyser: AnalyserNode | null = null
let _analyserReady = false

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
    const src = _audioCtx.createMediaElementSource(audio)
    src.connect(_analyser)
    _analyser.connect(_audioCtx.destination)
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
// MAGIC VISUALIZER CANVAS — inside player, behind content
// Beat-reactive multi-layer: nebula particles + radial bars + ripples
// ═══════════════════════════════════════════════════════════
function MagicCanvas({ accentColor }: { accentColor: string }) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const rafRef     = useRef<number>(0)
  const prevEnergy = useRef(0)
  const beatTime   = useRef(0)
  const hueShift   = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    const el = canvas  // capture non-null ref for closure
    function resize() {
      el.width  = el.offsetWidth
      el.height = el.offsetHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const analyser = _analyser
    const bufLen   = analyser?.frequencyBinCount ?? 128
    const dataArr  = analyser ? new Uint8Array(bufLen) : null

    // Particles — use 'el' (non-null captured ref) not 'canvas'
    const particles = Array.from({ length: 70 }, (_, i) => ({
      x:  Math.random() * el.width,
      y:  Math.random() * el.height,
      vx: (Math.random() - 0.5) * 1.2,
      vy: (Math.random() - 0.5) * 1.2,
      r:  4 + Math.random() * 18,
      hue: (i / 70) * 360,
      freqI: Math.floor(i * (bufLen - 1) / 70),
      life: Math.random(),
    }))

    function draw() {
      rafRef.current = requestAnimationFrame(draw)
      const W = el.width
      const H = el.height
      if (!W || !H) return

      if (analyser && dataArr) analyser.getByteFrequencyData(dataArr)

      // Beat detection — LOW thresholds so even light beats trigger
      const bassSum = dataArr ? (dataArr[1] + dataArr[2] + dataArr[3] + dataArr[4] + dataArr[5]) / (5 * 255) : 0.15
      const midSum  = dataArr ? (dataArr[8] + dataArr[12] + dataArr[18]) / (3 * 255) : 0.10
      const energy  = bassSum * 0.7 + midSum * 0.3
      const now     = performance.now()
      // Trigger on ANY energy spike >= 12% above running average, min 120ms apart
      const isBeat  = energy > prevEnergy.current * 1.12 && energy > 0.06 && now - beatTime.current > 120
      if (isBeat) beatTime.current = now
      prevEnergy.current = energy * 0.65 + prevEnergy.current * 0.35
      hueShift.current   = (hueShift.current + 0.6 + energy * 3) % 360

      // Fade trail — faster fade on beats for crisp flash, slower otherwise
      ctx.fillStyle = `rgba(5,5,18,${isBeat ? 0.35 : 0.14 + energy * 0.1})`
      ctx.fillRect(0, 0, W, H)

      const cx = W / 2
      const cy = H / 2

      // Layer 1: Circular frequency bars — longer on beat
      if (dataArr) {
        const BARS   = 72
        const beatMult = isBeat ? 1.8 : 1
        const baseR  = Math.min(cx, cy) * 0.28
        const maxLen = Math.min(cx, cy) * 0.55 * beatMult
        for (let i = 0; i < BARS; i++) {
          const bin   = Math.floor(i * (bufLen * 0.65) / BARS) + 1
          const v     = dataArr[bin] / 255
          const angle = (i / BARS) * Math.PI * 2 - Math.PI / 2
          const len   = (6 + v * maxLen) * (1 + energy * 0.4)
          const hue   = (hueShift.current + i * 5) % 360
          const x1 = cx + Math.cos(angle) * baseR
          const y1 = cy + Math.sin(angle) * baseR
          const x2 = cx + Math.cos(angle) * (baseR + len)
          const y2 = cy + Math.sin(angle) * (baseR + len)
          ctx.beginPath()
          ctx.moveTo(x1, y1)
          ctx.lineTo(x2, y2)
          ctx.strokeStyle = `hsla(${hue},100%,${60 + v * 30}%,${0.25 + v * 0.75})`
          ctx.lineWidth   = isBeat ? 3 + v * 4 : 1.5 + v * 2.5
          ctx.lineCap     = 'round'
          ctx.stroke()
        }
      }

      // Layer 2: Center glow — breathes with every energy change, PULSES on beat
      const glowMult = isBeat ? 2.2 : 1
      const glowR = Math.min(cx, cy) * (0.10 + bassSum * 0.25 * glowMult)
      const gGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR)
      gGlow.addColorStop(0,   `hsla(${hueShift.current},100%,90%,${isBeat ? 0.95 : 0.5 + bassSum * 0.4})`)
      gGlow.addColorStop(0.4, `hsla(${(hueShift.current + 40) % 360},100%,65%,${0.3 + bassSum * 0.4})`)
      gGlow.addColorStop(1,   'transparent')
      ctx.beginPath(); ctx.arc(cx, cy, glowR, 0, Math.PI * 2)
      ctx.fillStyle = gGlow; ctx.fill()

      // Beat shockwave ring — expands outward
      if (isBeat) {
        for (let ring = 0; ring < 2; ring++) {
          const beatR = Math.min(cx, cy) * (0.38 + ring * 0.22)
          const gBeat = ctx.createRadialGradient(cx, cy, beatR * 0.75, cx, cy, beatR)
          gBeat.addColorStop(0, 'transparent')
          gBeat.addColorStop(0.5, `hsla(${(hueShift.current + ring * 90) % 360},100%,85%,${0.7 - ring * 0.2})`)
          gBeat.addColorStop(1, 'transparent')
          ctx.beginPath(); ctx.arc(cx, cy, beatR, 0, Math.PI * 2)
          ctx.fillStyle = gBeat; ctx.fill()
        }
      }

      // Layer 3: Floating particles — more speed, bigger on every beat
      particles.forEach(p => {
        const freq  = dataArr ? dataArr[p.freqI] / 255 : 0.2
        const speed = (1.2 + energy * 3.5) * (isBeat ? 2 : 1)
        p.x += p.vx * speed
        p.y += p.vy * speed
        p.hue  = (p.hue + 1 + freq * 3) % 360
        p.life = (p.life + 0.003 + energy * 0.004) % 1

        if (p.x < -20) p.x = W + 20; if (p.x > W + 20) p.x = -20
        if (p.y < -20) p.y = H + 20; if (p.y > H + 20) p.y = -20

        const r    = p.r * (0.6 + freq * 1.6) * (isBeat ? 1.8 : 1)
        const life = Math.sin(p.life * Math.PI)
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r)
        g.addColorStop(0,   `hsla(${p.hue},100%,82%,${Math.min(0.92, (0.5 + freq * 0.5) * life)})`)
        g.addColorStop(0.55,`hsla(${p.hue + 40},90%,60%,${(0.2 + freq * 0.3) * life})`)
        g.addColorStop(1,   'transparent')
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
        ctx.fillStyle = g; ctx.fill()
      })

      // Layer 4: Aurora wave ribbons — amplitude reacts to energy AND beats
      const wavePoints = 10
      const amp = H * 0.09 * (1 + energy * 3.5) * (isBeat ? 1.6 : 1)
      for (let wave = 0; wave < 3; wave++) {
        const hue = (hueShift.current + wave * 70) % 360
        const yBase = wave === 0 ? H * 0.08 : wave === 1 ? H * 0.92 : H * 0.5
        ctx.beginPath()
        for (let i = 0; i <= wavePoints; i++) {
          const x = (i / wavePoints) * W
          const freq = dataArr ? dataArr[Math.floor(i * bufLen * 0.55 / wavePoints)] / 255 : 0.2
          const y = yBase + Math.sin(i * 0.9 + now * 0.0015 * (wave + 1)) * amp * (1 + freq * 1.2)
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        }
        ctx.strokeStyle = `hsla(${hue},100%,70%,${isBeat ? 0.6 : 0.18 + energy * 0.35})`
        ctx.lineWidth = isBeat ? 4 + wave : 2 + wave
        ctx.stroke()
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
      style={{ zIndex: 2 }}
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
// DOWNLOAD BUTTON (in expanded player)
// ═══════════════════════════════════════════════════════════
function DownloadSection({ accentColor }: { accentColor: string }) {
  const { currentSong } = usePlayerStore()
  const [dlAudio, setDlAudio] = useState<'idle' | 'loading' | 'done'>('idle')

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

  function handleVideoDl() {
    if (!currentSong) return
    // Open YouTube — browser can save via right-click or extension
    window.open(`https://www.youtube.com/watch?v=${currentSong.youtube_id}`, '_blank', 'noopener')
  }

  return (
    <div className="flex gap-2 mb-4 flex-shrink-0">
      {/* Audio download */}
      <button onClick={handleAudioDl} disabled={dlAudio === 'loading'}
        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl text-xs font-bold transition-all hover:scale-105 active:scale-95 disabled:opacity-60"
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

      {/* Open on YouTube */}
      <button onClick={handleVideoDl}
        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl text-xs font-bold transition-all hover:scale-105 active:scale-95"
        style={{
          background: 'rgba(255,50,50,0.10)',
          border: '1px solid rgba(255,50,50,0.22)',
          color: 'rgba(255,180,180,0.9)',
        }}
        title="Opens YouTube — use your browser or an extension to save">
        <MonitorPlay size={13} />
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
  const prevShowVideo       = useRef(false)   // ← FIX 4a: guard mount effect
  const videoStartAudioTime = useRef(0)
  const videoStartWall      = useRef(0)
  const latestVideoTime     = useRef(0)
  const [magicOn, setMagicOn] = useState(false)
  const [isVideoPlaying, setIsVideoPlaying] = useState(false)
  const [isVideoLoaded, setIsVideoLoaded]   = useState(false)  // ← FIX 11
  const [vidTime, setVidTime]               = useState(0)      // ← FIX 4d
  const [analyserReady, setAnalyserReady] = useState(!!_analyser)

  function ensureAnalyser() {
    if (!_analyser) { initAnalyser(); resumeCtx(); setAnalyserReady(!!_analyser) }
    resumeCtx()
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
    audio.volume      = usePlayerStore.getState().volume
    audio.play().catch(console.error)
    usePlayerStore.getState().setIsPlaying(true)
    setIsVideoPlaying(false)
    setVidTime(0)
  }, [showVideo]) // eslint-disable-line

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
        audio.volume      = usePlayerStore.getState().volume
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

  // ── VIDEO toggle handler — FIX 4c: mute audio BEFORE state change ──
  function handleVideoToggle() {
    if (!showVideo) {
      // Turning video ON: kill audio immediately so no dual audio
      const audio = getAudio()
      if (audio) { audio.volume = 0; audio.pause() }
      usePlayerStore.getState().setIsPlaying(false)
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
    ensureAnalyser()
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
          background: magicOn
            ? 'rgba(3,3,12,0.15)'    // near-transparent when magic — canvas shows through
            : `radial-gradient(ellipse at 50% -10%, rgba(${accentColor},0.45) 0%, transparent 55%),
               radial-gradient(ellipse at 85% 110%, rgba(${accentColor},0.18) 0%, transparent 45%),
               var(--bg-base)`,
        }}>

        {/* MAGIC CANVAS — sits behind everything inside player */}
        {magicOn && <MagicCanvas accentColor={accentColor} />}

        {/* Spotlight vignette when magic is on */}
        {magicOn && (
          <div className="absolute inset-0 pointer-events-none" style={{
            zIndex: 3,
            background: 'radial-gradient(ellipse 60% 65% at 50% 52%, transparent 30%, rgba(0,0,0,0.72) 72%, rgba(0,0,0,0.92) 100%)',
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

        {/* Main content */}
        <div className="relative flex flex-col h-full max-w-md mx-auto w-full px-5 overflow-y-auto" style={{ zIndex: 10 }}>

          {/* Top bar */}
          <div className="flex items-center justify-between pt-4 pb-3 flex-shrink-0">
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
              {/* Magic button */}
              <button
                onClick={() => { ensureAnalyser(); setMagicOn(v => !v) }}
                className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all hover:scale-110 active:scale-95 ${magicOn ? 'magic-btn-active' : ''}`}
                style={magicOn ? {} : { background: 'rgba(255,255,255,0.08)' }}
                title="Magic Mode">
                <Sparkles size={16}
                  style={{ color: magicOn ? 'white' : 'rgba(255,255,255,0.5)' }}
                  className={magicOn ? 'animate-spin' : ''}
                  strokeWidth={magicOn ? 2.5 : 1.5}
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

          {/* Art / Video */}
          <div className="flex items-center justify-center py-2 flex-shrink-0">
            <div className="relative overflow-hidden shadow-2xl"
              style={{
                width: showVideo ? 'min(90vw, 380px)' : 'min(70vw, 280px)',
                aspectRatio: showVideo ? '16/9' : '1/1',
                maxHeight: showVideo ? '45vw' : '280px',
                borderRadius: showVideo ? '18px' : '22px',
                boxShadow: `0 30px 80px rgba(${accentColor},0.4), 0 8px 30px rgba(0,0,0,0.8)`,
                transition: 'all 0.45s cubic-bezier(0.16,1,0.3,1)',
              }}>

              {showVideo ? (
                // FIX 11: Show album art behind iframe while loading, then crossfade
                <div className="relative w-full h-full">
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

          {/* EQ bars (audio mode only) */}
          {!showVideo && !magicOn && (
            <div className="flex-shrink-0 my-1">
              <EqCanvas isPlaying={isPlaying} accentColor={accentColor} />
            </div>
          )}

          {/* Song info */}
          <div className="text-center mb-3 flex-shrink-0 fade-in" key={currentSong.id}>
            <h2 className="text-base font-bold leading-snug line-clamp-2 mb-0.5">{currentSong.title}</h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{currentSong.movie_name || 'Unknown'}</p>
          </div>

          {/* Seek bar — FIX 4d: shown in BOTH audio and video modes */}
          <div className="mb-2 flex-shrink-0">
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
          <div className="flex items-center justify-between mb-4 flex-shrink-0">
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

          {/* Volume — label says "App Volume" for clarity (issue 6) */}
          <div className="flex items-center gap-3 mb-3 flex-shrink-0">
            <button onClick={() => setVolume(volume > 0 ? 0 : 0.8)} style={{ color: 'rgba(255,255,255,0.35)' }}>
              {volume > 0 ? <Volume2 size={15} /> : <VolumeX size={15} />}
            </button>
            <input type="range" min={0} max={1} step={0.02} value={volume}
              onChange={e => setVolume(parseFloat(e.target.value))}
              className="flex-1"
              style={{ background: `linear-gradient(to right,rgb(${accentColor}) 0%,rgb(${accentColor}) ${volume*100}%,rgba(255,255,255,0.12) ${volume*100}%,rgba(255,255,255,0.12) 100%)` }} />
            <Volume2 size={15} style={{ color: 'rgba(255,255,255,0.35)' }} />
          </div>
          <p className="text-center text-[9px] mb-3 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.15)' }}>App Volume</p>

          {/* Download section */}
          <DownloadSection accentColor={accentColor} />
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
    const onTime    = () => setCurrentTime(audio.currentTime)
    const onDur     = () => setDuration(audio.duration)
    const onEnded   = () => usePlayerStore.getState().next()
    const onPlaying = () => { setIsPlaying(true);  usePlayerStore.getState().setBuffering(false) }
    const onWaiting = () => usePlayerStore.getState().setBuffering(true)
    const onCanPlay = () => usePlayerStore.getState().setBuffering(false)
    audio.addEventListener('timeupdate',     onTime)
    audio.addEventListener('durationchange', onDur)
    audio.addEventListener('ended',          onEnded)
    audio.addEventListener('playing',        onPlaying)
    audio.addEventListener('waiting',        onWaiting)
    audio.addEventListener('canplay',        onCanPlay)
    return () => {
      audio.removeEventListener('timeupdate',     onTime)
      audio.removeEventListener('durationchange', onDur)
      audio.removeEventListener('ended',          onEnded)
      audio.removeEventListener('playing',        onPlaying)
      audio.removeEventListener('waiting',        onWaiting)
      audio.removeEventListener('canplay',        onCanPlay)
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

      {/* Mini player bar */}
      <div className="fixed inset-x-0 z-40 slide-up"
        style={{
          bottom: 0,
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
