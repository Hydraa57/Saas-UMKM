'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type LocalCashEntry } from '@/lib/db/local'
import { readSales } from '@/lib/db/sales'
import { useApp } from '@/lib/useApp'
import { fromDb, ZERO } from '@/lib/money'
import * as M from '@/lib/money'
import { Uang } from '@/components/Uang'
import { AppBar } from '@/components/AppBar'
import { Ikon } from '@/components/Ikon'
import {
  compareToPreviousMonth,
  findMonth,
  formatMonth,
  monthOf,
  monthlyRecap,
  yearTotal,
} from '@/lib/domain/recap'
import {
  barangTerlaris,
  formatJam,
  jamTerramai,
  marjinPersen,
  monthsWithSales,
  piutangDariPenjualan,
  ringkasPenjualan,
  salesInMonth,
  sebaranJam,
} from '@/lib/domain/laporan'
import type { CashEntry, Category, Debt, LocalMonth } from '@/lib/domain/types'

/**
 * Laporan.
 *
 * Ini **imbalannya**, dan sebabnya bukan tebakan: ibu sudah mengerjakan
 * halaman ini sendiri dengan pulpen selama delapan belas bulan, lengkap
 * dengan total tahunan yang dijumlah tangan. Selama layar ini belum ada,
 * aplikasinya cuma memindahkan pekerjaan mencatat tanpa mengembalikan
 * apa pun — persis kegagalan bot WhatsApp sebelumnya.
 *
 * Dua kartu di atas sengaja dipisah, dan pemisahan itu yang paling
 * penting di seluruh layar ini:
 *
 * - **Buku kas** menjawab "uangnya ke mana": semua yang masuk dan keluar,
 *   termasuk kulakan dan biaya. Ini yang selama ini ditulis di buku.
 * - **Dari penjualan** menjawab "dagangannya untung berapa": omzet
 *   dikurangi modal barang yang benar-benar keluar.
 *
 * Keduanya hampir selalu berbeda angkanya, dan itu benar — kulakan bulan
 * ini membeli barang yang lakunya bulan depan. Menggabungkannya jadi satu
 * angka "untung" akan menyembunyikan justru bulan-bulan yang perlu
 * dilihat: yang kasnya minus karena kulakan besar padahal dagangannya
 * sehat, dan sebaliknya.
 *
 * Yang **tidak** ditampilkan: grafik garis omzet harian. Ia terlihat
 * profesional dan tidak menjawab satu pun pertanyaan yang benar-benar
 * dibawa orang ke sini.
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

function Kosong() {
  return (
    <main className="flex flex-1 flex-col gap-4 px-4 pb-8">
      <AppBar judul="Laporan" kembali="/" />
      <div className="kartu text-center">
        <span
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl
                     bg-merek-50 text-merek-600"
        >
          <Ikon nama="laporan" ukuran={26} />
        </span>
        <p className="mt-3 font-semibold">Belum ada yang bisa dilaporkan</p>
        <p className="mt-1 text-slate-600">
          Begitu ada penjualan atau pengeluaran pertama, rekapnya muncul di
          sini — per bulan, lengkap dengan barang paling laku.
        </p>
        <Link href="/kasir" className="btn-primer btn-besar mt-5">
          Buka kasir
        </Link>
      </div>
    </main>
  )
}

export default function Laporan() {
  const { ready, tenantId, businessName } = useApp()
  const [dipilih, setDipilih] = useState<LocalMonth | null>(null)

  const [mengekspor, setMengekspor] = useState(false)
  const [berkas, setBerkas] = useState<string | null>(null)
  const [galatEkspor, setGalatEkspor] = useState<string | null>(null)

  async function ekspor() {
    setMengekspor(true)
    setGalatEkspor(null)
    try {
      // Dimuat saat ditekan, bukan bersama halamannya. Penyandi xlsx
      // tidak boleh ikut terunduh oleh orang yang cuma melihat rekap —
      // apalagi oleh kasir, yang dibuka puluhan kali sehari.
      const { eksporSemua } = await import('@/lib/export/ekspor')
      setBerkas(await eksporSemua(businessName))
    } catch {
      setGalatEkspor('Gagal menyiapkan berkasnya. Coba lagi sebentar.')
    } finally {
      setMengekspor(false)
    }
  }

  const data = useLiveQuery(async () => {
    const [entries, sales, debts] = await Promise.all([
      db().cashEntries.toArray(),
      readSales(db()),
      db().debts.toArray(),
    ])
    return {
      entries: entries.map(toEntry),
      sales,
      debts: debts.map(
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
      ),
    }
  }, [])

  if (!ready || data === undefined) {
    return <main className="flex-1 p-4" aria-busy="true" />
  }

  if (!tenantId) {
    return (
      <main className="flex flex-1 flex-col gap-4 p-4">
        <p className="kartu">Pengaturan awal belum selesai.</p>
        <Link href="/mulai" className="btn-primer btn-besar">
          Buka pengaturan
        </Link>
      </main>
    )
  }

  const rekap = monthlyRecap(data.entries)

  // Gabungan dua sumber, bukan salah satunya. Bulan yang cuma berisi
  // kulakan tidak punya struk, dan bulan yang seluruh jualannya diutang
  // belum tentu punya entri kas — keduanya tetap harus bisa dibuka.
  const bulanTersedia = [
    ...new Set([
      ...rekap.months.map((row) => row.month),
      ...monthsWithSales(data.sales),
    ]),
  ].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))

  if (bulanTersedia.length === 0) return <Kosong />

  const bulanIni = monthOf(new Date())
  const bulan =
    dipilih && bulanTersedia.includes(dipilih)
      ? dipilih
      : (bulanTersedia.includes(bulanIni) ? bulanIni : bulanTersedia[0]) ?? bulanIni

  const kas = findMonth(rekap, bulan)
  const banding = compareToPreviousMonth(rekap, bulan)
  const strukBulan = salesInMonth(data.sales, bulan)
  const jual = ringkasPenjualan(strukBulan)
  const marjin = marjinPersen(jual)
  const belumDibayar = piutangDariPenjualan(data.debts, strukBulan)
  const terlaris = barangTerlaris(strukBulan, 8)
  const jam = sebaranJam(strukBulan)
  const teramai = jamTerramai(jam)
  const tahun = yearTotal(rekap, Number(bulan.slice(0, 4)))

  const qtyTertinggi = terlaris.reduce((max, row) => Math.max(max, row.qty), 0)
  const strukTertinggi = jam.reduce((max, row) => Math.max(max, row.strukCount), 0)

  return (
    <main className="flex flex-1 flex-col gap-4 px-4 pb-8">
      <AppBar judul="Laporan" kembali="/" />

      {/* Pemilih bulan. Digeser, bukan dilipat ke dalam menu: bulan lalu
          adalah yang paling sering dibuka sesudah bulan berjalan, dan ia
          harus cuma sejauh satu ketukan. */}
      <div className="-mx-4 overflow-x-auto px-4 pb-1">
        <div className="flex w-max gap-2">
          {bulanTersedia.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={m === bulan}
              onClick={() => setDipilih(m)}
              className={`chip whitespace-nowrap px-4 ${m === bulan ? 'chip-aktif' : ''}`}
            >
              {m === bulanIni ? 'Bulan ini' : formatMonth(m)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Buku kas ─────────────────────────────────────────────── */}
      <section className="kartu-gelap animate-naik">
        {/* Jumlah catatan ikut di baris judul, bukan jadi petak ketiga
            di bawah. Tiga petak membuat kolomnya sesempit sepuluh huruf,
            dan "Rp 101rb" pun terlipat jadi dua baris — angka uang yang
            terlipat terbaca salah sekilas. */}
        <p className="text-sm font-medium text-slate-400">
          Buku kas · {formatMonth(bulan)} · {kas?.entryCount ?? 0} catatan
        </p>
        <p className="text-money mt-1">
          <Uang nilai={kas?.net ?? ZERO} />
        </p>
        <p className="mt-1 text-sm text-slate-400">
          Sisa sesudah semua pemasukan dikurangi semua pengeluaran
        </p>

        <div className="mt-5 flex gap-4 border-t border-white/10 pt-4">
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium text-slate-400">Masuk</span>
            <span className="block text-lg font-semibold text-emerald-300">
              <Uang nilai={kas?.income ?? ZERO} ringkas />
            </span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium text-slate-400">Keluar</span>
            <span className="block text-lg font-semibold text-red-300">
              <Uang nilai={kas?.expense ?? ZERO} ringkas />
            </span>
          </span>
        </div>
      </section>

      {/* Perbandingan dengan bulan sebelumnya. Sengaja tidak muncul di
          bulan pertama pemakaian — "turun 100%" pada bulan yang memang
          belum ada pembandingnya adalah kebohongan yang menakutkan. */}
      {banding && (
        <p className="kartu flex items-center gap-3 text-slate-600">
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl
                        ${
                          M.isNegative(banding.deltaNet)
                            ? 'bg-keluar-soft text-keluar'
                            : 'bg-masuk-soft text-masuk'
                        }`}
          >
            <Ikon nama="laporan" ukuran={22} />
          </span>
          <span>
            Dibanding bulan sebelumnya, sisanya{' '}
            <strong
              className={M.isNegative(banding.deltaNet) ? 'text-keluar' : 'text-masuk'}
            >
              {M.isNegative(banding.deltaNet) ? 'turun' : 'naik'}{' '}
              <Uang nilai={M.abs(banding.deltaNet)} />
            </strong>
          </span>
        </p>
      )}

      {/* ── Dari penjualan ───────────────────────────────────────── */}
      <section className="kartu">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-semibold">Dari penjualan</h2>
          <span className="text-sm text-slate-500">
            {jual.strukCount} struk · {jual.qtyCount} item
          </span>
        </div>

        <div className="flex gap-3">
          <div className="flex-1 rounded-2xl bg-slate-100 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Omzet
            </p>
            <p className="mt-1 text-lg font-bold">
              <Uang nilai={jual.omzet} ringkas />
            </p>
          </div>
          <div className="flex-1 rounded-2xl bg-slate-100 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Modal barang
            </p>
            <p className="mt-1 text-lg font-bold">
              <Uang nilai={jual.modal} ringkas />
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-baseline justify-between border-t border-slate-100 pt-4">
          <span>
            <span className="block font-semibold">Untung kotor</span>
            {marjin !== null && (
              <span className="text-sm text-slate-500">{marjin}% dari omzet</span>
            )}
          </span>
          <span
            className={`text-2xl font-bold ${
              M.isNegative(jual.laba) ? 'text-keluar' : 'text-masuk'
            }`}
          >
            <Uang nilai={jual.laba} />
          </span>
        </div>

        {/* Satu kalimat ini mencegah pertanyaan yang pasti muncul:
            kenapa untungnya besar tapi uang di laci sedikit. */}
        <p className="mt-3 text-sm text-slate-500">
          Baru dikurangi harga kulakan barangnya. Sewa, listrik, dan biaya
          lain ada di buku kas di atas.
        </p>

        {/* Sebab kedua omzet bisa lebih besar daripada pemasukan buku
            kas, dan satu-satunya yang tidak bisa ditebak sendiri oleh
            pembacanya. Muncul hanya kalau memang ada. */}
        {M.isPositive(belumDibayar) && (
          <Link
            href="/utang"
            className="mt-3 flex items-center gap-2 text-sm font-semibold text-tunggu"
          >
            <Ikon nama="utang" ukuran={16} className="shrink-0" />
            {/* Satu span untuk seluruh kalimat: kalau nominalnya jadi
                anak flex tersendiri, ia terbungkus sebagai blok utuh dan
                kalimatnya patah di tempat yang salah. */}
            <span className="flex-1">
              <Uang nilai={belumDibayar} /> dari omzet ini belum dibayar
            </span>
            <Ikon nama="lanjut" ukuran={14} className="shrink-0" />
          </Link>
        )}
      </section>

      {/* ── Paling laku ──────────────────────────────────────────── */}
      <section className="kartu">
        <div className="mb-4 flex items-center gap-2">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl
                       bg-merek-50 text-merek-700"
          >
            <Ikon nama="piala" ukuran={19} />
          </span>
          <h2 className="font-semibold">Paling laku bulan ini</h2>
        </div>

        {terlaris.length === 0 ? (
          <p className="text-slate-500">Belum ada penjualan di bulan ini.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {terlaris.map((row, index) => (
              <li key={row.itemId ?? `nama:${row.itemName}`}>
                <div className="flex items-baseline gap-2">
                  <span className="w-5 shrink-0 text-sm font-bold text-slate-400">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {row.itemName}
                  </span>
                  <span className="shrink-0 text-sm text-slate-500">
                    <Uang nilai={row.omzet} ringkas />
                  </span>
                  <span className="w-12 shrink-0 text-right font-bold">
                    {row.qty}
                  </span>
                </div>
                {/* Batang perbandingan, bukan angka saja: selisih 40 dan 12
                    baru terasa besar kalau panjangnya berbeda. */}
                <div className="ml-7 mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-merek-500"
                    style={{
                      width: `${qtyTertinggi > 0 ? (row.qty / qtyTertinggi) * 100 : 0}%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* ── Jam ramai ──────────────────────────────────────────────

          Baru muncul kalau penjualannya benar-benar tersebar ke lebih
          dari satu jam. Dengan satu jam saja, "paling ramai jam 08.00"
          cuma mengulang satu-satunya jam yang ada, dan batangnya jadi
          satu balok penuh selebar layar yang tidak membandingkan apa
          pun. Bagian yang tidak menjawab apa-apa lebih baik tidak ada
          daripada ada dan diabaikan. */}
      {jam.length >= 2 && (
        <section className="kartu">
          <div className="mb-4 flex items-center gap-2">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-xl
                         bg-merek-50 text-merek-700"
            >
              <Ikon nama="jam" ukuran={19} />
            </span>
            <h2 className="font-semibold">Jam paling ramai</h2>
          </div>

          {teramai && (
            <p className="mb-4 text-slate-600">
              Paling banyak pembeli sekitar{' '}
              <strong className="text-slate-900">{formatJam(teramai.jam)}</strong> —{' '}
              {teramai.strukCount} struk bulan ini.
            </p>
          )}

          {/* Lebarnya dibatasi menurut banyaknya batang. Tanpa itu, tiga
              jam berjualan melebar jadi tiga balok sebesar telapak
              tangan dan terbaca seperti grafik yang penuh. */}
          <div
            className="flex items-end gap-1.5"
            style={{ maxWidth: `${jam.length * 2.75}rem` }}
            aria-hidden="true"
          >
            {jam.map((row) => (
              <div key={row.jam} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className={`w-full rounded-t-md ${
                    row.jam === teramai?.jam ? 'bg-merek-600' : 'bg-merek-200'
                  }`}
                  style={{
                    height: `${
                      strukTertinggi > 0
                        ? Math.max(6, (row.strukCount / strukTertinggi) * 72)
                        : 6
                    }px`,
                  }}
                />
                <span className="text-[0.65rem] font-medium text-slate-400">
                  {String(row.jam).padStart(2, '0')}
                </span>
              </div>
            ))}
          </div>

          {/* Grafik batang di atas disembunyikan dari pembaca layar dan
              digantikan daftar ini — batang tanpa teks tidak bisa dibaca
              sama sekali, dan angkanya toh sudah ada. */}
          <ul className="sr-only">
            {jam.map((row) => (
              <li key={row.jam}>
                {formatJam(row.jam)}: {row.strukCount} struk
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Total tahun ──────────────────────────────────────────── */}
      <section className="kartu">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-semibold">Total {bulan.slice(0, 4)}</h2>
          <span className="text-sm text-slate-500">
            {tahun.entryCount} catatan
          </span>
        </div>
        <dl className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <dt className="text-slate-600">Masuk</dt>
            <dd className="font-semibold text-masuk">
              <Uang nilai={tahun.income} />
            </dd>
          </div>
          <div className="flex items-baseline justify-between">
            <dt className="text-slate-600">Keluar</dt>
            <dd className="font-semibold text-keluar">
              <Uang nilai={tahun.expense} />
            </dd>
          </div>
          <div className="flex items-baseline justify-between border-t border-slate-100 pt-2">
            <dt className="font-semibold">Sisa setahun</dt>
            <dd
              className={`text-xl font-bold ${
                M.isNegative(tahun.net) ? 'text-keluar' : ''
              }`}
            >
              <Uang nilai={tahun.net} />
            </dd>
          </div>
        </dl>
      </section>

      {/* ── Ekspor ───────────────────────────────────────────────────

          Seluruh catatan, bukan cuma bulan yang sedang dipilih — dan
          judulnya menyebutkan itu, karena tombol di bawah laporan satu
          bulan wajar disangka mengekspor bulan itu saja.

          Isinya dibaca dari HP, bukan dari peladen: yang paling butuh
          menyalin datanya keluar justru orang yang belum mencadangkan
          apa pun. */}
      <section className="kartu">
        <div className="mb-3 flex items-center gap-2">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl
                       bg-merek-50 text-merek-700"
          >
            <Ikon nama="unduh" ukuran={19} />
          </span>
          <h2 className="font-semibold">Simpan salinan</h2>
        </div>
        <p className="text-slate-600">
          Semua catatan sejak awal — penjualan, buku kas, katalog, utang,
          dan pergerakan stok — jadi satu berkas Excel yang bisa dibuka di
          HP atau dikirim ke orang lain.
        </p>

        {galatEkspor && (
          <p role="alert" className="mt-3 font-semibold text-keluar">
            {galatEkspor}
          </p>
        )}
        {berkas && !galatEkspor && (
          <p role="status" className="mt-3 text-sm text-masuk">
            Tersimpan sebagai {berkas}. Cari di folder Unduhan.
          </p>
        )}

        <button
          type="button"
          disabled={mengekspor}
          onClick={ekspor}
          className="btn-sekunder mt-4 w-full"
        >
          {mengekspor ? 'Menyiapkan…' : 'Unduh semua ke Excel'}
        </button>
      </section>
    </main>
  )
}
