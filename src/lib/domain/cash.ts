import * as M from '@/lib/money'
import type { Rupiah } from '@/lib/money'
import type { Book, CashEntry, Category, Wallet } from './types'

/**
 * Buku kas.
 *
 * Satu aturan menjelaskan hampir seluruh berkas ini:
 *
 * > **Pemindahan antar dompet bukan penghasilan dan bukan biaya.**
 *
 * Uang jahit yang dipindahkan untuk belanja dapur bukan pemasukan rumah
 * tangga — itu uang yang sama, berpindah tempat. Menghitungnya sebagai
 * pemasukan berarti rekap bulanan menghitungnya dua kali, dan rekap
 * bulanan adalah satu-satunya angka yang selama ini ibu hitung sendiri.
 * Kalau angka aplikasi berbeda dari angka yang biasa dia dapat, yang
 * dia percayai adalah bukunya.
 *
 * Saldo dompet tetap bergerak, karena uangnya memang benar-benar pindah.
 */

/** Entri yang ikut dihitung: belum dibatalkan. */
export function isLive(entry: CashEntry): boolean {
  return !entry.deletedAt
}

/** Entri yang ikut laporan penghasilan/biaya: bukan pemindahan. */
export function countsAsFlow(entry: CashEntry): boolean {
  return isLive(entry) && entry.kind !== 'transfer'
}

/** Nilai bertanda: positif untuk masuk, negatif untuk keluar. */
export function signedAmount(entry: CashEntry): Rupiah {
  return entry.direction === 'in' ? entry.amount : M.negate(entry.amount)
}

export interface FlowSummary {
  readonly income: Rupiah
  readonly expense: Rupiah
  /** income − expense. Boleh negatif. */
  readonly net: Rupiah
  readonly byCategory: ReadonlyMap<Category, Rupiah>
  readonly entryCount: number
}

/**
 * Ringkasan pemasukan dan pengeluaran.
 *
 * Pemindahan dilewati. Entri yang dibatalkan dilewati.
 */
export function summarizeFlow(entries: readonly CashEntry[]): FlowSummary {
  const byCategory = new Map<Category, Rupiah>()
  let income = M.ZERO
  let expense = M.ZERO
  let entryCount = 0

  for (const entry of entries) {
    if (!countsAsFlow(entry)) continue
    entryCount += 1

    byCategory.set(
      entry.category,
      M.add(byCategory.get(entry.category) ?? M.ZERO, entry.amount),
    )

    if (entry.kind === 'income') {
      income = M.add(income, entry.amount)
    } else {
      expense = M.add(expense, entry.amount)
    }
  }

  return {
    income,
    expense,
    net: M.subtract(income, expense),
    byCategory,
    entryCount,
  }
}

export function filterByBook(
  entries: readonly CashEntry[],
  book: Book,
): CashEntry[] {
  return entries.filter((entry) => entry.book === book)
}

export function filterByWallet(
  entries: readonly CashEntry[],
  walletId: string,
): CashEntry[] {
  return entries.filter((entry) => entry.walletId === walletId)
}

/**
 * Saldo sebuah dompet.
 *
 * Saldo sengaja **tidak** disimpan sebagai kolom. Kolom saldo yang
 * diperbarui tiap transaksi akan melenceng cepat atau lambat — satu
 * sinkronisasi gagal separuh sudah cukup — dan begitu melenceng tidak ada
 * cara memulihkannya, karena tidak ada lagi kebenaran untuk dibandingkan.
 * Saldo turunan selalu bisa dihitung ulang dari nol.
 *
 * Semua entri hidup ikut, **termasuk pemindahan**: uangnya memang
 * berpindah dari dompet ini ke dompet lain.
 */
export function walletBalance(
  wallet: Pick<Wallet, 'id' | 'openingBalance'>,
  entries: readonly CashEntry[],
): Rupiah {
  const own = entries.filter(
    (entry) => entry.walletId === wallet.id && isLive(entry),
  )
  return M.add(wallet.openingBalance, M.sum(own.map(signedAmount)))
}

/** Saldo seluruh dompet dalam satu buku. */
export function bookBalance(
  wallets: readonly Wallet[],
  entries: readonly CashEntry[],
  book: Book,
): Rupiah {
  return M.sum(
    wallets
      .filter((wallet) => wallet.book === book && !wallet.archivedAt)
      .map((wallet) => walletBalance(wallet, entries)),
  )
}

/**
 * Selisih antara uang fisik yang dihitung dan saldo menurut aplikasi.
 *
 * Positif berarti isi dompet lebih banyak daripada catatan — biasanya ada
 * pemasukan yang belum tercatat. Negatif berarti sebaliknya.
 *
 * Ada karena kriteria penerimaan yang paling keras adalah saldo aplikasi
 * cocok dengan isi dompet. Selisih yang bisa dilihat dan dijelaskan jauh
 * lebih baik daripada selisih yang diam-diam menumpuk sampai ibu berhenti
 * percaya pada angkanya.
 */
export function reconcile(
  counted: Rupiah,
  expected: Rupiah,
): { readonly difference: Rupiah; readonly matches: boolean } {
  const difference = M.subtract(counted, expected)
  return { difference, matches: M.isZero(difference) }
}

/**
 * Dua sisi sebuah pemindahan.
 *
 * Berguna untuk menampilkannya sebagai satu baris di riwayat, bukan dua
 * baris yang terlihat seperti uang keluar lalu uang masuk entah dari mana.
 */
export function pairTransfer(
  entries: readonly CashEntry[],
  transferGroupId: string,
): { readonly out?: CashEntry; readonly in?: CashEntry } {
  const pair = entries.filter(
    (entry) => entry.transferGroupId === transferGroupId,
  )
  return {
    out: pair.find((entry) => entry.direction === 'out'),
    in: pair.find((entry) => entry.direction === 'in'),
  }
}
