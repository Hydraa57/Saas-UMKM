'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db/local'
import { useApp } from '@/lib/useApp'
import { fromDb, ZERO } from '@/lib/money'
import * as M from '@/lib/money'
import { Uang } from '@/components/Uang'
import { formatLocalDate, toLocalDate, today } from '@/lib/domain/dates'

/**
 * Riwayat struk.
 *
 * Ada karena pembeli sering baru minta struknya setelah transaksi
 * berikutnya sudah dimulai — dan karena struk yang tidak bisa dibuka
 * ulang membuat pembatalan jadi mustahil.
 *
 * Dikelompokkan per hari, bukan daftar panjang tanpa jeda: pertanyaan
 * yang dibawa orang ke layar ini hampir selalu berbentuk "yang tadi
 * siang" atau "yang kemarin", bukan "yang ke-37".
 *
 * Yang dibatalkan tetap muncul, dicoret. Menyembunyikannya membuat
 * jumlah struk hari itu tidak pernah bisa dicocokkan dengan apa pun.
 */

interface BarisStruk {
  readonly id: string
  readonly invoiceNo: string
  readonly occurredAt: string
  readonly total: number
  readonly paid: number
  readonly customerName: string | null
  readonly voided: boolean
  readonly itemCount: number
}

export default function Riwayat() {
  const { ready, tenantId } = useApp()
  const hariIni = today()

  const data = useLiveQuery(async () => {
    const baris = await db().saleItems.toArray()
    const jumlahBaris = new Map<string, number>()
    for (const b of baris) {
      jumlahBaris.set(b.sale_id, (jumlahBaris.get(b.sale_id) ?? 0) + 1)
    }

    return (await db().sales.toArray())
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
      .map(
        (row): BarisStruk => ({
          id: row.id,
          invoiceNo: row.invoice_no,
          occurredAt: row.occurred_at,
          total: fromDb(row.total),
          paid: fromDb(row.paid),
          customerName: row.customer_name,
          voided: Boolean(row.voided_at),
          itemCount: jumlahBaris.get(row.id) ?? 0,
        }),
      )
  }, [])

  if (!ready || data === undefined) {
    return <main className="flex-1 p-4" aria-busy="true" />
  }

  if (!tenantId) {
    return (
      <main className="flex flex-1 flex-col gap-4 p-4">
        <p className="kartu">Pengaturan awal belum selesai.</p>
        <a href="/mulai" className="btn-aksi justify-center bg-slate-900 text-white">
          Buka pengaturan
        </a>
      </main>
    )
  }

  // Dikelompokkan per tanggal kalender di zona waktu usaha, bukan per UTC:
  // struk jam 00.30 WIB harus masuk hari itu, bukan hari sebelumnya.
  const perHari = new Map<string, BarisStruk[]>()
  for (const struk of data) {
    const tanggal = toLocalDate(struk.occurredAt)
    const isi = perHari.get(tanggal)
    if (isi) isi.push(struk)
    else perHari.set(tanggal, [struk])
  }

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 pb-8">
      <header className="flex items-center gap-3">
        <a
          href="/"
          aria-label="Kembali"
          className="flex h-touch w-touch items-center justify-center rounded-xl
                     bg-slate-200 text-2xl text-slate-700"
        >
          ←
        </a>
        <h1 className="text-xl font-bold">Riwayat struk</h1>
      </header>

      {data.length === 0 ? (
        <div className="kartu">
          <p className="font-semibold">Belum ada transaksi</p>
          <p className="mt-1 text-slate-600">
            Struk muncul di sini begitu ada penjualan pertama.
          </p>
          <a href="/kasir" className="btn-aksi mt-4 justify-center bg-slate-900 text-white">
            Buka kasir
          </a>
        </div>
      ) : (
        [...perHari.entries()].map(([tanggal, struk]) => {
          // Yang dibatalkan tidak ikut total harinya — uangnya sudah
          // ditarik kembali dari buku kas.
          const hidup = struk.filter((s) => !s.voided)
          const total = M.sum(hidup.map((s) => M.rupiah(s.total)))

          return (
            <section key={tanggal}>
              <h2 className="mb-2 flex items-baseline justify-between text-sm text-slate-500">
                <span>
                  {tanggal === hariIni ? 'Hari ini' : formatLocalDate(tanggal)}
                </span>
                <span className="font-semibold text-slate-700">
                  {hidup.length} struk · <Uang nilai={total} />
                </span>
              </h2>

              <ul className="flex flex-col gap-2">
                {struk.map((s) => {
                  const kurang = M.clampToZero(
                    M.subtract(M.rupiah(s.total), M.rupiah(s.paid)),
                  )
                  return (
                    <li key={s.id}>
                      <a
                        href={`/struk/${s.id}`}
                        className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm
                                   active:bg-slate-100"
                      >
                        <span className="min-w-0 flex-1">
                          <span
                            className={`block font-semibold ${
                              s.voided ? 'text-slate-400 line-through' : ''
                            }`}
                          >
                            {s.invoiceNo}
                          </span>
                          <span className="block text-sm text-slate-500">
                            {s.itemCount} item
                            {s.customerName ? ` · ${s.customerName}` : ''}
                            {s.voided ? ' · dibatalkan' : ''}
                          </span>
                          {!s.voided && M.isPositive(kurang) && (
                            <span className="block text-sm text-keluar">
                              Belum lunas <Uang nilai={kurang} />
                            </span>
                          )}
                        </span>
                        <span
                          className={`text-lg font-bold ${
                            s.voided ? 'text-slate-400 line-through' : ''
                          }`}
                        >
                          <Uang nilai={M.rupiah(s.total) ?? ZERO} />
                        </span>
                        <span aria-hidden className="text-xl text-slate-400">
                          ›
                        </span>
                      </a>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })
      )}
    </main>
  )
}
