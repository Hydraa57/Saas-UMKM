'use client'

import { use } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db/local'
import { useApp } from '@/lib/useApp'
import { fromDb } from '@/lib/money'
import * as M from '@/lib/money'
import {
  receiptForWhatsapp,
  renderReceipt,
  summarizeReceipt,
  whatsappShareUrl,
} from '@/lib/domain/receipt'
import { Uang } from '@/components/Uang'
import type { CartLine, PaymentMethod, Sale } from '@/lib/domain/types'

/**
 * Struk.
 *
 * Halaman sendiri, bukan tampilan sekali lewat setelah bayar, supaya
 * bisa dibuka ulang dari riwayat — pembeli sering baru minta struknya
 * setelah transaksi berikutnya sudah dimulai.
 *
 * Isinya teks lebar tetap yang sama persis dengan yang dikirim ke
 * WhatsApp dan yang nanti dicetak ke printer termal. Struk yang berbeda
 * antara yang dilihat, dibagikan, dan dicetak adalah persis jenis
 * selisih yang membuat pembeli curiga.
 */

export default function LayarStruk({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>
}) {
  const { id } = use(params)
  const { businessName, businessPhone, ready } = useApp()

  const sale = useLiveQuery(async () => {
    const row = await db().sales.get(id)
    if (!row) return null

    const lines = (await db().saleItems.toArray())
      .filter((r) => r.sale_id === id)
      // Urutan keranjang, bukan urutan penyimpanan: kunci utamanya UUID
      // acak, jadi tanpa pengurutan ini struk yang sama bisa tampil
      // dengan urutan berbeda tiap kali dibuka.
      .sort((a, b) => a.line_no - b.line_no)
      .map(
        (r): CartLine => ({
          itemId: r.item_id,
          itemKind: r.item_kind,
          itemName: r.item_name,
          qty: r.qty,
          unitPrice: fromDb(r.unit_price),
          unitCost: fromDb(r.unit_cost),
        }),
      )

    const built: Sale = {
      id: row.id,
      invoiceNo: row.invoice_no,
      occurredAt: row.occurred_at,
      lines,
      discount: fromDb(row.discount),
      paid: fromDb(row.paid),
      paymentMethod: (row.payment_method as PaymentMethod) ?? 'tunai',
      customerName: row.customer_name,
      note: row.note,
      voidedAt: row.voided_at,
    }
    return built
  }, [id])

  if (!ready || sale === undefined) {
    return <main className="flex-1 p-4" aria-busy="true" />
  }

  if (sale === null) {
    return (
      <main className="flex flex-1 flex-col gap-4 p-4">
        <p className="kartu">Struk tidak ditemukan.</p>
        <a href="/" className="btn-aksi justify-center bg-slate-200 text-slate-900">
          Kembali
        </a>
      </main>
    )
  }

  const header = { businessName, phone: businessPhone }
  const teks = renderReceipt(sale, header)
  const ringkas = summarizeReceipt(sale)
  const shareUrl = whatsappShareUrl(receiptForWhatsapp(sale, header))

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 pb-8">
      <div className="kartu text-center">
        <p className="text-4xl" aria-hidden>
          ✓
        </p>
        <p className="mt-2 text-slate-600">Transaksi tersimpan</p>
        <p className="text-money text-masuk">
          <Uang nilai={ringkas.total} />
        </p>
        {M.isPositive(ringkas.change) && (
          <p className="mt-1 text-lg">
            Kembali <Uang nilai={ringkas.change} className="font-bold" />
          </p>
        )}
        {M.isPositive(ringkas.outstanding) && (
          <p className="mt-1 text-lg text-keluar">
            Kurang <Uang nilai={ringkas.outstanding} className="font-bold" />
          </p>
        )}
      </div>

      {/* Lebar huruf tetap: bentuknya sama persis dengan yang dibagikan
          dan yang dicetak. */}
      <pre
        className="overflow-x-auto rounded-2xl bg-white p-4 font-mono text-[13px]
                   leading-snug shadow-sm"
      >
        {teks}
      </pre>

      <a
        href={shareUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-aksi justify-center bg-emerald-600 text-white"
      >
        Kirim ke WhatsApp
      </a>

      <div className="flex gap-3">
        <a
          href="/kasir"
          className="flex min-h-touch flex-1 items-center justify-center rounded-xl
                     bg-slate-900 font-semibold text-white"
        >
          Transaksi baru
        </a>
        <a
          href="/"
          className="flex min-h-touch flex-1 items-center justify-center rounded-xl
                     bg-slate-200 font-semibold text-slate-800"
        >
          Selesai
        </a>
      </div>

      {/* Printer termal menyusul: Web Bluetooth + ESC/POS, memakai teks
          yang sama persis. Belum dipasang supaya alur utamanya bisa diuji
          lebih dulu tanpa alat tambahan. */}
    </main>
  )
}
