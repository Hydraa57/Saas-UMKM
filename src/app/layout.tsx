import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Kasir Usaha',
  description: 'Layani pembeli, cetak struk — pembukuan dan stok terisi sendiri.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Kasir Usaha' },
}

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
  // Perbesar-cubit tidak dimatikan. Melarangnya adalah kebiasaan lama
  // yang merugikan justru pengguna yang paling butuh — dan pengguna
  // aplikasi ini persis di kelompok itu.
  maximumScale: 5,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body className="mx-auto flex min-h-dvh max-w-md flex-col">{children}</body>
    </html>
  )
}
