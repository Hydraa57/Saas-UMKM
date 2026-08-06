import { describe, it, expect } from 'vitest'
import { rupiah, ZERO } from '@/lib/money'
import {
  addLine,
  calculateCart,
  changeDue,
  lineCost,
  lineSubtotal,
  setLineQty,
} from './cart'
import { makeLine } from './fixtures'

describe('lineSubtotal / lineCost', () => {
  it('mengalikan harga dengan jumlah', () => {
    const line = makeLine({ qty: 3, unitPrice: rupiah(5000), unitCost: rupiah(3500) })
    expect(lineSubtotal(line)).toBe(15000)
    expect(lineCost(line)).toBe(10500)
  })

  it('menangani jumlah pecahan untuk barang timbang', () => {
    const line = makeLine({ qty: 0.25, unitPrice: rupiah(40000), unitCost: rupiah(30000) })
    expect(lineSubtotal(line)).toBe(10000)
    expect(lineCost(line)).toBe(7500)
  })
})

describe('calculateCart', () => {
  it('menjumlah beberapa baris', () => {
    const totals = calculateCart([
      makeLine({ qty: 2, unitPrice: rupiah(5000), unitCost: rupiah(3500) }),
      makeLine({ qty: 1, unitPrice: rupiah(12000), unitCost: rupiah(9000) }),
    ])

    expect(totals.subtotal).toBe(22000)
    expect(totals.cost).toBe(16000)
    expect(totals.total).toBe(22000)
    expect(totals.profit).toBe(6000)
    expect(totals.itemCount).toBe(2)
  })

  it('keranjang kosong menghasilkan nol, bukan NaN', () => {
    const totals = calculateCart([])
    expect(totals.subtotal).toBe(0)
    expect(totals.total).toBe(0)
    expect(totals.profit).toBe(0)
    expect(totals.itemCount).toBe(0)
  })

  it('mengurangi diskon dari subtotal', () => {
    const totals = calculateCart(
      [makeLine({ qty: 2, unitPrice: rupiah(10000), unitCost: rupiah(7000) })],
      rupiah(3000),
    )
    expect(totals.subtotal).toBe(20000)
    expect(totals.discount).toBe(3000)
    expect(totals.total).toBe(17000)
    expect(totals.profit).toBe(3000)
  })

  it('diskon berlebih dibatasi di subtotal — total tidak boleh negatif', () => {
    const totals = calculateCart(
      [makeLine({ qty: 1, unitPrice: rupiah(5000), unitCost: rupiah(3500) })],
      rupiah(999_999),
    )
    expect(totals.discount).toBe(5000)
    expect(totals.total).toBe(0)
    expect(totals.profit).toBe(-3500)
  })

  it('diskon negatif diperlakukan sebagai nol', () => {
    const totals = calculateCart([makeLine({ unitPrice: rupiah(5000) })], rupiah(-1000))
    expect(totals.discount).toBe(0)
    expect(totals.total).toBe(5000)
  })

  it('untung negatif kalau dijual di bawah modal', () => {
    const totals = calculateCart([
      makeLine({ qty: 1, unitPrice: rupiah(3000), unitCost: rupiah(3500) }),
    ])
    expect(totals.profit).toBe(-500)
  })
})

describe('changeDue', () => {
  it('menghitung kembalian', () => {
    expect(changeDue(rupiah(17000), rupiah(20000))).toBe(3000)
  })

  it('nol kalau uang pas', () => {
    expect(changeDue(rupiah(17000), rupiah(17000))).toBe(0)
  })

  it('nol kalau uang kurang — kekurangan bukan kembalian negatif', () => {
    expect(changeDue(rupiah(17000), rupiah(10000))).toBe(0)
  })
})

describe('addLine', () => {
  it('menggabung produk yang sama dengan harga sama', () => {
    const line = makeLine({ productId: 'p1', qty: 1 })
    const cart = addLine(addLine([], line), { ...line, qty: 1 })

    expect(cart).toHaveLength(1)
    expect(cart[0]?.qty).toBe(2)
  })

  it('menambah baris baru kalau harga satuannya berbeda', () => {
    const base = makeLine({ productId: 'p1', unitPrice: rupiah(5000) })
    const cart = addLine(addLine([], base), { ...base, unitPrice: rupiah(4500) })

    expect(cart).toHaveLength(2)
  })

  it('tidak pernah menggabung catatan bebas tanpa produk', () => {
    const free = makeLine({ productId: null, itemName: 'Lainnya' })
    const cart = addLine(addLine([], free), { ...free })

    expect(cart).toHaveLength(2)
  })

  it('menekan foto yang sama tiga kali menghasilkan satu baris berisi tiga', () => {
    const line = makeLine({ productId: 'p1', qty: 1 })
    let cart = addLine([], line)
    cart = addLine(cart, line)
    cart = addLine(cart, line)

    expect(cart).toHaveLength(1)
    expect(cart[0]?.qty).toBe(3)
  })

  it('tidak mengubah larik asal', () => {
    const original = [makeLine({ productId: 'p1' })]
    addLine(original, makeLine({ productId: 'p2' }))
    expect(original).toHaveLength(1)
  })
})

describe('setLineQty', () => {
  it('mengubah jumlah', () => {
    const cart = [makeLine({ qty: 1 }), makeLine({ qty: 2 })]
    expect(setLineQty(cart, 0, 5)[0]?.qty).toBe(5)
  })

  it('jumlah nol menghapus baris', () => {
    const cart = [makeLine({ qty: 1 }), makeLine({ qty: 2 })]
    expect(setLineQty(cart, 0, 0)).toHaveLength(1)
  })

  it('jumlah negatif juga menghapus baris', () => {
    const cart = [makeLine({ qty: 1 })]
    expect(setLineQty(cart, 0, -3)).toHaveLength(0)
  })

  it('indeks di luar jangkauan tidak mengubah apa pun', () => {
    const cart = [makeLine({ qty: 1 })]
    expect(setLineQty(cart, 99, 5)).toHaveLength(1)
  })
})

describe('konsistensi keranjang dan total', () => {
  it('untung selalu sama dengan total dikurangi modal', () => {
    const cart = [
      makeLine({ qty: 3, unitPrice: rupiah(5500), unitCost: rupiah(4100) }),
      makeLine({ qty: 0.5, unitPrice: rupiah(37000), unitCost: rupiah(28000) }),
      makeLine({ qty: 7, unitPrice: rupiah(1500), unitCost: rupiah(1200) }),
    ]
    const totals = calculateCart(cart, rupiah(2500))
    expect(totals.profit).toBe(totals.total - totals.cost)
    expect(totals.total).toBe(totals.subtotal - totals.discount)
  })

  it('semua hasil tetap bilangan bulat', () => {
    const totals = calculateCart(
      [makeLine({ qty: 0.333, unitPrice: rupiah(9999), unitCost: rupiah(7777) })],
      ZERO,
    )
    expect(Number.isInteger(totals.subtotal)).toBe(true)
    expect(Number.isInteger(totals.cost)).toBe(true)
    expect(Number.isInteger(totals.profit)).toBe(true)
  })
})
