import { describe, expect, it } from 'vitest'
import { rupiah, ZERO } from '@/lib/money'
import {
  addLine,
  calculateCart,
  changeDue,
  lineCost,
  lineFromItem,
  lineSubtotal,
  outstanding,
  overStock,
  qtyInCart,
  removeLine,
  setQty,
} from './cart'
import { isBarang } from './types'
import { lineOf, makeBarang, makeJasa, makeLine } from './fixtures'

describe('jasa tidak punya stok', () => {
  // Pembeda utama aplikasi ini, dan sekarang ditegakkan tipe: `stockQty`
  // hanya ada pada barang, jadi mengaksesnya pada jasa tidak akan lolos
  // pemeriksaan tipe sama sekali.
  it('penyempit tipe memisahkan barang dari jasa', () => {
    const barang = makeBarang()
    const jasa = makeJasa()

    expect(isBarang(barang)).toBe(true)
    expect(isBarang(jasa)).toBe(false)
    if (isBarang(barang)) expect(barang.stockQty).toBe(100)
  })

  it('jasa tidak pernah muncul sebagai melebihi stok, berapa pun jumlahnya', () => {
    const jasa = makeJasa()
    const cart = [lineOf(jasa, 999)]
    expect(overStock(cart, [jasa])).toHaveLength(0)
  })
})

describe('perhitungan baris', () => {
  it('mengalikan harga dengan jumlah', () => {
    const line = makeLine({ qty: 3, unitPrice: rupiah(5_000), unitCost: rupiah(3_500) })
    expect(lineSubtotal(line)).toBe(15_000)
    expect(lineCost(line)).toBe(10_500)
  })

  it('menangani jumlah pecahan untuk barang timbang', () => {
    const line = makeLine({ qty: 0.25, unitPrice: rupiah(40_000), unitCost: rupiah(30_000) })
    expect(lineSubtotal(line)).toBe(10_000)
    expect(lineCost(line)).toBe(7_500)
  })
})

describe('total keranjang', () => {
  it('menjumlah barang dan jasa dalam satu struk', () => {
    const totals = calculateCart([
      lineOf(makeBarang(), 3),
      lineOf(makeJasa(), 1),
    ])

    expect(totals.subtotal).toBe(45_000)
    expect(totals.cost).toBe(10_500)
    expect(totals.profit).toBe(34_500)
    expect(totals.lineCount).toBe(2)
    expect(totals.itemCount).toBe(4)
  })

  it('keranjang kosong menghasilkan nol, bukan NaN', () => {
    const totals = calculateCart([])
    expect(totals.subtotal).toBe(0)
    expect(totals.total).toBe(0)
    expect(totals.profit).toBe(0)
  })

  it('mengurangi diskon', () => {
    const totals = calculateCart([lineOf(makeBarang(), 4)], rupiah(2_000))
    expect(totals.subtotal).toBe(20_000)
    expect(totals.discount).toBe(2_000)
    expect(totals.total).toBe(18_000)
  })

  it('diskon berlebih dibatasi di subtotal — total tidak negatif', () => {
    const totals = calculateCart([lineOf(makeBarang(), 1)], rupiah(999_999))
    expect(totals.discount).toBe(5_000)
    expect(totals.total).toBe(0)
    expect(totals.profit).toBe(-3_500)
  })

  it('diskon negatif diperlakukan nol', () => {
    const totals = calculateCart([lineOf(makeBarang(), 1)], rupiah(-1_000))
    expect(totals.discount).toBe(0)
    expect(totals.total).toBe(5_000)
  })

  it('untung negatif kalau dijual di bawah modal', () => {
    const totals = calculateCart([
      makeLine({ qty: 1, unitPrice: rupiah(3_000), unitCost: rupiah(3_500) }),
    ])
    expect(totals.profit).toBe(-500)
  })

  it('untung selalu total dikurangi modal, apa pun isinya', () => {
    const totals = calculateCart(
      [
        makeLine({ qty: 3, unitPrice: rupiah(5_500), unitCost: rupiah(4_100) }),
        makeLine({ qty: 0.5, unitPrice: rupiah(37_000), unitCost: rupiah(28_000) }),
        makeLine({ qty: 7, unitPrice: rupiah(1_500), unitCost: rupiah(1_200) }),
      ],
      rupiah(2_500),
    )
    expect(totals.profit).toBe(totals.total - totals.cost)
    expect(totals.total).toBe(totals.subtotal - totals.discount)
    expect(Number.isInteger(totals.profit)).toBe(true)
  })
})

describe('pembayaran', () => {
  it('menghitung kembalian', () => {
    expect(changeDue(rupiah(45_000), rupiah(50_000))).toBe(5_000)
    expect(changeDue(rupiah(45_000), rupiah(45_000))).toBe(0)
  })

  it('uang kurang bukan kembalian negatif', () => {
    expect(changeDue(rupiah(45_000), rupiah(20_000))).toBe(0)
  })

  it('sisa tagihan nol kalau uangnya lebih', () => {
    expect(outstanding(rupiah(45_000), rupiah(50_000))).toBe(0)
    expect(outstanding(rupiah(45_000), rupiah(20_000))).toBe(25_000)
  })
})

