'use client'

import { useState } from 'react'
import { actionContext, useApp } from '@/lib/useApp'
import { recordExpense } from '@/lib/actions/pos'
import * as M from '@/lib/money'
import type { Rupiah } from '@/lib/money'
import { PapanAngka } from '@/components/PapanAngka'
import { Uang } from '@/components/Uang'
import { AppBar } from '@/components/AppBar'
import { Ikon } from '@/components/Ikon'
import {
  CATEGORY_LABELS,
  EXPENSE_CATEGORIES,
  type Category,
} from '@/lib/domain/types'

/**
 * Uang keluar.
 *
 * Semua uang masuk lewat kasir, tapi tidak semua uang keluar lewat
 * kulakan: gas, listrik, ongkos angkut, upah harian. Tanpa layar ini,
 * "sisa bulan ini" di beranda akan selalu terlihat lebih besar daripada
 * yang benar-benar ada di laci — dan angka yang selalu terlalu bagus
 * lebih cepat ditinggalkan daripada angka yang tidak ada sama sekali.
 *
 * Kategori yang lahir dari kasir dan kulakan — penjualan, jasa, modal —
 * sengaja tidak ada di sini. Kalau bisa dipilih manual, buku kas akan
 * punya baris kulakan yang tidak berpasangan dengan kulakan mana pun.
 */

export default function Keluar() {
  const { tenantId, defaultWallet, ready } = useApp()

  const [jumlah, setJumlah] = useState<Rupiah>(M.ZERO)
  const [kategori, setKategori] = useState<Category>('operasional')
  const [catatan, setCatatan] = useState('')
  const [menyimpan, setMenyimpan] = useState(false)

  const bisaSimpan = M.isPositive(jumlah) && !menyimpan

  async function simpan() {
    if (!bisaSimpan || !tenantId || !defaultWallet) return
    setMenyimpan(true)
    try {
      await recordExpense(actionContext(tenantId), {
        walletId: defaultWallet.id,
        amount: jumlah,
        category: kategori,
        note: catatan.trim() || null,
      })
      window.location.href = '/'
    } catch {
      setMenyimpan(false)
    }
  }

  if (!ready) return <main className="flex-1 p-4" aria-busy="true" />

  if (!tenantId || !defaultWallet) {
    return (
      <main className="flex flex-1 flex-col gap-4 p-4">
        <p className="kartu">Pengaturan awal belum selesai.</p>
        <a href="/mulai" className="btn-primer btn-besar">
          Buka pengaturan
        </a>
      </main>
    )
  }

  return (
    <main className="flex flex-1 flex-col gap-3 px-4 pb-32">
      <AppBar judul="Uang Keluar" kembali="/" />

      <div className="kartu-gelap animate-naik">
        <p className="text-sm font-medium text-slate-400">Jumlah</p>
        <p className="text-money mt-1">
          <Uang nilai={jumlah} />
        </p>
      </div>

      <PapanAngka
        nilai={jumlah}
        onChange={setJumlah}
        pintasan={[5_000, 10_000, 20_000, 50_000]}
      />

      <section>
        <h2 className="label mb-2">Untuk apa</h2>
        <div className="grid grid-cols-2 gap-2">
          {EXPENSE_CATEGORIES.map((pilihan) => (
            <button
              key={pilihan}
              type="button"
              aria-pressed={kategori === pilihan}
              onClick={() => setKategori(pilihan)}
              className={`chip ${kategori === pilihan ? 'chip-aktif' : ''}`}
            >
              {CATEGORY_LABELS[pilihan]}
            </button>
          ))}
        </div>
      </section>

      <label className="kartu block">
        <span className="label">Catatan (boleh kosong)</span>
        <input
          type="text"
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          placeholder="Gas 3 kg"
          className="kolom mt-1"
        />
      </label>

      <div className="bilah-bawah">
        <button
          type="button"
          disabled={!bisaSimpan}
          onClick={simpan}
          className="btn-primer btn-besar"
        >
          <Ikon nama="cek" ukuran={22} tebal={2.2} />
          Simpan
        </button>
      </div>
    </main>
  )
}
