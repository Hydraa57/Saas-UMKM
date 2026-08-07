import * as M from '@/lib/money'
import type { Rupiah } from '@/lib/money'
import { daysBetween, toLocalDate } from './dates'
import type { Debt, DebtSide, LocalDate } from './types'

/**
 * Utang dan piutang.
 *
 * Sengaja kecil.
 *
 * Ibu tidak mencatat utang secara rapi — di buku belanja, "hutang" cuma
 * muncul sebagai salah satu kata dalam keterangan sebuah baris. Tapi
 * berutang memang terjadi, dan lupa menagih adalah kerugian nyata. Jadi
 * modulnya ada, tapi tidak jadi pusat apa pun.
 *
 * Aturan yang menentukan bentuknya: **sebuah utang tidak menyentuh buku
 * kas sampai uangnya benar-benar berpindah.** Mencatatnya lebih awal akan
 * membuat saldo aplikasi menunjukkan uang yang belum ada di dompet, dan
 * saat itu terjadi ibu berhenti percaya pada seluruh angkanya.
 */

export function outstanding(debt: Debt): Rupiah {
  return M.clampToZero(M.subtract(debt.amount, debt.paidAmount))
}

export function isSettled(debt: Debt): boolean {
  return Boolean(debt.settledAt) || debt.paidAmount >= debt.amount
}

export function isOpen(debt: Debt): boolean {
  return !debt.deletedAt && !isSettled(debt)
}

export function isPartiallyPaid(debt: Debt): boolean {
  return M.isPositive(debt.paidAmount) && debt.paidAmount < debt.amount
}

/** Berapa hari sejak utangnya terjadi. */
export function ageInDays(debt: Debt, today: LocalDate): number {
  return daysBetween(toLocalDate(debt.occurredAt), today)
}

export interface DebtSummary {
  readonly side: DebtSide
  readonly items: readonly Debt[]
  readonly total: Rupiah
  readonly count: number
  /** Sudah lewat sebulan — yang paling perlu ditagih lebih dulu. */
  readonly stale: readonly Debt[]
}

export const STALE_AFTER_DAYS = 30

/**
 * Ringkasan satu sisi utang, diurutkan dari yang paling lama.
 *
 * Yang lama didahulukan karena itu yang paling mungkin terlupakan, dan
 * yang paling canggung ditagih kalau dibiarkan makin lama.
 */
export function summarizeDebts(
  debts: readonly Debt[],
  side: DebtSide,
  today: LocalDate,
): DebtSummary {
  const open = debts
    .filter((debt) => debt.side === side && isOpen(debt))
    .sort((a, b) => ageInDays(b, today) - ageInDays(a, today))

  return {
    side,
    items: open,
    total: M.sum(open.map(outstanding)),
    count: open.length,
    stale: open.filter((debt) => ageInDays(debt, today) >= STALE_AFTER_DAYS),
  }
}

/**
 * Mengelompokkan per orang — ibu menagih per orang, bukan per transaksi.
 * Nama dicocokkan tanpa peduli besar-kecil huruf dan spasi berlebih,
 * supaya "bu ani" dan "Bu Ani " tidak jadi dua orang.
 */
export function groupByPerson(
  debts: readonly Debt[],
): Map<string, { readonly total: Rupiah; readonly items: readonly Debt[] }> {
  const groups = new Map<string, { total: Rupiah; items: Debt[] }>()

  for (const debt of debts) {
    const key = debt.person.trim().toLowerCase()
    const existing = groups.get(key)
    if (existing) {
      existing.items.push(debt)
      existing.total = M.add(existing.total, outstanding(debt))
    } else {
      groups.set(key, { total: outstanding(debt), items: [debt] })
    }
  }

  return groups
}

/**
 * Membagi satu pembayaran ke beberapa utang, dari yang paling lama.
 *
 * Dipakai saat seseorang datang membayar sejumlah uang tanpa menyebut
 * utang yang mana. Melunasi yang paling lama lebih dulu adalah kebiasaan
 * yang wajar dan mudah dijelaskan kalau ditanya.
 *
 * Sisa uang setelah semua utang tertutup dikembalikan sebagai
 * `remainder`; pemanggil yang memutuskan itu jadi kembalian atau titipan.
 */
export function allocatePayment(
  debts: readonly Debt[],
  amount: Rupiah,
  today: LocalDate,
): {
  readonly allocations: ReadonlyArray<{
    readonly debt: Debt
    readonly amount: Rupiah
  }>
  readonly remainder: Rupiah
} {
  const oldestFirst = [...debts]
    .filter(isOpen)
    .sort((a, b) => ageInDays(b, today) - ageInDays(a, today))

  const allocations: Array<{ debt: Debt; amount: Rupiah }> = []
  let left = amount

  for (const debt of oldestFirst) {
    if (!M.isPositive(left)) break
    const applied = M.min(left, outstanding(debt))
    if (!M.isPositive(applied)) continue
    allocations.push({ debt, amount: applied })
    left = M.subtract(left, applied)
  }

  return { allocations, remainder: left }
}
