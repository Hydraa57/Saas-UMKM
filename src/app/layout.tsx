import type { Metadata, Viewport } from 'next'
import './globals.css'
import { TabBar } from '@/components/TabBar'

export const metadata: Metadata = {
  title: 'Ezura',
  description: 'Layani pembeli, cetak struk — pembukuan dan stok terisi sendiri.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Ezura' },
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
      {/* Lebar dibatasi karena ini aplikasi HP. Di layar lebar ia tetap
          selebar HP dan berada di tengah, bukan melar jadi tata letak
          yang tidak pernah dirancang. */}
      <body className="mx-auto flex min-h-dvh max-w-md flex-col bg-slate-100">
        {children}
        <TabBar />
      </body>
    </html>
  )
}
