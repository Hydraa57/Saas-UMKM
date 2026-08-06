'use client'

import { useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db/local'
import { summarizeCash } from '@/lib/domain/cash'
import { buildBoard } from '@/lib/domain/tailor'
import { dayRange, today } from '@/lib/domain/dates'
import { summarizeReceivables, saleReceivable } from '@/lib/domain/receivable'
import { fromDb, ZERO } from '@/lib/money'
import { Uang } from '@/components/Uang'
import type { CashEntry, Sale, TailorOrder } from '@/lib/domain/types'

/**
 * Beranda.
 *
 * Tiga tombol dan satu angka — batas keras dari docs/02-prd.md §5.1.
 * Tiap menu tambahan menurunkan peluang menemukan yang benar, dan yang
 * ibu lakukan tiap hari adalah *mencatat*, bukan *menganalisis*. Laporan
 * ada, tapi di lapis kedua.
 *
 * Label dan urutan tombolnya masih hipotesis sampai wawancara lapangan
 * selesai (docs/06-wawancara-lapangan.md). Istilah yang dipakai di sini
 * harus diganti dengan istilah yang ibu pakai sendiri — itu sebabnya
 * semuanya dikumpulkan di satu tempat di bawah, bukan disebar ke
 * seluruh berkas.
 */

const AKSI = [
  {
    href: '/jual',
    ikon: '🍪',
    judul: 'Jual Snack',
    warna: 'bg-masuk-soft text-emerald-900',
  },
  {
    href: '/jahit',
    ikon: '✂️',
    judul: 'Order Jahit',
    warna: 'bg-indigo-100 text-indigo-900',
  },
  {
    href: '/keluar',
    ikon: '💸',
    judul: 'Catat Keluar',
    warna: 'bg-keluar-soft text-red-900',
  },
] as const

export default function Beranda() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined)
    }
  }, [])

  const hariIni = today()
  const ringkasan = useLiveQuery(async () => {
    const { from, to } = dayRange(hariIni)

    const entriHariIni = await db()
      .cashEntries.where('occurred_at')
      .between(from, to, true, false)
      .toArray()

    const kas = summarizeCash(
      entriHariIni
        .filter((baris) => !baris.deleted_at)
        .map(
          (baris): CashEntry => ({
            id: baris.id,
            walletId: baris.wallet_id,
            occurredAt: baris.occurred_at,
            direction: baris.direction,
            amount: fromDb(baris.amount),
            category: baris.category as CashEntry['category'],
            note: baris.note,
          }),
        ),
    )

    const orders = await db().tailorOrders.toArray()
    const papan = buildBoard(
      orders.map(
        (baris): TailorOrder => ({
          id: baris.id,
          orderNo: baris.order_no,
          customerId: baris.customer_id,
          garmentType: baris.garment_type,
          price: fromDb(baris.price),
          paidAmount: fromDb(baris.paid_amount),
          promisedDate: baris.promised_date,
          status: baris.status,
          createdAt: baris.created_at,
        }),
      ),
      hariIni,
    )

    const penjualan = await db().sales.toArray()
    const piutang = summarizeReceivables(
      (
        await Promise.all(
          penjualan.map(async (baris) => {
            const items = await db().saleItems.where('sale_id').equals(baris.id).toArray()
            const sale: Sale = {
              id: baris.id,
              occurredAt: baris.occurred_at,
              lines: items.map((item) => ({
                itemName: item.item_name,
                productId: item.product_id,
                qty: item.qty,
                unitPrice: fromDb(item.unit_price),
                unitCost: fromDb(item.unit_cost),
              })),
              discountAmount: fromDb(baris.discount_amount),
              paidAmount: fromDb(baris.paid_amount),
              customerId: baris.customer_id,
              voidedAt: baris.voided_at,
            }
            return saleReceivable(sale, hariIni)
          }),
        )
      ).filter((item) => item !== null),
    )

    return { kas, papan, piutang }
  }, [hariIni])

  const masuk = ringkasan?.kas.totalIn ?? ZERO
  const keluar = ringkasan?.kas.totalOut ?? ZERO
  const jatuhTempo =
    (ringkasan?.papan.overdue.length ?? 0) + (ringkasan?.papan.dueToday.length ?? 0)
  const piutang = ringkasan?.piutang.total ?? ZERO

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 pb-8">
      <header className="kartu">
        <p className="text-sm text-slate-500">Uang masuk hari ini</p>
        <p className="text-money text-masuk">
          <Uang nilai={masuk} />
        </p>
        <p className="mt-1 text-slate-600">
          Keluar <Uang nilai={keluar} className="font-semibold text-keluar" />
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

      {/* Pengingat hanya muncul kalau ada isinya. Penanda kosong yang
          selalu ada akan berhenti dibaca dalam seminggu. */}
      {(jatuhTempo > 0 || piutang > 0) && (
        <section className="flex flex-col gap-2">
          {jatuhTempo > 0 && (
            <a href="/jahit" className="kartu flex items-center gap-3 text-tunggu">
              <span aria-hidden>⏰</span>
              <span className="font-semibold">
                {jatuhTempo} jahitan harus jadi hari ini
              </span>
            </a>
          )}
          {piutang > 0 && (
            <a href="/utang" className="kartu flex items-center gap-3">
              <span aria-hidden>📒</span>
              <span className="font-semibold">
                Belum bayar <Uang nilai={piutang} />
              </span>
            </a>
          )}
        </section>
      )}
    </main>
  )
}
