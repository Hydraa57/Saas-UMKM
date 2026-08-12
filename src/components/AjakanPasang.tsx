'use client'

import { useState } from 'react'
import { usePasang } from '@/lib/pasang'
import { Ikon } from './Ikon'

/**
 * Ajakan memasang aplikasi ke layar depan.
 *
 * Ditulis untuk orang yang tidak tahu bahwa "aplikasi" dan "situs web"
 * bisa jadi hal yang sama. Karena itu yang dijanjikan bukan istilahnya
 * ("pasang PWA", "tambah ke layar utama") melainkan **akibatnya**: ada
 * ikon di layar depan, dan membukanya tidak lewat peramban lagi.
 *
 * Bisa ditutup, dan penutupannya diingat. Ajakan yang tidak bisa ditutup
 * akan dilewati matanya dalam dua hari, dan sesudah itu ia cuma memakan
 * baris teratas beranda selamanya. Yang terlanjur menutupnya masih bisa
 * menemukannya di Pengaturan — jalan kedua itu ada justru supaya
 * menutupnya tidak berarti kehilangan selamanya.
 */

export function AjakanPasang() {
  const { keadaan, ditutup, pasang, tutup } = usePasang()
  const [petunjuk, setPetunjuk] = useState(false)

  if (ditutup) return null
  if (keadaan === 'memuat' || keadaan === 'terpasang' || keadaan === 'tidak-bisa') {
    return null
  }

  return (
    <section className="kartu animate-naik">
      <div className="flex items-start gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-kartu
                     bg-merek-50 text-merek-600"
        >
          <Ikon nama="unduh" ukuran={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Pasang di layar depan</p>
          <p className="mt-1 text-sm text-slate-600">
            Supaya bisa dibuka langsung dari ikonnya, tanpa mengetik alamat —
            dan tanpa bilah peramban di atas layar.
          </p>
        </div>
        <button
          type="button"
          onClick={tutup}
          aria-label="Tutup ajakan pasang"
          className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center
                     rounded-kartu-kecil text-slate-400 active:bg-slate-100"
        >
          <Ikon nama="silang" ukuran={18} tebal={2.2} />
        </button>
      </div>

      {keadaan === 'bisa' ? (
        <button
          type="button"
          onClick={() => void pasang()}
          className="btn-primer mt-3 w-full"
        >
          Pasang sekarang
        </button>
      ) : (
        /* iOS. Safari tidak menyediakan cara memasang dari dalam halaman
           sama sekali, jadi yang bisa diberikan cuma petunjuknya —
           dan tombol "Pasang" yang tidak melakukan apa-apa lebih buruk
           daripada petunjuk yang jujur. */
        <>
          <button
            type="button"
            onClick={() => setPetunjuk((b) => !b)}
            aria-expanded={petunjuk}
            className="btn-sekunder mt-3 w-full"
          >
            Caranya di iPhone
          </button>
          {petunjuk && (
            <ol className="mt-3 flex list-inside list-decimal flex-col gap-1 text-sm text-slate-600 animate-naik">
              <li>Ketuk tombol Bagikan di bawah layar Safari.</li>
              <li>Gulir, lalu pilih “Tambah ke Layar Utama”.</li>
              <li>Ketuk “Tambah” di pojok kanan atas.</li>
            </ol>
          )}
        </>
      )}
    </section>
  )
}
