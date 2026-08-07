'use client'

import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db/local'
import { actionContext, useApp } from '@/lib/useApp'
import { deleteEntry, recordEntry } from '@/lib/actions/record'
import { dayRange, today } from '@/lib/domain/dates'
import { monthOf, monthlyRecap, formatMonth } from '@/lib/domain/recap'
import { filterByBook, summarizeFlow } from '@/lib/domain/cash'
import * as M from '@/lib/money'
import type { Rupiah } from '@/lib/money'
import { PapanAngka } from '@/components/PapanAngka'
import { Uang } from '@/components/Uang'
import {
  BOOK_LABELS,
  CATEGORIES,
  CATEGORY_LABELS,
  type Book,
  type CashEntry,
  type Category,
} from '@/lib/domain/types'

/**
 * Layar catat.
 *
 * Satu-satunya layar yang dipakai tiap hari, jadi seluruh rancangannya
 * tunduk pada satu ukuran: **satu catatan selesai di bawah 10 detik.**
 *
 * Tiga hal yang membuatnya mungkin:
 *
 * 1. **Pintasan sekali ketuk** mengisi nominal, kategori, dan keterangan
 *    sekaligus. Daftarnya tumbuh sendiri dari pemakaian — tidak ada
 *    katalog yang harus disiapkan lebih dulu.
 * 2. **Papan angka sendiri**, bukan keyboard bawaan yang memakan separuh
 *    layar dan memunculkan huruf yang tidak pernah dibutuhkan.
 * 3. **Tidak pernah menunggu jaringan.** Simpan menulis ke perangkat,
 *    lalu selesai.
 *
 * Dan satu hal yang membuatnya bertahan dipakai: **setelah menyimpan,
 * pengguna langsung melihat totalnya berubah.** Percobaan sebelumnya —
 * bot WhatsApp — gagal justru di sini; ia menerima catatan lalu cuma
 * menjawab "sudah disimpan".
 */

interface Props {
  readonly kind: 'income' | 'expense'
  readonly book: Book
}

type Fase = { tahap: 'isi' } | { tahap: 'tersimpan'; entryId: string; nominal: Rupiah }

/** Nominal yang paling sering diketik, supaya jadi satu ketukan. */
const PINTASAN_NOMINAL = [5_000, 10_000, 20_000, 50_000] as const

