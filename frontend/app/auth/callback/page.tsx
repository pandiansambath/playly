'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Music } from 'lucide-react'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    // Supabase JS client auto-exchanges the code from the URL.
    // Wait for SIGNED_IN event and then redirect home.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: any) => {
      if (event === 'SIGNED_IN') {
        subscription.unsubscribe()
        router.replace('/')
      }
    })

    // Also check if already signed in (code already exchanged)
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: any } }) => {
      if (session) {
        subscription.unsubscribe()
        router.replace('/')
      }
    })

    // Hard fallback after 5s — session should be ready by then
    const t = setTimeout(() => { subscription.unsubscribe(); router.replace('/') }, 5000)
    return () => { subscription.unsubscribe(); clearTimeout(t) }
  }, [router]) // eslint-disable-line

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-5"
      style={{ background: 'var(--bg-base)' }}>
      {/* Animated waveform loader */}
      <div className="flex items-end gap-1">
        {[40, 75, 55, 90, 45, 80, 52].map((h, i) => (
          <div key={i} className="eq-bar rounded-full"
            style={{
              width: 5, height: `${h * 0.44}px`,
              background: 'linear-gradient(to top, var(--accent), var(--accent-alt))',
              transformOrigin: 'bottom',
              animationDuration: `${0.5 + i * 0.08}s`,
              animationDelay: `${i * 0.05}s`,
            }} />
        ))}
      </div>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Signing you in…</p>
    </div>
  )
}
