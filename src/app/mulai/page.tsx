'use client'

import { useState } from 'react'
import { db } from '@/lib/db/local'
import { setupTenant } from '@/lib/actions/setup'
import {
  BUSINESS_TYPE_HINTS,
  BUSINESS_TYPE_LABELS,
  type BusinessType,
} from '@/lib/domain/types'

/**
 * Pengaturan awal.
 *
 * Satu layar, tiga pertanyaan, dan hanya yang pertama yang wajib
 * dijawab. Tiap pertanyaan tambahan di sini adalah gerbang sebelum
 * manfaat pertama terasa — dan di situlah orang berhenti.
 *
 * Yang sengaja **tidak** ditanyakan: daftar produk, harga, stok, modal
 * awal, dompet. Semuanya bisa tumbuh dari pemakaian, dan menanyakannya
 * di awal berarti meminta pengguna menyiapkan sesuatu sebelum dia tahu
 * aplikasinya berguna atau tidak.
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
  const [bukuRumah, setBukuRumah] = useState(true)
  const [menyimpan, setMenyimpan] = useState(false)

  const bisaLanjut = nama.trim().length > 0 && !menyimpan

  async function mulai() {
    if (!bisaLanjut) return
    setMenyimpan(true)
    try {
      await setupTenant(
        { db: db() },
        { name: nama, businessType: jenis, householdBook: bukuRumah },
      )
      window.location.href = '/'
    } catch {
      setMenyimpan(false)
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-5 p-4 pb-8">
      <header>
        <h1 className="text-xl font-bold">Selamat datang</h1>
        <p className="text-slate-600">
          Tiga pertanyaan, lalu langsung bisa mencatat.
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

      {/* Menyala secara bawaan: mayoritas usaha mikro belum memisahkan
          uang usaha dari uang rumah tangga, dan bagi merekalah buku ini
          paling berguna. Yang keuangannya sudah terpisah bisa
          mematikannya. */}
      <button
        type="button"
        role="switch"
        aria-checked={bukuRumah}
        onClick={() => setBukuRumah((nyala) => !nyala)}
        className="kartu flex items-center gap-4 text-left"
      >
        <span
          aria-hidden
          className={`flex h-8 w-14 shrink-0 items-center rounded-full p-1 transition ${
            bukuRumah ? 'bg-slate-900' : 'bg-slate-300'
          }`}
        >
          <span
            className={`h-6 w-6 rounded-full bg-white transition ${
              bukuRumah ? 'translate-x-6' : ''
            }`}
          />
        </span>
        <span>
          <span className="block font-semibold">Catat belanja rumah juga</span>
          <span className="block text-sm text-slate-500">
            Supaya uang usaha tidak tercampur dengan uang belanja
          </span>
        </span>
      </button>

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
