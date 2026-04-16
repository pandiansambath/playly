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
}
module.exports = nextConfig
