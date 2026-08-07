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
 * Buku menjawab "kegiatan mana yang menghasilkan atau menghabiskan uang
 * ini" — dan sengaja **tidak** terikat pada dompet, yang menjawab
 * pertanyaan berbeda ("uangnya ada di mana").
 *
 * Penelitian menemukan 73% UMKM Indonesia belum memisahkan keuangan usaha
 * dan pribadi, dan mayoritas usaha mikro cuma punya satu rekening untuk
 * keduanya. Kalau buku ditentukan oleh dompet, kelompok itu harus
 * mengarang dompet palsu sebelum bisa memakai fiturnya sama sekali.
 *
 * Dengan buku melekat pada tiap entri, pengguna berdompet tunggal tetap
 * bisa memisahkan: belanja dapur yang dibayar dari uang dagangan cukup
 * dicatat berbuku rumah, dari dompet yang sama.
 */
export type Book = 'usaha' | 'rumah'

export type EntryKind = 'income' | 'expense' | 'transfer'
export type Direction = 'in' | 'out'

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

/**
 * Kategori.
 *
 * Daftar tertutup, memakai kata baku, dan dipilih supaya cukup umum untuk
 * usaha apa pun — warung, kuliner, laundry, jahit, bengkel. Kategori bebas
 * akan berkembang jadi puluhan ejaan untuk hal yang sama, dan laporan yang
 * menjumlahkannya berhenti bisa dipercaya.
 */
export type Category =
  // pemasukan usaha
  | 'penjualan'
  | 'jasa'
  // pengeluaran usaha
  | 'modal'
  | 'operasional'
  | 'upah'
  | 'sewa'
  // pemasukan rumah
  | 'gaji'
  | 'pemberian'
  // pengeluaran rumah
  | 'belanja'
  | 'transportasi'
  | 'utilitas'
  | 'komunikasi'
  | 'pendidikan'
  | 'kesehatan'
  | 'sosial'
  | 'angsuran'
  // di mana saja
  | 'lainnya'
  | 'pindah'

/**
 * Kategori yang sah untuk tiap pasangan buku dan jenis.
 *
 * Sepadan dengan fungsi `category_fits` di peladen. Keduanya sengaja ada:
 * peladen menjaga kebenaran data, dan daftar ini menyusun pilihan di
 * layar — supaya kategori yang tidak mungkin tidak pernah sempat
 * ditawarkan.
 *
 * `lainnya` ada di setiap daftar. Selalu ada hal yang tidak masuk kategori
 * mana pun, dan pengguna yang terjebak tanpa pilihan akan berhenti
 * mencatat sama sekali.
 */
export const CATEGORIES: Readonly<
  Record<Book, Readonly<Record<'income' | 'expense', readonly Category[]>>>
> = {
  usaha: {
    income: ['penjualan', 'jasa', 'lainnya'],
    expense: ['modal', 'operasional', 'upah', 'sewa', 'lainnya'],
  },
  rumah: {
    income: ['gaji', 'pemberian', 'lainnya'],
    expense: [
      'belanja',
      'transportasi',
      'utilitas',
      'komunikasi',
      'pendidikan',
      'kesehatan',
      'sosial',
      'angsuran',
      'lainnya',
    ],
  },
}

/**
 * Sebutan yang dipakai di layar.
 *
 * Kata baku, bukan singkatan atau istilah akuntansi. Semuanya dikumpulkan
 * di satu tempat supaya bisa diganti tanpa menyentuh sisa aplikasi.
 */
export const CATEGORY_LABELS: Readonly<Record<Category, string>> = {
  penjualan: 'Penjualan',
  jasa: 'Jasa',
  modal: 'Modal & Bahan',
  operasional: 'Operasional',
  upah: 'Upah',
  sewa: 'Sewa',
  gaji: 'Gaji',
  pemberian: 'Pemberian',
  belanja: 'Belanja',
  transportasi: 'Transportasi',
  utilitas: 'Listrik, Air & Gas',
  komunikasi: 'Komunikasi',
  pendidikan: 'Pendidikan',
  kesehatan: 'Kesehatan',
  sosial: 'Sosial',
  angsuran: 'Angsuran',
  lainnya: 'Lainnya',
  pindah: 'Pindah Dompet',
}

export const BOOK_LABELS: Readonly<Record<Book, string>> = {
  usaha: 'Usaha',
  rumah: 'Rumah Tangga',
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
  /** Sekadar usulan untuk mengisi layar catat, bukan aturan. Boleh kosong. */
  readonly defaultBook?: Book | null
  readonly openingBalance: Rupiah
  readonly isDefault: boolean
  readonly archivedAt?: string | null
}

export interface CashEntry {
  readonly id: string
  /** Di mana uangnya berpindah. */
  readonly walletId: string
  /** Kegiatan mana. Kosong untuk pemindahan antar dompet. */
  readonly book: Book | null
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
