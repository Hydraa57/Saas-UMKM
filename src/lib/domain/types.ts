import type { Rupiah } from '@/lib/money'

/**
 * Tipe domain. Sengaja tidak mengimpor apa pun dari Supabase atau Dexie —
 * seluruh isi `lib/domain` harus bisa diuji tanpa database.
 */

/** Tanggal kalender lokal, `YYYY-MM-DD`. Bukan instan waktu. */
export type LocalDate = string

/** Bulan kalender, `YYYY-MM`. */
export type LocalMonth = string

/**
 * Barang atau jasa.
 *
 * Satu tipe untuk keduanya, karena di layar kasir keduanya adalah hal
 * yang sama: sesuatu yang dijual, punya nama dan harga, diketuk untuk
 * masuk keranjang.
 *
 * Satu-satunya bedanya: **barang punya stok, jasa tidak.** "Potong
 * celana" tidak pernah habis. Perbedaan itu ada di tipe (`stockQty`
 * hanya ada pada barang) dan ditegakkan constraint di basis data, bukan
 * diserahkan ke kedisiplinan kode.
 */
export type ItemKind = 'barang' | 'jasa'

export const ITEM_KIND_LABELS: Readonly<Record<ItemKind, string>> = {
  barang: 'Barang',
  jasa: 'Jasa',
}

interface ItemBase {
  readonly id: string
  readonly name: string
  readonly photoPath?: string | null
  readonly price: Rupiah
  readonly costPrice: Rupiah
  readonly unit: string
  readonly barcode?: string | null
  /** Menentukan urutan grid kasir; yang sering dijual naik sendiri. */
  readonly soldCount: number
  readonly archivedAt?: string | null
}

export interface Barang extends ItemBase {
  readonly kind: 'barang'
  readonly stockQty: number
  readonly minStock: number
}

export interface Jasa extends ItemBase {
  readonly kind: 'jasa'
  /** Sengaja tidak ada `stockQty`. Jasa tidak pernah habis. */
}

export type Item = Barang | Jasa

/** Penyempit tipe, supaya stok tidak pernah diakses pada jasa. */
export function isBarang(item: Item): item is Barang {
  return item.kind === 'barang'
}

/** Baris di keranjang kasir. */
export interface CartLine {
  /** Kosong untuk barang di luar katalog (tombol "lainnya"). */
  readonly itemId: string | null
  readonly itemKind: ItemKind
  /** Salinan nama saat transaksi — katalog boleh berubah nanti. */
  readonly itemName: string
  readonly qty: number
  readonly unitPrice: Rupiah
  readonly unitCost: Rupiah
}

export type PaymentMethod = 'tunai' | 'qris' | 'transfer' | 'utang'

export const PAYMENT_LABELS: Readonly<Record<PaymentMethod, string>> = {
  tunai: 'Tunai',
  qris: 'QRIS',
  transfer: 'Transfer',
  utang: 'Utang',
}

export interface Sale {
  readonly id: string
  readonly invoiceNo: string
  readonly occurredAt: string
  readonly lines: readonly CartLine[]
  readonly discount: Rupiah
  readonly paid: Rupiah
  readonly paymentMethod?: PaymentMethod | null
  readonly customerName?: string | null
  readonly note?: string | null
  readonly voidedAt?: string | null
}

export type EntryKind = 'income' | 'expense' | 'transfer'
export type Direction = 'in' | 'out'

export type Category =
  | 'penjualan'
  | 'jasa'
  | 'modal'
  | 'operasional'
  | 'upah'
  | 'sewa'
  | 'lainnya'
  | 'pindah'

/**
 * Kategori yang boleh dipilih saat mencatat biaya secara manual.
 *
 * `penjualan`, `jasa`, dan `modal` sengaja tidak ada di sini: ketiganya
 * lahir dari kasir dan kulakan. Kalau bisa dibuat manual, buku kas akan
 * punya baris kulakan yang tidak berpasangan dengan kulakan mana pun.
 */
export const EXPENSE_CATEGORIES: readonly Category[] = [
  'operasional',
  'upah',
  'sewa',
  'lainnya',
]

export const CATEGORY_LABELS: Readonly<Record<Category, string>> = {
  penjualan: 'Penjualan',
  jasa: 'Jasa',
  modal: 'Modal & Bahan',
  operasional: 'Operasional',
  upah: 'Upah',
  sewa: 'Sewa',
  lainnya: 'Lainnya',
  pindah: 'Pindah Kas',
}

export type BusinessType =
  | 'dagang'
  | 'makanan'
  | 'jasa'
  | 'campuran'
  | 'lainnya'

export const BUSINESS_TYPE_LABELS: Readonly<Record<BusinessType, string>> = {
  dagang: 'Dagang',
  makanan: 'Makanan & Minuman',
  jasa: 'Jasa',
  campuran: 'Barang & Jasa',
  lainnya: 'Lainnya',
}

export const BUSINESS_TYPE_HINTS: Readonly<Record<BusinessType, string>> = {
  dagang: 'Warung, toko, kelontong, toko online',
  makanan: 'Katering, gerobak, warung makan, kue',
  jasa: 'Jahit, laundry, salon, servis, bengkel',
  campuran: 'Jual barang sekaligus terima pesanan jasa',
  lainnya: 'Belum masuk pilihan di atas',
}

export type WalletKind = 'tunai' | 'bank' | 'ewallet'

export const WALLET_KIND_LABELS: Readonly<Record<WalletKind, string>> = {
  tunai: 'Tunai',
  bank: 'Rekening',
  ewallet: 'E-wallet',
}

export interface Wallet {
  readonly id: string
  readonly name: string
  readonly kind: WalletKind
  readonly openingBalance: Rupiah
  readonly isDefault: boolean
  readonly archivedAt?: string | null
}

export interface CashEntry {
  readonly id: string
  readonly walletId: string
  readonly occurredAt: string
  readonly direction: Direction
  readonly amount: Rupiah
  readonly kind: EntryKind
  readonly category: Category
  readonly note?: string | null
  readonly transferGroupId?: string | null
  readonly deletedAt?: string | null
}

export type DebtSide = 'receivable' | 'payable'

export interface Debt {
  readonly id: string
  readonly side: DebtSide
  readonly person: string
  readonly amount: Rupiah
  readonly paidAmount: Rupiah
  readonly saleId?: string | null
  readonly occurredAt: string
  readonly note?: string | null
  readonly settledAt?: string | null
  readonly deletedAt?: string | null
}

export type StockReason =
  | 'awal'
  | 'penjualan'
  | 'kulakan'
  | 'koreksi'
  | 'retur'
  | 'rusak'

export const STOCK_REASON_LABELS: Readonly<Record<StockReason, string>> = {
  awal: 'Stok awal',
  penjualan: 'Terjual',
  kulakan: 'Kulakan',
  koreksi: 'Koreksi',
  retur: 'Retur',
  rusak: 'Rusak',
}

export interface StockMovement {
  readonly id: string
  readonly itemId: string
  readonly occurredAt: string
  readonly qtyChange: number
  readonly reason: StockReason
  readonly note?: string | null
}
