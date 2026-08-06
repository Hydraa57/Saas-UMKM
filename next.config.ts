import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  experimental: {
    // Uang disimpan sebagai bigint; pastikan serialisasi tidak diam-diam
    // mengubahnya jadi number di batas server/klien.
    typedEnv: true,
  },
  async headers() {
    return [
      {
        // Service worker harus selalu diperiksa ulang, kalau tidak
        // pembaruan aplikasi tidak pernah sampai ke perangkat.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ]
  },
}

export default nextConfig
