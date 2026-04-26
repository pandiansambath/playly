'use client'
import { useState, useEffect } from 'react'
import { Clock, Download, Check, Play, Loader2 } from 'lucide-react'
import { formatDuration } from '@/lib/supabase'

export interface YTResult {
  youtube_id: string
  title: string
  channel: string
  thumbnail_url: string
  duration_seconds: number
}

interface Props {
  result: YTResult
  onDownload: (r: YTResult) => void
  onPlay?: (r: YTResult) => void
  isDownloading: boolean
  isDone?: boolean
  /** Real download progress 0-100 from the V2 flow. If undefined, falls back
   *  to a simulated stepper so the bar still feels alive. */
  progress?: number
}

function useFakeProgress(active: boolean, done: boolean) {
  const [pct, setPct] = useState(0)
  useEffect(() => {
    if (!active && !done) { setPct(0); return }
    if (done) { setPct(100); return }
    setPct(0)
    const steps = [
      { target: 25, delay: 200 },
      { target: 50, delay: 800 },
      { target: 70, delay: 1800 },
      { target: 85, delay: 3000 },
      { target: 90, delay: 5000 },
    ]
    const timers: ReturnType<typeof setTimeout>[] = []
    steps.forEach(s => { timers.push(setTimeout(() => setPct(s.target), s.delay)) })
    return () => timers.forEach(clearTimeout)
  }, [active, done])
  return pct
}

export function SearchResult({ result, onDownload, onPlay, isDownloading, isDone, progress }: Props) {
  const fake = useFakeProgress(isDownloading, !!isDone)
  const pct = progress != null ? progress : fake

  return (
    <div
      className={`group relative flex items-center gap-3 px-4 py-3 transition-all duration-150 cursor-pointer`}
      style={{ background: isDone ? 'rgba(var(--accent-rgb),0.04)' : 'transparent' }}
      onClick={() => !isDownloading && !isDone && onDownload(result)}
      onMouseEnter={e => { if (!isDone) (e.currentTarget as HTMLElement).style.background = 'var(--bg-raised)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isDone ? 'rgba(var(--accent-rgb),0.04)' : 'transparent' }}
    >
      {/* Thumbnail */}
      <div className="relative w-12 h-12 flex-shrink-0 rounded-xl overflow-hidden">
        <img src={result.thumbnail_url} alt="" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" />
        {/* Play overlay */}
        {!isDownloading && !isDone && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
            <Download size={16} className="text-white" />
          </div>
        )}
        {isDone && (
          <div className="absolute inset-0 flex items-center justify-center"
            style={{ background: 'rgba(var(--accent-rgb),0.75)' }}>
            <Check size={16} className="text-white" strokeWidth={3} />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate leading-tight"
          style={{ color: isDone ? 'var(--accent)' : 'var(--text-primary)' }}>
          {result.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span className="truncate max-w-[140px]">{result.channel}</span>
          <span>·</span>
          <span className="flex items-center gap-1 flex-shrink-0">
            <Clock size={10} />
            {formatDuration(result.duration_seconds)}
          </span>
        </div>
        {isDownloading && (
          <div className="flex items-center gap-1.5 mt-1">
            <div className="flex-1 h-1 rounded-full" style={{ background: 'var(--bg-elevated)' }}>
              <div className="h-full rounded-full transition-all duration-500 ease-out"
                style={{ width: `${pct}%`, background: 'linear-gradient(90deg,var(--accent),var(--accent-alt))' }} />
            </div>
            <span className="text-[10px] font-medium flex-shrink-0" style={{ color: 'var(--accent)' }}>{Math.round(pct)}%</span>
          </div>
        )}
        {isDone && <p className="text-[10px] font-semibold mt-0.5" style={{ color: 'var(--accent)' }}>✓ Added to library</p>}
      </div>

      {/* Action */}
      <div className="flex-shrink-0">
        {isDownloading ? (
          <div className="w-8 h-8 flex items-center justify-center rounded-xl"
            style={{ background: 'rgba(var(--accent-rgb),0.1)' }}>
            <Loader2 size={15} className="animate-spin" style={{ color: 'var(--accent)' }} />
          </div>
        ) : isDone && onPlay ? (
          <button onClick={e => { e.stopPropagation(); onPlay(result) }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all hover:scale-105 active:scale-95"
            style={{ background: 'rgba(var(--accent-rgb),0.15)', color: 'var(--accent)' }}>
            <Play size={13} fill="currentColor" /> Play
          </button>
        ) : (
          <button onClick={e => { e.stopPropagation(); onDownload(result) }}
            className="btn-accent flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold opacity-0 group-hover:opacity-100 transition-all">
            <Download size={13} /> Add
          </button>
        )}
      </div>
    </div>
  )
}
