import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  experimental: {
    // Uang disimpan sebagai bigint; pastikan serialisasi tidak diam-diam
    // mengubahnya jadi number di batas server/klien.
    typedEnv: true,
  },
  async redirects() {
    return [
      {
        // "Stok" dulu halaman sendiri. Setelah digabung ke tab di
        // /katalog, jalurnya dipertahankan sebagai pengalihan: tautan
        // yang sudah beredar dan pintasan layar utama yang sudah dipasang
        // pengguna tidak boleh berakhir di halaman 404.
        source: '/stok',
        destination: '/katalog?tab=stok',
        permanent: false,
      },
    ]
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
