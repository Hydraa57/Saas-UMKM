'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { db } from '@/lib/db/local'
import { setupTenant } from '@/lib/actions/pos'
import {
  BUSINESS_TYPE_HINTS,
  BUSINESS_TYPE_LABELS,
  type BusinessType,
} from '@/lib/domain/types'
import { Ikon } from '@/components/Ikon'

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
  const router = useRouter()
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
      router.replace('/katalog?awal=1')
    } catch {
      setMenyimpan(false)
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-5 p-4 pb-32">
      <header className="animate-naik pt-4">
        <span
          className="mb-4 flex h-14 w-14 items-center justify-center rounded-kartu
                     bg-merek-600 text-white"
        >
          <Ikon nama="kasir" ukuran={26} tebal={1.9} />
        </span>
        <h1 className="text-2xl font-bold">Selamat datang</h1>
        <p className="mt-1 text-slate-600">
          Isi nama usaha, lalu langsung bisa jualan.
        </p>
      </header>

      <label className="kartu block">
        <span className="label">Nama usaha</span>
        <input
          type="text"
          value={nama}
          onChange={(event) => setNama(event.target.value)}
          placeholder="Warung Bu Ani"
          autoFocus
          className="kolom mt-1 text-xl font-semibold"
        />
      </label>

      <section>
        <h2 className="label mb-2">Jenis usaha</h2>
        <div className="flex flex-col gap-2">
          {JENIS.map((pilihan) => (
            <button
              key={pilihan}
              type="button"
              aria-pressed={jenis === pilihan}
              onClick={() => setJenis(pilihan)}
              className={`flex min-h-touch items-center gap-3 rounded-kartu px-4 py-3
                          text-left transition active:scale-[0.985] ${
                            jenis === pilihan
                              ? 'bg-merek-600 text-white'
                              : 'bg-white text-slate-800 border border-garis'
                          }`}
            >
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">
                  {BUSINESS_TYPE_LABELS[pilihan]}
                </span>
                <span
                  className={`block text-sm ${
                    jenis === pilihan ? 'text-merek-100' : 'text-slate-500'
                  }`}
                >
                  {BUSINESS_TYPE_HINTS[pilihan]}
                </span>
              </span>
              {jenis === pilihan && <Ikon nama="cek" ukuran={20} tebal={2.4} />}
            </button>
          ))}
        </div>
      </section>

      <label className="kartu block">
        <span className="label">Nomor WhatsApp untuk struk (boleh kosong)</span>
        <input
          type="tel"
          inputMode="tel"
          value={telepon}
          onChange={(event) => setTelepon(event.target.value)}
          placeholder="08xxxxxxxxxx"
          className="kolom mt-1"
        />
      </label>

      <div className="bilah-bawah">
        <button
          type="button"
          disabled={!bisaLanjut}
          onClick={mulai}
          className="btn-primer btn-besar"
        >
          Mulai
        </button>
      </div>
    </main>
  )
}
