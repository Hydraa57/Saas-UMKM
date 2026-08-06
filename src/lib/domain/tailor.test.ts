import { describe, it, expect } from 'vitest'
import { rupiah } from '@/lib/money'
import {
  buildBoard,
  canTransition,
  formatOrderNo,
  isAwaitingPickup,
  isDueToday,
  isDueWithin,
  isFinished,
  isFullyPaid,
  isOpen,
  isOverdue,
  nextStatuses,
  parseOrderNo,
  remainingPayment,
  sortByUrgency,
  urgencyOf,
} from './tailor'
import { makeOrder } from './fixtures'

const TODAY = '2026-08-06'

describe('perpindahan status', () => {
  it('mengizinkan alur normal', () => {
    expect(canTransition('queued', 'in_progress')).toBe(true)
    expect(canTransition('in_progress', 'done')).toBe(true)
    expect(canTransition('done', 'picked_up')).toBe(true)
  })

  it('mengizinkan jahitan kembali ke mesin setelah dicoba pelanggan', () => {
    expect(canTransition('done', 'in_progress')).toBe(true)
  })

  it('menolak lompatan yang tidak masuk akal', () => {
    expect(canTransition('queued', 'picked_up')).toBe(false)
    expect(canTransition('cancelled', 'in_progress')).toBe(false)
  })

  it('status akhir tidak bisa mundur', () => {
    expect(nextStatuses('picked_up')).toHaveLength(0)
    expect(nextStatuses('cancelled')).toHaveLength(0)
  })

  it('order bisa dibatalkan selama belum jadi', () => {
    expect(canTransition('queued', 'cancelled')).toBe(true)
    expect(canTransition('in_progress', 'cancelled')).toBe(true)
    expect(canTransition('done', 'cancelled')).toBe(false)
  })
})

describe('predikat status', () => {
  it('membedakan berjalan, selesai, dan menunggu diambil', () => {
    expect(isOpen(makeOrder({ status: 'queued' }))).toBe(true)
    expect(isOpen(makeOrder({ status: 'in_progress' }))).toBe(true)
    expect(isOpen(makeOrder({ status: 'done' }))).toBe(false)

    expect(isFinished(makeOrder({ status: 'picked_up' }))).toBe(true)
    expect(isFinished(makeOrder({ status: 'cancelled' }))).toBe(true)
    expect(isFinished(makeOrder({ status: 'done' }))).toBe(false)

    expect(isAwaitingPickup(makeOrder({ status: 'done' }))).toBe(true)
  })
})

describe('pembayaran order', () => {
  it('menghitung sisa setelah DP', () => {
    const order = makeOrder({ price: rupiah(150_000), paidAmount: rupiah(50_000) })
    expect(remainingPayment(order)).toBe(100_000)
    expect(isFullyPaid(order)).toBe(false)
  })

  it('lunas kalau sudah tertutup', () => {
    const order = makeOrder({ price: rupiah(150_000), paidAmount: rupiah(150_000) })
    expect(remainingPayment(order)).toBe(0)
    expect(isFullyPaid(order)).toBe(true)
  })
})

describe('tenggat', () => {
  it('telat kalau tanggal janji sudah lewat dan belum jadi', () => {
    expect(isOverdue(makeOrder({ promisedDate: '2026-08-05' }), TODAY)).toBe(true)
    expect(isOverdue(makeOrder({ promisedDate: '2026-08-06' }), TODAY)).toBe(false)
    expect(isOverdue(makeOrder({ promisedDate: '2026-08-07' }), TODAY)).toBe(false)
  })

  it('yang sudah jadi tidak pernah dianggap telat', () => {
    const order = makeOrder({ promisedDate: '2026-07-01', status: 'done' })
    expect(isOverdue(order, TODAY)).toBe(false)
  })

  it('order tanpa tanggal janji tidak pernah telat', () => {
    expect(isOverdue(makeOrder({ promisedDate: null }), TODAY)).toBe(false)
  })

  it('mengenali jatuh tempo hari ini', () => {
    expect(isDueToday(makeOrder({ promisedDate: TODAY }), TODAY)).toBe(true)
    expect(isDueToday(makeOrder({ promisedDate: TODAY, status: 'done' }), TODAY)).toBe(false)
  })

  it('mengenali jatuh tempo dalam beberapa hari ke depan', () => {
    expect(isDueWithin(makeOrder({ promisedDate: '2026-08-09' }), TODAY, 3)).toBe(true)
    expect(isDueWithin(makeOrder({ promisedDate: '2026-08-10' }), TODAY, 3)).toBe(false)
    // Yang sudah telat bukan "akan jatuh tempo".
    expect(isDueWithin(makeOrder({ promisedDate: '2026-08-01' }), TODAY, 3)).toBe(false)
  })
})

