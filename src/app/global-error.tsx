'use client'

import { useEffect } from 'react'
import './globals.css'
import { LayarGalat } from '@/components/LayarGalat'

/**
 * Penangkap terakhir: galat di tata letak akar itu sendiri.
 *
 * `error.tsx` hidup **di dalam** tata letak akar, jadi ia tidak bisa
 * menangkap kegagalan tata letak itu sendiri. Kalau `Gerbang` atau
 * `TabBar` yang rusak, tanpa berkas ini yang tergambar adalah layar
 * bawaan peramban — putih kosong, berbahasa Inggris, tanpa satu pun
 * tombol.
 *
 * Karena ia menggantikan tata letak akar, ia harus menggambar `<html>`
 * dan `<body>` sendiri, dan mengimpor gayanya sendiri. Kelas `body`-nya
 * disalin dari tata letak akar — kalau tidak, layar galatnya melar
 * selebar layar di HP dan terlihat seperti halaman yang bukan bagian
 * dari aplikasi ini, tepat pada saat pemiliknya paling butuh yakin ia
 * masih di aplikasi yang sama.
 */

export default function GalatAkar({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang="id">
      <body className="mx-auto flex min-h-dvh max-w-md flex-col bg-latar">
        <LayarGalat galat={error} ulangi={reset} />
      </body>
    </html>
  )
}
