'use client'

import { useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type LocalCashEntry } from '@/lib/db/local'
import { summarizeFlow, filterByBook } from '@/lib/domain/cash'
import { monthOf, monthlyRecap, formatMonth } from '@/lib/domain/recap'
import { summarizeDebts } from '@/lib/domain/debt'
import { dayRange, today } from '@/lib/domain/dates'
import { fromDb, ZERO } from '@/lib/money'
import { Uang } from '@/components/Uang'
import type { CashEntry, Category, Debt } from '@/lib/domain/types'

/**
 * Beranda.
 *
 * Dua aturan yang membentuknya, keduanya berasal dari catatan ibu:
 *
 * **1. Setiap kali ibu memasukkan sesuatu, dia harus langsung menerima
 * sesuatu.** Percobaan sebelumnya — bot WhatsApp — gagal justru di sini:
 * ia bisa menerima catatan tapi cuma menjawab "sudah disimpan". Untuk
 * tahu pemasukan sebulan, ibu tetap harus membuka spreadsheet, dan
 * akhirnya berhenti memakainya. Jadi total bulan ini muncul di layar
 * pertama, bukan di balik menu laporan.
 *
 * **2. Dua buku, tidak dicampur.** Ibu sudah memisahkan uang hasil
 * kerjanya dari uang belanja pemberian bapak bertahun-tahun — rekap
 * bulanan tulisan tangannya secara tegas tidak memasukkan uang dari
 * bapak. Aplikasi mengikuti pemisahan yang sudah ada.
 *
 * Label dan urutan tombol masih perlu diperiksa bersama ibu; semuanya
 * dikumpulkan di satu tempat di bawah, bukan disebar ke seluruh berkas.
 */

const AKSI = [
  {
    href: '/catat/jahit',
    ikon: '✂️',
    judul: 'Jahit masuk',
    warna: 'bg-emerald-100 text-emerald-900',
  },
  {
    href: '/catat/snack',
    ikon: '🍪',
    judul: 'Snack masuk',
    warna: 'bg-amber-100 text-amber-900',
  },
  {
    href: '/catat/belanja',
    ikon: '🛒',
    judul: 'Belanja',
    warna: 'bg-slate-200 text-slate-900',
  },
] as const

function toDomain(row: LocalCashEntry): CashEntry {
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
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined)
    }
  }, [])

  const hariIni = today()
  const bulanIni = monthOf(new Date())

  const data = useLiveQuery(async () => {
    const { from, to } = dayRange(hariIni)

    const semua = (await db().cashEntries.toArray()).map(toDomain)
    const entriHariIni = semua.filter(
      (entry) => entry.occurredAt >= from && entry.occurredAt < to,
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

    return {
      usahaHariIni: summarizeFlow(filterByBook(entriHariIni, 'usaha')),
      rumahHariIni: summarizeFlow(filterByBook(entriHariIni, 'rumah')),
      rekapUsaha: monthlyRecap(semua, 'usaha'),
      rekapRumah: monthlyRecap(semua, 'rumah'),
      piutang: summarizeDebts(utang, 'receivable', hariIni),
    }
  }, [hariIni])

  const masukHariIni = data?.usahaHariIni.income ?? ZERO
  const bulanUsaha = data?.rekapUsaha.months.find((row) => row.month === bulanIni)
  const bulanRumah = data?.rekapRumah.months.find((row) => row.month === bulanIni)
  const piutang = data?.piutang

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 pb-8">
      <header className="kartu">
        <p className="text-sm text-slate-500">Masuk hari ini</p>
        <p className="text-money text-masuk">
          <Uang nilai={masukHariIni} />
        </p>
      </header>

      <nav className="flex flex-col gap-3">
        {AKSI.map((aksi) => (
          <a key={aksi.href} href={aksi.href} className={`btn-aksi ${aksi.warna}`}>
            <span aria-hidden className="text-3xl">
              {aksi.ikon}
            </span>
            {aksi.judul}
          </a>
        ))}
      </nav>

      {/* Inilah yang hilang dari percobaan sebelumnya, dan yang selama ini
          ibu hitung sendiri dengan pulpen tiap bulan. */}
      <section className="kartu">
        <h2 className="mb-3 text-sm text-slate-500">{formatMonth(bulanIni)}</h2>

        <div className="flex items-baseline justify-between border-b border-slate-100 pb-3">
          <span className="font-semibold">Penghasilan ibu</span>
          <span className="text-xl font-bold text-masuk">
            <Uang nilai={bulanUsaha?.income ?? ZERO} />
          </span>
        </div>

        <div className="flex items-baseline justify-between pt-3">
          <span className="text-slate-600">Belanja rumah</span>
          <span className="font-semibold text-keluar">
            <Uang nilai={bulanRumah?.expense ?? ZERO} />
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
