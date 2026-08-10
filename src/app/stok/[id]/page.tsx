'use client'

import { use, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db/local'
import { actionContext, toItem, useApp } from '@/lib/useApp'
import { adjustStock } from '@/lib/actions/pos'
import { isBarang, STOCK_REASON_LABELS, type Barang, type StockMovement } from '@/lib/domain/types'
import { selisihHitung, statusStok, stokDariMutasi } from '@/lib/domain/stock'
import { formatLocalDate, toLocalDate } from '@/lib/domain/dates'

/**
 * Satu barang: sisa stok, riwayat pergerakannya, dan koreksi hitung
 * fisik.
 *
 * Riwayatnya ada di sini bukan sebagai kelengkapan, tapi karena itu satu-
 * satunya cara **selisih stok bisa dijelaskan, bukan cuma diperbaiki.**
 * Angka yang tidak bisa dijelaskan asalnya akan berhenti dipercaya, lalu
 * berhenti dipakai — dan yang paling sering tidak cocok adalah stok.
 *
 * Karena itu juga yang dicatat saat koreksi adalah **selisihnya**, bukan
 * angka akhirnya: penjumlahan seluruh mutasi harus tetap sama dengan
 * angka yang tampil, supaya pemeriksaannya masih mungkin bulan depan.
 */

export default function DetailStok({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>
}) {
  const { id } = use(params)
  const { tenantId, ready } = useApp()

  const [hitung, setHitung] = useState('')
  const [catatan, setCatatan] = useState('')
  const [menyimpan, setMenyimpan] = useState(false)

  const data = useLiveQuery(async () => {
    const row = await db().items.get(id)
    if (!row) return null

    const item = toItem(row)
    if (!isBarang(item)) return { item: null as Barang | null, jasa: true, mutasi: [] }

    const mutasi = (await db().stockMovements.toArray())
      .filter((m) => m.item_id === id)
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
      .map(
        (m): StockMovement => ({
          id: m.id,
          itemId: m.item_id,
          occurredAt: m.occurred_at,
          qtyChange: m.qty_change,
          reason: m.reason as StockMovement['reason'],
          note: m.note,
        }),
      )

    return { item, jasa: false, mutasi }
  }, [id])

  async function koreksi() {
    if (!tenantId || hitung === '' || menyimpan) return
    setMenyimpan(true)
    try {
      await adjustStock(actionContext(tenantId), id, Number(hitung), catatan || undefined)
      setHitung('')
      setCatatan('')
    } finally {
      setMenyimpan(false)
    }
  }

  if (!ready || data === undefined) {
    return <main className="flex-1 p-4" aria-busy="true" />
  }

  if (data === null || data.jasa || !data.item) {
    return (
      <main className="flex flex-1 flex-col gap-4 p-4">
        <p className="kartu">
          {data?.jasa
            ? 'Jasa tidak punya stok — "Potong celana" tidak pernah habis.'
            : 'Barang tidak ditemukan.'}
        </p>
        <a href="/stok" className="btn-aksi justify-center bg-slate-200 text-slate-900">
          Kembali
        </a>
      </main>
    )
  }

  const item = data.item
  const status = statusStok(item)
  const dariMutasi = stokDariMutasi(data.mutasi)
  const selisih = hitung === '' ? null : selisihHitung(item, Number(hitung))

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 pb-8">
      <header className="flex items-center gap-3">
        <a
          href="/stok"
          aria-label="Kembali"
          className="flex h-touch w-touch items-center justify-center rounded-xl
                     bg-slate-200 text-2xl text-slate-700"
        >
          ←
        </a>
        <h1 className="min-w-0 flex-1 truncate text-xl font-bold">{item.name}</h1>
      </header>

      <div className="kartu">
        <p className="text-sm text-slate-500">Sisa menurut aplikasi</p>
        <p
          className={`text-money ${
            status === 'habis'
              ? 'text-keluar'
              : status === 'menipis'
                ? 'text-tunggu'
                : ''
          }`}
        >
          {item.stockQty} {item.unit}
        </p>
        {item.minStock > 0 && (
          <p className="mt-1 text-sm text-slate-500">
            Diingatkan saat tinggal {item.minStock} {item.unit}
          </p>
        )}

        {/* Rollup yang disimpan diperiksa terhadap penjumlahan mutasinya.
            Kalau berbeda, yang benar adalah mutasinya — itu yang punya
            asal-usul — dan pemiliknya perlu tahu sebelum dia berangkat
            kulakan dengan angka yang salah. */}
        {dariMutasi !== item.stockQty && (
          <p className="mt-3 rounded-xl bg-tunggu-soft p-3 text-sm text-tunggu">
            Penjumlahan riwayat menghasilkan {dariMutasi} {item.unit}, berbeda
            dari angka di atas. Hitung fisik lalu koreksi di bawah.
          </p>
        )}
      </div>

      <section className="kartu">
        <h2 className="text-sm text-slate-500">Koreksi dari hitung fisik</h2>
        <label className="mt-2 block">
          <span className="text-sm text-slate-600">
            Jumlah sebenarnya di rak
          </span>
          <input
            type="number"
            inputMode="decimal"
            value={hitung}
            onChange={(e) => setHitung(e.target.value)}
            placeholder={String(item.stockQty)}
            className="mt-1 w-full bg-transparent text-2xl font-bold outline-none"
          />
        </label>

        {selisih !== null && selisih !== 0 && (
          <p className={`mt-2 ${selisih > 0 ? 'text-masuk' : 'text-keluar'}`}>
            Selisih {selisih > 0 ? '+' : ''}
            {selisih} {item.unit}
            {selisih < 0 && ' — ada yang keluar tanpa tercatat'}
          </p>
        )}
        {selisih === 0 && (
          <p className="mt-2 text-slate-600">Cocok, tidak ada yang perlu dikoreksi.</p>
        )}

        <label className="mt-3 block">
          <span className="text-sm text-slate-600">Keterangan (boleh kosong)</span>
          <input
            type="text"
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            placeholder="Ada yang rusak"
            className="mt-1 w-full bg-transparent text-lg outline-none"
          />
        </label>

        <button
          type="button"
          disabled={hitung === '' || selisih === 0 || menyimpan}
          onClick={koreksi}
          className="btn-aksi mt-4 justify-center bg-slate-900 text-white
                     disabled:bg-slate-300 disabled:text-slate-500"
        >
          Simpan koreksi
        </button>
      </section>

      <section>
        <h2 className="mb-2 text-sm text-slate-500">Riwayat pergerakan</h2>
        {data.mutasi.length === 0 ? (
          <p className="kartu text-slate-600">
            Belum ada pergerakan. Stok berubah lewat penjualan, kulakan, dan
            koreksi.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.mutasi.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">
                    {STOCK_REASON_LABELS[m.reason]}
                  </span>
                  <span className="block text-sm text-slate-500">
                    {formatLocalDate(toLocalDate(m.occurredAt))}
                    {m.note ? ` · ${m.note}` : ''}
                  </span>
                </span>
                <span
                  className={`text-lg font-bold ${
                    m.qtyChange > 0 ? 'text-masuk' : 'text-keluar'
                  }`}
                >
                  {m.qtyChange > 0 ? '+' : ''}
                  {m.qtyChange}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
