'use client'
import { createContext, useContext, useEffect, useState } from 'react'

export type Theme = 'dark' | 'amoled' | 'light' | 'ocean' | 'sunset' | 'forest'

export const THEMES: { id: Theme; label: string; emoji: string; preview: string }[] = [
  { id: 'dark',   label: 'Dark',    emoji: '🌑', preview: 'linear-gradient(135deg,#07070f,#1a0a3a)' },
  { id: 'amoled', label: 'AMOLED',  emoji: '⬛', preview: 'linear-gradient(135deg,#000,#1a0030)' },
  { id: 'light',  label: 'Light',   emoji: '☀️', preview: 'linear-gradient(135deg,#f0f2ff,#e8e0ff)' },
  { id: 'ocean',  label: 'Ocean',   emoji: '🌊', preview: 'linear-gradient(135deg,#020b14,#0a2040)' },
  { id: 'sunset', label: 'Sunset',  emoji: '🌅', preview: 'linear-gradient(135deg,#0f0805,#3d1508)' },
  { id: 'forest', label: 'Forest',  emoji: '🌿', preview: 'linear-gradient(135deg,#040d06,#0a2b0e)' },
]

const ThemeCtx = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
  theme: 'dark',
  setTheme: () => {},
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark')

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('playly-theme') as Theme | null
    if (saved && THEMES.find(t => t.id === saved)) {
      setThemeState(saved)
      document.documentElement.setAttribute('data-theme', saved)
    }
  }, [])

  function setTheme(t: Theme) {
    setThemeState(t)
    localStorage.setItem('playly-theme', t)
    document.documentElement.setAttribute('data-theme', t)
  }

  return (
    <ThemeCtx.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeCtx.Provider>
  )
}

export const useTheme = () => useContext(ThemeCtx)
