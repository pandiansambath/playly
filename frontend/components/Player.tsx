'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Play, Pause, SkipBack, SkipForward,
  Volume2, VolumeX, ChevronDown, Repeat, Repeat1, Shuffle,
  MonitorPlay, Maximize2, Sparkles, X,
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
    _analyser.fftSize = 256           // 128 frequency bins
    _analyser.smoothingTimeConstant = 0.82
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
// CANVAS EQUALIZER BARS — actual frequency data, no React state
// ═══════════════════════════════════════════════════════════
function EqCanvas({ isPlaying, accentColor }: { isPlaying: boolean; accentColor: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef    = useRef<number>()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const W = canvas.width  = 260
    const H = canvas.height = 56
    const BAR_COUNT = 22
    const analyser = _analyser

    function drawStatic() {
      ctx.clearRect(0, 0, W, H)
      const bw = W / BAR_COUNT - 2
      for (let i = 0; i < BAR_COUNT; i++) {
        const x = i * (W / BAR_COUNT)
        const h = 4 + Math.sin(i * 0.8) * 4
        ctx.fillStyle = `rgba(${accentColor},0.25)`
        ctx.beginPath()
        ctx.roundRect(x, H - h, bw, h, 2)
        ctx.fill()
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
        const bin = 1 + Math.floor(i * 55 / BAR_COUNT)
        const v   = data[bin] / 255
        const h   = Math.max(4, v * H)
        const x   = i * (W / BAR_COUNT)
        const grad = ctx.createLinearGradient(0, H, 0, H - h)
        grad.addColorStop(0, `rgba(${accentColor},0.9)`)
        grad.addColorStop(1, 'rgba(236,72,153,0.7)')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.roundRect(x, H - h, bw, h, 2)
        ctx.fill()
      }
    }
    draw()
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [isPlaying])  // eslint-disable-line

  return (
    <canvas ref={canvasRef}
      style={{ width: 260, height: 56, display: 'block', margin: '0 auto' }} />
  )
}

// ═══════════════════════════════════════════════════════════
// MAGIC VISUALIZER — Full-screen canvas with bouncing balls
// ═══════════════════════════════════════════════════════════
function MagicVisualizer({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef    = useRef<number>()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    canvas.width  = window.innerWidth
    canvas.height = window.innerHeight

    const analyser = _analyser
    const bufLen   = analyser?.frequencyBinCount ?? 64
    const dataArr  = analyser ? new Uint8Array(bufLen) : null

    // 45 colorful bouncing balls
    const balls = Array.from({ length: 45 }, (_, i) => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 2.5,
      vy: (Math.random() - 0.5) * 2.5,
      baseR: 10 + Math.random() * 28,
      hue: (i / 45) * 360,
      freqIdx: Math.floor(i * (bufLen - 1) / 45),
    }))

    function draw() {
      rafRef.current = requestAnimationFrame(draw)
      if (analyser && dataArr) analyser.getByteFrequencyData(dataArr)

      // Fade trail for motion blur effect
      ctx.fillStyle = 'rgba(7,7,15,0.13)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const bass = dataArr ? (dataArr[1] + dataArr[2] + dataArr[3]) / (3 * 255) : 0.3

      balls.forEach(b => {
        const freq = dataArr ? dataArr[b.freqIdx] / 255 : 0.3
        const energy = 0.6 + freq * 1.4
        const r = b.baseR * energy

        b.x += b.vx * energy * (1 + bass * 2)
        b.y += b.vy * energy * (1 + bass * 2)
        if (b.x < r)  { b.x = r;  b.vx =  Math.abs(b.vx) }
        if (b.x > canvas.width  - r) { b.x = canvas.width  - r; b.vx = -Math.abs(b.vx) }
        if (b.y < r)  { b.y = r;  b.vy =  Math.abs(b.vy) }
        if (b.y > canvas.height - r) { b.y = canvas.height - r; b.vy = -Math.abs(b.vy) }

        b.hue = (b.hue + 0.7 + freq * 2.5) % 360

        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r)
        g.addColorStop(0,   `hsla(${b.hue},100%,75%,${0.65 + freq * 0.35})`)
        g.addColorStop(0.5, `hsla(${b.hue + 40},100%,55%,${0.35 + freq * 0.25})`)
        g.addColorStop(1,   `hsla(${b.hue + 80},100%,40%,0)`)
        ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill()
      })
    }
    draw()

    const onResize = () => {
      canvas.width  = window.innerWidth
      canvas.height = window.innerHeight
    }
    window.addEventListener('resize', onResize)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <div className="fixed inset-0 z-[200]">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-end pb-12">
        <p className="text-white/40 text-sm font-medium tracking-wider">✨ MAGIC MODE</p>
      </div>
      <button onClick={onClose}
        className="absolute top-6 right-6 w-12 h-12 rounded-2xl flex items-center justify-center transition-all hover:scale-110"
        style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(20px)' }}>
        <X size={20} className="text-white" />
      </button>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// SEEK BAR
