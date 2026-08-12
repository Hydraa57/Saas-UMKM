import type { Metadata, Viewport } from 'next'
import './globals.css'
import { TabBar } from '@/components/TabBar'
import { Gerbang } from '@/components/Gerbang'
import { SKRIP_HURUF } from '@/lib/tampilan'

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
      <head>
        {/* Ukuran huruf pilihan pengguna dipasang **sebelum** gambar
            pertama. Kalau menunggu React, halaman tergambar sekejap
            dengan ukuran bawaan lalu melompat — dan lompatan itu paling
            mengganggu justru bagi yang memilih huruf besar. */}
        <script dangerouslySetInnerHTML={{ __html: SKRIP_HURUF }} />
      </head>
      {/* Lebar dibatasi karena ini aplikasi HP. Di layar lebar ia tetap
          selebar HP dan berada di tengah, bukan melar jadi tata letak
          yang tidak pernah dirancang. */}
      <body className="mx-auto flex min-h-dvh max-w-md flex-col bg-latar">
        {/* Bilah navigasi ikut di dalam gerbang, bukan di sebelahnya:
            kalau di luar, ia tetap tergambar di atas layar ajakan
            mendaftar — dan menu yang terlihat tapi mengantar ke layar
            "belum selesai" lebih buruk daripada menu yang belum ada. */}
        <Gerbang>
          {children}
          <TabBar />
        </Gerbang>
      </body>
    </html>
  )
}
