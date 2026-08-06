import type { Rupiah } from '@/lib/money'

/**
 * Tipe domain. Sengaja tidak mengimpor apa pun dari Supabase atau Dexie —
 * seluruh isi `lib/domain` harus bisa diuji tanpa database.
 */

/** Tanggal kalender lokal, `YYYY-MM-DD`. Bukan instan waktu. */
export type LocalDate = string

export type CashDirection = 'in' | 'out'

/**
 * Kategori entri buku kas.
 *
 * Pembagiannya tidak sembarangan: kategori inilah yang menentukan sebuah
 * pergerakan uang ikut dihitung sebagai untung atau tidak. Lihat
 * `profit.ts` untuk aturannya, dan `cash.ts` untuk arus kasnya.
 */
export type CashCategory =
  /** Uang masuk dari penjualan barang yang dibayar saat itu juga. */
  | 'sale'
  /** Uang masuk dari jasa — DP maupun pelunasan jahitan. */
  | 'service'
  /** Pelunasan utang lama. Bukan pendapatan baru. */
  | 'receivable'
  /** Uang pribadi dimasukkan ke usaha. Bukan pendapatan. */
  | 'capital'
  /** Pemasukan lain yang benar-benar pendapatan. */
  | 'other_in'
  /** Kulakan barang dagangan. Jadi persediaan, bukan biaya. */
  | 'purchase'
  /** Biaya jalan: listrik, plastik, benang, ongkos. */
  | 'operational'
  /** Uang usaha dipakai untuk keperluan pribadi. Bukan biaya. */
  | 'owner_draw'
  /** Pengeluaran lain yang benar-benar biaya. */
  | 'other_out'

export const IN_CATEGORIES = [
  'sale',
  'service',
  'receivable',
  'capital',
  'other_in',
] as const satisfies readonly CashCategory[]

export const OUT_CATEGORIES = [
  'purchase',
  'operational',
  'owner_draw',
  'other_out',
] as const satisfies readonly CashCategory[]

export interface CashEntry {
  readonly id: string
  readonly walletId: string
  readonly occurredAt: string
  readonly direction: CashDirection
  readonly amount: Rupiah
  readonly category: CashCategory
  readonly note?: string | null
}

export interface SaleLine {
  /** Salinan nama saat transaksi — nama produk boleh berubah nanti. */
  readonly itemName: string
  readonly productId?: string | null
  readonly qty: number
  readonly unitPrice: Rupiah
  /** Salinan modal saat transaksi. Inilah yang jadi modal barang terjual. */
  readonly unitCost: Rupiah
}

export interface Sale {
  readonly id: string
  readonly occurredAt: string
  readonly lines: readonly SaleLine[]
  readonly discountAmount: Rupiah
  readonly paidAmount: Rupiah
  readonly customerId?: string | null
  readonly voidedAt?: string | null
}

export type TailorStatus =
  | 'queued'
  | 'in_progress'
  | 'done'
  | 'picked_up'
  | 'cancelled'

export interface TailorOrder {
  readonly id: string
  readonly orderNo: string
  readonly customerId: string
  readonly garmentType: string
  readonly price: Rupiah
  readonly paidAmount: Rupiah
  readonly promisedDate?: LocalDate | null
  readonly status: TailorStatus
  readonly createdAt: string
}