export function LayarCatat({ kind, book }: Props) {
  const { tenantId, defaultWallet, ready } = useApp()

  const [nominal, setNominal] = useState<Rupiah>(M.ZERO)
  const [kategori, setKategori] = useState<Category>(
    CATEGORIES[book][kind][0] ?? 'lainnya',
  )
  const [keterangan, setKeterangan] = useState('')
  const [fase, setFase] = useState<Fase>({ tahap: 'isi' })
  const [menyimpan, setMenyimpan] = useState(false)

  const hariIni = today()
  const bulanIni = monthOf(new Date())

  const pintasan = useLiveQuery(
    async () =>
      (await db().quickEntries.toArray())
        .filter(
          (row) => row.book === book && row.kind === kind && !row.archived_at,
        )
        .sort((a, b) => b.use_count - a.use_count)
        .slice(0, 6),
    [book, kind],
  )

  const total = useLiveQuery(async () => {
    const { from, to } = dayRange(hariIni)
    const semua = (await db().cashEntries.toArray()).map(
      (row): CashEntry => ({
        id: row.id,
        walletId: row.wallet_id,
        book: row.book,
        occurredAt: row.occurred_at,
        direction: row.direction,
        amount: M.fromDb(row.amount),
        kind: row.kind,
        category: row.category as Category,
        note: row.note,
        transferGroupId: row.transfer_group_id,
        deletedAt: row.deleted_at,
      }),
    )

    const bukuIni = filterByBook(semua, book)
    const hari = summarizeFlow(
      bukuIni.filter((e) => e.occurredAt >= from && e.occurredAt < to),
    )
    const bulan = monthlyRecap(semua, book).months.find(
      (row) => row.month === bulanIni,
    )

    return {
      hari: kind === 'income' ? hari.income : hari.expense,
      bulan: (kind === 'income' ? bulan?.income : bulan?.expense) ?? M.ZERO,
    }
  }, [book, kind, hariIni, bulanIni])

  const kategoriTersedia = useMemo(() => CATEGORIES[book][kind], [book, kind])
  const bisaSimpan = M.isPositive(nominal) && !menyimpan && Boolean(tenantId)

  async function simpan() {
    if (!bisaSimpan || !tenantId || !defaultWallet) return
    setMenyimpan(true)
    try {
      const { id } = await recordEntry(actionContext(tenantId), {
        walletId: defaultWallet.id,
        book,
        kind,
        amount: nominal,
        category: kategori,
        label: keterangan,
      })
      setFase({ tahap: 'tersimpan', entryId: id, nominal })
      setNominal(M.ZERO)
      setKeterangan('')
    } finally {
      setMenyimpan(false)
    }
  }

  async function urung(entryId: string) {
    if (!tenantId) return
    await deleteEntry(actionContext(tenantId), entryId)
    setFase({ tahap: 'isi' })
  }

  if (!ready) {
    return <main className="flex-1 p-4" aria-busy="true" />
  }

  // Belum ada dompet berarti pengaturan awal belum selesai. Mengarahkan
  // ke sana lebih jujur daripada menampilkan formulir yang pasti gagal.
  if (!tenantId || !defaultWallet) {
    return (
      <main className="flex flex-1 flex-col gap-4 p-4">
        <p className="kartu">Aplikasi belum siap. Selesaikan pengaturan awal dulu.</p>
        <a href="/mulai" className="btn-aksi bg-slate-200 text-slate-900">
          Buka pengaturan
        </a>
      </main>
    )
  }

  // ── Setelah menyimpan ──────────────────────────────────────────────
  //
  // Inilah timbal baliknya: bukan sekadar "tersimpan", tapi angka yang
  // berubah. Itu yang membedakannya dari percobaan sebelumnya.
  if (fase.tahap === 'tersimpan') {
    return (
      <main className="flex flex-1 flex-col gap-4 p-4">
        <div className="kartu text-center">
          <p className="text-4xl" aria-hidden>
            ✓
          </p>
          <p className="mt-2 text-slate-600">
            {kind === 'income' ? 'Masuk' : 'Keluar'}{' '}
            <Uang nilai={fase.nominal} className="font-semibold" />
          </p>
        </div>

        <section className="kartu">
          <div className="flex items-baseline justify-between border-b border-slate-100 pb-3">
            <span className="text-slate-600">Hari ini</span>
            <span className="text-xl font-bold">
              <Uang nilai={total?.hari ?? M.ZERO} />
            </span>
          </div>
          <div className="flex items-baseline justify-between pt-3">
            <span className="text-slate-600">{formatMonth(bulanIni)}</span>
            <span className="text-xl font-bold">
              <Uang nilai={total?.bulan ?? M.ZERO} />
            </span>
          </div>
        </section>

        <button
          type="button"
          onClick={() => setFase({ tahap: 'isi' })}
          className="btn-aksi justify-center bg-slate-900 text-white"
        >
          Catat lagi
        </button>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => urung(fase.entryId)}
            className="min-h-touch flex-1 rounded-xl bg-slate-200 font-semibold text-slate-800"
          >
            Urung
          </button>
          <a
            href="/"
            className="flex min-h-touch flex-1 items-center justify-center
                       rounded-xl bg-slate-200 font-semibold text-slate-800"
          >
            Selesai
          </a>
        </div>
      </main>
    )
  }

  // ── Formulir ───────────────────────────────────────────────────────
  //
  // Tombol simpan menempel di bawah layar, tidak ikut menggulir. Layar
  // ini panjang (pintasan + papan angka + kategori + keterangan), dan
  // kalau menyimpan menuntut menggulir dulu, target "di bawah 10 detik"
  // tidak akan pernah tercapai.
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
        <div>
          <h1 className="text-xl font-bold">
            {kind === 'income' ? 'Uang Masuk' : 'Uang Keluar'}
          </h1>
          <p className="text-sm text-slate-500">{BOOK_LABELS[book]}</p>
        </div>
      </header>

      <div className="kartu">
        <p className="text-sm text-slate-500">Jumlah</p>
        <p
          className={`text-money-lg ${
            kind === 'income' ? 'text-masuk' : 'text-keluar'
          }`}
          aria-live="polite"
        >
          <Uang nilai={nominal} />
        </p>
      </div>

      {pintasan && pintasan.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm text-slate-500">Sering dipakai</h2>
          <div className="grid grid-cols-2 gap-2">
            {pintasan.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  // Mengisi, bukan langsung menyimpan. Salah ketuk pada
                  // aplikasi keuangan lebih mahal daripada satu ketukan
                  // tambahan.
                  if (item.default_amount > 0) {
                    setNominal(M.fromDb(item.default_amount))
                  }
                  setKategori(item.category as Category)
                  setKeterangan(item.label)
                }}
                className="min-h-touch rounded-xl bg-white px-4 py-3 text-left shadow-sm
                           active:bg-slate-100"
              >
                <span className="block font-semibold">{item.label}</span>
                {item.default_amount > 0 && (
                  <span className="block text-sm text-slate-500">
                    {M.format(M.fromDb(item.default_amount))}
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      <PapanAngka nilai={nominal} onChange={setNominal} pintasan={PINTASAN_NOMINAL} />

      <section>
        <h2 className="mb-2 text-sm text-slate-500">Untuk apa</h2>
        <div className="flex flex-wrap gap-2">
          {kategoriTersedia.map((pilihan) => (
            <button
              key={pilihan}
              type="button"
              aria-pressed={kategori === pilihan}
              onClick={() => setKategori(pilihan)}
              className={`min-h-touch rounded-xl px-4 font-semibold transition ${
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
        <span className="text-sm text-slate-500">Keterangan (boleh kosong)</span>
        <input
          type="text"
          value={keterangan}
          onChange={(event) => setKeterangan(event.target.value)}
          placeholder="sayur, tahu, cabai"
          className="mt-1 w-full bg-transparent text-lg outline-none"
        />
      </label>

      <div
        className="fixed inset-x-0 bottom-0 mx-auto max-w-md border-t
                   border-slate-200 bg-slate-50/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]
                   backdrop-blur"
      >
        <button
          type="button"
          disabled={!bisaSimpan}
          onClick={simpan}
          className="btn-aksi justify-center bg-slate-900 text-white
                     disabled:bg-slate-300 disabled:text-slate-500"
        >
          {M.isPositive(nominal) ? `Simpan ${M.format(nominal)}` : 'Simpan'}
        </button>
      </div>
    </main>
  )
}
