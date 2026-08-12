'use client'

import Link from 'next/link'
import { use, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db/local'
import { actionContext, useApp } from '@/lib/useApp'
import { voidSale } from '@/lib/actions/pos'
import { fromDb } from '@/lib/money'
import * as M from '@/lib/money'
import {
  receiptForWhatsapp,
  renderReceipt,
  summarizeReceipt,
  whatsappShareUrl,
} from '@/lib/domain/receipt'
import { Uang } from '@/components/Uang'
import { bluetoothTersedia, cetakStruk, PrinterError } from '@/lib/print/bluetooth'
import { AppBar } from '@/components/AppBar'
import { Ikon } from '@/components/Ikon'
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
  const { businessName, businessPhone, tenantId, ready } = useApp()

  const [mencetak, setMencetak] = useState(false)
  const [pesanCetak, setPesanCetak] = useState<string | null>(null)
  const [konfirmasiBatal, setKonfirmasiBatal] = useState(false)
  const [membatalkan, setMembatalkan] = useState(false)

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
    return <main className="layar flex-1 p-4" aria-busy="true" />
  }

  if (sale === null) {
    return (
      <main className="layar flex flex-1 flex-col gap-4 p-4">
        <p className="kartu">Struk tidak ditemukan.</p>
        <Link href="/riwayat" className="btn-sekunder btn-besar">
          Kembali
        </Link>
      </main>
    )
  }

  const header = { businessName, phone: businessPhone }
  const teks = renderReceipt(sale, header)
  const ringkas = summarizeReceipt(sale)
  const shareUrl = whatsappShareUrl(receiptForWhatsapp(sale, header))

  async function cetak() {
    setMencetak(true)
    setPesanCetak(null)
    try {
      // Teks yang sama persis dengan yang tampil di atas dan yang dikirim
      // ke WhatsApp. Tidak ada penyusunan kedua.
      const { namaPrinter } = await cetakStruk(teks)
      setPesanCetak(`Tercetak di ${namaPrinter}.`)
    } catch (e) {
      // Gagal mencetak bukan gagal menyimpan: penjualannya sudah tercatat
      // jauh sebelum tombol ini disentuh.
      setPesanCetak(
        e instanceof PrinterError ? e.message : 'Gagal mencetak. Coba lagi.',
      )
    } finally {
      setMencetak(false)
    }
  }

  async function batalkan() {
    if (!tenantId || membatalkan) return
    setMembatalkan(true)
    try {
      await voidSale(actionContext(tenantId), id)
      setKonfirmasiBatal(false)
    } finally {
      setMembatalkan(false)
    }
  }

  const dibatalkan = Boolean(sale.voidedAt)

  return (
    <main className="layar flex flex-1 flex-col gap-3 px-4 pb-8">
      <AppBar judul={`Struk ${sale.invoiceNo}`} kembali="/riwayat" />

      <div className="kartu-gelap animate-naik text-center">
        <span
          className={`mx-auto flex h-14 w-14 items-center justify-center rounded-kartu ${
            dibatalkan ? 'bg-white/10 text-slate-300' : 'bg-masuk/30 text-emerald-300'
          }`}
        >
          <Ikon nama={dibatalkan ? 'silang' : 'cek'} ukuran={28} tebal={2.4} />
        </span>
        <p className="mt-3 text-sm font-medium text-slate-400">
          {dibatalkan ? 'Struk dibatalkan' : 'Transaksi tersimpan'}
        </p>
        <p className={`text-money mt-1 ${dibatalkan ? 'text-slate-500 line-through' : ''}`}>
          <Uang nilai={ringkas.total} />
        </p>
        {!dibatalkan && M.isPositive(ringkas.change) && (
          <p className="mt-4 flex items-center justify-between rounded-kartu bg-white/10 px-4 py-3 text-left">
            <span className="font-semibold">Kembali</span>
            <span className="text-xl font-bold">
              <Uang nilai={ringkas.change} />
            </span>
          </p>
        )}
        {!dibatalkan && M.isPositive(ringkas.outstanding) && (
          <p className="mt-4 flex items-center justify-between rounded-kartu bg-keluar/25 px-4 py-3 text-left">
            <span className="font-semibold">Kurang</span>
            <span className="text-xl font-bold">
              <Uang nilai={ringkas.outstanding} />
            </span>
          </p>
        )}
      </div>

      {/* Lebar huruf tetap: bentuknya sama persis dengan yang dibagikan
          dan yang dicetak. */}
      <pre
        className="overflow-x-auto rounded-kartu bg-white p-4 font-mono text-[13px]
                   leading-snug text-slate-700 border border-garis"
      >
        {teks}
      </pre>

      <a
        href={shareUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-besar bg-masuk text-white active:bg-masuk-kuat"
      >
        <Ikon nama="wa" ukuran={22} />
        Kirim ke WhatsApp
      </a>

      {/* Tombol cetak hanya muncul kalau perambannya memang bisa. Tombol
          yang selalu ada lalu selalu gagal membuat orang mengira
          printernya rusak. */}
      {bluetoothTersedia() && (
        <button
          type="button"
          disabled={mencetak}
          onClick={cetak}
          className="btn-sekunder btn-besar"
        >
          <Ikon nama="cetak" ukuran={22} />
          {mencetak ? 'Mencetak…' : 'Cetak ke printer'}
        </button>
      )}

      {pesanCetak && (
        <p role="status" className="kartu animate-naik text-slate-700">
          {pesanCetak}
        </p>
      )}

      {/* Pembatalan diletakkan paling bawah dan butuh dua ketukan.
          Ia mengembalikan stok dan menarik uang dari buku kas sekaligus,
          dan tidak ada yang lebih mahal daripada pembatalan yang tidak
          disengaja saat pembeli masih di depan meja. */}
      {!dibatalkan &&
        (konfirmasiBatal ? (
          <div className="kartu flex flex-col gap-3">
            <p className="font-semibold">Batalkan struk ini?</p>
            <p className="text-slate-600">
              Stoknya kembali dan uangnya ditarik dari buku kas. Struknya
              tetap tersimpan sebagai riwayat, tidak dihapus.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                disabled={membatalkan}
                onClick={batalkan}
                className="btn-bahaya flex-1"
              >
                Ya, batalkan
              </button>
              <button
                type="button"
                onClick={() => setKonfirmasiBatal(false)}
                className="btn-sekunder flex-1"
              >
                Tidak
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setKonfirmasiBatal(true)}
            className="min-h-touch rounded-kartu font-semibold text-keluar
                       active:bg-keluar-soft"
          >
            Batalkan struk
          </button>
        ))}

      <div className="flex gap-3">
        <Link href="/kasir" className="btn-primer flex-1">
          Transaksi baru
        </Link>
        <Link href="/riwayat" className="btn-sekunder flex-1">
          Riwayat
        </Link>
      </div>

    </main>
  )
}
