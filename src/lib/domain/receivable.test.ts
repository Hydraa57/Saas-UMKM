import { describe, it, expect } from 'vitest'
import { rupiah } from '@/lib/money'
import {
  allocatePayment,
  groupByCustomer,
  isPartiallyPaid,
  isSettled,
  outstanding,
  overpayment,
  saleReceivable,
  summarizeReceivables,
  tailorReceivable,
  type Receivable,
} from './receivable'
import { makeLine, makeOrder, makeSale } from './fixtures'

const TODAY = '2026-08-06'

describe('sisa bayar', () => {
  it('menghitung kekurangan', () => {
    expect(outstanding(rupiah(150_000), rupiah(50_000))).toBe(100_000)
  })

  it('nol kalau lunas atau lebih — kelebihan bayar bukan piutang', () => {
    expect(outstanding(rupiah(150_000), rupiah(150_000))).toBe(0)
    expect(outstanding(rupiah(150_000), rupiah(200_000))).toBe(0)
  })

  it('kelebihan bayar dilaporkan terpisah', () => {
    expect(overpayment(rupiah(150_000), rupiah(200_000))).toBe(50_000)
    expect(overpayment(rupiah(150_000), rupiah(100_000))).toBe(0)
  })

  it('mengenali status pembayaran', () => {
    expect(isSettled(rupiah(100), rupiah(100))).toBe(true)
    expect(isSettled(rupiah(100), rupiah(120))).toBe(true)
    expect(isPartiallyPaid(rupiah(100), rupiah(40))).toBe(true)
    expect(isPartiallyPaid(rupiah(100), rupiah(0))).toBe(false)
    expect(isPartiallyPaid(rupiah(100), rupiah(100))).toBe(false)
  })
})

describe('piutang dari penjualan', () => {
  it('muncul saat belum lunas', () => {
    const receivable = saleReceivable(
      makeSale({
        lines: [makeLine({ qty: 2, unitPrice: rupiah(5000) })],
        paidAmount: rupiah(0),
        customerId: 'customer-1',
      }),
      TODAY,
    )

    expect(receivable).not.toBeNull()
    expect(receivable?.outstanding).toBe(10_000)
    expect(receivable?.customerId).toBe('customer-1')
    expect(receivable?.sourceType).toBe('sale')
  })

  it('tidak muncul saat sudah lunas', () => {
    const receivable = saleReceivable(
      makeSale({
        lines: [makeLine({ qty: 1, unitPrice: rupiah(5000) })],
        paidAmount: rupiah(5000),
      }),
      TODAY,
    )
    expect(receivable).toBeNull()
  })

  it('tidak muncul kalau penjualannya dibatalkan', () => {
    const receivable = saleReceivable(
      makeSale({ paidAmount: rupiah(0), voidedAt: '2026-08-06T05:00:00Z' }),
      TODAY,
    )
    expect(receivable).toBeNull()
  })

  it('memperhitungkan diskon', () => {
    const receivable = saleReceivable(
      makeSale({
        lines: [makeLine({ qty: 1, unitPrice: rupiah(20_000) })],
        discountAmount: rupiah(5000),
        paidAmount: rupiah(0),
      }),
      TODAY,
    )
    expect(receivable?.outstanding).toBe(15_000)
  })

  it('memberi label yang bisa dikenali ibu', () => {
    const single = saleReceivable(
      makeSale({
        lines: [makeLine({ itemName: 'Biskuit Roma' })],
        paidAmount: rupiah(0),
      }),
      TODAY,
    )
    expect(single?.label).toBe('Biskuit Roma')

    const many = saleReceivable(
      makeSale({
        lines: [
          makeLine({ itemName: 'Biskuit Roma' }),
          makeLine({ itemName: 'Oreo' }),
          makeLine({ itemName: 'Chitato' }),
        ],
        paidAmount: rupiah(0),
      }),
      TODAY,
    )
    expect(many?.label).toBe('Biskuit Roma +2 lainnya')
  })

  it('menghitung umur piutang dari tanggal transaksi di zona waktu usaha', () => {
    const receivable = saleReceivable(
      makeSale({ occurredAt: '2026-07-07T03:00:00.000Z', paidAmount: rupiah(0) }),
      TODAY,
    )
    expect(receivable?.since).toBe('2026-07-07')
    expect(receivable?.ageInDays).toBe(30)
  })
})

describe('piutang dari order jahit', () => {
  it('muncul untuk order yang belum lunas, termasuk yang masih dikerjakan', () => {
    const receivable = tailorReceivable(
      makeOrder({ status: 'in_progress', price: rupiah(150_000), paidAmount: rupiah(50_000) }),
      TODAY,
    )
    expect(receivable?.outstanding).toBe(100_000)
    expect(receivable?.sourceType).toBe('tailor_order')
  })

  it('tidak muncul untuk order yang dibatalkan', () => {
    expect(
      tailorReceivable(makeOrder({ status: 'cancelled', paidAmount: rupiah(0) }), TODAY),
    ).toBeNull()
  })

  it('tidak muncul kalau sudah lunas', () => {
    expect(
      tailorReceivable(
        makeOrder({ price: rupiah(150_000), paidAmount: rupiah(150_000) }),
        TODAY,
      ),
    ).toBeNull()
  })

  it('labelnya menyebut jenis jahitan dan nomor order', () => {
    const receivable = tailorReceivable(
      makeOrder({ garmentType: 'Kebaya', orderNo: '2026-0041' }),
      TODAY,
    )
    expect(receivable?.label).toBe('Kebaya · 2026-0041')
  })
})

