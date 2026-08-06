/**
 * Uang, dalam rupiah utuh.
 *
 * Keputusan penyimpanan
 * ---------------------
 * Di PostgreSQL, uang disimpan sebagai `bigint` rupiah utuh — tanpa sen,
 * tanpa `numeric`, tanpa floating point.
 *
 * Di TypeScript, uang diwakili `number` yang diberi merek (branded type),
 * bukan `bigint` JavaScript. Alasannya praktis: `bigint` tidak bisa
 * di-`JSON.stringify`, tidak bisa dicampur dengan `number` dalam satu
 * operasi aritmetika tanpa konversi eksplisit, dan PostgREST mengirim
 * kolom `int8` sebagai angka JSON biasa. Memakainya berarti mengonversi
 * bolak-balik di setiap batas sistem, dan setiap konversi adalah tempat
 * bug bersembunyi.
 *
 * Yang membuat `number` aman di sini adalah disiplinnya, bukan tipenya:
 * selama nilainya selalu bilangan bulat dan tidak melewati
 * `Number.MAX_SAFE_INTEGER`, aritmetika double IEEE-754 bersifat *eksak*.
 * Modul ini memaksakan kedua syarat itu di setiap titik masuk, dan
 * satu-satunya tempat pembulatan bisa terjadi — perkalian dengan jumlah
 * pecahan — ditandai eksplisit.
 *
 * Aturan yang tidak boleh dilanggar:
 *   1. Jangan pernah pakai operator `+ - *` langsung pada nilai `Rupiah`.
 *      Selalu lewat fungsi di modul ini.
 *   2. Jangan pernah menyimpan hasil pembagian tanpa membulatkannya.
 *   3. Jangan pernah membuat `Rupiah` dari input pengguna tanpa `parse()`.
 */

declare const RUPIAH: unique symbol

/** Bilangan bulat rupiah. Positif, nol, atau negatif. */
export type Rupiah = number & { readonly [RUPIAH]: true }

/**
 * Batas atas yang diterima. Jauh di bawah `Number.MAX_SAFE_INTEGER`
 * (~9,007 kuadriliun) supaya penjumlahan beruntun pun tidak mungkin
 * menyentuh batas presisi. Seratus triliun rupiah sudah beberapa kali
 * lipat APBN; kalau ada nilai sebesar ini di aplikasi UMKM, itu bug,
 * dan lebih baik gagal keras daripada diam-diam salah.
 */
export const MAX_RUPIAH = 100_000_000_000_000

export const ZERO = 0 as Rupiah

/** Dilempar saat sebuah nilai tidak bisa menjadi rupiah yang sah. */
export class MoneyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MoneyError'
  }
}

/**
 * Membuat `Rupiah` dari angka, dengan pemeriksaan penuh.
 *
 * Ini satu-satunya jalan sah membuat `Rupiah` dari `number` mentah.
 * Gagal keras — bukan mengembalikan nol — karena nilai uang yang salah
 * yang lolos diam-diam akan muncul lagi sebagai selisih di laci, dan
 * di sana jauh lebih sulit dilacak.
 */
export function rupiah(value: number): Rupiah {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new MoneyError(`Nilai uang tidak valid: ${String(value)}`)
  }
  if (!Number.isFinite(value)) {
    throw new MoneyError(`Nilai uang tidak berhingga: ${String(value)}`)
  }
  if (!Number.isInteger(value)) {
    throw new MoneyError(
      `Rupiah harus bilangan bulat, dapat ${value}. ` +
        `Gunakan multiplyByQty() atau applyPercent() yang membulatkan secara eksplisit.`,
    )
  }
  if (Math.abs(value) > MAX_RUPIAH) {
    throw new MoneyError(`Nilai uang di luar batas wajar: ${value}`)
  }
  return value as Rupiah
}

/**
 * Membuat `Rupiah` dari nilai yang datang dari database.
 *
 * PostgREST mengirim kolom `bigint` sebagai angka JSON, dan pada nilai
 * sangat besar bisa kehilangan presisi. Nilai `null` diperlakukan sebagai
 * nol karena kolom uang di skema semuanya `not null default 0` — `null`
 * hanya muncul dari `left join` yang tidak menemukan pasangan.
 */
export function fromDb(value: number | string | null | undefined): Rupiah {
  if (value === null || value === undefined) return ZERO
  const n = typeof value === 'string' ? Number(value) : value
  return rupiah(n)
}