// ═══════════════════════════════════════════════════════════
function SeekBar({ pct, accent }: { pct: number; accent: string }) {
  const { duration } = usePlayerStore()
  function seek(e: React.MouseEvent) {
    const el = e.currentTarget as HTMLElement
    const r  = el.getBoundingClientRect()
    const t  = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (duration || 0)
    const audio = getAudio(); if (audio) audio.currentTime = t
  }
  return (
    <div onClick={seek} className="w-full group cursor-pointer py-2">
      <div className="w-full h-1.5 rounded-full relative transition-all group-hover:h-2.5"
        style={{ background: 'rgba(255,255,255,0.1)' }}>
        <div className="h-full rounded-full"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg,rgb(${accent}),rgba(${accent},0.65))` }} />
        <div className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white shadow-lg
          opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ left: `calc(${pct}% - 8px)`, boxShadow: `0 0 12px rgba(${accent},0.9)` }} />
      </div>
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

  // ── Video sync refs ──────────────────────────────────────
  const iframeRef            = useRef<HTMLIFrameElement>(null)
  const videoStartAudioTime  = useRef(0)   // audio position when video was enabled
  const videoStartWall       = useRef(0)   // wall clock when video enabled
  const latestVideoTime      = useRef(0)   // best estimate from YT postMessage
  const magicMode            = useState(false)
  const [magicOn, setMagicOn]= magicMode

  const [isVideoPlaying, setIsVideoPlaying] = useState(false)

  // ── Analyser (created on first play interaction) ─────────
  const [analyserReady, setAnalyserReady] = useState(!!_analyser)

  function ensureAnalyser() {
    if (!_analyser) {
      initAnalyser()
      resumeCtx()
      setAnalyserReady(!!_analyser)
    }
    resumeCtx()
  }

  // ── YT postMessage listener (accurate currentTime from iframe) ─
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return
      try {
        const d = JSON.parse(typeof e.data === 'string' ? e.data : '{}')
        // YT sends infoDelivery with currentTime when playing
        if (d.event === 'infoDelivery' && d.info?.currentTime != null) {
          latestVideoTime.current = d.info.currentTime
        }
      } catch {}
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  // Subscribe to YT events after iframe loads
  function onIframeLoad() {
    setIsVideoPlaying(true)
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'listening', id: 1 }), '*'
    )
  }

  // ── VIDEO turns ON ───────────────────────────────────────
  useEffect(() => {
    if (!showVideo) return
    const audio = getAudio()
    videoStartAudioTime.current = usePlayerStore.getState().currentTime
    videoStartWall.current = Date.now()
    latestVideoTime.current = videoStartAudioTime.current
    if (audio) { audio.pause() }
    usePlayerStore.getState().setIsPlaying(false)
    setIsVideoPlaying(false)  // will be set true on iframe load
  }, [showVideo])  // eslint-disable-line

  // ── VIDEO turns OFF — resume audio from where video paused ─
  useEffect(() => {
    if (showVideo) return
    const audio = getAudio()
    if (!audio) return
    // Best estimate: YT postMessage time (if received) OR wall-clock fallback
    const elapsed = (Date.now() - videoStartWall.current) / 1000
    const wallEstimate = videoStartAudioTime.current + elapsed
    // Use YT postMessage time if it differs significantly from wall estimate (more accurate)
    const bestTime = Math.abs(latestVideoTime.current - wallEstimate) < 30
      ? latestVideoTime.current   // YT confirmed time
      : wallEstimate              // fallback
    audio.currentTime = Math.max(0, bestTime)
    audio.volume = usePlayerStore.getState().volume
    audio.play().catch(console.error)
    usePlayerStore.getState().setIsPlaying(true)
    setIsVideoPlaying(false)
  }, [showVideo])  // eslint-disable-line

  // ── Tab hidden while VIDEO ON → switch to audio ──────────
  useEffect(() => {
    if (!showVideo) return
    const onVis = () => {
      if (!document.hidden) return
      const audio = getAudio()
      const elapsed = (Date.now() - videoStartWall.current) / 1000
      const bestTime = latestVideoTime.current > videoStartAudioTime.current
        ? latestVideoTime.current
        : videoStartAudioTime.current + elapsed
      if (audio) {
        audio.currentTime = Math.max(0, bestTime)
        audio.volume = usePlayerStore.getState().volume
        audio.play().catch(console.error)
        usePlayerStore.getState().setIsPlaying(true)
      }
      usePlayerStore.getState().setShowVideo(false)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [showVideo])

  // ── Master play/pause (controls both audio and video) ────
  function handlePlayPause() {
    ensureAnalyser()
    if (showVideo) {
      // Control the YouTube iframe via postMessage (requires enablejsapi=1 in URL)
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

  const pct = duration ? (currentTime / duration) * 100 : 0
  const videoStart = Math.floor(videoStartAudioTime.current > 0
    ? videoStartAudioTime.current
    : currentTime)

  return (
    <>
      {magicOn && <MagicVisualizer onClose={() => setMagicOn(false)} />}

      <div className="fixed inset-0 z-[150] flex flex-col overflow-hidden slide-up-full"
        style={{
          background: `
            radial-gradient(ellipse at 50% -10%, rgba(${accentColor},0.45) 0%, transparent 55%),
            radial-gradient(ellipse at 85% 110%, rgba(${accentColor},0.18) 0%, transparent 45%),
            var(--bg-base)
          `
        }}>

        {/* Blurred album art background */}
        <div className="absolute inset-0 opacity-20 bg-center bg-cover pointer-events-none"
          style={{ backgroundImage: `url(${currentSong.thumbnail_url})`, filter: 'blur(100px) saturate(2)', transform: 'scale(1.2)' }} />
        <div className="absolute inset-0 bg-black/30 pointer-events-none" />

        <div className="relative z-10 flex flex-col h-full max-w-md mx-auto w-full px-6 overflow-y-auto">

          {/* Top bar */}
          <div className="flex items-center justify-between py-5 flex-shrink-0">
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
              {/* Magic Button */}
              <button onClick={() => { ensureAnalyser(); setMagicOn(true) }}
                className="w-10 h-10 rounded-2xl flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                style={{ background: magicOn ? `rgb(${accentColor})` : 'rgba(255,255,255,0.08)' }}
                title="Magic Mode">
                <Sparkles size={16} style={{ color: magicOn ? 'white' : 'rgba(255,255,255,0.5)' }} />
              </button>
              {/* Video toggle */}
              <button onClick={() => setShowVideo(!showVideo)}
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
                {showVideo ? 'VIDEO' : 'VIDEO'}
              </button>
            </div>
          </div>

          {/* Art / Video */}
          <div className="flex items-center justify-center py-3 flex-shrink-0">
            <div className="relative overflow-hidden shadow-2xl"
              style={{
                width: 'min(82vw, 320px)',
                aspectRatio: showVideo ? '16/9' : '1/1',
                borderRadius: showVideo ? '20px' : '24px',
                boxShadow: `0 40px 90px rgba(${accentColor},0.4), 0 8px 30px rgba(0,0,0,0.8)`,
                transition: 'all 0.45s cubic-bezier(0.16,1,0.3,1)',
              }}>

              {showVideo ? (
                /* iframe autoplay=1 + enablejsapi=1 for postMessage control */
                <iframe
                  key={`${currentSong.youtube_id}-${videoStart}`}
                  ref={iframeRef}
                  src={`https://www.youtube.com/embed/${currentSong.youtube_id}?autoplay=1&start=${videoStart}&rel=0&modestbranding=1&iv_load_policy=3&enablejsapi=1&origin=${typeof window !== 'undefined' ? window.location.origin : ''}`}
                  allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full"
                  style={{ border: 'none' }}
                  onLoad={onIframeLoad}
                />
              ) : (
                /* Album art — rectangle, no spinning */
                <div className="relative w-full h-full">
                  <img
                    src={currentSong.thumbnail_url}
                    alt={currentSong.title}
                    className="w-full h-full object-cover"
                  />
                  {/* Pulsing glow overlay when playing */}
                  {isPlaying && (
                    <div className="absolute inset-0 glow-pulse pointer-events-none"
                      style={{ background: `radial-gradient(circle at center, rgba(${accentColor},0.2), transparent 70%)` }} />
                  )}
                  {/* Play indicator overlay */}
                  {!isPlaying && !buffering && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <div className="w-16 h-16 rounded-full flex items-center justify-center"
                        style={{ background: `rgba(${accentColor},0.9)` }}>
                        <Play size={28} fill="white" className="ml-1 text-white" />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Equalizer bars (audio mode only) */}
          {!showVideo && (
            <div className="flex-shrink-0 my-1">
              <EqCanvas isPlaying={isPlaying} accentColor={accentColor} />
            </div>
          )}

          {/* Song info */}
          <div className="text-center mb-4 flex-shrink-0 fade-in" key={currentSong.id}>
            <h2 className="text-lg font-bold leading-snug line-clamp-2 mb-1">{currentSong.title}</h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{currentSong.movie_name || 'Unknown'}</p>
          </div>

          {/* Seek bar */}
          {!showVideo && (
            <div className="mb-2 flex-shrink-0">
              <SeekBar pct={pct} accent={accentColor} />
              <div className="flex justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                <span>{formatDuration(Math.floor(currentTime))}</span>
                <span>{formatDuration(Math.floor(duration))}</span>
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center justify-between mb-5 flex-shrink-0">
            <button onClick={toggleShuffle} className="p-3 rounded-full transition-all hover:scale-110 active:scale-95"
              style={{ color: shuffle ? `rgb(${accentColor})` : 'rgba(255,255,255,0.3)' }}>
              <Shuffle size={20} />
            </button>
            <button onClick={prev} className="p-3 transition-all hover:scale-110 active:scale-95"
              style={{ color: 'rgba(255,255,255,0.85)' }}>
              <SkipBack size={30} fill="currentColor" />
            </button>

            {/* Master play/pause — controls BOTH audio and video */}
            <button onClick={handlePlayPause}
              className="rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95"
              style={{
                width: 70, height: 70,
                background: `linear-gradient(135deg,rgb(${accentColor}),rgba(${accentColor},0.7))`,
                boxShadow: `0 10px 40px rgba(${accentColor},0.6)`,
              }}>
              {(showVideo ? false : buffering)
                ? <div className="w-7 h-7 rounded-full border-2 border-white border-t-transparent animate-spin" />
                : (showVideo ? !isVideoPlaying : !isPlaying)
                  ? <Play  size={30} fill="white" className="text-white ml-1" />
                  : <Pause size={30} fill="white" className="text-white" />
              }
            </button>

            <button onClick={next} className="p-3 transition-all hover:scale-110 active:scale-95"
              style={{ color: 'rgba(255,255,255,0.85)' }}>
              <SkipForward size={30} fill="currentColor" />
            </button>
            <button onClick={cycleRepeat} className="p-3 rounded-full transition-all hover:scale-110 active:scale-95"
              style={{ color: repeat !== 'none' ? `rgb(${accentColor})` : 'rgba(255,255,255,0.3)' }}>
              {repeat === 'one' ? <Repeat1 size={20} /> : <Repeat size={20} />}
            </button>
          </div>

          {/* Volume */}
          <div className="flex items-center gap-3 mb-10 flex-shrink-0">
            <button onClick={() => setVolume(volume > 0 ? 0 : 0.8)} style={{ color: 'rgba(255,255,255,0.35)' }}>
              {volume > 0 ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
            <input type="range" min={0} max={1} step={0.02} value={volume}
              onChange={e => setVolume(parseFloat(e.target.value))}
              className="flex-1"
              style={{ background: `linear-gradient(to right,rgb(${accentColor}) 0%,rgb(${accentColor}) ${volume*100}%,rgba(255,255,255,0.12) ${volume*100}%,rgba(255,255,255,0.12) 100%)` }} />
            <Volume2 size={16} style={{ color: 'rgba(255,255,255,0.35)' }} />
          </div>
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
    const onPlaying = () => { setIsPlaying(true); usePlayerStore.getState().setBuffering(false) }
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
        {/* Thin progress line */}
        <div className="w-full h-[2px]" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <div className="h-full transition-[width] duration-300"
            style={{ width: `${pct}%`, background: `linear-gradient(90deg,rgb(${accentColor}),rgba(${accentColor},0.6))` }} />
        </div>

        <div className="flex items-center gap-3 px-4 py-2.5 max-w-screen-xl mx-auto"
          // On mobile, extra padding for bottom tab bar
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
            <button onClick={() => { if (!buffering) { initAnalyser(); resumeCtx(); setIsPlaying(!isPlaying) } }}
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