describe('urgensi', () => {
  it('memberi tingkat sesuai jarak ke tanggal janji', () => {
    expect(urgencyOf(makeOrder({ promisedDate: '2026-08-01' }), TODAY)).toBe('overdue')
    expect(urgencyOf(makeOrder({ promisedDate: TODAY }), TODAY)).toBe('today')
    expect(urgencyOf(makeOrder({ promisedDate: '2026-08-08' }), TODAY)).toBe('soon')
    expect(urgencyOf(makeOrder({ promisedDate: '2026-08-20' }), TODAY)).toBe('later')
    expect(urgencyOf(makeOrder({ promisedDate: null }), TODAY)).toBe('none')
    expect(urgencyOf(makeOrder({ status: 'picked_up' }), TODAY)).toBe('none')
  })

  it('mengurutkan paling mendesak di atas', () => {
    const sorted = sortByUrgency(
      [
        makeOrder({ orderNo: '2026-0004', promisedDate: '2026-08-20' }),
        makeOrder({ orderNo: '2026-0001', promisedDate: '2026-08-01' }),
        makeOrder({ orderNo: '2026-0003', promisedDate: '2026-08-08' }),
        makeOrder({ orderNo: '2026-0002', promisedDate: TODAY }),
      ],
      TODAY,
    )
    expect(sorted.map((order) => order.orderNo)).toEqual([
      '2026-0001',
      '2026-0002',
      '2026-0003',
      '2026-0004',
    ])
  })

  it('order tanpa tanggal janji turun ke bawah tapi tidak hilang', () => {
    const sorted = sortByUrgency(
      [
        makeOrder({ orderNo: 'tanpa-tanggal', promisedDate: null }),
        makeOrder({ orderNo: 'ada-tanggal', promisedDate: '2026-08-20' }),
      ],
      TODAY,
    )
    expect(sorted).toHaveLength(2)
    expect(sorted[1]?.orderNo).toBe('tanpa-tanggal')
  })
})

describe('papan order', () => {
  it('mengelompokkan untuk beranda', () => {
    const board = buildBoard(
      [
        makeOrder({ orderNo: 'telat', promisedDate: '2026-08-01', status: 'in_progress' }),
        makeOrder({ orderNo: 'hari-ini', promisedDate: TODAY, status: 'queued' }),
        makeOrder({ orderNo: 'segera', promisedDate: '2026-08-08', status: 'queued' }),
        makeOrder({ orderNo: 'nanti', promisedDate: '2026-09-01', status: 'queued' }),
        makeOrder({ orderNo: 'jadi', status: 'done' }),
        makeOrder({ orderNo: 'diambil', status: 'picked_up' }),
      ],
      TODAY,
    )

    expect(board.overdue.map((o) => o.orderNo)).toEqual(['telat'])
    expect(board.dueToday.map((o) => o.orderNo)).toEqual(['hari-ini'])
    expect(board.dueSoon.map((o) => o.orderNo)).toEqual(['segera'])
    expect(board.awaitingPickup.map((o) => o.orderNo)).toEqual(['jadi'])
    expect(board.openCount).toBe(4)
  })

  it('jatuh tempo hari ini tidak dihitung dua kali di "segera"', () => {
    const board = buildBoard([makeOrder({ promisedDate: TODAY })], TODAY)
    expect(board.dueToday).toHaveLength(1)
    expect(board.dueSoon).toHaveLength(0)
  })

  it('menjumlah nilai pekerjaan berjalan dan sisa tagihan', () => {
    const board = buildBoard(
      [
        makeOrder({ status: 'queued', price: rupiah(150_000), paidAmount: rupiah(50_000) }),
        makeOrder({ status: 'done', price: rupiah(200_000), paidAmount: rupiah(0) }),
        makeOrder({ status: 'cancelled', price: rupiah(999_000), paidAmount: rupiah(0) }),
      ],
      TODAY,
    )

    expect(board.openValue).toBe(150_000)
    expect(board.unpaidTotal).toBe(300_000)
  })

  it('daftar kosong aman', () => {
    const board = buildBoard([], TODAY)
    expect(board.openCount).toBe(0)
    expect(board.openValue).toBe(0)
    expect(board.unpaidTotal).toBe(0)
  })
})

describe('nomor order', () => {
  it('membentuk nomor yang bisa diucapkan', () => {
    expect(formatOrderNo(2026, 41)).toBe('2026-0041')
    expect(formatOrderNo(2026, 1)).toBe('2026-0001')
    expect(formatOrderNo(2026, 12345)).toBe('2026-12345')
  })

  it('bisa dibaca kembali', () => {
    expect(parseOrderNo('2026-0041')).toEqual({ year: 2026, sequence: 41 })
    expect(parseOrderNo('bukan-nomor')).toBeNull()
    expect(parseOrderNo('26-1')).toBeNull()
  })

  it('bolak-balik', () => {
    for (const sequence of [1, 41, 999, 10_000]) {
      expect(parseOrderNo(formatOrderNo(2026, sequence))?.sequence).toBe(sequence)
    }
  })
})
