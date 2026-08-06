import { describe, it, expect } from 'vitest'
import { rupiah } from '@/lib/money'
import { summarizeCash, walletBalance, reconcile, signedAmount } from './cash'
import { marginPercent, profitByProduct, summarizeProfit } from './profit'
import { makeEntry, makeLine, makeOrder, makeSale } from './fixtures'

describe('arus kas', () => {
  it('memisahkan masuk dan keluar', () => {
    const summary = summarizeCash([
      makeEntry('sale', 85_000),
      makeEntry('service', 50_000),
      makeEntry('purchase', 200_000),
      makeEntry('operational', 15_000),
    ])

    expect(summary.totalIn).toBe(135_000)
    expect(summary.totalOut).toBe(215_000)
    expect(summary.net).toBe(-80_000)
    expect(summary.entryCount).toBe(4)
  })

  it('merinci per kategori', () => {
    const summary = summarizeCash([
      makeEntry('sale', 10_000),
      makeEntry('sale', 15_000),
      makeEntry('owner_draw', 50_000),
    ])

    expect(summary.byCategory.sale).toBe(25_000)
    expect(summary.byCategory.owner_draw).toBe(50_000)
    expect(summary.byCategory.service).toBe(0)
  })

  it('daftar kosong menghasilkan nol di semua kategori', () => {
    const summary = summarizeCash([])
    expect(summary.net).toBe(0)
    expect(summary.byCategory.purchase).toBe(0)
  })

  it('memberi tanda sesuai arah', () => {
    expect(signedAmount(makeEntry('sale', 5000))).toBe(5000)
    expect(signedAmount(makeEntry('purchase', 5000))).toBe(-5000)
  })
})

describe('saldo dompet', () => {
  it('menghitung dari saldo awal ditambah seluruh mutasi', () => {
    const balance = walletBalance(rupiah(100_000), [
      makeEntry('sale', 85_000),
      makeEntry('purchase', 200_000),
      makeEntry('capital', 500_000),
    ])
    expect(balance).toBe(485_000)
  })

  it('boleh negatif — laci memang bisa minus kalau ada yang belum tercatat', () => {
    expect(walletBalance(rupiah(0), [makeEntry('purchase', 50_000)])).toBe(-50_000)
  })
})

describe('cocokkan kas', () => {
  it('cocok kalau sama persis', () => {
    const result = reconcile(rupiah(485_000), rupiah(485_000))
    expect(result.matches).toBe(true)
    expect(result.difference).toBe(0)
  })

  it('selisih positif berarti uang di laci lebih banyak dari catatan', () => {
    const result = reconcile(rupiah(490_000), rupiah(485_000))
    expect(result.matches).toBe(false)
    expect(result.difference).toBe(5000)
  })

  it('selisih negatif berarti catatan lebih banyak dari laci', () => {
    expect(reconcile(rupiah(480_000), rupiah(485_000)).difference).toBe(-5000)
  })
})

