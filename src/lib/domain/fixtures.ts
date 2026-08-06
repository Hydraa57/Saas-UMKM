import { rupiah } from '@/lib/money'
import type {
  CashCategory,
  CashEntry,
  Sale,
  SaleLine,
  TailorOrder,
  TailorStatus,
} from './types'

/**
 * Pembangun data uji. Hanya dipakai oleh berkas `.test.ts`, tapi disimpan
 * sebagai modul biasa supaya ikut diperiksa `tsc` — data uji yang tidak
 * ikut dicek tipe akan diam-diam melenceng dari skema aslinya.
 */

let counter = 0
const nextId = (prefix: string): string => `${prefix}-${++counter}`

export function makeLine(overrides: Partial<SaleLine> = {}): SaleLine {
  return {
    itemName: 'Biskuit Roma',
    productId: nextId('product'),
    qty: 1,
    unitPrice: rupiah(5000),
    unitCost: rupiah(3500),
    ...overrides,
  }
}

export function makeSale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: nextId('sale'),
    occurredAt: '2026-08-06T03:00:00.000Z', // 10.00 WIB
    lines: [makeLine()],
    discountAmount: rupiah(0),
    paidAmount: rupiah(5000),
    customerId: null,
    voidedAt: null,
    ...overrides,
  }
}

export function makeEntry(
  category: CashCategory,
  amount: number,
  overrides: Partial<CashEntry> = {},
): CashEntry {
  const outgoing: readonly CashCategory[] = [
    'purchase',
    'operational',
    'owner_draw',
    'other_out',
  ]
  return {
    id: nextId('entry'),
    walletId: 'wallet-tunai',
    occurredAt: '2026-08-06T03:00:00.000Z',
    direction: outgoing.includes(category) ? 'out' : 'in',
    amount: rupiah(amount),
    category,
    note: null,
    ...overrides,
  }
}

export function makeOrder(overrides: Partial<TailorOrder> = {}): TailorOrder {
  return {
    id: nextId('order'),
    orderNo: '2026-0001',
    customerId: 'customer-1',
    garmentType: 'Kemeja',
    price: rupiah(150_000),
    paidAmount: rupiah(50_000),
    promisedDate: '2026-08-10',
    status: 'queued' as TailorStatus,
    createdAt: '2026-08-01T03:00:00.000Z',
    ...overrides,
  }
}
