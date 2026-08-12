'use client'

import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, USAHA_BENTROK_KEY, setMeta } from '@/lib/db/local'
import { pendingCount } from '@/lib/sync/outbox'
import { pakaiUsahaPeladen, type UsahaPeladen } from '@/lib/tenant'
import { Ikon } from './Ikon'

/**
 * Perangkat dan akun memegang usaha yang berbeda.
 *
 * Aplikasinya berhenti di sini dan bertanya, alih-alih memilih sendiri.
 * Dua-duanya kehilangan sesuatu, dan yang kehilangan itu bukan saya:
 *
 * - Memakai usaha dari akun berarti catatan di HP ini yang belum
 *   terkirim hilang.
 * - Menahan catatan HP ini berarti akun yang sama memiliki **dua**
 *   warung yang tidak saling melihat — dan itu persis kerusakan yang
 *   membuat layar ini ada.
 *
 * Karena itu jumlah catatan yang belum terkirim disebutkan angkanya.
 * Konfirmasi tanpa angka adalah konfirmasi yang selalu ditekan tanpa
 * dibaca.
 */

interface Bentrok {
  lokal: string
  peladen: UsahaPeladen
}

export function PilihUsaha({ bentrok }: { bentrok: Bentrok }) {
  const belumTerkirim = useLiveQuery(() => pendingCount(db()), [], 0)
  const [sibuk, setSibuk] = useState(false)

  async function pakaiPeladen() {
    setSibuk(true)
    await pakaiUsahaPeladen(db(), bentrok.peladen)
    await setMeta(db(), USAHA_BENTROK_KEY, null)
    // Muat ulang penuh: seluruh basis data lokal baru saja dikosongkan,
    // dan tidak ada satu pun keadaan di memori yang layak dipertahankan.
    window.location.replace('/')
  }

  async function tahanLokal() {
    setSibuk(true)
    await setMeta(db(), USAHA_BENTROK_KEY, null)
    window.location.replace('/')
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
        <p className="mt-3 text-xl font-bold">Ada dua usaha</p>
        <p className="mt-1 text-slate-600">
          Akun ini sudah punya usaha bernama{' '}
          <span className="font-semibold">{bentrok.peladen.nama}</span>, tapi HP
          ini menyimpan catatan usaha yang lain. Keduanya tidak bisa digabung
          sendiri — pilih yang mana yang dipakai.
        </p>
      </div>

      <div className="kartu">
        <p className="font-semibold">Pakai usaha dari akun</p>
        <p className="mt-1 text-slate-600">
          Katalog, penjualan, stok, dan utang dari akun turun ke HP ini.
        </p>
        {belumTerkirim > 0 && (
          <p className="mt-2 font-semibold text-keluar">
            {belumTerkirim} catatan di HP ini belum sempat terkirim, dan akan
            hilang.
          </p>
        )}
        <button
          type="button"
          disabled={sibuk}
          onClick={() => void pakaiPeladen()}
          className="btn-primer mt-3 w-full"
        >
          Pakai {bentrok.peladen.nama}
        </button>
      </div>

      <div className="kartu">
        <p className="font-semibold">Tetap pakai catatan HP ini</p>
        <p className="mt-1 text-slate-600">
          Catatan di HP ini dikirim sebagai usaha <em>kedua</em> di akun yang
          sama. Keduanya tetap terpisah dan tidak saling melihat — pilih ini
          hanya kalau memang dua usaha yang berbeda.
        </p>
        <button
          type="button"
          disabled={sibuk}
          onClick={() => void tahanLokal()}
          className="btn-sekunder mt-3 w-full"
        >
          Tetap pakai yang di HP ini
        </button>
      </div>
    </main>
  )
}
