'use client'

import { useState } from 'react'
import { db } from '@/lib/db/local'
import { setupTenant } from '@/lib/actions/pos'
import {
  BUSINESS_TYPE_HINTS,
  BUSINESS_TYPE_LABELS,
  type BusinessType,
} from '@/lib/domain/types'

/**
 * Pengaturan awal.
 *
 * Satu layar, dan hanya nama usaha yang wajib. Tiap pertanyaan tambahan
 * di sini adalah gerbang sebelum manfaat pertama terasa — dan di situlah
 * orang berhenti.
 *
 * Yang sengaja **tidak** ditanyakan: daftar barang, harga, stok, modal
 * awal, dompet. Katalog memang inti aplikasinya, tapi mengisinya di
 * layar pembuka berarti meminta orang mengetik dua puluh barang sebelum
 * dia tahu kasirnya berguna atau tidak. Katalog tumbuh dari layar
 * katalog, dan barang pertama bisa ditambahkan dari dalam kasir.
 *
 * Nomor WhatsApp diminta di sini karena dia muncul di kepala struk. Boleh
 * dikosongkan — struk tanpa nomor tetap sah.
 */

const JENIS: readonly BusinessType[] = [
  'dagang',
  'makanan',
  'jasa',
  'campuran',
  'lainnya',
]

export default function Mulai() {
  const [nama, setNama] = useState('')
  const [jenis, setJenis] = useState<BusinessType>('dagang')
  const [telepon, setTelepon] = useState('')
  const [menyimpan, setMenyimpan] = useState(false)

  const bisaLanjut = nama.trim().length > 0 && !menyimpan

  async function mulai() {
    if (!bisaLanjut) return
    setMenyimpan(true)
    try {
      await setupTenant(
        { db: db() },
        { name: nama, businessType: jenis, phone: telepon || null },
      )
      // Langsung ke katalog, bukan ke beranda: tanpa satu pun barang,
      // kasirnya kosong dan beranda cuma menampilkan angka nol.
      window.location.href = '/katalog?awal=1'
    } catch {
      setMenyimpan(false)
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-5 p-4 pb-8">
      <header>
        <h1 className="text-xl font-bold">Selamat datang</h1>
        <p className="text-slate-600">
          Isi nama usaha, lalu langsung bisa jualan.
        </p>
      </header>

      <label className="kartu block">
        <span className="text-sm text-slate-500">Nama usaha</span>
        <input
          type="text"
          value={nama}
          onChange={(event) => setNama(event.target.value)}
          placeholder="Warung Bu Ani"
          autoFocus
          className="mt-1 w-full bg-transparent text-lg outline-none"
        />
      </label>

      <section>
        <h2 className="mb-2 text-sm text-slate-500">Jenis usaha</h2>
        <div className="flex flex-col gap-2">
          {JENIS.map((pilihan) => (
            <button
              key={pilihan}
              type="button"
              aria-pressed={jenis === pilihan}
              onClick={() => setJenis(pilihan)}
              className={`min-h-touch rounded-xl px-4 py-3 text-left transition ${
                jenis === pilihan
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-800 shadow-sm'
              }`}
            >
              <span className="block font-semibold">
                {BUSINESS_TYPE_LABELS[pilihan]}
              </span>
              <span
                className={`block text-sm ${
                  jenis === pilihan ? 'text-slate-300' : 'text-slate-500'
                }`}
              >
                {BUSINESS_TYPE_HINTS[pilihan]}
              </span>
            </button>
          ))}
        </div>
      </section>

      <label className="kartu block">
        <span className="text-sm text-slate-500">
          Nomor WhatsApp untuk struk (boleh kosong)
        </span>
        <input
          type="tel"
          inputMode="tel"
          value={telepon}
          onChange={(event) => setTelepon(event.target.value)}
          placeholder="08xxxxxxxxxx"
          className="mt-1 w-full bg-transparent text-lg outline-none"
        />
      </label>

      <button
        type="button"
        disabled={!bisaLanjut}
        onClick={mulai}
        className="btn-aksi justify-center bg-slate-900 text-white
                   disabled:bg-slate-300 disabled:text-slate-500"
      >
        Mulai
      </button>
    </main>
  )
}
