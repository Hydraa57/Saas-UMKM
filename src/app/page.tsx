'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type LocalCashEntry } from '@/lib/db/local'
import { toItem, useApp } from '@/lib/useApp'
import { summarizeFlow, totalBalance } from '@/lib/domain/cash'
import { monthOf, monthlyRecap, formatMonth } from '@/lib/domain/recap'
import { summarizeDebts } from '@/lib/domain/debt'
import { perluDitindak } from '@/lib/domain/stock'
import { dayRange, today } from '@/lib/domain/dates'
import { fromDb, ZERO } from '@/lib/money'
import * as M from '@/lib/money'
import { Uang } from '@/components/Uang'
import { Ikon, type NamaIkon } from '@/components/Ikon'
import { StatusCadangan } from '@/components/StatusCadangan'
import {
  isBarang,
  type CashEntry,
  type Category,
  type Debt,
  type Wallet,
} from '@/lib/domain/types'

/**
 * Beranda.
 *
 * Tiga aturan yang membentuknya:
 *
 * **1. Jalan tercepat ke kasir selalu ada di bawah ibu jari.** Aplikasi
 * ini dibuka saat ada pembeli berdiri di depan meja. Tombolnya sekarang
 * ada di bilah bawah, jadi ia ada di tempat yang sama di setiap layar —
 * bukan cuma di beranda.
 *
 * **2. Setiap kali pengguna memasukkan sesuatu, dia harus langsung
 * menerima sesuatu.** Percobaan sebelumnya — bot WhatsApp — gagal justru
 * di sini: ia bisa menerima catatan tapi cuma menjawab "sudah disimpan".
 * Jadi rekap bulan ini ada di layar pertama, bukan di balik menu
 * laporan.
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

function Pintasan({
  href,
  ikon,
  judul,
  ket,
}: {
  href: string
  ikon: NamaIkon
  judul: string
  ket: string
}) {
  return (
    <a href={href} className="kartu-tekan flex flex-col gap-2">
      <span
        className="flex h-11 w-11 items-center justify-center rounded-kartu
                   bg-merek-50 text-merek-700"
      >
        <Ikon nama={ikon} ukuran={22} />
      </span>
      <span className="font-semibold leading-tight">{judul}</span>
      <span className="text-sm leading-tight text-slate-500">{ket}</span>
    </a>
  )
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
      <main className="flex flex-1 flex-col justify-center gap-6 p-4">
        <div className="animate-naik">
          <span
            className="mb-5 flex h-16 w-16 items-center justify-center rounded-kartu-lg
                       bg-merek-600 text-white"
          >
            <Ikon nama="kasir" ukuran={30} tebal={1.9} />
          </span>
          <h1 className="text-2xl font-bold">Ezura</h1>
          <p className="mt-2 text-slate-600">
            Jual barang dan jasa, cetak struk — stok dan catatannya ikut terisi
            sendiri.
          </p>
        </div>
        <Link href="/mulai" className="btn-primer btn-besar animate-naik">
          Mulai
        </Link>
      </main>
    )
  }

  return (
    <main className="ruang-bilah flex flex-1 flex-col gap-4 px-4 pt-4">
      {/* Satu-satunya jalan ke pengaturan, dan sengaja cuma ikon di
          pojok. Yang dikerjakan di sana — ganti nama usaha, pasang QRIS —
          dilakukan sekali lalu tidak pernah lagi, jadi ia tidak pantas
          menempati tempat yang bersaing dengan angka hari ini. Tapi ia
          harus ada: sebelumnya nama usaha tidak bisa diubah sama sekali
          setelah pengaturan awal, dan QRIS cuma bisa dipasang lewat layar
          bayar — jadi cuma ditemukan orang yang kebetulan sudah memilih
          QRIS di depan pembeli. */}
      <div className="flex items-center justify-between">
        <span className="text-[1.05rem] font-extrabold tracking-tight text-slate-800">
          Ezura
        </span>
        <Link href="/pengaturan" aria-label="Pengaturan" className="btn-ikon">
          <Ikon nama="setelan" ukuran={21} />
        </Link>
      </div>

      {/* Kartu gelap: satu-satunya di aplikasi, dan itu disengaja. Ia
          menandai angka yang paling sering dicari — dan sekaligus jadi
          tautan ke riwayat, karena pertanyaan berikutnya setelah melihat
          "4 struk" hampir selalu "struk yang mana". */}
      <Link href="/riwayat" className="kartu-gelap block animate-naik">
        <p className="text-sm font-medium text-slate-400">
          {businessName} · hari ini
        </p>
        <p className="text-money mt-1">
          <Uang nilai={arus.income} />
        </p>

        <div className="mt-5 flex items-center gap-4 border-t border-white/10 pt-4">
          <span className="flex-1">
            <span className="block text-xs font-medium text-slate-400">Struk</span>
            <span className="block text-lg font-semibold">
              {data?.strukHariIni ?? 0}
            </span>
          </span>
          <span className="flex-1">
            <span className="block text-xs font-medium text-slate-400">
              Uang di tangan
            </span>
            <span className="block text-lg font-semibold">
              <Uang nilai={data?.saldo ?? ZERO} />
            </span>
          </span>
          <Ikon nama="lanjut" ukuran={20} className="text-slate-500" />
        </div>
      </Link>

      {/* Keadaan cadangan. Ia menghilang sendiri kalau semuanya sudah
          aman — penanda hijau yang selalu ada akan berhenti dibaca dalam
          dua hari, dan bersamanya peringatan yang sesungguhnya. */}
      <StatusCadangan />

      {/* Dua pintasan, bukan tiga: piutang sudah punya tempat tetap di
          bilah bawah, dan menaruhnya di dua tempat sekaligus membuat
          orang ragu apakah keduanya hal yang sama. */}
      <nav className="grid grid-cols-2 gap-3">
        <Pintasan href="/kulakan" ikon="kulakan" judul="Kulakan" ket="Isi stok" />
        <Pintasan href="/keluar" ikon="keluar" judul="Uang keluar" ket="Biaya lain" />
      </nav>

      {/* Yang hilang dari percobaan sebelumnya, dan yang selama ini
          dihitung sendiri dengan pulpen tiap bulan.

          Sekaligus pintu ke laporan lengkap: pertanyaan berikutnya
          sesudah melihat sisa bulan ini hampir selalu "dari mana" —
          bulan lalu berapa, apa yang paling laku, untungnya berapa.
          Karena itu tidak ada menu "Laporan" tersendiri; jalannya lewat
          angka yang memunculkan pertanyaannya. */}
      <Link href="/laporan" className="kartu-tekan block">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-semibold">{formatMonth(bulanIni)}</h2>
          <span className="flex items-center gap-1 text-sm text-slate-500">
            {bulan?.entryCount ?? 0} catatan
            <Ikon nama="lanjut" ukuran={16} className="text-slate-300" />
          </span>
        </div>

        <div className="flex gap-3">
          <div className="flex-1 rounded-kartu bg-masuk-soft p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-masuk">
              Masuk
            </p>
            <p className="mt-1 text-lg font-bold text-masuk">
              <Uang nilai={bulan?.income ?? ZERO} ringkas />
            </p>
          </div>
          <div className="flex-1 rounded-kartu bg-keluar-soft p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-keluar">
              Keluar
            </p>
            <p className="mt-1 text-lg font-bold text-keluar">
              <Uang nilai={bulan?.expense ?? ZERO} ringkas />
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-baseline justify-between border-t border-slate-100 pt-4">
          <span className="font-semibold">Sisa bulan ini</span>
          <span
            className={`text-2xl font-bold ${
              M.isNegative(bulan?.net ?? ZERO) ? 'text-keluar' : ''
            }`}
          >
            <Uang nilai={bulan?.net ?? ZERO} />
          </span>
        </div>

        <p className="mt-3 text-sm font-semibold text-merek-700">
          Lihat laporan lengkap
        </p>
      </Link>

      {data && data.menipis.length > 0 && (
        <Link
          href="/katalog?tab=stok"
          className="kartu-tekan flex items-center gap-3 bg-tunggu-soft ring-tunggu/10"
        >
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-kartu
                       bg-white/70 text-tunggu"
          >
            <Ikon nama="peringatan" ukuran={22} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-tunggu">
              {data.menipis.length} barang perlu dibeli
            </span>
            <span className="block truncate text-sm text-tunggu/80">
              {data.menipis.map((item) => item.name).join(', ')}
            </span>
          </span>
          <Ikon nama="lanjut" ukuran={20} className="shrink-0 text-tunggu/50" />
        </Link>
      )}

      {piutang && piutang.count > 0 && (
        <Link href="/utang" className="kartu-tekan flex items-center gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-kartu
                       bg-keluar-soft text-keluar"
          >
            <Ikon nama="utang" ukuran={22} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">
              {piutang.count} orang belum bayar
            </span>
            <span className="block text-sm text-slate-500">
              <Uang nilai={piutang.total} /> belum tertagih
            </span>
          </span>
          <Ikon nama="lanjut" ukuran={20} className="shrink-0 text-slate-300" />
        </Link>
      )}
    </main>
  )
}
