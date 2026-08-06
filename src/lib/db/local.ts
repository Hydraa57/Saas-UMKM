import Dexie, { type EntityTable } from 'dexie'

/**
 * Basis data lokal di perangkat.
 *
 * Ini **sumber kebenaran saat aplikasi berjalan**, bukan singgahan
 * (cache). Setiap pembacaan di layar mengambil dari sini, dan setiap
 * penulisan mendarat di sini lebih dulu — jaringan menyusul belakangan.
 *
 * Alasannya bukan kenyamanan. Pesaing aplikasi ini adalah buku tulis,
 * dan buku tulis terbuka dalam nol detik tanpa sinyal. Aplikasi yang
 * menampilkan lingkaran berputar saat ibu ingin mencatat penjualan
 * Rp5.000 sudah kalah sebelum fiturnya sempat dinilai.
 *
 * Bentuk barisnya sengaja dibuat sama persis dengan tabel di peladen
 * (`snake_case`, uang sebagai bilangan bulat rupiah), supaya hasil
 * tarikan bisa disimpan apa adanya tanpa lapisan penerjemah yang harus
 * dijaga tetap sepadan di dua tempat.
 */

export interface LocalRow {
  id: string
  tenant_id: string
  updated_at?: string
}

export interface LocalProduct extends LocalRow {
  name: string
  photo_path: string | null
  sell_price: number
  cost_price: number
  stock_qty: number
  min_stock: number
  unit_label: string
  barcode: string | null
  sold_count: number
  archived_at: string | null
}

export interface LocalCustomer extends LocalRow {
  name: string
  phone: string | null
  note: string | null
  archived_at: string | null
}

export interface LocalWallet extends LocalRow {
  name: string
  kind: 'cash' | 'bank' | 'ewallet'
  opening_balance: number
  is_default: boolean
  archived_at: string | null
}

export interface LocalSale extends LocalRow {
  occurred_at: string
  customer_id: string | null
  total_amount: number
  discount_amount: number
  paid_amount: number
  payment_method: string | null
  note: string | null
  voided_at: string | null
}

export interface LocalSaleItem {
  id: string
  tenant_id: string
  sale_id: string
  product_id: string | null
  item_name: string
  qty: number
  unit_price: number
  unit_cost: number
  subtotal: number
}

export interface LocalTailorOrder extends LocalRow {
  customer_id: string
  order_no: string
  garment_type: string
  description: string | null
  qty: number
  price: number
  paid_amount: number
  promised_date: string | null
  status: 'queued' | 'in_progress' | 'done' | 'picked_up' | 'cancelled'
  measurement_snapshot: Record<string, unknown> | null
  note: string | null
  created_at: string
}

export interface LocalCashEntry extends LocalRow {
  wallet_id: string
  occurred_at: string
  direction: 'in' | 'out'
  amount: number
  category: string
  note: string | null
  source_type: string | null
  source_id: string | null
  deleted_at: string | null
}

/**
 * Panggilan RPC yang menunggu giliran dikirim.
 *
 * Antrean ini yang membuat "catat sekarang, kirim nanti" mungkin. Isinya
 * bukan baris data, melainkan **maksud** — nama fungsi beserta
 * argumennya — sehingga peladen tetap yang menghitung total dan
 * memperbarui stok, persis seperti kalau perangkat sedang daring.
 */
export interface OutboxItem {
  /** UUID dari perangkat. Sekaligus kunci idempotensi di peladen. */
  id: string
  tenant_id: string
  rpc: string
  args: Record<string, unknown>
  created_at: string
  attempts: number
  /** Kapan boleh dicoba lagi. Mundur bertahap setiap kegagalan. */
  next_attempt_at: string
  status: 'pending' | 'failed'
  last_error: string | null
}

/** Penanda posisi sinkronisasi dan pengaturan yang bertahan. */
export interface MetaRow {
  key: string
  value: unknown
}

export class LocalDatabase extends Dexie {
  products!: EntityTable<LocalProduct, 'id'>
  customers!: EntityTable<LocalCustomer, 'id'>
  wallets!: EntityTable<LocalWallet, 'id'>
  sales!: EntityTable<LocalSale, 'id'>
  saleItems!: EntityTable<LocalSaleItem, 'id'>
  tailorOrders!: EntityTable<LocalTailorOrder, 'id'>
  cashEntries!: EntityTable<LocalCashEntry, 'id'>
  outbox!: EntityTable<OutboxItem, 'id'>
  meta!: EntityTable<MetaRow, 'key'>

  constructor(name = 'nexausaha') {
    super(name)

    // Indeks dipilih dari query yang benar-benar dipakai layar, bukan
    // dari semua kolom yang mungkin. Indeks berlebih memperlambat
    // penulisan, dan penulisan ada di jalur yang harus paling cepat.
    this.version(1).stores({
      products: 'id, tenant_id, [tenant_id+archived_at], sold_count, name',
      customers: 'id, tenant_id, name',
      wallets: 'id, tenant_id',
      sales: 'id, tenant_id, occurred_at, customer_id',
      saleItems: 'id, sale_id, product_id',
      tailorOrders: 'id, tenant_id, status, promised_date, customer_id',
      cashEntries: 'id, tenant_id, occurred_at, category, wallet_id',
      outbox: 'id, status, next_attempt_at, created_at',
      meta: 'key',
    })
  }
}

let instance: LocalDatabase | null = null

/**
 * Basis data bersama untuk seluruh aplikasi.
 *
 * Dibuat malas, bukan saat modul dimuat, supaya berkas ini aman diimpor
 * di lingkungan tanpa IndexedDB — render di peladen dan pengujian yang
 * tidak menyentuh penyimpanan.
 */
export function db(): LocalDatabase {
  instance ??= new LocalDatabase()
  return instance
}

/** Hanya untuk pengujian: memakai basis data yang terisolasi. */
export function useDatabase(database: LocalDatabase | null): void {
  instance = database
}

export async function getMeta<T>(
  database: LocalDatabase,
  key: string,
): Promise<T | undefined> {
  const row = await database.meta.get(key)
  return row?.value as T | undefined
}

export async function setMeta(
  database: LocalDatabase,
  key: string,
  value: unknown,
): Promise<void> {
  await database.meta.put({ key, value })
}