function receivable(overrides: Partial<Receivable> = {}): Receivable {
  return {
    sourceType: 'sale',
    sourceId: 'sale-1',
    customerId: 'customer-1',
    label: 'Biskuit',
    totalAmount: rupiah(50_000),
    paidAmount: rupiah(0),
    outstanding: rupiah(50_000),
    since: '2026-08-01',
    ageInDays: 5,
    ...overrides,
  }
}

describe('ringkasan piutang', () => {
  it('menjumlah dan mengurutkan dari yang paling lama', () => {
    const summary = summarizeReceivables([
      receivable({ sourceId: 'a', ageInDays: 3, outstanding: rupiah(10_000) }),
      receivable({ sourceId: 'b', ageInDays: 45, outstanding: rupiah(20_000) }),
      receivable({ sourceId: 'c', ageInDays: 12, outstanding: rupiah(5000) }),
    ])

    expect(summary.total).toBe(35_000)
    expect(summary.count).toBe(3)
    expect(summary.items[0]?.sourceId).toBe('b')
    expect(summary.items[2]?.sourceId).toBe('a')
  })

  it('menandai yang sudah lewat 30 hari', () => {
    const summary = summarizeReceivables([
      receivable({ sourceId: 'a', ageInDays: 29 }),
      receivable({ sourceId: 'b', ageInDays: 30 }),
      receivable({ sourceId: 'c', ageInDays: 90 }),
    ])
    expect(summary.overdue.map((item) => item.sourceId)).toEqual(['c', 'b'])
  })

  it('daftar kosong aman', () => {
    const summary = summarizeReceivables([])
    expect(summary.total).toBe(0)
    expect(summary.overdue).toHaveLength(0)
  })
})

describe('groupByCustomer', () => {
  it('menjumlah per pelanggan — ibu menagih per orang', () => {
    const groups = groupByCustomer([
      receivable({ customerId: 'c1', outstanding: rupiah(10_000) }),
      receivable({ customerId: 'c1', outstanding: rupiah(15_000) }),
      receivable({ customerId: 'c2', outstanding: rupiah(7000) }),
    ])

    expect(groups.get('c1')?.total).toBe(25_000)
    expect(groups.get('c1')?.items).toHaveLength(2)
    expect(groups.get('c2')?.total).toBe(7000)
  })

  it('piutang tanpa pelanggan dikelompokkan terpisah', () => {
    const groups = groupByCustomer([receivable({ customerId: null })])
    expect(groups.get(null)?.total).toBe(50_000)
  })
})

describe('allocatePayment', () => {
  it('melunasi yang paling lama lebih dulu', () => {
    const result = allocatePayment(
      [
        receivable({ sourceId: 'baru', ageInDays: 2, outstanding: rupiah(30_000) }),
        receivable({ sourceId: 'lama', ageInDays: 60, outstanding: rupiah(20_000) }),
      ],
      rupiah(25_000),
    )

    expect(result.allocations[0]?.receivable.sourceId).toBe('lama')
    expect(result.allocations[0]?.amount).toBe(20_000)
    expect(result.allocations[1]?.receivable.sourceId).toBe('baru')
    expect(result.allocations[1]?.amount).toBe(5000)
    expect(result.remainder).toBe(0)
  })

  it('membayar sebagian kalau uangnya kurang', () => {
    const result = allocatePayment(
      [receivable({ outstanding: rupiah(50_000) })],
      rupiah(20_000),
    )
    expect(result.allocations).toHaveLength(1)
    expect(result.allocations[0]?.amount).toBe(20_000)
    expect(result.remainder).toBe(0)
  })

  it('mengembalikan sisa kalau uangnya lebih', () => {
    const result = allocatePayment(
      [receivable({ outstanding: rupiah(20_000) })],
      rupiah(50_000),
    )
    expect(result.allocations).toHaveLength(1)
    expect(result.remainder).toBe(30_000)
  })

  it('tidak mengalokasikan apa pun untuk pembayaran nol', () => {
    const result = allocatePayment([receivable()], rupiah(0))
    expect(result.allocations).toHaveLength(0)
    expect(result.remainder).toBe(0)
  })

  it('total alokasi tidak pernah melebihi uang yang dibayarkan', () => {
    const items = [
      receivable({ sourceId: 'a', ageInDays: 10, outstanding: rupiah(13_000) }),
      receivable({ sourceId: 'b', ageInDays: 20, outstanding: rupiah(17_000) }),
      receivable({ sourceId: 'c', ageInDays: 30, outstanding: rupiah(11_000) }),
    ]
    const paid = 35_000
    const result = allocatePayment(items, rupiah(paid))
    const allocated = result.allocations.reduce((sum, a) => sum + a.amount, 0)

    expect(allocated + result.remainder).toBe(paid)
    expect(allocated).toBeLessThanOrEqual(paid)
  })
})
