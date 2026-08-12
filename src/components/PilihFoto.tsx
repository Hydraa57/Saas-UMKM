'use client'

import { useEffect, useRef, useState } from 'react'
import { Ikon } from './Ikon'

/**
 * Memilih foto barang: dari galeri **atau** dari kamera.
 *
 * Versi sebelumnya cuma satu `<input type="file">` dengan
 * `capture="environment"`. Atribut itu bukan "utamakan kamera" melainkan
 * **paksa kamera**: di Android, pemilih galerinya tidak ditawarkan sama
 * sekali. Akibatnya foto barang yang sudah ada di HP — hasil unduhan dari
 * pemasok, atau yang difoto kemarin — tidak bisa dipakai, dan tiap barang
 * harus difoto ulang saat itu juga. Untuk katalog lima puluh barang, itu
 * pekerjaan yang membuat orang berhenti di barang kelima.
 *
 * Jadi ada dua masukan berkas, keduanya tersembunyi, masing-masing
 * dipicu tombolnya sendiri. Yang tanpa `capture` membuka galeri; yang
 * dengan `capture` langsung membuka kamera.
 *
 * Masukan berkasnya sendiri **tidak pernah terlihat**. Kendali bawaan
 * peramban ("Choose file / no file chosen") berbeda rupa di tiap HP,
 * tidak bisa diberi warna, dan menuliskan nama berkas yang tidak berarti
 * apa-apa bagi pemakainya — satu kendali itu saja cukup membuat seluruh
 * layar terlihat seperti formulir web, bukan aplikasi.
 */

interface Props {
  /** Pratinjau yang sudah ada, misalnya saat menyunting barang lama. */
  readonly pratinjau: string | null
  readonly onPilih: (berkas: File) => void
  readonly onHapus: () => void
}

export function PilihFoto({ pratinjau, onPilih, onHapus }: Props) {
  const galeri = useRef<HTMLInputElement>(null)
  const kamera = useRef<HTMLInputElement>(null)
  const [sibuk, setSibuk] = useState(false)

  // Foto besar butuh sesaat untuk diperkecil. Tanpa penanda, ketukan
  // terasa tidak terjadi dan orang menekannya lagi.
  useEffect(() => {
    if (pratinjau) setSibuk(false)
  }, [pratinjau])

  function terima(berkas: File | undefined) {
    if (!berkas) return
    setSibuk(true)
    onPilih(berkas)
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={galeri}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          terima(e.target.files?.[0])
          // Dikosongkan supaya memilih **berkas yang sama** dua kali
          // tetap memicu perubahan. Tanpa ini, mencoba ulang setelah
          // gagal terlihat seperti tombolnya rusak.
          e.target.value = ''
        }}
      />
      <input
        ref={kamera}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          terima(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      {pratinjau ? (
        <div className="relative w-32">
          {/* eslint-disable-next-line @next/next/no-img-element -- blob
              lokal, bukan aset yang bisa dioptimalkan next/image. */}
          <img
            src={pratinjau}
            alt="Foto barang"
            className="aspect-square w-32 rounded-kartu object-cover"
          />
          <button
            type="button"
            onClick={onHapus}
            aria-label="Hapus foto"
            className="absolute -right-2 -top-2 flex h-9 w-9 items-center justify-center
                       rounded-full bg-white text-keluar shadow-melayang
                       transition active:scale-90"
          >
            <Ikon nama="silang" ukuran={18} tebal={2.4} />
          </button>
        </div>
      ) : (
        <div
          aria-hidden={!sibuk}
          className={`flex aspect-square w-32 items-center justify-center rounded-kartu
                      bg-latar text-slate-400 ${sibuk ? 'animate-pulse' : ''}`}
        >
          <Ikon nama="galeri" ukuran={30} />
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={sibuk}
          onClick={() => galeri.current?.click()}
          className="btn-sekunder flex-1 text-base"
        >
          <Ikon nama="galeri" ukuran={19} />
          Galeri
        </button>
        <button
          type="button"
          disabled={sibuk}
          onClick={() => kamera.current?.click()}
          className="btn-sekunder flex-1 text-base"
        >
          <Ikon nama="kamera" ukuran={19} />
          Kamera
        </button>
      </div>
    </div>
  )
}
