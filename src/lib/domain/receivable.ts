import * as M from '@/lib/money'
import type { Rupiah } from '@/lib/money'
import { calculateCart } from './cart'
import type { LocalDate, Sale, TailorOrder } from './types'
import { daysBetween, toLocalDate } from './dates'

/**
 * Piutang — "siapa yang belum bayar".
 *
 * Piutang sengaja tidak punya tabelnya sendiri. Piutang bukan benda,
 * melainkan keadaan: sebuah penjualan atau order jahit yang jumlah
 * terbayarnya belum menutup harganya. Membuatkan tabel tersendiri berarti
 * menyimpan angka yang sama di dua tempat, dan dua tempat yang menyimpan
 * angka yang sama pada akhirnya selalu berbeda.
 */

export type ReceivableSource = 'sale' | 'tailor_order'

export interface Receivable {
  readonly sourceType: ReceivableSource
  readonly sourceId: string
  readonly customerId: string | null
  readonly label: string
  readonly totalAmount: Rupiah
  readonly paidAmount: Rupiah
  readonly outstanding: Rupiah
  readonly since: LocalDate
  readonly ageInDays: number
}

/** Sisa yang harus dibayar. Tidak pernah negatif — kelebihan bayar bukan piutang. */
export function outstanding(total: Rupiah, paid: Rupiah): Rupiah {
  return M.clampToZero(M.subtract(total, paid))
}

/** Kelebihan bayar, kalau ada. Pasangan dari `outstanding`. */
export function overpayment(total: Rupiah, paid: Rupiah): Rupiah {
  return M.clampToZero(M.subtract(paid, total))
}

export function isSettled(total: Rupiah, paid: Rupiah): boolean {
  return paid >= total
}

/** Sudah dibayar sebagian, tapi belum lunas. */
export function isPartiallyPaid(total: Rupiah, paid: Rupiah): boolean {
  return M.isPositive(paid) && paid < total
}

export function saleReceivable(sale: Sale, today: LocalDate): Receivable | null {
  if (sale.voidedAt) return null

  const { total } = calculateCart(sale.lines, sale.discountAmount)
  const due = outstanding(total, sale.paidAmount)
  if (M.isZero(due)) return null

  const since = toLocalDate(sale.occurredAt)
  const firstLine = sale.lines[0]
  const label =
    sale.lines.length === 0
      ? 'Penjualan'
      : sale.lines.length === 1 && firstLine
        ? firstLine.itemName
        : `${firstLine?.itemName ?? 'Barang'} +${sale.lines.length - 1} lainnya`

  return {
    sourceType: 'sale',
    sourceId: sale.id,
    customerId: sale.customerId ?? null,
    label,
    totalAmount: total,
    paidAmount: sale.paidAmount,
    outstanding: due,
    since,
    ageInDays: daysBetween(since, today),
  }
}

/**
 * Order jahit yang belum lunas.
 *
 * Order yang dibatalkan dilewati. Order yang masih dikerjakan **ikut**,
 * karena kekurangan bayarnya nyata dan ibu perlu melihatnya saat
 * pelanggan datang mengambil — meski pendapatannya belum diakui di
 * laporan laba rugi. Kedua sudut pandang itu memang berbeda, dan
 * dipisahkan dengan sengaja.
 */
export function tailorReceivable(
  order: TailorOrder,
  today: LocalDate,
): Receivable | null {
  if (order.status === 'cancelled') return null

  const due = outstanding(order.price, order.paidAmount)
  if (M.isZero(due)) return null

  const since = toLocalDate(order.createdAt)

  return {
    sourceType: 'tailor_order',
    sourceId: order.id,
    customerId: order.customerId,
    label: `${order.garmentType} · ${order.orderNo}`,
    totalAmount: order.price,
    paidAmount: order.paidAmount,
    outstanding: due,
    since,
    ageInDays: daysBetween(since, today),
  }
}

export interface ReceivableSummary {
  readonly items: readonly Receivable[]
  readonly total: Rupiah
  readonly count: number
  /** Piutang yang sudah lewat 30 hari — yang perlu ditagih lebih dulu. */
  readonly overdue: readonly Receivable[]
}

export const OVERDUE_AFTER_DAYS = 30

/** Diurutkan dari yang paling lama, karena itu yang paling perlu ditagih. */
export function summarizeReceivables(
  items: readonly Receivable[],
): ReceivableSummary {
  const sorted = [...items].sort((a, b) => b.ageInDays - a.ageInDays)
  return {
    items: sorted,
    total: M.sum(sorted.map((item) => item.outstanding)),
    count: sorted.length,
    overdue: sorted.filter((item) => item.ageInDays >= OVERDUE_AFTER_DAYS),
  }
}

/** Mengelompokkan per pelanggan — ibu menagih per orang, bukan per transaksi. */
export function groupByCustomer(
  items: readonly Receivable[],
): Map<string | null, { total: Rupiah; items: Receivable[] }> {
  const groups = new Map<string | null, { total: Rupiah; items: Receivable[] }>()

  for (const item of items) {
    const existing = groups.get(item.customerId)
    if (existing) {
      existing.items.push(item)
      existing.total = M.add(existing.total, item.outstanding)
    } else {
      groups.set(item.customerId, { total: item.outstanding, items: [item] })
    }
  }

  return groups
}

/**
 * Membagi satu pembayaran ke beberapa piutang, dari yang paling lama.
 *
 * Dipakai saat pelanggan datang membayar sejumlah uang tanpa menyebut
 * utang yang mana. Melunasi yang paling lama lebih dulu adalah kebiasaan
 * yang wajar dan mudah dijelaskan kalau ditanya.
 *
 * Sisa uang setelah semua piutang tertutup dikembalikan di `remainder`,
 * dan pemanggil yang memutuskan mau diapakan — dijadikan kembalian atau
 * disimpan sebagai titipan.
 */
export function allocatePayment(
  items: readonly Receivable[],
  amount: Rupiah,
): {
  readonly allocations: ReadonlyArray<{
    readonly receivable: Receivable
    readonly amount: Rupiah
  }>
  readonly remainder: Rupiah
} {
  const oldestFirst = [...items].sort((a, b) => b.ageInDays - a.ageInDays)
  const allocations: Array<{ receivable: Receivable; amount: Rupiah }> = []
  let left = amount

  for (const receivable of oldestFirst) {
    if (!M.isPositive(left)) break
    const applied = M.min(left, receivable.outstanding)
    allocations.push({ receivable, amount: applied })
    left = M.subtract(left, applied)
  }

  return { allocations, remainder: left }
}