describe('laba rugi', () => {
  it('pendapatan diakui saat barang berpindah, bukan saat uang diterima', () => {
    // Dua penjualan identik: satu dibayar tunai, satu diutang penuh.
    // Keduanya harus menghasilkan pendapatan dan untung yang sama.
    const line = makeLine({ qty: 2, unitPrice: rupiah(5000), unitCost: rupiah(3500) })

    const paid = summarizeProfit({
      sales: [makeSale({ lines: [line], paidAmount: rupiah(10_000) })],
      tailorOrders: [],
      cashEntries: [],
    })
    const unpaid = summarizeProfit({
      sales: [makeSale({ lines: [line], paidAmount: rupiah(0) })],
      tailorOrders: [],
      cashEntries: [],
    })

    expect(paid.revenue).toBe(unpaid.revenue)
    expect(paid.netProfit).toBe(unpaid.netProfit)
    expect(paid.netProfit).toBe(3000)
  })

  it('kulakan tidak mengurangi untung — itu persediaan, bukan biaya', () => {
    const summary = summarizeProfit({
      sales: [
        makeSale({
          lines: [makeLine({ qty: 2, unitPrice: rupiah(5000), unitCost: rupiah(3500) })],
        }),
      ],
      tailorOrders: [],
      cashEntries: [makeEntry('purchase', 2_000_000)],
    })

    expect(summary.costOfGoodsSold).toBe(7000)
    expect(summary.operatingExpense).toBe(0)
    expect(summary.netProfit).toBe(3000)
  })

  it('ambil buat rumah dan tambah modal tidak menyentuh untung', () => {
    const base = {
      sales: [
        makeSale({
          lines: [makeLine({ qty: 1, unitPrice: rupiah(10_000), unitCost: rupiah(6000) })],
        }),
      ],
      tailorOrders: [],
    }

    const without = summarizeProfit({ ...base, cashEntries: [] })
    const with_ = summarizeProfit({
      ...base,
      cashEntries: [makeEntry('owner_draw', 500_000), makeEntry('capital', 1_000_000)],
    })

    expect(with_.netProfit).toBe(without.netProfit)
    expect(with_.netProfit).toBe(4000)
  })

  it('pelunasan utang lama tidak dihitung ulang sebagai pendapatan', () => {
    const summary = summarizeProfit({
      sales: [],
      tailorOrders: [],
      cashEntries: [makeEntry('receivable', 120_000)],
    })
    expect(summary.revenue).toBe(0)
    expect(summary.netProfit).toBe(0)
  })

  it('biaya operasional mengurangi untung', () => {
    const summary = summarizeProfit({
      sales: [
        makeSale({
          lines: [makeLine({ qty: 10, unitPrice: rupiah(5000), unitCost: rupiah(3500) })],
        }),
      ],
      tailorOrders: [],
      cashEntries: [makeEntry('operational', 8000), makeEntry('other_out', 2000)],
    })

    expect(summary.grossProfit).toBe(15_000)
    expect(summary.operatingExpense).toBe(10_000)
    expect(summary.netProfit).toBe(5000)
  })

  it('jasa jahit diakui hanya setelah dikerjakan', () => {
    const summary = summarizeProfit({
      sales: [],
      cashEntries: [],
      tailorOrders: [
        makeOrder({ status: 'queued', price: rupiah(150_000) }),
        makeOrder({ status: 'in_progress', price: rupiah(200_000) }),
        makeOrder({ status: 'done', price: rupiah(175_000) }),
        makeOrder({ status: 'picked_up', price: rupiah(125_000) }),
        makeOrder({ status: 'cancelled', price: rupiah(999_000) }),
      ],
    })

    expect(summary.serviceRevenue).toBe(300_000)
  })

  it('DP order yang belum jadi tidak menaikkan untung', () => {
    const summary = summarizeProfit({
      sales: [],
      tailorOrders: [makeOrder({ status: 'in_progress', price: rupiah(150_000) })],
      cashEntries: [makeEntry('service', 50_000)],
    })
    expect(summary.netProfit).toBe(0)
  })

  it('penjualan yang dibatalkan tidak dihitung', () => {
    const summary = summarizeProfit({
      sales: [
        makeSale({ lines: [makeLine({ unitPrice: rupiah(5000), unitCost: rupiah(3500) })] }),
        makeSale({
          lines: [makeLine({ unitPrice: rupiah(50_000), unitCost: rupiah(30_000) })],
          voidedAt: '2026-08-06T05:00:00.000Z',
        }),
      ],
      tailorOrders: [],
      cashEntries: [],
    })

    expect(summary.goodsRevenue).toBe(5000)
    expect(summary.netProfit).toBe(1500)
  })

  it('menggabungkan barang, jasa, dan biaya dalam satu angka', () => {
    const summary = summarizeProfit({
      sales: [
        makeSale({
          lines: [makeLine({ qty: 20, unitPrice: rupiah(5000), unitCost: rupiah(3500) })],
        }),
      ],
      tailorOrders: [makeOrder({ status: 'picked_up', price: rupiah(150_000) })],
      cashEntries: [
        makeEntry('purchase', 1_000_000),
        makeEntry('operational', 25_000),
        makeEntry('owner_draw', 300_000),
        makeEntry('other_in', 10_000),
      ],
    })

    expect(summary.goodsRevenue).toBe(100_000)
    expect(summary.serviceRevenue).toBe(150_000)
    expect(summary.otherRevenue).toBe(10_000)
    expect(summary.revenue).toBe(260_000)
    expect(summary.costOfGoodsSold).toBe(70_000)
    expect(summary.grossProfit).toBe(190_000)
    expect(summary.operatingExpense).toBe(25_000)
    expect(summary.netProfit).toBe(165_000)
  })

  it('periode kosong menghasilkan nol di mana-mana', () => {
    const summary = summarizeProfit({ sales: [], tailorOrders: [], cashEntries: [] })
    expect(summary.revenue).toBe(0)
    expect(summary.netProfit).toBe(0)
  })
})

describe('marginPercent', () => {
  it('menghitung margin', () => {
    const summary = summarizeProfit({
      sales: [
        makeSale({
          lines: [makeLine({ qty: 10, unitPrice: rupiah(10_000), unitCost: rupiah(6000) })],
        }),
      ],
      tailorOrders: [],
      cashEntries: [],
    })
    expect(marginPercent(summary)).toBe(40)
  })

  it('nol tanpa pendapatan, bukan NaN di layar', () => {
    const summary = summarizeProfit({ sales: [], tailorOrders: [], cashEntries: [] })
    expect(marginPercent(summary)).toBe(0)
  })
})

describe('profitByProduct', () => {
  it('mengelompokkan per produk dan mengurutkan dari untung terbesar', () => {
    const result = profitByProduct([
      makeSale({
        lines: [
          makeLine({ productId: 'p1', itemName: 'Roma', qty: 2, unitPrice: rupiah(5000), unitCost: rupiah(3500) }),
          makeLine({ productId: 'p2', itemName: 'Oreo', qty: 1, unitPrice: rupiah(12_000), unitCost: rupiah(8000) }),
        ],
      }),
      makeSale({
        lines: [
          makeLine({ productId: 'p1', itemName: 'Roma', qty: 3, unitPrice: rupiah(5000), unitCost: rupiah(3500) }),
        ],
      }),
    ])

    expect(result).toHaveLength(2)
    expect(result[0]?.itemName).toBe('Roma')
    expect(result[0]?.qtySold).toBe(5)
    expect(result[0]?.profit).toBe(7500)
    expect(result[1]?.profit).toBe(4000)
  })

  it('mengelompokkan catatan bebas menurut namanya', () => {
    const result = profitByProduct([
      makeSale({
        lines: [
          makeLine({ productId: null, itemName: 'Titipan tetangga', qty: 1, unitPrice: rupiah(3000), unitCost: rupiah(0) }),
          makeLine({ productId: null, itemName: 'Titipan tetangga', qty: 1, unitPrice: rupiah(3000), unitCost: rupiah(0) }),
        ],
      }),
    ])

    expect(result).toHaveLength(1)
    expect(result[0]?.qtySold).toBe(2)
    expect(result[0]?.productId).toBeNull()
  })

  it('melewati penjualan yang dibatalkan', () => {
    const result = profitByProduct([
      makeSale({ voidedAt: '2026-08-06T05:00:00.000Z' }),
    ])
    expect(result).toHaveLength(0)
  })
})
