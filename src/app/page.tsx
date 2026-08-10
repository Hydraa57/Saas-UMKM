'use client'

import { useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type LocalCashEntry } from '@/lib/db/local'
import { useApp } from '@/lib/useApp'
import { summarizeFlow, totalBalance } from '@/lib/domain/cash'
import { monthOf, monthlyRecap, formatMonth } from '@/lib/domain/recap'
import { summarizeDebts } from '@/lib/domain/debt'
import { dayRange, today } from '@/lib/domain/dates'
import { fromDb, ZERO } from '@/lib/money'
import { Uang } from '@/components/Uang'
import {
  isBarang,
  type CashEntry,
  type Category,
  type Debt,
  type Wallet,
} from '@/lib/domain/types'
import { toItem } from '@/lib/useApp'
import { perluDitindak } from '@/lib/domain/stock'

/**
 * Beranda.
 *
 * Tiga aturan yang membentuknya:
 *
 * **1. Jalan tercepat ke kasir ada di paling atas.** Aplikasi ini dipakai
 * saat ada pembeli berdiri di depan meja. Apa pun yang berdiri di antara
 * membuka aplikasi dan menerima uang adalah beban.
 *
 * **2. Setiap kali pengguna memasukkan sesuatu, dia harus langsung
 * menerima sesuatu.** Percobaan sebelumnya — bot WhatsApp — gagal justru
 * di sini: ia bisa menerima catatan tapi cuma menjawab "sudah disimpan".
 * Untuk tahu pemasukan sebulan, penggunanya tetap harus membuka
 * spreadsheet, dan akhirnya berhenti. Jadi rekap bulan ini ada di layar
 * pertama, bukan di balik menu laporan.
 *
 * **3. Yang butuh tindakan muncul sendiri.** Stok menipis dan pembeli
 * yang belum bayar tidak menunggu dicari — keduanya baru berguna kalau
 * terlihat sebelum terlambat.
 */

function toEntry(row: LocalCashEntry): CashEntry {
  return {
    id: row.id,
    walletId: row.wallet_id,
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
  const { tenantId, businessName, ready } = useApp()

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
        openingBalance: fromDb(row.opening_balance),
        isDefault: row.is_default,
        archivedAt: row.archived_at,
      }),
    )

    const utang = (await db().debts.toArray()).map(
      (row): Debt => ({
        id: row.id,
        side: row.side,
        person: row.person,
        amount: fromDb(row.amount),
        paidAmount: fromDb(row.paid_amount),
        saleId: row.sale_id,
        occurredAt: row.occurred_at,
        note: row.note,
        settledAt: row.settled_at,
        deletedAt: row.deleted_at,
      }),
    )

    // Stok menipis dihitung di sini, bukan di layar katalog, supaya
    // peringatannya sampai ke orang yang belum membuka katalog hari ini.
    const menipis = (await db().items.toArray())
      .filter((row) => !row.archived_at)
      .map(toItem)
      .filter((item) => isBarang(item) && perluDitindak(item))

    const strukHariIni = (await db().sales.toArray()).filter(
      (row) => !row.voided_at && row.occurred_at >= from && row.occurred_at < to,
    ).length

    return {
      semua,
      hariIniEntries: semua.filter(
        (entry) => entry.occurredAt >= from && entry.occurredAt < to,
      ),
      saldo: totalBalance(wallets, semua),
      piutang: summarizeDebts(utang, 'receivable', hariIni),
      menipis,
      strukHariIni,
    }
  }, [hariIni])

  const arus = summarizeFlow(data?.hariIniEntries ?? [])
  const rekap = monthlyRecap(data?.semua ?? [])
  const bulan = rekap.months.find((row) => row.month === bulanIni)
  const piutang = data?.piutang

  if (!ready) {
    return <main className="flex-1 p-4" aria-busy="true" />
  }

  if (!tenantId) {
    return (
      <main className="flex flex-1 flex-col justify-center gap-5 p-4">
        <div>
          <h1 className="text-xl font-bold">Ezura</h1>
          <p className="mt-1 text-slate-600">
            Jual barang dan jasa, cetak struk, stok dan catatannya ikut
            terisi sendiri.
          </p>
        </div>
        <a href="/mulai" className="btn-aksi justify-center bg-slate-900 text-white">
          Mulai
        </a>
      </main>
    )
  }

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 pb-8">
      {/* Kartunya sekaligus tautan ke riwayat: pertanyaan berikutnya
          setelah melihat "3 struk" hampir selalu "struk yang mana". */}
      <a href="/riwayat" className="kartu block">
        <p className="text-sm text-slate-500">{businessName} · hari ini</p>
        <p className="text-money text-masuk">
          <Uang nilai={arus.income} />
        </p>
        <p className="mt-1 text-slate-600">
          {data?.strukHariIni ?? 0} struk · uang di tangan{' '}
          <Uang nilai={data?.saldo ?? ZERO} className="font-semibold" />
        </p>
      </a>

      {/* Tombol terbesar di layar, dan yang pertama dijangkau ibu jari. */}
      <a href="/kasir" className="btn-aksi bg-slate-900 text-white">
        <span aria-hidden className="text-3xl">
          🧾
        </span>
        Kasir
      </a>

      <nav className="grid grid-cols-3 gap-3">
        <a
          href="/katalog"
          className="flex min-h-touch-lg flex-col justify-center rounded-2xl bg-white
                     p-4 shadow-sm active:bg-slate-100"
        >
          <span aria-hidden className="text-2xl">
            📦
          </span>
          <span className="mt-1 font-semibold">Katalog</span>
          <span className="text-sm text-slate-500">Barang & jasa</span>
        </a>
        <a
          href="/stok"
          className="flex min-h-touch-lg flex-col justify-center rounded-2xl bg-white
                     p-4 shadow-sm active:bg-slate-100"
        >
          <span aria-hidden className="text-2xl">
            📊
          </span>
          <span className="mt-1 font-semibold">Stok</span>
          <span className="text-sm text-slate-500">Sisa & kulakan</span>
        </a>
        <a
          href="/keluar"
          className="flex min-h-touch-lg flex-col justify-center rounded-2xl bg-white
                     p-4 shadow-sm active:bg-slate-100"
        >
          <span aria-hidden className="text-2xl">
            ↑
          </span>
          <span className="mt-1 font-semibold">Keluar</span>
          <span className="text-sm text-slate-500">Biaya lain</span>
        </a>
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

      {data && data.menipis.length > 0 && (
        <a href="/stok" className="kartu flex items-start gap-3 bg-tunggu-soft text-tunggu">
          <span aria-hidden>⚠</span>
          <span className="font-semibold">
            {data.menipis.length} barang menipis:{' '}
            {data.menipis
              .slice(0, 3)
              .map((item) => item.name)
              .join(', ')}
            {data.menipis.length > 3 ? ', …' : ''}
          </span>
        </a>
      )}

      {piutang && piutang.count > 0 && (
        <a href="/utang" className="kartu flex items-center gap-3">
          <span aria-hidden>📒</span>
          <span className="flex-1 font-semibold">
            {piutang.count} orang belum bayar · <Uang nilai={piutang.total} />
          </span>
          <span aria-hidden className="text-xl text-slate-400">
            ›
          </span>
        </a>
      )}
    </main>
  )
}
