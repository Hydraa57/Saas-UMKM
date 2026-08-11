import * as M from '@/lib/money'
import { DEFAULT_TIMEZONE, toLocalDate } from '@/lib/domain/dates'
import { formatMonth, monthlyRecap } from '@/lib/domain/recap'
import { outstanding } from '@/lib/domain/debt'
import {
  CATEGORY_LABELS,
  ITEM_KIND_LABELS,
  PAYMENT_LABELS,
  STOCK_REASON_LABELS,
  isBarang,
} from '@/lib/domain/types'
import type {
  CashEntry,
  Category,
  Debt,
  Item,
  PaymentMethod,
  Sale,
  StockReason,
  Wallet,
} from '@/lib/domain/types'
import type { Lembar, Sel } from './xlsx'

/**
 * Menyusun isi berkas ekspor.
 *
 * Dipisah dari penyandi `.xlsx` supaya keduanya bisa diuji sendiri-sendiri:
 * yang satu soal "apakah berkasnya sah", yang ini soal "apakah isinya
 * benar dan bisa dibaca orang".
 *
 * Dua aturan membentuk seluruh berkas ini.
 *
 * **Angka tetap angka, waktu jadi teks.** Rupiah ditulis sebagai bilangan
 * supaya bisa dijumlah di spreadsheet — itu satu-satunya alasan mengekspor
 * ke Excel alih-alih ke teks biasa. Tanggal justru ditulis sebagai teks
 * `YYYY-MM-DD`: penanggalan asli Excel disimpan sebagai bilangan hari
 * sejak 1900 dan ditampilkan menurut setelan wilayah pembacanya, jadi
 * berkas yang sama bisa terbaca 8 November di satu HP dan 11 Agustus di
 * HP lain. Untuk catatan keuangan, ambiguitas itu tidak sepadan dengan
 * kemudahan mengurutkannya — dan `YYYY-MM-DD` toh tetap urut sebagai teks.
 *
 * **Semuanya, bukan cuma yang sedang dilihat.** Ini pemenuhan janji di
 * dokumen arsitektur: tombol "ekspor semua ke Excel" yang bisa ditekan
 * sendiri, supaya datanya tidak tersandera satu penyedia. Karena itu
 * yang dibatalkan dan yang diarsipkan **ikut**, ditandai di kolomnya
 * sendiri. Cadangan yang diam-diam membuang sebagian isi bukan cadangan.
 */

/** Sel kosong ditulis sebagai teks kosong; penyandinya melewatinya. */
const KOSONG = ''

const tanggal = (instant: string, tz: string): string => toLocalDate(instant, tz)

