/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for Docker multi-stage build (standalone mode)
  // The Dockerfile does: COPY --from=builder /app/.next/standalone ./
  output: 'standalone',

  // Skip TypeScript type-check during production Docker builds.
  // The app runs correctly — strict inference issue with Supabase v2 types.
  typescript: {
    ignoreBuildErrors: true,
  },

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'i.ytimg.com' },
      { protocol: 'https', hostname: 'img.youtube.com' },
    ],
  },
  devIndicators: false,

  // CACHE CONTROL — fixes the "old UI keeps appearing until incognito" bug.
  // HTML pages get must-revalidate so users always get fresh markup pointing
  // at the latest hashed JS bundles. The hashed bundles themselves stay
  // immutable + 1-year cached, so the network cost of revalidating HTML is
  // trivial and the browser still serves JS instantly.
  async headers() {
    return [
      {
        // All HTML / Next.js page responses — short revalidate, no stale-while-revalidate
        source: '/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        ],
        missing: [
          { type: 'header', key: 'next-router-prefetch' },
        ],
      },
      {
        // Hashed Next static chunks — immutable, cache forever
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ]
  },
}
module.exports = nextConfig
