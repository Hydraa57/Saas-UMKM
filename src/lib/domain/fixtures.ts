import { rupiah } from '@/lib/money'
import type {
  Book,
  CashEntry,
  Category,
  Debt,
  EntryKind,
  Wallet,
} from './types'

/**
 * Pembangun data uji. Hanya dipakai berkas `.test.ts`, tapi disimpan
 * sebagai modul biasa supaya ikut diperiksa `tsc` — data uji yang tidak
 * ikut dicek tipe akan diam-diam melenceng dari skemanya.
 */

let counter = 0
const nextId = (prefix: string): string => `${prefix}-${++counter}`

export const DOMPET_JAHIT = 'wallet-jahit'
export const DOMPET_SNACK = 'wallet-snack'
export const DOMPET_BELANJA = 'wallet-belanja'

export function makeWallet(overrides: Partial<Wallet> = {}): Wallet {
  return {
    id: DOMPET_JAHIT,
    name: 'Dompet Jahit',
    book: 'usaha',
    kind: 'cash',
    openingBalance: rupiah(0),
    isDefault: true,
    archivedAt: null,
    ...overrides,
  }
}

interface EntryOptions {
  readonly book?: Book
  readonly kind?: EntryKind
  readonly walletId?: string
  readonly occurredAt?: string
  readonly category?: Category
  readonly note?: string | null
  readonly transferGroupId?: string | null
  readonly deletedAt?: string | null
}

/** Pemasukan. Arah dan jenisnya ditentukan, tidak perlu diulang tiap kali. */
export function income(
  amount: number,
  category: Category = 'jahit',
  options: EntryOptions = {},
): CashEntry {
  return {
    id: nextId('entry'),
    walletId: options.walletId ?? DOMPET_JAHIT,
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
    walletId: options.walletId ?? DOMPET_BELANJA,
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

/** Sepasang entri pemindahan, seperti yang dibuat `record_transfer`. */
export function transfer(
  amount: number,
  from: { walletId: string; book: Book },
  to: { walletId: string; book: Book },
  occurredAt = '2026-08-06T03:00:00.000Z',
): [CashEntry, CashEntry] {
  const group = nextId('transfer')
  const base = {
    kind: 'transfer' as const,
    category: 'pindah' as const,
    amount: rupiah(amount),
    occurredAt,
    transferGroupId: group,
    note: null,
    deletedAt: null,
  }
  return [
    { ...base, id: nextId('entry'), walletId: from.walletId, book: from.book, direction: 'out' },
    { ...base, id: nextId('entry'), walletId: to.walletId, book: to.book, direction: 'in' },
  ]
}

export function makeDebt(overrides: Partial<Debt> = {}): Debt {
  return {
    id: nextId('debt'),
    book: 'usaha',
    side: 'receivable',
    person: 'Bu Tetangga',
    amount: rupiah(25_000),
    paidAmount: rupiah(0),
    occurredAt: '2026-08-01T03:00:00.000Z',
    note: null,
    settledAt: null,
    deletedAt: null,
    ...overrides,
  }
}
