import type { Metadata, Viewport } from 'next'
import './globals.css'
import { TabBar } from '@/components/TabBar'
import { Gerbang } from '@/components/Gerbang'
import { SKRIP_HURUF } from '@/lib/tampilan'
import { SKRIP_PASANG } from '@/lib/pasang'
import { DaftarSW } from '@/components/DaftarSW'

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
        {/* `beforeinstallprompt` dipicu peramban **sekali**, sangat awal,
            dan hilang begitu saja kalau tidak ada yang mendengarkan saat
            itu — React belum hidup pada detik itu. */}
        <script dangerouslySetInnerHTML={{ __html: SKRIP_PASANG }} />
      </head>
      {/* Di HP: satu kolom, bilah navigasi di dasar layar. Di layar
          lebar: bilahnya pindah ke samping dan isinya mengisi sisanya.
          Lebar tiap layar diatur kelas `.layar` masing-masing, bukan
          dipaku di sini — dulu `max-w-md` di badan ini membuat laptop
          menampilkan pita selebar HP di tengah layar kosong. */}
      <body className="flex min-h-dvh flex-col bg-latar lg:flex-row">
        {/* Bilah navigasi ikut di dalam gerbang, bukan di sebelahnya:
            kalau di luar, ia tetap tergambar di atas layar ajakan
            mendaftar — dan menu yang terlihat tapi mengantar ke layar
            "belum selesai" lebih buruk daripada menu yang belum ada. */}
        <DaftarSW />
        <Gerbang>
          <TabBar />
          <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        </Gerbang>
      </body>
    </html>
  )
}