/** `19.05` — bentuk jam yang dipakai orang Indonesia menulis waktu. */
function jam(instant: string, tz: string): string {
  return new Date(instant)
    .toLocaleString('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
    .replace(':', '.')
}

/**
 * Urut menurut waktu, terlama dulu.
 *
 * Urutan penyimpanan IndexedDB mengikuti kunci utama yang berupa UUID
 * acak, jadi tanpa pengurutan ini isi berkasnya berbeda tiap kali diekspor
 * walau datanya sama — dan dua berkas yang tidak bisa dibandingkan tidak
 * berguna sebagai cadangan.
 */
function urutWaktu<T extends { readonly occurredAt: string }>(
  baris: readonly T[],
): readonly T[] {
  return [...baris].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
}

export interface IsiEkspor {
  readonly namaUsaha: string
  readonly items: readonly Item[]
  readonly sales: readonly Sale[]
  readonly entries: readonly CashEntry[]
  readonly wallets: readonly Wallet[]
  readonly debts: readonly Debt[]
  readonly movements: readonly {
    readonly itemId: string
    readonly occurredAt: string
    readonly qtyChange: number
    readonly reason: string
    readonly note: string | null
  }[]
}

/** Nama berkas: nama usaha + tanggal, supaya dua unduhan tidak bertumpuk. */
export function namaBerkas(namaUsaha: string, hari: string): string {
  const bersih = namaUsaha.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'Ezura'
  return `Ezura - ${bersih} - ${hari}.xlsx`
}

export function susunLembar(
  isi: IsiEkspor,
  tz: string = DEFAULT_TIMEZONE,
): readonly Lembar[] {
  const namaBarang = new Map(isi.items.map((item) => [item.id, item.name]))

  // ── Rekap bulanan ────────────────────────────────────────────────────
  const rekap = monthlyRecap(isi.entries, tz)
  const lembarRekap: Lembar = {
    nama: 'Rekap bulanan',
    lebar: [18, 16, 16, 16, 12],
    baris: [
      ['Bulan', 'Masuk', 'Keluar', 'Sisa', 'Jumlah catatan'],
      ...rekap.months.map((row): Sel[] => [
        formatMonth(row.month),
        row.income,
        row.expense,
        row.net,
        row.entryCount,
      ]),
      // Baris total dipisah satu baris kosong: tanpa jeda, ia terbaca
      // seperti bulan berikutnya dan ikut tersalin saat orang menyeleksi
      // datanya untuk dihitung ulang.
      [],
      ['TOTAL', rekap.totalIncome, rekap.totalExpense, rekap.totalNet, null],
    ],
  }

  // ── Penjualan, satu baris per barang ─────────────────────────────────
  const barisJual: Sel[][] = []
  for (const sale of urutWaktu(isi.sales)) {
    sale.lines.forEach((line, index) => {
      barisJual.push([
        tanggal(sale.occurredAt, tz),
        jam(sale.occurredAt, tz),
        sale.invoiceNo,
        // Nomor struk diulang tiap baris, dan nomor urut barisnya ikut:
        // tanpa itu, satu struk berisi tiga barang tidak bisa disusun
        // ulang setelah datanya diurutkan menurut kolom lain.
        index + 1,
        ITEM_KIND_LABELS[line.itemKind],
        line.itemName,
        line.qty,
        line.unitPrice,
        line.unitCost,
        M.multiplyByQty(line.unitPrice, line.qty),
        M.subtract(
          M.multiplyByQty(line.unitPrice, line.qty),
          M.multiplyByQty(line.unitCost, line.qty),
        ),
        sale.customerName ?? KOSONG,
        sale.paymentMethod
          ? (PAYMENT_LABELS[sale.paymentMethod as PaymentMethod] ??
            sale.paymentMethod)
          : KOSONG,
        sale.voidedAt ? 'DIBATALKAN' : KOSONG,
      ])
    })
  }

  const lembarJual: Lembar = {
    nama: 'Penjualan',
    lebar: [12, 8, 16, 6, 10, 28, 8, 14, 14, 14, 14, 18, 12, 14],
    baris: [
      [
        'Tanggal',
        'Jam',
        'No struk',
        'Baris',
        'Jenis',
        'Nama',
        'Jumlah',
        'Harga satuan',
        'Modal satuan',
        'Subtotal',
        'Untung kotor',
        'Pembeli',
        'Bayar',
        'Status',
      ],
      ...barisJual,
    ],
  }

  // ── Buku kas ─────────────────────────────────────────────────────────
  const namaDompet = new Map(isi.wallets.map((w) => [w.id, w.name]))
  const lembarKas: Lembar = {
    nama: 'Buku kas',
    lebar: [12, 8, 10, 16, 14, 18, 16, 30],
    baris: [
      ['Tanggal', 'Jam', 'Arah', 'Jumlah', 'Jenis', 'Kategori', 'Dompet', 'Catatan'],
      ...urutWaktu(isi.entries)
        .filter((e) => !e.deletedAt)
        .map((e): Sel[] => [
          tanggal(e.occurredAt, tz),
          jam(e.occurredAt, tz),
          e.direction === 'in' ? 'Masuk' : 'Keluar',
          // Selalu positif, dengan arahnya di kolom sendiri. Nominal
          // bertanda membuat penjumlahan satu kolom terlihat masuk akal
          // padahal mencampur pemasukan dan pengeluaran.
          M.abs(e.amount),
          e.kind === 'income' ? 'Pemasukan' : e.kind === 'expense' ? 'Pengeluaran' : 'Pindah',
          CATEGORY_LABELS[e.category as Category] ?? e.category,
          namaDompet.get(e.walletId) ?? KOSONG,
          e.note ?? KOSONG,
        ]),
    ],
  }

  // ── Barang & jasa ────────────────────────────────────────────────────
  const lembarKatalog: Lembar = {
    nama: 'Barang & jasa',
    lebar: [10, 28, 14, 14, 10, 12, 12, 16, 12],
    baris: [
      [
        'Jenis',
        'Nama',
        'Harga jual',
        'Harga modal',
        'Satuan',
        'Sisa stok',
        'Stok minimum',
        'Barcode',
        'Status',
      ],
      ...isi.items.map((item): Sel[] => [
        ITEM_KIND_LABELS[item.kind],
        item.name,
        item.price,
        item.costPrice,
        item.unit,
        // Kolom stok dibiarkan **kosong** untuk jasa, bukan diisi nol.
        // Ini pembeda utama produknya, dan ia harus selamat sampai ke
        // berkas ekspornya: "potong celana" tidak pernah habis, dan nol
        // akan terbaca sebagai habis.
        isBarang(item) ? item.stockQty : null,
        isBarang(item) ? (item.minStock ?? null) : null,
        item.barcode ?? KOSONG,
        item.archivedAt ? 'DIARSIPKAN' : KOSONG,
      ]),
    ],
  }

  // ── Utang & piutang ──────────────────────────────────────────────────
  const lembarUtang: Lembar = {
    nama: 'Utang & piutang',
    lebar: [14, 22, 16, 16, 16, 12, 12, 30],
    baris: [
      [
        'Pihak',
        'Nama',
        'Jumlah',
        'Sudah dibayar',
        'Sisa',
        'Tanggal',
        'Status',
        'Catatan',
      ],
      ...urutWaktu(isi.debts)
        .filter((d) => !d.deletedAt)
        .map((d): Sel[] => [
          d.side === 'receivable' ? 'Orang berutang' : 'Usaha berutang',
          d.person,
          d.amount,
          d.paidAmount,
          outstanding(d),
          tanggal(d.occurredAt, tz),
          d.settledAt ? 'Lunas' : 'Belum lunas',
          d.note ?? KOSONG,
        ]),
    ],
  }

  // ── Pergerakan stok ──────────────────────────────────────────────────
  const lembarStok: Lembar = {
    nama: 'Pergerakan stok',
    lebar: [12, 8, 28, 12, 16, 30],
    baris: [
      ['Tanggal', 'Jam', 'Barang', 'Perubahan', 'Sebab', 'Catatan'],
      ...urutWaktu(isi.movements).map((m): Sel[] => [
        tanggal(m.occurredAt, tz),
        jam(m.occurredAt, tz),
        namaBarang.get(m.itemId) ?? m.itemId,
        m.qtyChange,
        STOCK_REASON_LABELS[m.reason as StockReason] ?? m.reason,
        m.note ?? KOSONG,
      ]),
    ],
  }

  return [
    lembarRekap,
    lembarJual,
    lembarKas,
    lembarKatalog,
    lembarUtang,
    lembarStok,
  ]
}
