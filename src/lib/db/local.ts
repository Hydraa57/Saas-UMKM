import Dexie, { type EntityTable } from 'dexie'

/**
 * Basis data lokal di perangkat.
 *
 * Ini **sumber kebenaran saat aplikasi berjalan**, bukan singgahan.
 * Setiap pembacaan di layar mengambil dari sini, dan setiap penulisan
 * mendarat di sini lebih dulu — jaringan menyusul belakangan.
 *
 * Untuk aplikasi kasir ini bukan kemewahan melainkan syarat: kasir yang
 * menunggu sinyal saat pembeli antre di depan tidak akan dipakai dua
 * kali. Sinyal di warung, pasar, dan pinggir jalan memang begitu.
 *
 * Bentuk barisnya sama persis dengan tabel di peladen (`snake_case`, uang
 * sebagai bilangan bulat rupiah), supaya hasil tarikan bisa disimpan apa
 * adanya tanpa lapisan penerjemah yang harus dijaga sepadan di dua tempat.
 */

export interface LocalRow {
  id: string
  tenant_id: string
  updated_at?: string
}

export interface LocalWallet extends LocalRow {
  name: string
  kind: 'tunai' | 'bank' | 'ewallet'
  opening_balance: number
  is_default: boolean
  sort_order: number
  archived_at: string | null
}

/**
 * Barang dan jasa dalam satu tabel.
 *
 * `stock_qty` kosong untuk jasa — dan itu bukan kelalaian melainkan
 * intinya. "Potong celana" tidak pernah habis.
 */
export interface LocalItem extends LocalRow {
  kind: 'barang' | 'jasa'
  name: string
  photo_path: string | null
  price: number
  cost_price: number
  unit: string
  stock_qty: number | null
  min_stock: number | null
  barcode: string | null
  sold_count: number
  sort_order: number
  archived_at: string | null
}

/**
 * Foto barang, disimpan sebagai blob di perangkat.
 *
 * Terpisah dari `items` supaya memuat daftar katalog tidak ikut menarik
 * seluruh gambarnya ke memori. Unggahannya menyusul lewat antrean, jadi
 * memotret barang tetap bisa dilakukan tanpa sinyal.
 */
export interface LocalPhoto {
  item_id: string
  tenant_id: string
  blob: Blob
  uploaded_at: string | null
}

export interface LocalSale extends LocalRow {
  invoice_no: string
  occurred_at: string
  subtotal: number
  discount: number
  total: number
  paid: number
  payment_method: string | null
  wallet_id: string | null
  customer_name: string | null
  note: string | null
  voided_at: string | null
}

export interface LocalSaleItem {
  id: string
  tenant_id: string
  sale_id: string
  item_id: string | null
  item_kind: 'barang' | 'jasa'
  item_name: string
  qty: number
  unit_price: number
  unit_cost: number
  subtotal: number
  /** Urutan baris di keranjang; struk dibaca menurut kolom ini. */
  line_no: number
}

export interface LocalStockMovement {
  id: string
  tenant_id: string
  item_id: string
  occurred_at: string
  qty_change: number
  reason: string
  source_type: string | null
  source_id: string | null
  note: string | null
}

export interface LocalCashEntry extends LocalRow {
  wallet_id: string
  occurred_at: string
  direction: 'in' | 'out'
  amount: number
  kind: 'income' | 'expense' | 'transfer'
  category: string
  note: string | null
  source_type: string | null
  source_id: string | null
  transfer_group_id: string | null
  deleted_at: string | null
}

export interface LocalDebt extends LocalRow {
  side: 'receivable' | 'payable'
  person: string
  amount: number
  paid_amount: number
  sale_id: string | null
  occurred_at: string
  note: string | null
  settled_at: string | null
  deleted_at: string | null
}

/**
 * Panggilan RPC yang menunggu giliran dikirim.
 *
 * Isinya bukan baris data melainkan **maksud** — nama fungsi beserta
 * argumennya — sehingga peladen tetap yang menghitung total, memberi
 * nomor struk, dan mengurangi stok, persis seperti kalau perangkat
 * sedang daring.
 */
export interface OutboxItem {
  /** UUID dari perangkat. Sekaligus kunci idempotensi di peladen. */
  id: string
  tenant_id: string
  rpc: string
  args: Record<string, unknown>
  created_at: string
  attempts: number
  next_attempt_at: string
  status: 'pending' | 'failed'
  last_error: string | null
}

export interface MetaRow {
  key: string
  value: unknown
}

export const TENANT_KEY = 'tenant_id'
export const BUSINESS_NAME_KEY = 'business_name'
export const BUSINESS_PHONE_KEY = 'business_phone'

export class LocalDatabase extends Dexie {
  wallets!: EntityTable<LocalWallet, 'id'>
  items!: EntityTable<LocalItem, 'id'>
  photos!: EntityTable<LocalPhoto, 'item_id'>
  sales!: EntityTable<LocalSale, 'id'>
  saleItems!: EntityTable<LocalSaleItem, 'id'>
  stockMovements!: EntityTable<LocalStockMovement, 'id'>
  cashEntries!: EntityTable<LocalCashEntry, 'id'>
  debts!: EntityTable<LocalDebt, 'id'>
  outbox!: EntityTable<OutboxItem, 'id'>
  meta!: EntityTable<MetaRow, 'key'>

  constructor(name = 'nexausaha') {
    super(name)

    // Indeks dipilih dari query yang benar-benar dipakai layar. Indeks
    // berlebih memperlambat penulisan, dan penulisan ada di jalur yang
    // harus paling cepat: menyimpan penjualan di depan pembeli.
    this.version(1).stores({
      wallets: 'id, tenant_id',
      items: 'id, tenant_id, kind, sold_count, name, barcode',
      photos: 'item_id, tenant_id, uploaded_at',
      sales: 'id, tenant_id, occurred_at, invoice_no',
      saleItems: 'id, sale_id, item_id',
      stockMovements: 'id, item_id, occurred_at',
      cashEntries: 'id, tenant_id, occurred_at, kind, wallet_id',
      debts: 'id, tenant_id, [side+settled_at], person, sale_id',
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
