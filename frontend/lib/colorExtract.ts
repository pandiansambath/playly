// Curated accent colors that look gorgeous as music app backgrounds
const PALETTES: [number, number, number][] = [
  [139, 92,  246],  // violet
  [236, 72,  153],  // pink
  [59,  130, 246],  // blue
  [16,  185, 129],  // emerald
  [245, 158, 11],   // amber
  [239, 68,  68],   // red
  [20,  184, 166],  // teal
  [168, 85,  247],  // purple
  [249, 115, 22],   // orange
  [99,  102, 241],  // indigo
  [6,   182, 212],  // cyan
  [244, 63,  94],   // rose
]

/** Returns "r,g,b" string — deterministic per youtube_id, always a curated colour */
export function getSongColor(youtubeId: string): string {
  let hash = 0
  for (let i = 0; i < youtubeId.length; i++) {
    hash = youtubeId.charCodeAt(i) + ((hash << 5) - hash)
    hash |= 0
  }
  const [r, g, b] = PALETTES[Math.abs(hash) % PALETTES.length]
  return `${r},${g},${b}`
}
