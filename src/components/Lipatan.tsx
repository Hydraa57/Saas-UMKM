'use client'

import { useState } from 'react'
import { Ikon } from './Ikon'

/**
 * Bagian yang bisa dibuka-tutup.
 *
 * Menggantikan `<details>` bawaan peramban. Kendali bawaan itu menggambar
 * **segitiga kecil** yang bentuk, ukuran, dan warnanya ditentukan sistem
 * operasi — berbeda di tiap HP, tidak bisa disamakan dengan ikon lain di
 * aplikasi ini, dan terlalu kecil untuk jari. Satu kendali seperti itu
 * cukup membuat layar di sekitarnya terbaca sebagai halaman web.
 *
 * Yang dipertahankan dari `<details>`: isinya **tidak dirender** selama
 * tertutup. Itu bukan penghematan gaya — bagian yang dilipat di sini
 * memuat kolom isian dan pemilih foto, dan menggambar keduanya untuk
 * sesuatu yang tidak terlihat memperlambat layar yang paling sering
 * dibuka saat mengisi katalog.
 */

interface Props {
  readonly judul: string
  readonly ikon?: React.ComponentProps<typeof Ikon>['nama']
  readonly children: React.ReactNode
}

export function Lipatan({ judul, ikon, children }: Props) {
  const [buka, setBuka] = useState(false)

  return (
    <section className="kartu">
      <button
        type="button"
        aria-expanded={buka}
        onClick={() => setBuka((b) => !b)}
        className="flex w-full items-center gap-2 text-left font-semibold"
      >
        {ikon && <Ikon nama={ikon} ukuran={20} className="shrink-0 text-slate-400" />}
        <span className="flex-1">{judul}</span>
        <Ikon
          nama="lanjut"
          ukuran={18}
          className={`shrink-0 text-slate-400 transition-transform duration-200 ${
            buka ? 'rotate-90' : ''
          }`}
        />
      </button>

      {buka && <div className="mt-3 animate-naik">{children}</div>}
    </section>
  )
}
