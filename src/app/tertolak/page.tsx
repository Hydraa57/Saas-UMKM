'use client'

import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db/local'
import { discardFailed, failedItems, retryFailed } from '@/lib/sync/outbox'
import { rupaAntrean } from '@/lib/sync/rupa'
import { pesanGalat } from '@/lib/galat'
import { AppBar } from '@/components/AppBar'
import { Ikon } from '@/components/Ikon'
import { formatLocalDate, toLocalDate } from '@/lib/domain/dates'

/**
 * Catatan yang ditolak peladen.
 *
 * Sampai layar ini ada, beranda menampilkan *"3 catatan ditolak — perlu
 * diperiksa"* lalu mengantar ke layar cadangan, yang tidak menyebut
 * catatan tertolak sama sekali. Kabar buruk tanpa jalan keluar, dan
 * itulah bentuk pesan galat yang paling cepat membuat orang berhenti
 * membaca peringatan apa pun dari aplikasi ini. `retryFailed` dan
 * `discardFailed` sudah ada di kode sejak lama dan tidak pernah dipanggil
 * dari layar mana pun.
 *
 * ## Yang harus benar-benar jelas di sini
 *
 * **Catatannya sendiri tidak ke mana-mana.** Yang tertolak adalah
 * *pengirimannya*, bukan penjualannya. Struk yang sudah tercetak tetap
 * ada, stoknya tetap berkurang, buku kasnya tetap terisi — semuanya di
 * IndexedDB, dan tidak satu pun tombol di layar ini menyentuhnya.
 * Membuang berarti berhenti mencoba mengirim, bukan menghapus.
 *
 * Kalau itu tidak dinyatakan terang-terangan, tombol "Buang" jadi tombol
 * yang tidak akan pernah ditekan siapa pun — dan peringatan yang tidak
 * bisa dituntaskan akan menetap di beranda selamanya sampai ia berhenti
 * dilihat.
 *
 * **Sebabnya ditulis dengan bahasa manusia.** `last_error` isinya pesan
 * Postgres berbahasa Inggris; yang ditampilkan hasil terjemahannya.
 */

export default function Tertolak() {
  const gagal = useLiveQuery(() => failedItems(db()), [], undefined)
  const [sibuk, setSibuk] = useState(false)
  const [konfirmasiBuang, setKonfirmasiBuang] = useState<string | null>(null)

  async function cobaLagi(id?: string) {
    setSibuk(true)
    try {
      await retryFailed(db(), id ? [id] : undefined)
    } finally {
      setSibuk(false)
    }
  }

  async function buang(id: string) {
    setSibuk(true)
    try {
      await discardFailed(db(), [id])
      setKonfirmasiBuang(null)
    } finally {
      setSibuk(false)
    }
  }

  if (gagal === undefined) {
    return <main className="layar flex-1 p-4" aria-busy="true" />
  }

  if (gagal.length === 0) {
    return (
      <main className="layar flex flex-1 flex-col justify-center gap-4 p-4">
        <div className="kartu text-center">
          <span
            className="mx-auto flex h-12 w-12 items-center justify-center rounded-kartu
                       bg-masuk-soft text-masuk"
          >
            <Ikon nama="cek" ukuran={24} tebal={2.4} />
          </span>
          <p className="mt-3 font-semibold">Tidak ada yang tertolak</p>
          <p className="mt-1 text-slate-600">Semua catatan sudah terkirim.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="layar flex flex-1 flex-col gap-3 px-4 pb-8">
      <AppBar judul="Catatan yang ditolak" kembali="/" />

      <div className="kartu">
        <p className="font-semibold">Catatannya tetap ada di HP ini</p>
        <p className="mt-1 text-slate-600">
          Yang gagal adalah pengirimannya, bukan catatannya. Struk, stok, dan
          buku kasnya tetap seperti semula — yang belum terjadi cuma
          penyalinannya ke peladen, jadi kalau HP ini hilang, yang ini saja yang
          tidak ikut kembali.
        </p>
      </div>

      {gagal.length > 1 && (
        <button
          type="button"
          disabled={sibuk}
          onClick={() => void cobaLagi()}
          className="btn-sekunder"
        >
          Coba kirim ulang semuanya
        </button>
      )}

      {gagal.map((item) => {
        const rupa = rupaAntrean(item)
        const membuang = konfirmasiBuang === item.id

        return (
          <section key={item.id} className="kartu animate-naik">
            <p className="font-semibold">{rupa.judul}</p>
            {rupa.rincian && (
              <p className="text-sm text-slate-500">{rupa.rincian}</p>
            )}
            <p className="mt-1 text-sm text-slate-500">
              {formatLocalDate(toLocalDate(item.created_at))}
            </p>

            <p className="mt-3 rounded-kartu-kecil bg-keluar-soft px-3 py-2 text-sm text-keluar">
              {pesanGalat({ message: item.last_error })}
            </p>

            {membuang ? (
              <div className="mt-3 flex flex-col gap-2">
                <p className="font-semibold">
                  Berhenti mencoba mengirim catatan ini?
                </p>
                <p className="text-sm text-slate-600">
                  Catatannya tetap ada di HP dan tetap ikut dihitung di laporan
                  maupun ekspor Excel. Yang hilang cuma salinannya di peladen.
                </p>
                <button
                  type="button"
                  disabled={sibuk}
                  onClick={() => void buang(item.id)}
                  className="btn-bahaya"
                >
                  Ya, berhenti mengirim
                </button>
                <button
                  type="button"
                  onClick={() => setKonfirmasiBuang(null)}
                  className="btn-sekunder"
                >
                  Batal
                </button>
              </div>
            ) : (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={sibuk}
                  onClick={() => setKonfirmasiBuang(item.id)}
                  className="btn-sekunder flex-1"
                >
                  Buang
                </button>
                <button
                  type="button"
                  disabled={sibuk}
                  onClick={() => void cobaLagi(item.id)}
                  className="btn-primer flex-1"
                >
                  Coba lagi
                </button>
              </div>
            )}
          </section>
        )
      })}
    </main>
  )
}
