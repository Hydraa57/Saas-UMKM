import { fromDb } from '@/lib/money'
import type { LocalDatabase, LocalSale, LocalSaleItem } from './local'
import type { CartLine, PaymentMethod, Sale } from '@/lib/domain/types'

/**
 * Menyusun ulang `Sale` dari baris-baris IndexedDB.
 *
 * Ada di satu tempat karena penyusunannya punya satu langkah yang mudah
 * terlupa: **barisnya harus diurutkan menurut `line_no`.** Kunci utama
 * `sale_items` adalah UUID acak, jadi tanpa pengurutan itu struk yang
 * sama bisa tampil dengan urutan berbeda tiap kali dibuka — pernah
 * terjadi, dan tidak ada yang menyadarinya sampai sebuah struk dibuka
 * dua kali berturut-turut.
 *
 * Dua layar sudah membutuhkannya (struk dan laporan), dan layar ketiga
 * yang menyalin ulang langkah ini pasti akan melupakan pengurutannya.
 */

export function toCartLine(row: LocalSaleItem): CartLine {
  return {
    itemId: row.item_id,
    itemKind: row.item_kind,
    itemName: row.item_name,
    qty: row.qty,
    unitPrice: fromDb(row.unit_price),
    unitCost: fromDb(row.unit_cost),
  }
}

export function toSale(row: LocalSale, lines: readonly LocalSaleItem[]): Sale {
  return {
    id: row.id,
    invoiceNo: row.invoice_no,
    occurredAt: row.occurred_at,
    lines: [...lines].sort((a, b) => a.line_no - b.line_no).map(toCartLine),
    discount: fromDb(row.discount),
    paid: fromDb(row.paid),
    paymentMethod: (row.payment_method as PaymentMethod | null) ?? null,
    customerName: row.customer_name,
    note: row.note,
    voidedAt: row.voided_at,
  }
}

/**
 * Seluruh struk beserta isinya.
 *
 * Barisnya dikelompokkan lebih dulu dalam satu lintasan, bukan disaring
 * ulang untuk tiap struk. Dengan seratus struk sebulan, cara yang naif
 * jadi seratus kali pemindaian tabel — dan laporan yang butuh dua detik
 * untuk terbuka tidak akan pernah dibuka.
 */
export async function readSales(database: LocalDatabase): Promise<readonly Sale[]> {
  const [sales, items] = await Promise.all([
    database.sales.toArray(),
    database.saleItems.toArray(),
  ])

  const perStruk = new Map<string, LocalSaleItem[]>()
  for (const row of items) {
    const ada = perStruk.get(row.sale_id)
    if (ada) ada.push(row)
    else perStruk.set(row.sale_id, [row])
  }

  return sales.map((row) => toSale(row, perStruk.get(row.id) ?? []))
}
