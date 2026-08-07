'use client'

import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type LocalCashEntry } from '@/lib/db/local'
import { summarizeFlow, filterByBook, totalBalance } from '@/lib/domain/cash'
import { monthOf, monthlyRecap, formatMonth } from '@/lib/domain/recap'
import { summarizeDebts } from '@/lib/domain/debt'
import { dayRange, today } from '@/lib/domain/dates'
import { fromDb, ZERO } from '@/lib/money'
import { Uang } from '@/components/Uang'
import {
  BOOK_LABELS,
  type Book,
  type CashEntry,
  type Category,
  type Debt,
  type Wallet,
} from '@/lib/domain/types'

/**
 * Beranda.
 *
 * Dua aturan yang membentuknya:
 *
 * **1. Setiap kali pengguna memasukkan sesuatu, dia harus langsung
 * menerima sesuatu.** Percobaan sebelumnya — bot WhatsApp — gagal justru
 * di sini: ia bisa menerima catatan tapi cuma menjawab "sudah disimpan".
 * Untuk tahu pemasukan sebulan, penggunanya tetap harus membuka
 * spreadsheet, dan akhirnya berhenti. Jadi rekap bulan ini ada di layar
 * pertama, bukan di balik menu laporan.
 *
 * **2. Dua buku, dipilih di atas, bukan ditebak dari dompet.** Mayoritas
 * usaha mikro cuma punya satu tempat uang. Kalau bukunya ditentukan
 * dompet, mereka tidak bisa memisahkan apa pun.
 */

const AKSI = [
  { href: '/catat/masuk', ikon: '↓', judul: 'Uang Masuk', warna: 'bg-emerald-100 text-emerald-900' },
  { href: '/catat/keluar', ikon: '↑', judul: 'Uang Keluar', warna: 'bg-red-100 text-red-900' },
] as const

function toEntry(row: LocalCashEntry): CashEntry {
  return {
    id: row.id,
    walletId: row.wallet_id,
    book: row.book,
    occurredAt: row.occurred_at,
    direction: row.direction,
    amount: fromDb(row.amount),
    kind: row.kind,
    category: row.category as Category,
    note: row.note,
    transferGroupId: row.transfer_group_id,
    deletedAt: row.deleted_at,
  }
}

export default function Beranda() {
  const [buku, setBuku] = useState<Book>('usaha')

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined)
    }
  }, [])

  const hariIni = today()
  const bulanIni = monthOf(new Date())

  const data = useLiveQuery(async () => {
    const { from, to } = dayRange(hariIni)
    const semua = (await db().cashEntries.toArray()).map(toEntry)

    const wallets = (await db().wallets.toArray()).map(
      (row): Wallet => ({
        id: row.id,
        name: row.name,
        kind: row.kind,
        defaultBook: row.default_book,
        openingBalance: fromDb(row.opening_balance),
        isDefault: row.is_default,
        archivedAt: row.archived_at,
      }),
    )

    const utang = (await db().debts.toArray()).map(
      (row): Debt => ({
        id: row.id,
        book: row.book,
        side: row.side,
        person: row.person,
        amount: fromDb(row.amount),
        paidAmount: fromDb(row.paid_amount),
        occurredAt: row.occurred_at,
        note: row.note,
        settledAt: row.settled_at,
        deletedAt: row.deleted_at,
      }),
    )

    const hariIniEntries = semua.filter(
      (entry) => entry.occurredAt >= from && entry.occurredAt < to,
    )

    return {
      semua,
      hariIniEntries,
      saldo: totalBalance(wallets, semua),
      piutang: summarizeDebts(utang, 'receivable', hariIni),
    }
  }, [hariIni])

  const hariIniBuku = summarizeFlow(
    filterByBook(data?.hariIniEntries ?? [], buku),
  )
  const rekap = monthlyRecap(data?.semua ?? [], buku)
  const bulan = rekap.months.find((row) => row.month === bulanIni)
  const piutang = data?.piutang

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 pb-8">
      {/* Buku dipilih di sini, bukan ditebak dari dompet — supaya pengguna
          berdompet tunggal tetap bisa memisahkan uang usaha dari uang
          rumah tangga. */}
      <div role="tablist" className="flex gap-2 rounded-2xl bg-slate-200 p-1">
        {(['usaha', 'rumah'] as const).map((pilihan) => (
          <button
            key={pilihan}
            role="tab"
            aria-selected={buku === pilihan}
            onClick={() => setBuku(pilihan)}
            className={`min-h-touch flex-1 rounded-xl font-semibold transition ${
              buku === pilihan ? 'bg-white shadow-sm' : 'text-slate-600'
            }`}
          >
            {BOOK_LABELS[pilihan]}
          </button>
        ))}
      </div>

      <header className="kartu">
        <p className="text-sm text-slate-500">
          {buku === 'usaha' ? 'Masuk hari ini' : 'Keluar hari ini'}
        </p>
        <p
          className={`text-money ${buku === 'usaha' ? 'text-masuk' : 'text-keluar'}`}
        >
          <Uang
            nilai={buku === 'usaha' ? hariIniBuku.income : hariIniBuku.expense}
          />
        </p>
        <p className="mt-1 text-slate-600">
          Uang di tangan{' '}
          <Uang nilai={data?.saldo ?? ZERO} className="font-semibold" />
        </p>
      </header>

      <nav className="flex flex-col gap-3">
        {AKSI.map((aksi) => (
          <a
            key={aksi.href}
            href={`${aksi.href}?buku=${buku}`}
            className={`btn-aksi ${aksi.warna}`}
          >
            <span aria-hidden className="text-3xl">
              {aksi.ikon}
            </span>
            {aksi.judul}
          </a>
        ))}
      </nav>

      {/* Yang hilang dari percobaan sebelumnya, dan yang selama ini
          dihitung sendiri dengan pulpen tiap bulan. */}
      <section className="kartu">
        <h2 className="mb-3 text-sm text-slate-500">{formatMonth(bulanIni)}</h2>

        <div className="flex items-baseline justify-between border-b border-slate-100 pb-3">
          <span className="text-slate-600">Masuk</span>
          <span className="text-xl font-bold text-masuk">
            <Uang nilai={bulan?.income ?? ZERO} />
          </span>
        </div>

        <div className="flex items-baseline justify-between border-b border-slate-100 py-3">
          <span className="text-slate-600">Keluar</span>
          <span className="font-semibold text-keluar">
            <Uang nilai={bulan?.expense ?? ZERO} />
          </span>
        </div>

        <div className="flex items-baseline justify-between pt-3">
          <span className="font-semibold">Sisa</span>
          <span className="text-xl font-bold">
            <Uang nilai={bulan?.net ?? ZERO} />
          </span>
        </div>
      </section>

      {piutang && piutang.count > 0 && (
        <a href="/utang" className="kartu flex items-center gap-3">
          <span aria-hidden>📒</span>
          <span className="font-semibold">
            {piutang.count} orang belum bayar · <Uang nilai={piutang.total} />
          </span>
        </a>
      )}
    </main>
  )
}
