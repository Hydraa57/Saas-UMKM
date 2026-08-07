import Dexie, { type EntityTable } from 'dexie'

/**
 * Basis data lokal di perangkat.
 *
 * Ini **sumber kebenaran saat aplikasi berjalan**, bukan singgahan.
 * Setiap pembacaan di layar mengambil dari sini, dan setiap penulisan
 * mendarat di sini lebih dulu — jaringan menyusul belakangan.
 *
 * Alasannya bukan kenyamanan. Pesaing aplikasi ini adalah buku tulis,
 * dan buku tulis terbuka dalam nol detik tanpa sinyal. Aplikasi yang
 * menampilkan lingkaran berputar saat penggunanya ingin mencatat
 * pemasukan Rp5.000 sudah kalah sebelum fiturnya sempat dinilai.
 *
 * Bentuk barisnya dibuat sama persis dengan tabel di peladen
 * (`snake_case`, uang sebagai bilangan bulat rupiah), supaya hasil
 * tarikan bisa disimpan apa adanya tanpa lapisan penerjemah yang harus
 * dijaga sepadan di dua tempat.
 */

export interface LocalRow {
  id: string
  tenant_id: string
  updated_at?: string
}

export interface LocalWallet extends LocalRow {
  name: string
  kind: 'tunai' | 'bank' | 'ewallet'
  /** Usulan untuk mengisi layar catat, bukan aturan. Boleh kosong. */
  default_book: 'usaha' | 'rumah' | null
  opening_balance: number
  is_default: boolean
  sort_order: number
  archived_at: string | null
}

export interface LocalCashEntry extends LocalRow {
  wallet_id: string
  /** Kosong untuk pemindahan antar dompet. */
  book: 'usaha' | 'rumah' | null
  occurred_at: string
  direction: 'in' | 'out'
  amount: number
  kind: 'income' | 'expense' | 'transfer'
  category: string
  note: string | null
  transfer_group_id: string | null
  deleted_at: string | null
}

/** Pintasan yang tumbuh sendiri dari pemakaian. Menggantikan katalog produk. */
export interface LocalQuickEntry extends LocalRow {
  book: 'usaha' | 'rumah'
  kind: 'income' | 'expense'
  category: string
  label: string
  default_amount: number
  use_count: number
  last_used_at: string | null
  archived_at: string | null
}

export interface LocalDebt extends LocalRow {
  book: 'usaha' | 'rumah'
  side: 'receivable' | 'payable'
  person: string
  amount: number
  paid_amount: number
  occurred_at: string
  note: string | null
  settled_at: string | null
  deleted_at: string | null
}

/**
 * Panggilan RPC yang menunggu giliran dikirim.
 *
 * Isinya bukan baris data, melainkan **maksud** — nama fungsi beserta
 * argumennya — sehingga peladen tetap yang menentukan buku, arah, dan
 * pintasan, persis seperti kalau perangkat sedang daring.
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

export const TENANT_KEY = 'tenant_id'
export const HOUSEHOLD_KEY = 'household_book'

/**
 * Buku yang terakhir dipilih.
 *
 * Disimpan supaya pilihannya bertahan saat pengguna pergi mencatat lalu
 * kembali. Kalau tidak, dia memilih "Rumah Tangga", mencatat belanja,
 * kembali ke beranda, dan melihat buku usaha — catatannya tidak ada di
 * situ, dan yang paling wajar disimpulkan adalah catatannya hilang.
 */
export const ACTIVE_BOOK_KEY = 'active_book'

export class LocalDatabase extends Dexie {
  wallets!: EntityTable<LocalWallet, 'id'>
  cashEntries!: EntityTable<LocalCashEntry, 'id'>
  quickEntries!: EntityTable<LocalQuickEntry, 'id'>
  debts!: EntityTable<LocalDebt, 'id'>
  outbox!: EntityTable<OutboxItem, 'id'>
  meta!: EntityTable<MetaRow, 'key'>

  constructor(name = 'nexausaha') {
    super(name)

    // Indeks dipilih dari query yang benar-benar dipakai layar, bukan
    // dari semua kolom yang mungkin. Indeks berlebih memperlambat
    // penulisan, dan penulisan ada di jalur yang harus paling cepat.
    this.version(1).stores({
      wallets: 'id, tenant_id',
      cashEntries: 'id, tenant_id, occurred_at, [book+occurred_at], wallet_id, category',
      quickEntries: 'id, tenant_id, [book+kind], use_count',
      debts: 'id, tenant_id, [side+settled_at], person',
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
