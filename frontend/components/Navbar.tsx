'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Search, Library, Heart, Clock, ListMusic,
  User, LogOut, ChevronLeft,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './AuthProvider'
import { usePlayerStore } from '@/store/playerStore'

const LINKS = [
  { href: '/',          label: 'Search',    Icon: Search    },
  { href: '/library',   label: 'Library',   Icon: Library   },
  { href: '/favorites', label: 'Favorites', Icon: Heart     },
  { href: '/history',   label: 'History',   Icon: Clock     },
  { href: '/playlists', label: 'Playlists', Icon: ListMusic },
]

// ── Logo ───────────────────────────────────────────────
function PlayLyLogo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 group select-none">
      {/* Waveform icon */}
      <div className="relative w-8 h-8 flex items-end justify-center gap-[3px] pb-0.5"
        style={{
          background: 'linear-gradient(135deg,rgba(var(--accent-rgb),0.2),rgba(var(--accent-alt-rgb),0.15))',
          border: '1px solid rgba(var(--accent-rgb),0.3)',
          borderRadius: '10px',
          boxShadow: '0 2px 12px rgba(var(--accent-rgb),0.2)',
        }}>
        {[3,5,4,6,3].map((h, i) => (
          <div key={i} className="w-[3px] rounded-full transition-all duration-300 group-hover:opacity-80"
            style={{
              height: `${h * 3}px`,
              background: `linear-gradient(to top, var(--accent), var(--accent-alt))`,
              animationDelay: `${i * 0.1}s`,
            }} />
        ))}
      </div>
      <span className="text-xl font-black tracking-tight gradient-text">PlayLy</span>
    </Link>
  )
}

// ── Desktop Navbar ─────────────────────────────────────
export function Navbar() {
  const path        = usePathname()
  const router      = useRouter()
  const { user }    = useAuth()
  const clearPlayer = usePlayerStore(s => s.clearPlayer)
  const onProfile   = path === '/profile'

  if (!user) return (
    <nav className="sticky top-0 z-50 px-6 py-4 flex items-center"
      style={{ background: 'transparent' }}>
      <PlayLyLogo />
    </nav>
  )

  return (
    <>
      {/* ── Desktop top bar ──────────────────────────────── */}
      <nav className="sticky top-0 z-50 px-4 md:px-6 py-3 flex items-center justify-between hidden md:flex"
        style={{
          background: 'var(--nav-bg)',
          backdropFilter: 'blur(30px) saturate(1.5)',
          WebkitBackdropFilter: 'blur(30px) saturate(1.5)',
          borderBottom: '1px solid var(--border)',
          boxShadow: '0 1px 0 var(--border)',
        }}>
        <PlayLyLogo />

        {/* Nav links */}
        <div className="flex items-center gap-1">
          {LINKS.map(({ href, label, Icon }) => {
            const active = path === href
            return (
              <Link key={href} href={href}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all duration-200"
                style={active ? {
                  background: `rgba(var(--accent-rgb),0.15)`,
                  color: 'var(--accent)',
                  boxShadow: `inset 0 0 0 1px rgba(var(--accent-rgb),0.2)`,
                } : {
                  color: 'var(--text-muted)',
                }}
                onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-raised)' } }}
                onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.background = '' } }}
              >
                <Icon size={15} />
                <span>{label}</span>
              </Link>
            )
          })}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          <Link href="/profile"
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200"
            style={path === '/profile' ? {
              color: 'var(--accent)',
              background: `rgba(var(--accent-rgb),0.15)`,
            } : { color: 'var(--text-muted)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-raised)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = path === '/profile' ? 'var(--accent)' : 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.background = path === '/profile' ? `rgba(var(--accent-rgb),0.15)` : '' }}
          >
            <User size={15} />
            <span>Profile</span>
          </Link>
          <button
            onClick={() => { supabase.auth.signOut(); clearPlayer() }}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-raised)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.background = '' }}
          >
            <LogOut size={15} />
            <span>Sign out</span>
          </button>
        </div>
      </nav>

      {/* ── Mobile top bar ────────────────────────────────── */}
      <nav className="sticky top-0 z-50 px-4 py-3 flex items-center justify-between md:hidden"
        style={{
          background: 'var(--nav-bg)',
          backdropFilter: 'blur(30px)',
          WebkitBackdropFilter: 'blur(30px)',
          borderBottom: '1px solid var(--border)',
        }}>
        <PlayLyLogo />
        {/* Profile icon → shows back arrow when already on /profile */}
        {onProfile ? (
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-110"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)' }}>
            <ChevronLeft size={18} style={{ color: 'var(--text-secondary)' }} />
          </button>
        ) : (
          <Link href="/profile"
            className="w-9 h-9 rounded-full flex items-center justify-center transition-all"
            style={{
              background: 'var(--bg-raised)',
              border: '1px solid var(--border)',
            }}>
            <User size={16} style={{ color: 'var(--text-secondary)' }} />
          </Link>
        )}
      </nav>

      {/* ── Mobile bottom tab bar ─────────────────────────── */}
      <nav className="fixed bottom-0 inset-x-0 z-40 md:hidden safe-bottom"
        style={{
          background: 'var(--nav-bg)',
          backdropFilter: 'blur(30px) saturate(1.5)',
          WebkitBackdropFilter: 'blur(30px) saturate(1.5)',
          borderTop: '1px solid var(--border)',
        }}>
        {/* Player bar pushes this up — we need extra bottom space */}
        <div className="flex items-center justify-around px-2 pt-2 pb-3">
          {LINKS.map(({ href, label, Icon }) => {
            const active = path === href
            return (
              <Link key={href} href={href}
                className="flex flex-col items-center gap-1 px-3 py-1.5 rounded-2xl transition-all duration-200 min-w-[48px]"
                style={active ? {
                  color: 'var(--accent)',
                } : { color: 'var(--text-muted)' }}>
                <div className="relative">
                  <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
                  {active && (
                    <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                      style={{ background: 'var(--accent)' }} />
                  )}
                </div>
                <span className="text-[10px] font-medium">{label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
