import * as M from '@/lib/money'
import type { Rupiah } from '@/lib/money'
import { DEFAULT_TIMEZONE, toLocalDate } from './dates'
import { countsAsFlow } from './cash'
import type { CashEntry, LocalMonth } from './types'

/**
 * Rekap bulanan.
 *
 * Ini bagian yang paling jelas dibutuhkan dari seluruh aplikasi, dan
 * buktinya bukan tebakan: ibu sudah mengerjakannya sendiri dengan pulpen
 * selama delapan belas bulan berturut-turut, lengkap dengan total tahunan
 * yang dijumlah tangan.
 *
 * Ini juga yang hilang dari percobaan sebelumnya. Bot WhatsApp yang
 * pernah dibangun bisa menerima catatan, tapi setiap kali cuma menjawab
 * "sudah disimpan" — untuk tahu pemasukan sebulan, tetap harus membuka
 * spreadsheet. Ibu menyerahkan datanya dan tidak pernah menerima apa pun
 * sebagai gantinya, lalu berhenti.
 *
 * Aturan yang lahir dari situ, dan berlaku untuk seluruh aplikasi:
 *
 * > Setiap kali ibu memasukkan sesuatu, dia harus langsung menerima
 * > sesuatu.
 */

export interface MonthRow {
  readonly month: LocalMonth
  readonly income: Rupiah
  readonly expense: Rupiah
  /** income − expense. */
  readonly net: Rupiah
  readonly entryCount: number
}

export interface Recap {
  readonly months: readonly MonthRow[]
  readonly totalIncome: Rupiah
  readonly totalExpense: Rupiah
  readonly totalNet: Rupiah
}

/** Instan waktu → bulan kalender di zona waktu usaha. */
export function monthOf(
  instant: string | Date,
  timeZone: string = DEFAULT_TIMEZONE,
): LocalMonth {
  return toLocalDate(instant, timeZone).slice(0, 7)
}

/**
 * Rekap per bulan.
 *
 * Pemindahan antar dompet tidak ikut — lihat catatan di `cash.ts`.
 * Bulan tanpa transaksi tidak muncul; menampilkan baris nol untuk bulan
 * yang belum ada isinya membuat daftar terlihat penuh padahal kosong.
 *
 * Diurutkan dari yang terbaru, karena yang paling sering dilihat adalah
 * bulan berjalan.
 */
export function monthlyRecap(
  entries: readonly CashEntry[],
  timeZone: string = DEFAULT_TIMEZONE,
): Recap {
  const buckets = new Map<
    LocalMonth,
    { income: Rupiah; expense: Rupiah; entryCount: number }
  >()

  for (const entry of entries) {
    if (!countsAsFlow(entry)) continue

    const month = monthOf(entry.occurredAt, timeZone)
    const bucket = buckets.get(month) ?? {
      income: M.ZERO,
      expense: M.ZERO,
      entryCount: 0,
    }

    if (entry.kind === 'income') {
      bucket.income = M.add(bucket.income, entry.amount)
    } else {
      bucket.expense = M.add(bucket.expense, entry.amount)
    }
    bucket.entryCount += 1
    buckets.set(month, bucket)
  }

  const months: MonthRow[] = [...buckets.entries()]
    .map(([month, bucket]) => ({
      month,
      income: bucket.income,
      expense: bucket.expense,
      net: M.subtract(bucket.income, bucket.expense),
      entryCount: bucket.entryCount,
    }))
    .sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : 0))

  const totalIncome = M.sum(months.map((row) => row.income))
  const totalExpense = M.sum(months.map((row) => row.expense))

  return {
    months,
    totalIncome,
    totalExpense,
    totalNet: M.subtract(totalIncome, totalExpense),
  }
}

/** Total satu tahun kalender — angka yang ibu jumlah tangan di bukunya. */
export function yearTotal(recap: Recap, year: number): MonthRow {
  const prefix = String(year)
  const rows = recap.months.filter((row) => row.month.startsWith(prefix))
  const income = M.sum(rows.map((row) => row.income))
  const expense = M.sum(rows.map((row) => row.expense))

  return {
    month: prefix,
    income,
    expense,
    net: M.subtract(income, expense),
    entryCount: rows.reduce((total, row) => total + row.entryCount, 0),
  }
}

export function findMonth(
  recap: Recap,
  month: LocalMonth,
): MonthRow | undefined {
  return recap.months.find((row) => row.month === month)
}

/**
 * Perbandingan dengan bulan sebelumnya.
 *
 * `null` kalau belum ada pembanding — bulan pertama pemakaian tidak boleh
 * ditampilkan seolah turun 100%.
 */
export function compareToPreviousMonth(
  recap: Recap,
  month: LocalMonth,
): { readonly deltaIncome: Rupiah; readonly deltaNet: Rupiah } | null {
  const index = recap.months.findIndex((row) => row.month === month)
  if (index < 0) return null

  const current = recap.months[index]
  const previous = recap.months[index + 1] // sudah urut terbaru dulu
  if (!current || !previous) return null

  return {
    deltaIncome: M.subtract(current.income, previous.income),
    deltaNet: M.subtract(current.net, previous.net),
  }
}

const MONTH_NAMES = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
] as const

/** `2026-08` → `Agustus 2026`. Persis seperti judul di buku ibu. */
export function formatMonth(month: LocalMonth): string {
  const [year, index] = month.split('-')
  if (!year) return month
  if (!index) return year
  const name = MONTH_NAMES[Number(index) - 1]
  return name ? `${name} ${year}` : month
}
