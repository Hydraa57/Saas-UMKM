'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getMeta, QRIS_KEY } from '@/lib/db/local'
import { Uang } from './Uang'
import { Ikon } from './Ikon'
import type { Rupiah } from '@/lib/money'
import * as M from '@/lib/money'

/**
 * Kode QRIS di layar bayar, dengan nominal sudah terisi.
 *
 * Muncul begitu "QRIS" dipilih — tanpa ketukan tambahan, karena di depan
 * pembeli setiap ketukan berarti menunggu. Nominalnya disisipkan ke QRIS
 * statis milik usaha di HP ini juga, jadi tidak ada jaringan yang perlu
 * dihubungi dan tidak ada biaya per transaksi.
 *
 * **Yang sengaja tidak dilakukan: menandai lunas sendiri.** Tidak ada
 * jalur balik dari bank ke aplikasi ini, jadi ia tidak pernah tahu
 * uangnya sudah masuk. Yang tahu cuma pemiliknya, dari notifikasi
 * banknya. Aplikasi yang menebak-nebak soal ini akan menandai lunas
 * transaksi yang gagal — dan kekeliruan seperti itu baru ketahuan saat
 * menghitung laci di malam hari, ketika pembelinya sudah lama pulang.
 *
 * Penggambar QR dimuat saat kartu ini dipakai, bukan bersama kasir.
 * Kasir dibuka puluhan kali sehari; yang bayar pakai QRIS cuma sebagian.
 */

interface Props {
  readonly nominal: Rupiah
}

export function KartuQris({ nominal }: Props) {
  const muatan = useLiveQuery(() => getMeta<string>(db(), QRIS_KEY), [], undefined)

  const [svg, setSvg] = useState<string | null>(null)
  const [dinamis, setDinamis] = useState(true)
  const kartu = useRef<HTMLElement>(null)

  useEffect(() => {
    let dibatalkan = false
    if (!muatan || !M.isPositive(nominal)) {
      setSvg(null)
      return
    }

    void (async () => {
      const { gambarQris } = await import('@/lib/qris/gambar')
      const hasil = await gambarQris(muatan, nominal)
      if (dibatalkan) return
      setSvg(hasil.svg)
      setDinamis(hasil.dinamis)
    })()

    return () => {
      dibatalkan = true
    }
  }, [muatan, nominal])

  /**
   * Menggeser kodenya ke tengah layar begitu ia siap.
   *
   * Kartu ini muncul di bawah pilihan cara bayar, dan bagian bawahnya
   * jatuh persis di balik bilah tombol yang menempel di dasar layar.
   * Ketahuan oleh uji asap yang memindai balik gambar di layar: seperempat
   * bagian bawah kodenya tertutup bilah itu, dan QR yang terpotong tidak
   * bisa dibaca sama sekali — bukan "agak susah", melainkan gagal total.
   *
   * Menggesernya sendiri juga yang benar untuk pemakaiannya: sesudah
   * memilih QRIS, gerakan berikutnya adalah memutar HP ke arah pembeli —
   * bukan menggulir layar.
   */
  useEffect(() => {
    if (!svg) return
    kartu.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [svg])

  // Masih membaca dari IndexedDB. Tidak menampilkan apa pun lebih baik
  // daripada mengedipkan ajakan memasang QRIS yang lalu hilang sendiri.
  if (muatan === undefined) return null

  if (!muatan) {
    return (
      <Link href="/qris" className="kartu-tekan flex items-center gap-3 animate-naik">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl
                     bg-merek-50 text-merek-700"
        >
          <Ikon nama="qris" ukuran={22} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Pasang QRIS usaha</span>
          <span className="block text-sm text-slate-500">
            Sekali saja — pakai QRIS yang sudah ada
          </span>
        </span>
        <Ikon nama="lanjut" ukuran={20} className="shrink-0 text-slate-300" />
      </Link>
    )
  }

  return (
    <section ref={kartu} className="kartu animate-naik text-center">
      <p className="text-sm text-slate-500">Pembeli memindai ini</p>
      <p className="text-2xl font-bold">
        <Uang nilai={nominal} />
      </p>

      {/* Selebar kartunya, bukan dibatasi kecil. QR yang lebih besar
          lebih cepat dikunci kamera pembeli, dan layar ini memang tidak
          punya apa pun yang lebih pantas mendapat ruangnya. */}
      <div className="mx-auto mt-3 w-full max-w-[20rem] [&>svg]:h-auto [&>svg]:w-full">
        {svg ? (
          // Isinya cuma jalur gambar hasil penyandi QR, bukan teks dari
          // luar — tidak ada markah yang bisa ikut terbawa.
          <div id="qris-qr" dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <div className="aspect-square w-full animate-pulse rounded-2xl bg-slate-100" />
        )}
      </div>

      {dinamis ? (
        <p className="mt-3 text-sm text-slate-500">
          Nominalnya sudah terisi. Pembeli tinggal membayar.
        </p>
      ) : (
        // Kegagalan yang jujur: kodenya tetap tampil, tapi pembeli harus
        // mengetik sendiri. Jauh lebih baik daripada layar galat saat ada
        // orang menunggu.
        <p className="mt-3 text-sm font-semibold text-tunggu">
          Nominalnya tidak bisa diisikan — pembeli mengetik sendiri{' '}
          <Uang nilai={nominal} />.
        </p>
      )}

      <p className="mt-2 text-sm text-slate-500">
        Setelah uangnya masuk ke rekening, tekan tombol di bawah.
      </p>

      <Link href="/qris" className="mt-3 inline-block text-sm font-semibold text-merek-700">
        Ganti QRIS
      </Link>
    </section>
  )
}
