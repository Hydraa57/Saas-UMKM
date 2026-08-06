import * as M from '@/lib/money'
import type { Rupiah } from '@/lib/money'
import type { CashCategory, CashEntry } from './types'

/**
 * Arus kas — menjawab **"uang saya sekarang berapa"**.
 *
 * Ini sengaja dipisah dari `profit.ts`, yang menjawab pertanyaan
 * berbeda: "usaha saya untung berapa". Di buku tulis ibu kedua
 * pertanyaan itu tercampur jadi satu kolom, dan itulah sumber
 * kebingungannya:
 *
 *   - Uang dagangan dipakai belanja dapur → uang berkurang, untung tidak
 *   - Kulakan sekarung → uang berkurang banyak, untung belum berubah
 *   - Tetangga melunasi utang bulan lalu → uang bertambah, untung tidak
 *
 * Modul ini menghitung yang pertama. Setiap entri kas ikut, tanpa
 * kecuali — karena semuanya benar-benar menggerakkan uang di laci.
 */

export interface CashSummary {
  readonly totalIn: Rupiah
  readonly totalOut: Rupiah
  /** totalIn − totalOut. Boleh negatif. */
  readonly net: Rupiah
  /** Rincian per kategori, untuk laporan. */
  readonly byCategory: Readonly<Record<CashCategory, Rupiah>>
  readonly entryCount: number
}

const EMPTY_BY_CATEGORY: Record<CashCategory, Rupiah> = {
  sale: M.ZERO,
  service: M.ZERO,
  receivable: M.ZERO,
  capital: M.ZERO,
  other_in: M.ZERO,
  purchase: M.ZERO,
  operational: M.ZERO,
  owner_draw: M.ZERO,
  other_out: M.ZERO,
}

/**
 * Nilai bertanda sebuah entri: positif untuk masuk, negatif untuk keluar.
 * `amount` di skema selalu positif (ada `check (amount > 0)`); arahnya
 * ada di kolom `direction`.
 */
export function signedAmount(entry: CashEntry): Rupiah {
  return entry.direction === 'in' ? entry.amount : M.negate(entry.amount)
}

export function summarizeCash(entries: readonly CashEntry[]): CashSummary {
  const byCategory: Record<CashCategory, Rupiah> = { ...EMPTY_BY_CATEGORY }
  let totalIn = M.ZERO
  let totalOut = M.ZERO

  for (const entry of entries) {
    byCategory[entry.category] = M.add(byCategory[entry.category], entry.amount)
    if (entry.direction === 'in') {
      totalIn = M.add(totalIn, entry.amount)
    } else {
      totalOut = M.add(totalOut, entry.amount)
    }
  }

  return {
    totalIn,
    totalOut,
    net: M.subtract(totalIn, totalOut),
    byCategory,
    entryCount: entries.length,
  }
}

/**
 * Saldo sebuah dompet.
 *
 * Saldo sengaja **tidak** disimpan sebagai kolom di database. Kolom saldo
 * yang diperbarui setiap transaksi akan melenceng cepat atau lambat —
 * satu sinkronisasi gagal separuh sudah cukup — dan begitu melenceng
 * tidak ada cara memulihkannya, karena tidak ada lagi kebenaran untuk
 * dibandingkan. Saldo turunan selalu bisa dihitung ulang dari nol.
 */
export function walletBalance(
  openingBalance: Rupiah,
  entries: readonly CashEntry[],
): Rupiah {
  return M.add(openingBalance, M.sum(entries.map(signedAmount)))
}

export function filterByWallet(
  entries: readonly CashEntry[],
  walletId: string,
): CashEntry[] {
  return entries.filter((entry) => entry.walletId === walletId)
}

/**
 * Selisih antara uang fisik yang dihitung dan saldo menurut aplikasi.
 *
 * Positif berarti uang di laci lebih banyak daripada catatan — biasanya
 * ada penjualan yang belum tercatat. Negatif berarti sebaliknya.
 *
 * Fitur "cocokkan kas" ada karena kriteria penerimaan yang paling keras
 * adalah saldo aplikasi cocok dengan laci. Selisih yang bisa dilihat dan
 * dijelaskan jauh lebih baik daripada selisih yang diam-diam menumpuk
 * sampai ibu berhenti percaya pada angkanya.
 */
export function reconcile(
  countedCash: Rupiah,
  expectedBalance: Rupiah,
): { readonly difference: Rupiah; readonly matches: boolean } {
  const difference = M.subtract(countedCash, expectedBalance)
  return { difference, matches: M.isZero(difference) }
}
