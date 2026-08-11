'use client'

import { Ikon } from './Ikon'

/**
 * Kepala halaman.
 *
 * Menempel di atas saat digulir, dengan latar buram. Pada layar yang
 * isinya panjang — katalog, riwayat, stok — tombol kembali yang ikut
 * tergulir berarti pengguna harus menggulir ke atas dulu sebelum bisa
 * keluar, dan itu terasa seperti terjebak.
 *
 * Judulnya dipotong, bukan dibungkus ke baris kedua: nama barang yang
 * panjang tidak boleh mendorong isi halaman ke bawah.
 */

interface AppBarProps {
  readonly judul: string
  /** Tujuan tombol kembali. Kalau kosong, tombolnya tidak muncul. */
  readonly kembali?: string
  /** Dipakai kalau kembalinya bukan berpindah halaman, tapi ganti tahap. */
  readonly onKembali?: () => void
  readonly aksi?: React.ReactNode
}

export function AppBar({ judul, kembali, onKembali, aksi }: AppBarProps) {
  return (
    <header
      className="sticky top-0 z-20 -mx-4 mb-1 flex items-center gap-3 border-b
                 border-slate-900/5 bg-slate-100/85 px-4 py-3 backdrop-blur-xl"
    >
      {onKembali ? (
        <button type="button" onClick={onKembali} aria-label="Kembali" className="btn-ikon">
          <Ikon nama="kembali" ukuran={22} tebal={2} />
        </button>
      ) : kembali ? (
        <a href={kembali} aria-label="Kembali" className="btn-ikon">
          <Ikon nama="kembali" ukuran={22} tebal={2} />
        </a>
      ) : null}

      <h1 className="min-w-0 flex-1 truncate text-xl font-bold">{judul}</h1>

      {aksi}
    </header>
  )
}
