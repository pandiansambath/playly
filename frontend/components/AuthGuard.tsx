'use client'
import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from './AuthProvider'

const PROTECTED = ['/library', '/favorites', '/history', '/playlists', '/profile']

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router   = useRouter()
  const pathname = usePathname()

  const isProtected = PROTECTED.some(p => pathname === p || pathname.startsWith(p + '/'))

  useEffect(() => {
    if (loading) return
    if (!user && isProtected) router.replace('/')
  }, [user, loading, pathname]) // eslint-disable-line

  // Prevent flash of protected content while redirecting
  if (!loading && !user && isProtected) return null

  return <>{children}</>
}