// ── Aritmetika ──────────────────────────────────────────────────────────

export function add(a: Rupiah, b: Rupiah): Rupiah {
  return rupiah(a + b)
}

export function subtract(a: Rupiah, b: Rupiah): Rupiah {
  return rupiah(a - b)
}

export function negate(a: Rupiah): Rupiah {
  return rupiah(-a)
}

export function abs(a: Rupiah): Rupiah {
  return rupiah(Math.abs(a))
}

export function sum(amounts: readonly Rupiah[]): Rupiah {
  let total = 0
  for (const amount of amounts) total += amount
  return rupiah(total)
}

/** Nilai terbesar dari nol dan `a`. Berguna untuk sisa bayar. */
export function clampToZero(a: Rupiah): Rupiah {
  return a < 0 ? ZERO : a
}

/**
 * Harga satuan dikali jumlah.
 *
 * **Titik pembulatan.** Jumlah boleh pecahan (`numeric(12,3)` di skema —
 * snack dijual per ons dan per kilo), jadi hasilnya bisa punya pecahan
 * rupiah yang tidak bisa disimpan maupun dibayar. Dibulatkan ke rupiah
 * terdekat, dengan setengah dibulatkan ke atas.
 *
 * `Math.round` tidak dipakai karena perilakunya pada bilangan negatif
 * membulatkan ke arah nol (`Math.round(-0.5) === -0`), sehingga retur
 * dan koreksi akan meleset satu rupiah dari transaksi aslinya.
 */
export function multiplyByQty(unitPrice: Rupiah, qty: number): Rupiah {
  if (typeof qty !== 'number' || !Number.isFinite(qty)) {
    throw new MoneyError(`Jumlah tidak valid: ${String(qty)}`)
  }
  return rupiah(roundHalfUp(unitPrice * qty))
}

/**
 * Persentase dari sebuah nilai, dibulatkan ke rupiah terdekat.
 * Dipakai untuk diskon persen dan (nanti) MDR QRIS.
 */
export function applyPercent(amount: Rupiah, percent: number): Rupiah {
  if (typeof percent !== 'number' || !Number.isFinite(percent)) {
    throw new MoneyError(`Persentase tidak valid: ${String(percent)}`)
  }
  return rupiah(roundHalfUp((amount * percent) / 100))
}

/** Setengah selalu menjauh dari nol, supaya simetris untuk nilai negatif. */
function roundHalfUp(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value)
}

// ── Perbandingan ────────────────────────────────────────────────────────

export const isZero = (a: Rupiah): boolean => a === 0
export const isPositive = (a: Rupiah): boolean => a > 0
export const isNegative = (a: Rupiah): boolean => a < 0

/** -1 kalau a < b, 0 kalau sama, 1 kalau a > b. */
export function compare(a: Rupiah, b: Rupiah): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0
}

export const min = (a: Rupiah, b: Rupiah): Rupiah => (a <= b ? a : b)
export const max = (a: Rupiah, b: Rupiah): Rupiah => (a >= b ? a : b)

// ── Tampilan ────────────────────────────────────────────────────────────

const GROUPER = new Intl.NumberFormat('id-ID', {
  maximumFractionDigits: 0,
  useGrouping: true,
})

export interface FormatOptions {
  /** Sertakan awalan "Rp ". Default true. */
  withPrefix?: boolean
  /** Tampilkan "+" di depan nilai positif. Default false. */
  withSign?: boolean
}

/**
 * Format penuh: `Rp 5.000`, `-Rp 12.500`.
 *
 * Tanda minus diletakkan sebelum "Rp", bukan sesudahnya, karena
 * "Rp -5.000" terbaca seperti salah ketik.
 */
export function format(amount: Rupiah, options: FormatOptions = {}): string {
  const { withPrefix = true, withSign = false } = options
  const negative = amount < 0
  const digits = GROUPER.format(Math.abs(amount))
  const sign = negative ? '-' : withSign && amount > 0 ? '+' : ''
  return withPrefix ? `${sign}Rp ${digits}` : `${sign}${digits}`
}

/**
 * Format ringkas untuk angka besar di beranda: `Rp 85rb`, `Rp 1,2jt`.
 *
 * Di bawah sepuluh ribu ditampilkan penuh — pada nominal segitu setiap
 * rupiah masih terbaca sebagai jumlah yang tepat, dan meringkasnya
 * justru mengaburkan.
 */