describe('menyusun keranjang', () => {
  it('mengetuk barang yang sama tiga kali jadi satu baris berisi tiga', () => {
    const barang = makeBarang()
    let cart = addLine([], lineFromItem(barang))
    cart = addLine(cart, lineFromItem(barang))
    cart = addLine(cart, lineFromItem(barang))

    expect(cart).toHaveLength(1)
    expect(cart[0]?.qty).toBe(3)
  })

  it('harga berbeda jadi baris berbeda', () => {
    const base = makeLine({ itemId: 'p1', unitPrice: rupiah(5_000) })
    const cart = addLine(addLine([], base), { ...base, unitPrice: rupiah(4_500) })
    expect(cart).toHaveLength(2)
  })

  it('barang di luar katalog tidak pernah digabung', () => {
    const bebas = makeLine({ itemId: null, itemName: 'Titipan' })
    const cart = addLine(addLine([], bebas), { ...bebas })
    expect(cart).toHaveLength(2)
  })

  it('tidak mengubah larik asal', () => {
    const original = [makeLine({ itemId: 'p1' })]
    addLine(original, makeLine({ itemId: 'p2' }))
    expect(original).toHaveLength(1)
  })

  it('mengubah jumlah, dan nol menghapus barisnya', () => {
    const cart = [makeLine({ qty: 1 }), makeLine({ qty: 2 })]
    expect(setQty(cart, 0, 5)[0]?.qty).toBe(5)
    expect(setQty(cart, 0, 0)).toHaveLength(1)
    expect(setQty(cart, 0, -3)).toHaveLength(0 + 1)
  })

  it('indeks di luar jangkauan tidak mengubah apa pun', () => {
    const cart = [makeLine({ qty: 1 })]
    expect(setQty(cart, 99, 5)).toHaveLength(1)
    expect(removeLine(cart, 99)).toHaveLength(1)
  })

  it('menghitung jumlah sebuah barang di keranjang', () => {
    const barang = makeBarang()
    const cart = [lineOf(barang, 2), makeLine({ itemId: 'lain', qty: 5 })]
    expect(qtyInCart(cart, barang.id)).toBe(2)
    expect(qtyInCart(cart, 'entah')).toBe(0)
  })
})

describe('peringatan stok', () => {
  // Peringatan, bukan larangan: stok di aplikasi sering tertinggal dari
  // kenyataan, dan menolak penjualan karena angka stok akan membuat kasir
  // berhenti dipakai tepat saat ada pembeli menunggu.
  it('menandai barang yang melebihi stok', () => {
    const barang = makeBarang({ stockQty: 2 })
    const hasil = overStock([lineOf(barang, 5)], [barang])

    expect(hasil).toHaveLength(1)
    expect(hasil[0]?.wanted).toBe(5)
    expect(hasil[0]?.available).toBe(2)
  })

  it('tidak menandai yang masih cukup', () => {
    const barang = makeBarang({ stockQty: 10 })
    expect(overStock([lineOf(barang, 5)], [barang])).toHaveLength(0)
  })

  it('menjumlah beberapa baris barang yang sama', () => {
    const barang = makeBarang({ stockQty: 3 })
    const cart = [lineOf(barang, 2), { ...lineOf(barang, 2), unitPrice: rupiah(4_000) }]
    expect(overStock(cart, [barang])).toHaveLength(1)
  })

  it('melewati barang di luar katalog', () => {
    expect(overStock([makeLine({ itemId: null })], [])).toHaveLength(0)
  })

  it('tidak melapor dua kali untuk barang yang sama', () => {
    const barang = makeBarang({ stockQty: 1 })
    const cart = [lineOf(barang, 2), lineOf(barang, 2)]
    expect(overStock(cart, [barang])).toHaveLength(1)
  })
})

describe('lineFromItem', () => {
  it('menyalin nama dan harga, tidak merujuknya', () => {
    // Mengubah harga di katalog bulan depan tidak boleh mengubah struk
    // yang sudah tercetak.
    const barang = makeBarang({ name: 'Oreo', price: rupiah(12_000) })
    const line = lineFromItem(barang, 2)

    expect(line.itemName).toBe('Oreo')
    expect(line.unitPrice).toBe(12_000)
    expect(line.itemKind).toBe('barang')
    expect(line.qty).toBe(2)
  })

  it('jasa jadi baris berjenis jasa', () => {
    expect(lineFromItem(makeJasa()).itemKind).toBe('jasa')
  })
})

describe('konsistensi', () => {
  it('semua hasil tetap bilangan bulat', () => {
    const totals = calculateCart(
      [makeLine({ qty: 0.333, unitPrice: rupiah(9_999), unitCost: rupiah(7_777) })],
      ZERO,
    )
    expect(Number.isInteger(totals.subtotal)).toBe(true)
    expect(Number.isInteger(totals.cost)).toBe(true)
    expect(Number.isInteger(totals.profit)).toBe(true)
  })
})
