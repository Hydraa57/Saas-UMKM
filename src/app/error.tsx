'use client'

import { useEffect } from 'react'
import { LayarGalat } from '@/components/LayarGalat'

/**
 * Penangkap galat untuk seluruh halaman di dalam tata letak akar.
 *
 * Menangkap kegagalan saat menggambar layar — bukan kegagalan jaringan,
 * yang sudah ditangani antrean kirim dan tidak pernah sampai ke sini.
 *
 * Tata letak akar, bilah navigasi, dan gerbang tetap hidup: yang diganti
 * cuma isi halaman yang gagal. Itu sengaja — pemiliknya masih bisa
 * berpindah ke kasir lewat bilah bawah tanpa memuat ulang apa pun, dan
 * satu layar yang rusak tidak menghentikan jualan hari itu.
 */

export default function Galat({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Yang asli tetap dicatat ke konsol, tempat ia memang berguna —
    // bukan ke layar, tempat ia cuma menakuti.
    console.error(error)
  }, [error])

  return <LayarGalat galat={error} ulangi={reset} />
}
