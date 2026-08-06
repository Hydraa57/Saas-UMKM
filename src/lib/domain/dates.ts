import type { LocalDate } from './types'

/**
 * Tanggal kalender.
 *
 * Database menyimpan instan waktu (`timestamptz`, selalu UTC). Ibu berpikir
 * dalam hari kalender. Modul ini yang menerjemahkan keduanya, dan seluruh
 * penerjemahan itu terjadi di sini saja — supaya tidak ada satu pun tempat
 * lain di aplikasi yang diam-diam memakai zona waktu peladen.
 *
 * Kesalahan yang dicegah: transaksi jam 23.30 WIB tercatat sebagai
 * penjualan besok kalau tanggalnya diambil dari UTC. Ibu akan melihat
 * omzet hari ini yang tidak cocok dengan uang di lacinya, dan tidak akan
 * pernah menebak penyebabnya.
 *
 * `LocalDate` selalu berbentuk `YYYY-MM-DD` dan tidak membawa jam sama
 * sekali. Tanggal seperti itu tidak punya zona waktu, dan justru itu
 * gunanya.
 */

export const DEFAULT_TIMEZONE = 'Asia/Jakarta'

const formatterCache = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    formatterCache.set(timeZone, formatter)
  }
  return formatter
}

/**
 * Instan waktu → tanggal kalender di zona waktu usaha.
 *
 * Locale `en-CA` dipakai karena kebetulan memformat tanggal persis
 * sebagai `YYYY-MM-DD`, sehingga tidak perlu menyusun ulang bagiannya
 * sendiri.
 */
export function toLocalDate(
  instant: string | Date,
  timeZone: string = DEFAULT_TIMEZONE,
): LocalDate {
  const date = typeof instant === 'string' ? new Date(instant) : instant
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Waktu tidak valid: ${String(instant)}`)
  }
  return formatterFor(timeZone).format(date)
}

export function today(
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIMEZONE,
): LocalDate {
  return toLocalDate(now, timeZone)
}

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * `LocalDate` → epoch milidetik pada tengah malam UTC.
 *
 * Bukan waktu yang sebenarnya terjadi di mana pun; ini titik acuan
 * seragam supaya selisih antar tanggal kalender bisa dihitung tanpa
 * tersandung zona waktu atau daylight saving.
 */
function localDateToEpoch(date: LocalDate): number {
  const match = LOCAL_DATE_PATTERN.exec(date)
  if (!match) throw new Error(`Tanggal tidak valid: ${date}`)
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

const MS_PER_DAY = 86_400_000

/** Selisih hari dari `from` ke `to`. Negatif kalau `to` lebih awal. */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  return Math.round((localDateToEpoch(to) - localDateToEpoch(from)) / MS_PER_DAY)
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const shifted = new Date(localDateToEpoch(date) + days * MS_PER_DAY)
  return shifted.toISOString().slice(0, 10)
}

export function startOfMonth(date: LocalDate): LocalDate {
  return `${date.slice(0, 7)}-01`
}

export function endOfMonth(date: LocalDate): LocalDate {
  const match = LOCAL_DATE_PATTERN.exec(date)
  if (!match) throw new Error(`Tanggal tidak valid: ${date}`)
  const lastDay = new Date(Date.UTC(Number(match[1]), Number(match[2]), 0))
  return lastDay.toISOString().slice(0, 10)
}

export function isBefore(a: LocalDate, b: LocalDate): boolean {
  return a < b
}

export function isSameOrBefore(a: LocalDate, b: LocalDate): boolean {
  return a <= b
}

/**
 * Rentang instan yang mencakup satu hari kalender penuh di zona waktu
 * usaha, untuk memfilter kolom `timestamptz`. Batas akhirnya eksklusif.
 */
export function dayRange(
  date: LocalDate,
  timeZone: string = DEFAULT_TIMEZONE,
): { readonly from: string; readonly to: string } {
  return {
    from: startOfDayInstant(date, timeZone),
    to: startOfDayInstant(addDays(date, 1), timeZone),
  }
}

export function rangeBetween(
  from: LocalDate,
  to: LocalDate,
  timeZone: string = DEFAULT_TIMEZONE,
): { readonly from: string; readonly to: string } {
  return {
    from: startOfDayInstant(from, timeZone),
    to: startOfDayInstant(addDays(to, 1), timeZone),
  }
}

/**
 * Instan saat tengah malam sebuah tanggal kalender di zona waktu tertentu.
 *
 * Selisih zona waktu diukur dengan membandingkan bagaimana satu instan
 * yang sama dibaca di UTC dan di zona tujuan, alih-alih memakai angka
 * offset tetap. Untuk Asia/Jakarta (UTC+7, tanpa daylight saving) angkanya
 * memang selalu sama, tapi cara ini tetap benar saat tenant di zona lain
 * mulai memakai aplikasinya.
 */
function startOfDayInstant(date: LocalDate, timeZone: string): string {
  const utcMidnight = localDateToEpoch(date)
  const offset = timeZoneOffsetMs(utcMidnight, timeZone)
  return new Date(utcMidnight - offset).toISOString()
}

const OFFSET_FORMATTERS = new Map<string, Intl.DateTimeFormat>()

function timeZoneOffsetMs(epochMs: number, timeZone: string): number {
  let formatter = OFFSET_FORMATTERS.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    OFFSET_FORMATTERS.set(timeZone, formatter)
  }

  const parts = formatter.formatToParts(new Date(epochMs))
  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0')

  // `hour` bisa terbaca 24 pada tengah malam di sebagian runtime.
  const asUtc = Date.UTC(
    read('year'),
    read('month') - 1,
    read('day'),
    read('hour') % 24,
    read('minute'),
    read('second'),
  )
  return asUtc - epochMs
}

const DAY_FORMATTER = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
})

/** `2026-08-06` → `Kamis, 6 Agustus`. Untuk judul di layar. */
export function formatLocalDate(date: LocalDate): string {
  return DAY_FORMATTER.format(new Date(localDateToEpoch(date)))
}

/**
 * Penyebutan relatif yang dipakai orang: "Hari ini", "Besok", "Kemarin",
 * "3 hari lagi", "Telat 2 hari". Untuk daftar jahitan, di mana yang
 * penting bukan tanggal persisnya melainkan seberapa mendesak.
 */
export function describeRelativeDay(
  date: LocalDate,
  reference: LocalDate,
): string {
  const diff = daysBetween(reference, date)
  if (diff === 0) return 'Hari ini'
  if (diff === 1) return 'Besok'
  if (diff === -1) return 'Kemarin'
  if (diff > 1) return `${diff} hari lagi`
  return `Telat ${Math.abs(diff)} hari`
}
