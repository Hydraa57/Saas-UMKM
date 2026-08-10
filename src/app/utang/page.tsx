'use client'

import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db/local'
import { actionContext, useApp } from '@/lib/useApp'
import { payDebt } from '@/lib/actions/pos'
import { fromDb } from '@/lib/money'
import * as M from '@/lib/money'
import { Uang } from '@/components/Uang'
import { PapanAngka } from '@/components/PapanAngka'
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
        <a href="/mulai" className="btn-aksi justify-center bg-slate-900 text-white">
          Buka pengaturan
        </a>
      </main>
    )
  }

  // ── Layar terima pembayaran ────────────────────────────────────────
  if (aktif) {
    return (
      <main className="flex flex-1 flex-col gap-4 p-4 pb-28">
        <header className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setDipilih(null)}
            aria-label="Kembali ke daftar"
            className="flex h-touch w-touch items-center justify-center rounded-xl
                       bg-slate-200 text-2xl text-slate-700"
          >
            ←
          </button>
          <h1 className="text-xl font-bold">{aktif.person}</h1>
        </header>

        <div className="kartu">
          <p className="text-sm text-slate-500">Sisa utang</p>
          <p className="text-money text-keluar">
            <Uang nilai={sisaAktif} />
          </p>
          <p className="mt-1 text-slate-600">
            {ageInDays(aktif, hariIni)} hari
            {aktif.note ? ` · ${aktif.note}` : ''}
          </p>
        </div>

        <div className="kartu">
          <p className="text-sm text-slate-500">Uang diterima</p>
          <p className="text-money-lg text-masuk">
            <Uang nilai={jumlah} />
          </p>
          {M.isPositive(M.subtract(sisaAktif, jumlah)) && (
            <p className="mt-1 text-slate-600">
              Masih kurang{' '}
              <Uang nilai={M.subtract(sisaAktif, jumlah)} className="font-semibold" />
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => setJumlah(sisaAktif)}
          className="min-h-touch rounded-xl bg-slate-200 font-semibold text-slate-800"
        >
          Lunas
        </button>

        <PapanAngka
          nilai={jumlah}
          onChange={setJumlah}
          pintasan={[5_000, 10_000, 20_000, 50_000]}
        />

        <div
          className="fixed inset-x-0 bottom-0 mx-auto max-w-md border-t border-slate-200
                     bg-slate-50/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur"
        >
          <button
            type="button"
            disabled={!M.isPositive(jumlah) || menyimpan}
            onClick={terima}
            className="btn-aksi justify-center bg-slate-900 text-white
                       disabled:bg-slate-300 disabled:text-slate-500"
          >
            Terima pembayaran
          </button>
        </div>
      </main>
    )
  }

  // ── Daftar ─────────────────────────────────────────────────────────
  return (
    <main className="flex flex-1 flex-col gap-3 p-4 pb-8">
      <header className="flex items-center gap-3">
        <a
          href="/"
          aria-label="Kembali"
          className="flex h-touch w-touch items-center justify-center rounded-xl
                     bg-slate-200 text-2xl text-slate-700"
        >
          ←
        </a>
        <h1 className="text-xl font-bold">Belum bayar</h1>
      </header>

      {ringkas.count === 0 ? (
        <div className="kartu">
          <p className="font-semibold">Tidak ada yang berutang</p>
          <p className="mt-1 text-slate-600">
            Piutang muncul sendiri dari struk yang kurang bayar, selama nama
            pembelinya diisi.
          </p>
        </div>
      ) : (
        <>
          <div className="kartu">
            <p className="text-sm text-slate-500">
              {ringkas.count} orang belum bayar
            </p>
            <p className="text-money text-keluar">
              <Uang nilai={ringkas.total} />
            </p>
            {ringkas.stale.length > 0 && (
              <p className="mt-1 text-tunggu">
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
                    className="flex w-full items-center gap-3 rounded-2xl bg-white p-3
                               text-left shadow-sm active:bg-slate-100"
                  >
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
