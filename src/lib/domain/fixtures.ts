import { rupiah } from '@/lib/money'
import type {
  Barang,
  CartLine,
  CashEntry,
  Category,
  Debt,
  Item,
  Jasa,
  Sale,
  Wallet,
} from './types'

/**
 * Pembangun data uji. Hanya dipakai berkas `.test.ts`, tapi disimpan
 * sebagai modul biasa supaya ikut diperiksa `tsc` — data uji yang tidak
 * ikut dicek tipe akan diam-diam melenceng dari skemanya.
 */

let counter = 0
const nextId = (prefix: string): string => `${prefix}-${++counter}`

export const KAS = 'wallet-kas'
export const REKENING = 'wallet-rekening'

export function makeWallet(overrides: Partial<Wallet> = {}): Wallet {
  return {
    id: KAS,
    name: 'Kas Utama',
    kind: 'tunai',
    openingBalance: rupiah(0),
    isDefault: true,
    archivedAt: null,
    ...overrides,
  }
}

export function makeBarang(overrides: Partial<Barang> = {}): Barang {
  return {
    id: nextId('item'),
    kind: 'barang',
    name: 'Biskuit Roma',
    photoPath: null,
    price: rupiah(5_000),
    costPrice: rupiah(3_500),
    unit: 'pcs',
    barcode: null,
    soldCount: 0,
    archivedAt: null,
    stockQty: 100,
    minStock: 10,
    ...overrides,
  }
}

export function makeJasa(overrides: Partial<Jasa> = {}): Jasa {
  return {
    id: nextId('item'),
    kind: 'jasa',
    name: 'Potong celana',
    photoPath: null,
    price: rupiah(30_000),
    costPrice: rupiah(0),
    unit: 'pcs',
    barcode: null,
    soldCount: 0,
    archivedAt: null,
    ...overrides,
  }
}

export function makeLine(overrides: Partial<CartLine> = {}): CartLine {
  return {
    itemId: nextId('item'),
    itemKind: 'barang',
    itemName: 'Biskuit Roma',
    qty: 1,
    unitPrice: rupiah(5_000),
    unitCost: rupiah(3_500),
    ...overrides,
  }
}

export function lineOf(item: Item, qty = 1): CartLine {
  return {
    itemId: item.id,
    itemKind: item.kind,
    itemName: item.name,
    qty,
    unitPrice: item.price,
    unitCost: item.costPrice,
  }
}

export function makeSale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: nextId('sale'),
    invoiceNo: '2026-0001',
    occurredAt: '2026-08-06T03:00:00.000Z',
    lines: [makeLine()],
    discount: rupiah(0),
    paid: rupiah(5_000),
    paymentMethod: 'tunai',
    customerName: null,
    note: null,
    voidedAt: null,
    ...overrides,
  }
}

interface EntryOptions {
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
    walletId: options.walletId ?? KAS,
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
  category: Category = 'modal',
  options: EntryOptions = {},
): CashEntry {
  return {
    id: nextId('entry'),
    walletId: options.walletId ?? KAS,
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
  fromWalletId: string,
  toWalletId: string,
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
    { ...base, id: nextId('entry'), walletId: fromWalletId, direction: 'out' },
    { ...base, id: nextId('entry'), walletId: toWalletId, direction: 'in' },
  ]
}

export function makeDebt(overrides: Partial<Debt> = {}): Debt {
  return {
    id: nextId('debt'),
    side: 'receivable',
    person: 'Bu Ani',
    amount: rupiah(25_000),
    paidAmount: rupiah(0),
    saleId: null,
    occurredAt: '2026-08-01T03:00:00.000Z',
    note: null,
    settledAt: null,
    deletedAt: null,
    ...overrides,
  }
}
