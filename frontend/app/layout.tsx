import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Navbar } from '@/components/Navbar'
import { Player } from '@/components/Player'
import { AuthProvider } from '@/components/AuthProvider'
import { DynamicBackground } from '@/components/DynamicBackground'
import { LibraryPreloader } from '@/components/LibraryPreloader'
import { ThemeProvider } from '@/components/ThemeProvider'

export const metadata: Metadata = {
  title: 'PlayLy — Free Music Streaming',
  description: 'YouTube-powered music streaming. Search, stream & download MP3s. No ads. Background play. Free forever.',
  manifest: '/manifest.json',
  keywords: ['music', 'streaming', 'youtube', 'mp3', 'free', 'download', 'playlist'],
  openGraph: {
    title: 'PlayLy — Free Music Streaming',
    description: 'YouTube-powered music streaming. No ads. No limits.',
    type: 'website',
  },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'PlayLy' },
}

export const viewport: Viewport = {
  themeColor: '#07070f',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', minHeight: '100vh' }}>
        <ThemeProvider>
          <AuthProvider>
            <DynamicBackground />
            <LibraryPreloader />
            <div className="relative z-10 flex flex-col min-h-screen">
              <Navbar />
              {/* pb-24 = player bar; pb-36 on mobile = player + bottom tabs */}
              <main className="flex-1 pb-24 md:pb-24" style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}>
                {children}
              </main>
              <Player />
            </div>
          </AuthProvider>
        </ThemeProvider>
        <script dangerouslySetInnerHTML={{ __html: `
          // Apply saved theme before paint to prevent flash
          try {
            const t = localStorage.getItem('playly-theme');
            if (t) document.documentElement.setAttribute('data-theme', t);
          } catch(e) {}
          // Register service worker
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
          }
        `}} />
      </body>
    </html>
  )
}
