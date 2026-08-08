'use client'

import { useState } from 'react'
import { actionContext, useApp } from '@/lib/useApp'
import { recordExpense } from '@/lib/actions/pos'
import * as M from '@/lib/money'
import type { Rupiah } from '@/lib/money'
import { PapanAngka } from '@/components/PapanAngka'
import { Uang } from '@/components/Uang'
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
        <a href="/mulai" className="btn-aksi justify-center bg-slate-900 text-white">
          Buka pengaturan
        </a>
      </main>
    )
  }

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 pb-28">
      <header className="flex items-center gap-3">
        <a
          href="/"
          aria-label="Kembali"
          className="flex h-touch w-touch items-center justify-center rounded-xl
                     bg-slate-200 text-2xl text-slate-700"
        >
          ←
        </a>
        <h1 className="text-xl font-bold">Uang Keluar</h1>
      </header>

      <div className="kartu">
        <p className="text-sm text-slate-500">Jumlah</p>
        <p className="text-money-lg text-keluar">
          <Uang nilai={jumlah} />
        </p>
      </div>

      <PapanAngka
        nilai={jumlah}
        onChange={setJumlah}
        pintasan={[5_000, 10_000, 20_000, 50_000]}
      />

      <section>
        <h2 className="mb-2 text-sm text-slate-500">Untuk apa</h2>
        <div className="flex flex-wrap gap-2">
          {EXPENSE_CATEGORIES.map((pilihan) => (
            <button
              key={pilihan}
              type="button"
              aria-pressed={kategori === pilihan}
              onClick={() => setKategori(pilihan)}
              className={`min-h-touch rounded-xl px-5 font-semibold ${
                kategori === pilihan
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700 shadow-sm'
              }`}
            >
              {CATEGORY_LABELS[pilihan]}
            </button>
          ))}
        </div>
      </section>

      <label className="kartu block">
        <span className="text-sm text-slate-500">Catatan (boleh kosong)</span>
        <input
          type="text"
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          placeholder="Gas 3 kg"
          className="mt-1 w-full bg-transparent text-lg outline-none"
        />
      </label>

      <div
        className="fixed inset-x-0 bottom-0 mx-auto max-w-md border-t border-slate-200
                   bg-slate-50/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur"
      >
        <button
          type="button"
          disabled={!bisaSimpan}
          onClick={simpan}
          className="btn-aksi justify-center bg-slate-900 text-white
                     disabled:bg-slate-300 disabled:text-slate-500"
        >
          Simpan
        </button>
      </div>
    </main>
  )
}
