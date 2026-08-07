import { describe, expect, it } from 'vitest'
import { rupiah } from '@/lib/money'
import {
  ageInDays,
  allocatePayment,
  groupByPerson,
  isOpen,
  isPartiallyPaid,
  isSettled,
  outstanding,
  summarizeDebts,
} from './debt'
import { makeDebt } from './fixtures'

const TODAY = '2026-08-06'

describe('sisa utang', () => {
  it('menghitung kekurangan', () => {
    expect(
      outstanding(makeDebt({ amount: rupiah(25_000), paidAmount: rupiah(10_000) })),
    ).toBe(15_000)
  })

  it('nol kalau lunas — kelebihan bayar bukan utang negatif', () => {
    expect(
      outstanding(makeDebt({ amount: rupiah(25_000), paidAmount: rupiah(25_000) })),
    ).toBe(0)
    expect(
      outstanding(makeDebt({ amount: rupiah(25_000), paidAmount: rupiah(99_000) })),
    ).toBe(0)
  })

  it('mengenali keadaan pembayaran', () => {
    expect(isSettled(makeDebt({ paidAmount: rupiah(25_000) }))).toBe(true)
    expect(isSettled(makeDebt({ settledAt: '2026-08-05T03:00:00Z' }))).toBe(true)
    expect(isPartiallyPaid(makeDebt({ paidAmount: rupiah(10_000) }))).toBe(true)
    expect(isPartiallyPaid(makeDebt({ paidAmount: rupiah(0) }))).toBe(false)
    expect(isPartiallyPaid(makeDebt({ paidAmount: rupiah(25_000) }))).toBe(false)
  })

  it('utang yang dibatalkan tidak terbuka', () => {
    expect(isOpen(makeDebt({ deletedAt: '2026-08-05T03:00:00Z' }))).toBe(false)
  })
})

describe('umur utang', () => {
  it('dihitung dari tanggal kejadian di zona waktu usaha', () => {
    expect(ageInDays(makeDebt({ occurredAt: '2026-07-07T03:00:00Z' }), TODAY)).toBe(30)
    expect(ageInDays(makeDebt({ occurredAt: '2026-08-06T03:00:00Z' }), TODAY)).toBe(0)
  })
})

describe('ringkasan', () => {
  it('menjumlah sisa dan mengurutkan dari yang paling lama', () => {
    const summary = summarizeDebts(
      [
        makeDebt({ person: 'Baru', occurredAt: '2026-08-04T03:00:00Z', amount: rupiah(10_000) }),
        makeDebt({ person: 'Lama', occurredAt: '2026-06-01T03:00:00Z', amount: rupiah(20_000) }),
        makeDebt({ person: 'Sedang', occurredAt: '2026-07-20T03:00:00Z', amount: rupiah(5_000) }),
      ],
      'receivable',
      TODAY,
    )

    expect(summary.total).toBe(35_000)
    expect(summary.count).toBe(3)
    expect(summary.items.map((debt) => debt.person)).toEqual(['Lama', 'Sedang', 'Baru'])
  })

  it('memisahkan sisi piutang dan utang', () => {
    const debts = [
      makeDebt({ side: 'receivable', amount: rupiah(25_000) }),
      makeDebt({ side: 'payable', amount: rupiah(100_000) }),
    ]

    expect(summarizeDebts(debts, 'receivable', TODAY).total).toBe(25_000)
    expect(summarizeDebts(debts, 'payable', TODAY).total).toBe(100_000)
  })

  it('melewati yang sudah lunas dan yang dibatalkan', () => {
    const summary = summarizeDebts(
      [
        makeDebt({ amount: rupiah(25_000) }),
        makeDebt({ amount: rupiah(50_000), paidAmount: rupiah(50_000) }),
        makeDebt({ amount: rupiah(90_000), deletedAt: '2026-08-01T03:00:00Z' }),
      ],
      'receivable',
      TODAY,
    )
    expect(summary.total).toBe(25_000)
    expect(summary.count).toBe(1)
  })

  it('menandai yang sudah lewat sebulan', () => {
    const summary = summarizeDebts(
      [
        makeDebt({ person: 'A', occurredAt: '2026-07-09T03:00:00Z' }), // 28 hari
        makeDebt({ person: 'B', occurredAt: '2026-07-07T03:00:00Z' }), // 30 hari
        makeDebt({ person: 'C', occurredAt: '2026-05-01T03:00:00Z' }), // 97 hari
      ],
      'receivable',
      TODAY,
    )
    expect(summary.stale.map((debt) => debt.person)).toEqual(['C', 'B'])
  })

  it('daftar kosong aman', () => {
    const summary = summarizeDebts([], 'receivable', TODAY)
    expect(summary.total).toBe(0)
    expect(summary.stale).toHaveLength(0)
  })
})

