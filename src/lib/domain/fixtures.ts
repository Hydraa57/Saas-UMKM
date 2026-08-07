import { rupiah } from '@/lib/money'
import type { Book, CashEntry, Category, Debt, Wallet } from './types'

/**
 * Pembangun data uji. Hanya dipakai berkas `.test.ts`, tapi disimpan
 * sebagai modul biasa supaya ikut diperiksa `tsc` — data uji yang tidak
 * ikut dicek tipe akan diam-diam melenceng dari skemanya.
 */

let counter = 0
const nextId = (prefix: string): string => `${prefix}-${++counter}`

/**
 * Bawaannya satu dompet, karena itu keadaan mayoritas usaha mikro:
 * satu tempat uang untuk usaha sekaligus rumah tangga.
 */
export const DOMPET_UTAMA = 'wallet-utama'
export const REKENING = 'wallet-rekening'

export function makeWallet(overrides: Partial<Wallet> = {}): Wallet {
  return {
    id: DOMPET_UTAMA,
    name: 'Dompet Utama',
    kind: 'tunai',
    defaultBook: null,
    openingBalance: rupiah(0),
    isDefault: true,
    archivedAt: null,
    ...overrides,
  }
}

interface EntryOptions {
  readonly book?: Book
  readonly walletId?: string
  readonly occurredAt?: string
  readonly note?: string | null
  readonly deletedAt?: string | null
}

export function income(
  amount: number,
  category: Category = 'penjualan',
  options: EntryOptions = {},
): CashEntry {
  return {
    id: nextId('entry'),
    walletId: options.walletId ?? DOMPET_UTAMA,
    book: options.book ?? 'usaha',
    occurredAt: options.occurredAt ?? '2026-08-06T03:00:00.000Z',
    direction: 'in',
    amount: rupiah(amount),
    kind: 'income',
    category,
    note: options.note ?? null,
    transferGroupId: null,
    deletedAt: options.deletedAt ?? null,
  }
}

export function expense(
  amount: number,
  category: Category = 'belanja',
  options: EntryOptions = {},
): CashEntry {
  return {
    id: nextId('entry'),
    walletId: options.walletId ?? DOMPET_UTAMA,
    book: options.book ?? 'rumah',
    occurredAt: options.occurredAt ?? '2026-08-06T03:00:00.000Z',
    direction: 'out',
    amount: rupiah(amount),
    kind: 'expense',
    category,
    note: options.note ?? null,
    transferGroupId: null,
    deletedAt: options.deletedAt ?? null,
  }
}

/**
 * Sepasang entri pemindahan, seperti yang dibuat `record_transfer`.
 * Tanpa buku — memindahkan uang antar dompet bukan kegiatan usaha
 * maupun rumah tangga.
 */
export function transfer(
  amount: number,
  fromWalletId: string,
  toWalletId: string,
  occurredAt = '2026-08-06T03:00:00.000Z',
): [CashEntry, CashEntry] {
  const group = nextId('transfer')
  const base = {
    book: null,
    kind: 'transfer' as const,
    category: 'pindah' as const,
    amount: rupiah(amount),
    occurredAt,
    transferGroupId: group,
    note: null,
    deletedAt: null,
  }
  return [
    { ...base, id: nextId('entry'), walletId: fromWalletId, direction: 'out' },
    { ...base, id: nextId('entry'), walletId: toWalletId, direction: 'in' },
  ]
}

export function makeDebt(overrides: Partial<Debt> = {}): Debt {
  return {
    id: nextId('debt'),
    book: 'usaha',
    side: 'receivable',
    person: 'Bu Ani',
    amount: rupiah(25_000),
    paidAmount: rupiah(0),
    occurredAt: '2026-08-01T03:00:00.000Z',
    note: null,
    settledAt: null,
    deletedAt: null,
    ...overrides,
  }
}
