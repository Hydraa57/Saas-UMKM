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
 * Dua buku.
 *
 * Ibu memisahkan uang hasil kerjanya sendiri dari uang belanja pemberian
 * bapak, dan sudah menjalankannya bertahun-tahun — rekap bulanan tulisan
 * tangannya secara tegas tidak memasukkan uang dari bapak. Aplikasi
 * mengikuti pemisahan yang sudah ada, bukan mencampurnya lalu memberi
 * label.
 */
export type Book = 'usaha' | 'rumah'

export type EntryKind = 'income' | 'expense' | 'transfer'
export type Direction = 'in' | 'out'

export type IncomeCategory = 'jahit' | 'snack' | 'dari_bapak' | 'lain'
export type ExpenseCategory =
  | 'modal'
  | 'operasional'
  | 'belanja'
  | 'listrik_air'
  | 'gas'
  | 'transport'
  | 'arisan'
  | 'sekolah'
  | 'kesehatan'
  | 'lain'
export type Category = IncomeCategory | ExpenseCategory | 'pindah'

/**
 * Kategori yang sah untuk tiap pasangan buku dan jenis.
 *
 * Sepadan dengan fungsi `category_fits` di peladen. Keduanya sengaja
 * ada: peladen menjaga kebenaran data, dan daftar ini yang menyusun
 * pilihan di layar — supaya kategori yang tidak mungkin tidak pernah
 * sempat ditawarkan.
 */
export const CATEGORIES: Readonly<
  Record<Book, Readonly<Record<'income' | 'expense', readonly Category[]>>>
> = {
  usaha: {
    income: ['jahit', 'snack', 'lain'],
    expense: ['modal', 'operasional', 'lain'],
  },
  rumah: {
    income: ['dari_bapak', 'lain'],
    expense: [
      'belanja',
      'listrik_air',
      'gas',
      'transport',
      'arisan',
      'sekolah',
      'kesehatan',
      'lain',
    ],
  },
}

/**
 * Sebutan yang dipakai di layar.
 *
 * Diambil dari kata yang benar-benar ibu tulis di bukunya — "belanja",
 * "listrik", "gas", "bensin", "arisan" — bukan dari istilah akuntansi.
 * Ini yang perlu diperiksa ulang bersama ibu; sisa aplikasi tidak perlu
 * ikut berubah kalau sebutannya diganti.
 */
export const CATEGORY_LABELS: Readonly<Record<Category, string>> = {
  jahit: 'Jahit',
  snack: 'Snack',
  dari_bapak: 'Dari Bapak',
  modal: 'Modal / kulakan',
  operasional: 'Ongkos usaha',
  belanja: 'Belanja',
  listrik_air: 'Listrik & air',
  gas: 'Gas',
  transport: 'Bensin & transport',
  arisan: 'Arisan',
  sekolah: 'Sekolah',
  kesehatan: 'Kesehatan',
  lain: 'Lain-lain',
  pindah: 'Pindah dompet',
}

export const BOOK_LABELS: Readonly<Record<Book, string>> = {
  usaha: 'Uang Usaha',
  rumah: 'Uang Belanja',
}

export type WalletKind = 'cash' | 'bank' | 'ewallet'

export interface Wallet {
  readonly id: string
  readonly name: string
  readonly book: Book
  readonly kind: WalletKind
  readonly openingBalance: Rupiah
  readonly isDefault: boolean
  readonly archivedAt?: string | null
}

export interface CashEntry {
  readonly id: string
  readonly walletId: string
  /** Disalin dari dompet saat entri dibuat, supaya riwayat tidak berubah. */
  readonly book: Book
  readonly occurredAt: string
  readonly direction: Direction
  readonly amount: Rupiah
  readonly kind: EntryKind
  readonly category: Category
  readonly note?: string | null
  readonly transferGroupId?: string | null
  readonly deletedAt?: string | null
}

/** Pintasan yang tumbuh sendiri dari pemakaian. Menggantikan katalog produk. */
export interface QuickEntry {
  readonly id: string
  readonly book: Book
  readonly kind: 'income' | 'expense'
  readonly category: Category
  readonly label: string
  readonly defaultAmount: Rupiah
  readonly useCount: number
  readonly lastUsedAt?: string | null
}

export type DebtSide = 'receivable' | 'payable'

export interface Debt {
  readonly id: string
  readonly book: Book
  readonly side: DebtSide
  readonly person: string
  readonly amount: Rupiah
  readonly paidAmount: Rupiah
  readonly occurredAt: string
  readonly note?: string | null
  readonly settledAt?: string | null
  readonly deletedAt?: string | null
}
