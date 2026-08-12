'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db/local'
import { actionContext, useApp } from '@/lib/useApp'
import { payDebt } from '@/lib/actions/pos'
import { fromDb } from '@/lib/money'
import * as M from '@/lib/money'
import { Uang } from '@/components/Uang'
import { PapanAngka } from '@/components/PapanAngka'
import { AppBar } from '@/components/AppBar'
import { Ikon } from '@/components/Ikon'
import { ageInDays, outstanding, summarizeDebts, STALE_AFTER_DAYS } from '@/lib/domain/debt'
import { today } from '@/lib/domain/dates'
import type { Debt } from '@/lib/domain/types'

/**
 * Siapa belum bayar.
 *
 * Diurutkan dari yang paling lama, bukan dari yang paling besar: yang
 * lama itu yang paling mungkin terlupakan, dan yang paling canggung
 * ditagih kalau dibiarkan makin lama. Nominal besar biasanya justru
 * diingat sendiri.
 *
 * Piutang di sini selalu lahir dari struk yang kurang bayar, dan hanya
 * kalau nama pembelinya diketahui — piutang tanpa nama tidak bisa
 * ditagih, ia cuma angka yang membuat laporan terlihat salah.
 */

export default function Utang() {
  const { tenantId, defaultWallet, ready } = useApp()
  const hariIni = today()

  const [dipilih, setDipilih] = useState<string | null>(null)
  const [jumlah, setJumlah] = useState(M.ZERO)
  const [menyimpan, setMenyimpan] = useState(false)

  const debts = useLiveQuery(
    async () =>
      (await db().debts.toArray()).map(
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
    [],
  )

  const ringkas = summarizeDebts(debts ?? [], 'receivable', hariIni)
  const aktif = ringkas.items.find((d) => d.id === dipilih) ?? null
  const sisaAktif = aktif ? outstanding(aktif) : M.ZERO

  function pilih(debt: Debt) {
    setDipilih(debt.id)
    // Nominalnya sudah terisi penuh: yang paling sering terjadi adalah
    // orang membayar lunas, dan mengetik ulang angka yang sudah diketahui
    // aplikasi cuma menambah kesempatan salah ketik.
    setJumlah(outstanding(debt))
  }

  async function terima() {
    if (!aktif || !tenantId || !defaultWallet || menyimpan) return
    setMenyimpan(true)
    try {
      await payDebt(actionContext(tenantId), {
        debtId: aktif.id,
        amount: jumlah,
        walletId: defaultWallet.id,
      })
      setDipilih(null)
      setJumlah(M.ZERO)
    } finally {
      setMenyimpan(false)
    }
  }

  if (!ready || debts === undefined) {
    return <main className="flex-1 p-4" aria-busy="true" />
  }

  if (!tenantId || !defaultWallet) {
    return (
      <main className="flex flex-1 flex-col gap-4 p-4">
        <p className="kartu">Pengaturan awal belum selesai.</p>
        <Link href="/mulai" className="btn-primer btn-besar">
          Buka pengaturan
        </Link>
      </main>
    )
  }

  // ── Layar terima pembayaran ────────────────────────────────────────
  if (aktif) {
    return (
      <main className="ruang-bilah-aksi flex flex-1 flex-col gap-3 px-4">
        <AppBar judul={aktif.person} onKembali={() => setDipilih(null)} />

        <div className="kartu-gelap animate-naik">
          <p className="text-sm font-medium text-slate-400">Sisa utang</p>
          <p className="text-money mt-1">
            <Uang nilai={sisaAktif} />
          </p>
          <p className="mt-2 text-sm text-slate-400">
            {ageInDays(aktif, hariIni)} hari
            {aktif.note ? ` · ${aktif.note}` : ''}
          </p>

          <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
            <span className="text-sm font-medium text-slate-400">Uang diterima</span>
            <span className="text-2xl font-bold">
              <Uang nilai={jumlah} />
            </span>
          </div>
          {M.isPositive(M.subtract(sisaAktif, jumlah)) && (
            <div className="mt-3 flex items-center justify-between rounded-kartu bg-keluar/25 px-4 py-3">
              <span className="font-semibold">Masih kurang</span>
              <span className="text-xl font-bold">
                <Uang nilai={M.subtract(sisaAktif, jumlah)} />
              </span>
            </div>
          )}
        </div>

        <button type="button" onClick={() => setJumlah(sisaAktif)} className="btn-sekunder">
          Lunas
        </button>

        <PapanAngka
          nilai={jumlah}
          onChange={setJumlah}
          pintasan={[5_000, 10_000, 20_000, 50_000]}
        />

        {/* Mengambang di atas bilah navigasi, bukan bilah aksi penuh:
            /utang adalah tujuan tab, jadi bilah navigasi ikut tampil di
            sini — dan dua bilah bertumpuk membuat tombolnya tidak pernah
            bisa ditekan. */}
        <div className="mengambang !justify-stretch">
          <button
            type="button"
            disabled={!M.isPositive(jumlah) || menyimpan}
            onClick={terima}
            className="btn-primer flex-1"
          >
            <Ikon nama="cek" ukuran={22} tebal={2.2} />
            Terima pembayaran
          </button>
        </div>
      </main>
    )
  }

  // ── Daftar ─────────────────────────────────────────────────────────
  return (
    <main className="ruang-bilah flex flex-1 flex-col gap-3 px-4">
      <AppBar judul="Belum bayar" kembali="/" />

      {ringkas.count === 0 ? (
        <div className="kartu text-center">
          <span
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-kartu
                       bg-masuk-soft text-masuk"
          >
            <Ikon nama="cek" ukuran={26} tebal={2.2} />
          </span>
          <p className="mt-3 font-semibold">Tidak ada yang berutang</p>
          <p className="mt-1 text-slate-600">
            Piutang muncul sendiri dari struk yang kurang bayar, selama nama
            pembelinya diisi.
          </p>
        </div>
      ) : (
        <>
          <div className="kartu-gelap animate-naik">
            <p className="text-sm font-medium text-slate-400">
              {ringkas.count} orang belum bayar
            </p>
            <p className="text-money mt-1">
              <Uang nilai={ringkas.total} />
            </p>
            {ringkas.stale.length > 0 && (
              <p className="mt-3 inline-flex items-center gap-2 rounded-kartu-kecil bg-tunggu/25 px-3 py-1.5 text-sm font-semibold">
                <Ikon nama="peringatan" ukuran={16} />
                {ringkas.stale.length} sudah lewat {STALE_AFTER_DAYS} hari
              </p>
            )}
          </div>

          <ul className="flex flex-col gap-2">
            {ringkas.items.map((debt) => {
              const umur = ageInDays(debt, hariIni)
              const lama = umur >= STALE_AFTER_DAYS
              return (
                <li key={debt.id}>
                  <button
                    type="button"
                    onClick={() => pilih(debt)}
                    className="baris w-full text-left"
                  >
                    <span
                      className={`flex h-11 w-11 shrink-0 items-center justify-center
                                  rounded-kartu text-base font-bold ${
                                    lama
                                      ? 'bg-tunggu-soft text-tunggu'
                                      : 'bg-slate-100 text-slate-600'
                                  }`}
                    >
                      {debt.person.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{debt.person}</span>
                      <span
                        className={`block text-sm ${lama ? 'text-tunggu' : 'text-slate-500'}`}
                      >
                        {umur === 0 ? 'Hari ini' : `${umur} hari`}
                        {M.isPositive(debt.paidAmount) &&
                          ` · sudah bayar ${M.format(debt.paidAmount)}`}
                      </span>
                    </span>
                    <span className="text-lg font-bold text-keluar">
                      <Uang nilai={outstanding(debt)} />
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </main>
  )
}