describe('kelompok per orang', () => {
  it('menjumlah per orang — ibu menagih per orang, bukan per transaksi', () => {
    const groups = groupByPerson([
      makeDebt({ person: 'Bu Ani', amount: rupiah(10_000) }),
      makeDebt({ person: 'Bu Ani', amount: rupiah(15_000) }),
      makeDebt({ person: 'Bu Sri', amount: rupiah(7_000) }),
    ])

    expect(groups.get('bu ani')?.total).toBe(25_000)
    expect(groups.get('bu ani')?.items).toHaveLength(2)
    expect(groups.get('bu sri')?.total).toBe(7_000)
  })

  it('nama yang sama dengan ejaan berbeda tetap satu orang', () => {
    const groups = groupByPerson([
      makeDebt({ person: 'Bu Ani', amount: rupiah(10_000) }),
      makeDebt({ person: 'bu ani ', amount: rupiah(15_000) }),
    ])
    expect(groups.size).toBe(1)
    expect(groups.get('bu ani')?.total).toBe(25_000)
  })
})

describe('membagi pembayaran', () => {
  it('melunasi yang paling lama lebih dulu', () => {
    const lama = makeDebt({
      person: 'Lama',
      occurredAt: '2026-06-01T03:00:00Z',
      amount: rupiah(20_000),
    })
    const baru = makeDebt({
      person: 'Baru',
      occurredAt: '2026-08-04T03:00:00Z',
      amount: rupiah(30_000),
    })

    const result = allocatePayment([baru, lama], rupiah(25_000), TODAY)

    expect(result.allocations[0]?.debt.person).toBe('Lama')
    expect(result.allocations[0]?.amount).toBe(20_000)
    expect(result.allocations[1]?.debt.person).toBe('Baru')
    expect(result.allocations[1]?.amount).toBe(5_000)
    expect(result.remainder).toBe(0)
  })

  it('membayar sebagian kalau uangnya kurang', () => {
    const result = allocatePayment(
      [makeDebt({ amount: rupiah(50_000) })],
      rupiah(20_000),
      TODAY,
    )
    expect(result.allocations[0]?.amount).toBe(20_000)
    expect(result.remainder).toBe(0)
  })

  it('mengembalikan sisa kalau uangnya lebih', () => {
    const result = allocatePayment(
      [makeDebt({ amount: rupiah(20_000) })],
      rupiah(50_000),
      TODAY,
    )
    expect(result.allocations).toHaveLength(1)
    expect(result.remainder).toBe(30_000)
  })

  it('melewati utang yang sudah lunas', () => {
    const result = allocatePayment(
      [makeDebt({ amount: rupiah(20_000), paidAmount: rupiah(20_000) })],
      rupiah(50_000),
      TODAY,
    )
    expect(result.allocations).toHaveLength(0)
    expect(result.remainder).toBe(50_000)
  })

  it('total alokasi ditambah sisa selalu sama dengan yang dibayarkan', () => {
    const debts = [
      makeDebt({ occurredAt: '2026-07-27T03:00:00Z', amount: rupiah(13_000) }),
      makeDebt({ occurredAt: '2026-07-17T03:00:00Z', amount: rupiah(17_000) }),
      makeDebt({ occurredAt: '2026-07-07T03:00:00Z', amount: rupiah(11_000) }),
    ]
    const paid = 35_000
    const result = allocatePayment(debts, rupiah(paid), TODAY)
    const allocated = result.allocations.reduce((sum, a) => sum + a.amount, 0)

    expect(allocated + result.remainder).toBe(paid)
  })
})
