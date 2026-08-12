'use client'

import { useState } from 'react'
import { Ikon } from './Ikon'

/**
 * Layar yang muncul kalau ada yang benar-benar rusak.
 *
 * Sebelum ini tidak ada sama sekali, jadi yang tergambar adalah layar
 * bawaan Next.js — di produksi bunyinya *"Application error: a
 * client-side exception has occurred"*, dengan latar putih kosong dan
 * tanpa satu pun tombol. Bagi yang membacanya sambil ada pembeli
 * menunggu, kalimat itu berarti satu hal: **catatan saya hilang.**
 *
 * Tiga hal yang harus ada di layar ini, dan urutannya sengaja:
 *
 * 1. **Jaminan lebih dulu, sebelum penjelasan apa pun.** Yang paling
 *    ditakutkan bukan aplikasinya rusak melainkan catatannya ikut rusak.
 *    Dan jaminannya benar: sumber kebenarannya IndexedDB, yang tidak
 *    tersentuh oleh galat saat menggambar layar.
 * 2. **Jalan keluar.** Tombol buka-lagi memakai `reset()` dari Next.js —
 *    ia menggambar ulang cabang yang gagal tanpa memuat ulang seluruh
 *    aplikasi.
 * 3. **Sekoci.** Kalau rusaknya berulang, buka-lagi tidak menolong, dan
 *    unduh-semua-ke-Excel jadi satu-satunya cara mengeluarkan catatannya
 *    dari HP itu. Inilah alasan tombol itu ada di sini dan bukan cuma di
 *    layar laporan — layar laporan mungkin justru yang sedang rusak.
 *
 * Yang **tidak** ditampilkan: jejak tumpukan dan pesan galat aslinya.
 * Keduanya tidak bisa ditindaklanjuti pemiliknya dan cuma menegaskan
 * kesan bahwa yang di depannya sudah tidak bisa diselamatkan. Yang asli
 * tetap ditulis ke konsol, tempat ia memang berguna.
 */

interface Props {
  readonly galat: Error & { digest?: string }
  readonly ulangi?: () => void
}

export function LayarGalat({ galat, ulangi }: Props) {
  const [mengunduh, setMengunduh] = useState(false)
  const [gagalUnduh, setGagalUnduh] = useState(false)

  async function unduh() {
    setMengunduh(true)
    setGagalUnduh(false)
    try {
      // Diimpor di sini, bukan di atas berkas. Layar ini harus tetap
      // tergambar walau modul ekspornya sendiri yang gagal dimuat — dan
      // pada layar yang gunanya menangani kerusakan, itu bukan
      // kemungkinan yang boleh diabaikan.
      const { eksporSemua } = await import('@/lib/export/ekspor')
      const { db, getMeta, BUSINESS_NAME_KEY } = await import('@/lib/db/local')
      const nama = (await getMeta<string>(db(), BUSINESS_NAME_KEY)) ?? 'Usaha'
      await eksporSemua(nama)
    } catch {
      setGagalUnduh(true)
    } finally {
      setMengunduh(false)
    }
  }

  return (
    <main className="layar flex flex-1 flex-col justify-center gap-4 p-4">
      <div className="kartu animate-naik">
        <span
          className="flex h-12 w-12 items-center justify-center rounded-kartu
                     bg-tunggu-soft text-tunggu"
        >
          <Ikon nama="peringatan" ukuran={24} />
        </span>

        <p className="mt-3 text-xl font-bold">Catatannya aman</p>
        <p className="mt-1 text-slate-600">
          Ada yang tidak beres di layar ini, tapi seluruh katalog, penjualan,
          dan pembukuan tetap tersimpan di HP ini. Tidak ada yang hilang.
        </p>
      </div>

      {ulangi && (
        <button type="button" onClick={ulangi} className="btn-primer btn-besar">
          Buka lagi
        </button>
      )}

      <div className="kartu">
        <p className="font-semibold">Kalau masih tidak beres juga</p>
        <p className="mt-1 text-slate-600">
          Unduh dulu semua catatannya ke satu berkas Excel, supaya ia keluar
          dari HP ini apa pun yang terjadi berikutnya.
        </p>
        <button
          type="button"
          disabled={mengunduh}
          onClick={() => void unduh()}
          className="btn-sekunder mt-3 w-full"
        >
          <Ikon nama="unduh" ukuran={20} />
          {mengunduh ? 'Menyiapkan…' : 'Unduh semua ke Excel'}
        </button>

        {gagalUnduh && (
          <p role="alert" className="mt-3 font-semibold text-keluar">
            Unduhannya juga gagal. Jangan hapus aplikasi ini dan jangan
            bersihkan data peramban — catatannya masih ada di dalam, dan masih
            bisa diambil nanti.
          </p>
        )}
      </div>

      {/* Kode ringkas untuk dilaporkan. Bukan pesan galatnya — ini
          disediakan Next.js justru supaya yang asli tidak perlu
          ditampilkan. */}
      {galat.digest && (
        <p className="text-center text-sm text-slate-400">Kode: {galat.digest}</p>
      )}
    </main>
  )
}