export function formatCompact(amount: Rupiah): string {
  const negative = amount < 0
  const value = Math.abs(amount)
  const sign = negative ? '-' : ''

  if (value < 10_000) return `${sign}Rp ${GROUPER.format(value)}`
  if (value < 1_000_000) return `${sign}Rp ${trimZero(value / 1_000)}rb`
  if (value < 1_000_000_000) return `${sign}Rp ${trimZero(value / 1_000_000)}jt`
  return `${sign}Rp ${trimZero(value / 1_000_000_000)}mlr`
}

/** Satu angka di belakang koma, koma Indonesia, tanpa ",0" yang mubazir. */
function trimZero(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded)
    ? String(rounded)
    : String(rounded).replace('.', ',')
}

// ── Input ───────────────────────────────────────────────────────────────

/**
 * Urutan penting: pola yang lebih panjang diuji lebih dulu supaya
 * "milyar" tidak keburu tertangkap oleh pola lain.
 *
 * Huruf "m" sendirian sengaja tidak diterima. Dalam kebiasaan Indonesia
 * "M" berarti miliar, tapi sebagian orang memakainya untuk juta —
 * selisihnya seribu kali lipat, dan menebak salah pada nilai uang jauh
 * lebih buruk daripada meminta pengguna mengetik lebih jelas.
 */
const SUFFIXES: ReadonlyArray<readonly [RegExp, number]> = [
  [/(?:rb|ribu|k)$/i, 1_000],
  [/(?:jt|juta)$/i, 1_000_000],
  [/(?:mlr|miliar|milyar)$/i, 1_000_000_000],
]

/**
 * Membaca nominal yang diketik pengguna.
 *
 * Menerima bentuk-bentuk yang benar-benar diketik orang Indonesia:
 *
 *   "5000"     → 5000        "5.000"    → 5000
 *   "5rb"      → 5000        "5 ribu"   → 5000
 *   "1,5jt"    → 1500000     "Rp 12.500" → 12500
 *   "2.5k"     → 2500
 *
 * Mengembalikan `null` untuk input yang tidak bisa dibaca, bukan melempar —
 * pengguna sedang mengetik, dan setengah ketikan bukan kesalahan.
 *
 * Titik diperlakukan sebagai pemisah ribuan (kebiasaan Indonesia) dan koma
 * sebagai desimal, kecuali pada bentuk bersufiks di mana titik lebih sering
 * dimaksudkan sebagai desimal ("2.5k" berarti 2500, bukan 25 ribu).
 */
export function parse(input: string): Rupiah | null {
  if (typeof input !== 'string') return null

  let text = input.trim().toLowerCase()
  if (text === '') return null

  const negative = text.startsWith('-')
  if (negative) text = text.slice(1).trim()

  text = text.replace(/^rp\.?\s*/i, '').trim()
  if (text === '') return null

  let multiplier = 1
  for (const [pattern, factor] of SUFFIXES) {
    if (pattern.test(text)) {
      multiplier = factor
      text = text.replace(pattern, '').trim()
      break
    }
  }

  const hasSuffix = multiplier > 1
  const numeric = hasSuffix
    ? text.replace(/,/g, '.')
    : text.replace(/\./g, '').replace(/,/g, '.')

  if (!/^\d*\.?\d*$/.test(numeric) || numeric === '' || numeric === '.') {
    return null
  }

  const value = Number(numeric) * multiplier
  if (!Number.isFinite(value) || Math.abs(value) > MAX_RUPIAH) return null

  const rounded = roundHalfUp(value)
  return rupiah(negative ? -rounded : rounded)
}

/**
 * Menambahkan satu digit ke nominal yang sedang diketik di papan angka.
 * Papan angka bekerja dalam rupiah utuh, jadi menekan "5" pada "12"
 * menghasilkan "125" — bukan pergeseran desimal seperti pada mata uang
 * bersen.
 */
export function appendDigit(current: Rupiah, digit: number): Rupiah {
  if (!Number.isInteger(digit) || digit < 0 || digit > 9) {
    throw new MoneyError(`Digit tidak valid: ${String(digit)}`)
  }
  const next = current * 10 + digit
  return Math.abs(next) > MAX_RUPIAH ? current : rupiah(next)
}

/** Menghapus digit terakhir. Kebalikan dari `appendDigit`. */
export function removeDigit(current: Rupiah): Rupiah {
  return rupiah(Math.trunc(current / 10))
}
