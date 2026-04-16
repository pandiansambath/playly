'use client'
import { useEffect, useState, useRef } from 'react'
import {
  User, Camera, Save, Music, Heart, ListMusic,
  LogOut, Trash2, ChevronRight, Check, CheckCircle2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/AuthProvider'
import { usePlayerStore } from '@/store/playerStore'
import { api } from '@/lib/api'
import { useTheme, THEMES } from '@/components/ThemeProvider'

// ── Beautiful Toast notification ──────────────────────────
function Toast({ msg, ok, onDone }: { msg: string; ok: boolean; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[300] bounce-in flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl"
      style={{
        background: ok ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
        border: `1px solid ${ok ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.35)'}`,
        backdropFilter: 'blur(20px)',
        boxShadow: ok
          ? '0 8px 32px rgba(16,185,129,0.2)'
          : '0 8px 32px rgba(239,68,68,0.2)',
      }}>
      {ok
        ? <CheckCircle2 size={18} style={{ color: 'rgb(52,211,153)', flexShrink: 0 }} />
        : <span style={{ color: '#f87171' }}>⚠</span>
      }
      <span className="text-sm font-semibold" style={{ color: ok ? 'rgb(209,250,229)' : 'rgb(254,202,202)' }}>
        {msg}
      </span>
    </div>
  )
}

export default function ProfilePage() {
  const { user } = useAuth()
  const clearPlayer = usePlayerStore(s => s.clearPlayer)
  const { theme, setTheme } = useTheme()

  const [profile,   setProfile]   = useState<any>(null)
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [name,      setName]      = useState('')
  const [quality,   setQuality]   = useState('192')
  const [toast,     setToast]     = useState<{ text: string; ok: boolean } | null>(null)
  const [stats,     setStats]     = useState({ songs: 0, favorites: 0, playlists: 0 })
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function showToast(text: string, ok: boolean) {
    setToast({ text, ok })
  }

  useEffect(() => {
    if (!user) return
    Promise.all([
      supabase.from('users').select('*').eq('id', user.id).single(),
      api.getLibrary(),
      api.getFavorites(),
      api.getPlaylists(),
    ]).then(([{ data }, lib, favs, pls]) => {
      if (data) { setProfile(data); setName(data.name || ''); setQuality(data.quality_mp3 || '192') }
      setStats({
        songs:     lib?.songs?.length     ?? 0,
        favorites: favs?.favorites?.length ?? 0,
        playlists: pls?.playlists?.length  ?? 0,
      })
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [user])

  async function saveProfile() {
    if (!user) return
    setSaving(true)
    try {
      await supabase.from('users').update({ name, quality_mp3: quality }).eq('id', user.id)
      showToast('Profile saved successfully!', true)
    } catch {
      showToast('Failed to save profile', false)
    } finally { setSaving(false) }
  }

  async function uploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setUploading(true)
    try {
      const ext  = file.name.split('.').pop()
      const path = `${user.id}.${ext}`
      await supabase.storage.from('avatars').upload(path, file, { upsert: true })
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      await supabase.from('users').update({ avatar_url: data.publicUrl }).eq('id', user.id)
      setProfile((p: any) => ({ ...p, avatar_url: data.publicUrl }))
      showToast('Avatar updated!', true)
    } catch {
      showToast('Upload failed — try a smaller image', false)
    } finally { setUploading(false) }
  }

  async function clearHistory() {
    if (!confirm('Clear all play history?')) return
    await api.clearHistory()
    showToast('History cleared', true)
  }

  async function signOut() {
    await supabase.auth.signOut()
    clearPlayer()
  }

  if (!user) return (
    <div className="flex items-center justify-center h-64">
      <p style={{ color: 'var(--text-muted)' }}>Please sign in</p>
    </div>
  )

  const avatarUrl = profile?.avatar_url || null
  const initials  = (profile?.name || user?.email || 'U').charAt(0).toUpperCase()

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 fade-in">
      {toast && <Toast msg={toast.text} ok={toast.ok} onDone={() => setToast(null)} />}

      <div className="mb-8">
        <h1 className="text-2xl font-black mb-0.5">Profile</h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Manage your account & preferences</p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-28 rounded-3xl shimmer" />)}
        </div>
      ) : (
        <div className="space-y-4">

          {/* Avatar + info */}
          <div className="glass rounded-3xl p-6">
            <div className="flex items-center gap-5">
              <div className="relative flex-shrink-0">
                <div className="w-20 h-20 rounded-3xl overflow-hidden avatar-ring"
                  style={{ background: 'var(--bg-raised)' }}>
                  {avatarUrl
                    ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-3xl font-black gradient-text">{initials}</div>
                  }
                </div>
                <button onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="absolute -bottom-2 -right-2 w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:scale-110"
                  style={{ background: 'var(--accent)', boxShadow: '0 4px 12px rgba(var(--accent-rgb),0.4)' }}>
                  {uploading
                    ? <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    : <Camera size={14} className="text-white" />
                  }
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={uploadAvatar} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-lg truncate">{profile?.name || 'Anonymous'}</p>
                <p className="text-sm truncate" style={{ color: 'var(--text-muted)' }}>{user.email}</p>
                <div className="flex items-center gap-3 mt-2">
                  {[
                    { icon: <Music size={12} />,    val: stats.songs,     label: 'songs'     },
                    { icon: <Heart size={12} />,    val: stats.favorites, label: 'favs'      },
                    { icon: <ListMusic size={12} />,val: stats.playlists, label: 'playlists' },
                  ].map(s => (
                    <div key={s.label} className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {s.icon}
                      <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{s.val}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Edit name */}
          <div className="glass rounded-3xl p-6">
            <h3 className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text-muted)' }}>Account</h3>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <User size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                <input value={name} onChange={e => setName(e.target.value)}
                  placeholder="Display name"
                  className="input-field w-full pl-9 pr-4 py-3 rounded-xl text-sm" />
              </div>
              <button onClick={saveProfile} disabled={saving}
                className="btn-accent px-5 rounded-xl text-sm font-bold flex items-center gap-2 disabled:opacity-50">
                {saving ? <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> : <Save size={15} />}
                Save
              </button>
            </div>
          </div>

          {/* MP3 Quality */}
          <div className="glass rounded-3xl p-6">
            <h3 className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text-muted)' }}>MP3 Quality</h3>
            <div className="grid grid-cols-3 gap-2">
              {[
                { val: '128', label: '128 kbps', desc: 'Smaller files' },
                { val: '192', label: '192 kbps', desc: 'Balanced ✨'   },
                { val: '320', label: '320 kbps', desc: 'Best quality'  },
              ].map(q => (
                <button key={q.val} onClick={() => setQuality(q.val)}
                  className="p-3 rounded-2xl text-left transition-all duration-200 relative"
                  style={quality === q.val ? {
                    background: `rgba(var(--accent-rgb),0.12)`,
                    border: `1px solid rgba(var(--accent-rgb),0.4)`,
                  } : { background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold"
                      style={{ color: quality === q.val ? 'var(--accent)' : 'var(--text-primary)' }}>
                      {q.label}
                    </span>
                    {quality === q.val && <Check size={12} style={{ color: 'var(--accent)' }} />}
                  </div>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{q.desc}</p>
                </button>
              ))}
            </div>
            <button onClick={saveProfile} disabled={saving}
              className="btn-accent w-full mt-4 py-3 rounded-xl text-sm font-bold">
              Save Quality Setting
            </button>
          </div>

          {/* Themes */}
          <div className="glass rounded-3xl p-6">
            <h3 className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text-muted)' }}>Theme</h3>
            <div className="grid grid-cols-3 gap-2">
              {THEMES.map(t => (
                <button key={t.id} onClick={() => setTheme(t.id)}
                  className="relative p-3 rounded-2xl flex flex-col items-center gap-2 transition-all duration-200"
                  style={theme === t.id ? {
                    background: `rgba(var(--accent-rgb),0.12)`,
                    border: `1px solid rgba(var(--accent-rgb),0.4)`,
                  } : { background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                  <div className="w-full h-8 rounded-lg" style={{ background: t.preview }} />
                  <span className="text-xs font-medium">{t.emoji} {t.label}</span>
                  {theme === t.id && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ background: 'var(--accent)' }}>
                      <Check size={11} className="text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="glass rounded-3xl p-6">
            <h3 className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text-muted)' }}>Actions</h3>
            <div className="space-y-2">
              <button onClick={clearHistory}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm text-left transition-all"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-raised)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface)'}>
                <Trash2 size={16} style={{ color: 'var(--text-muted)' }} />
                <span style={{ color: 'var(--text-primary)' }}>Clear play history</span>
                <ChevronRight size={14} className="ml-auto" style={{ color: 'var(--text-muted)' }} />
              </button>
              <button onClick={signOut}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm text-left transition-all"
                style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.12)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.06)'}>
                <LogOut size={16} />
                Sign out
                <ChevronRight size={14} className="ml-auto" />
              </button>
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
