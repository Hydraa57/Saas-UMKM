import { describe, expect, it } from 'vitest'
import {
  perluDitindak,
  saranKulakan,
  selisihHitung,
  statusStok,
  stokDariMutasi,
  urutkanUntukDitindak,
} from './stock'
import { makeBarang } from './fixtures'
import type { StockMovement } from './types'

describe('status stok', () => {
  it('aman selama masih di atas ambang', () => {
    expect(statusStok(makeBarang({ stockQty: 100, minStock: 10 }))).toBe('aman')
    expect(statusStok(makeBarang({ stockQty: 11, minStock: 10 }))).toBe('aman')
  })

  it('menipis tepat saat menyentuh ambang, bukan setelah lewat', () => {
    // Kalau baru diperingatkan setelah lewat ambang, ambangnya kehilangan
    // artinya: yang diminta pemiliknya adalah "ingatkan saat tinggal 10".
    expect(statusStok(makeBarang({ stockQty: 10, minStock: 10 }))).toBe('menipis')
  })

  it('nol dan minus dua-duanya habis', () => {
    expect(statusStok(makeBarang({ stockQty: 0, minStock: 10 }))).toBe('habis')
    // Stok boleh minus: kasir memperingatkan, tidak melarang. Yang perlu
    // dilakukan pemiliknya sama saja dengan nol.
    expect(statusStok(makeBarang({ stockQty: -3, minStock: 10 }))).toBe('habis')
  })

  it('ambang nol berarti tidak minta diingatkan', () => {
    expect(statusStok(makeBarang({ stockQty: 1, minStock: 0 }))).toBe('aman')
    // Tapi habis tetap habis, ambang atau tidak.
    expect(statusStok(makeBarang({ stockQty: 0, minStock: 0 }))).toBe('habis')
  })

  it('perluDitindak menyatukan habis dan menipis', () => {
    expect(perluDitindak(makeBarang({ stockQty: 0, minStock: 0 }))).toBe(true)
    expect(perluDitindak(makeBarang({ stockQty: 5, minStock: 5 }))).toBe(true)
    expect(perluDitindak(makeBarang({ stockQty: 50, minStock: 5 }))).toBe(false)
  })
})

describe('urutan layar stok', () => {
  it('habis dulu, lalu menipis, lalu sisanya', () => {
    const aman = makeBarang({ name: 'Aman', stockQty: 100, minStock: 5 })
    const habis = makeBarang({ name: 'Habis', stockQty: 0, minStock: 5 })
    const menipis = makeBarang({ name: 'Menipis', stockQty: 3, minStock: 5 })

    expect(
      urutkanUntukDitindak([aman, menipis, habis]).map((i) => i.name),
    ).toEqual(['Habis', 'Menipis', 'Aman'])
  })

  it('di dalam kelompok yang sama urutannya abjad, bukan jumlah', () => {
    // Kalau diurutkan menurut jumlah, letak barang berpindah tiap kali
    // stoknya bergerak sedikit — dan yang dicari jadi tidak pernah ada di
    // tempat yang sama dua kali.
    const a = makeBarang({ name: 'Ale', stockQty: 1, minStock: 10 })
    const b = makeBarang({ name: 'Biskuit', stockQty: 9, minStock: 10 })
    const c = makeBarang({ name: 'Cokelat', stockQty: 5, minStock: 10 })

    expect(urutkanUntukDitindak([c, b, a]).map((i) => i.name)).toEqual([
      'Ale',
      'Biskuit',
      'Cokelat',
    ])
  })

  it('tidak mengubah larik aslinya', () => {
    const asli = [
      makeBarang({ name: 'Aman', stockQty: 100, minStock: 5 }),
      makeBarang({ name: 'Habis', stockQty: 0, minStock: 5 }),
    ]
    urutkanUntukDitindak(asli)
    expect(asli.map((i) => i.name)).toEqual(['Aman', 'Habis'])
  })

  it('daftar kosong aman', () => {
    expect(urutkanUntukDitindak([])).toEqual([])
  })
})

describe('saran kulakan', () => {
  it('mengusulkan selisih sampai ambang', () => {
    expect(saranKulakan(makeBarang({ stockQty: 3, minStock: 10 }))).toBe(7)
    expect(saranKulakan(makeBarang({ stockQty: 0, minStock: 10 }))).toBe(10)
  })

  it('stok minus tidak membuat usulannya melebihi ambang', () => {
    expect(saranKulakan(makeBarang({ stockQty: -5, minStock: 10 }))).toBe(15)
  })

  it('tidak mengusulkan apa pun untuk yang masih aman', () => {
    expect(saranKulakan(makeBarang({ stockQty: 50, minStock: 10 }))).toBe(0)
  })

  it('tanpa ambang tidak mengarang angka', () => {
    // Angka yang dikarang di layar kulakan akan ikut terbeli.
    expect(saranKulakan(makeBarang({ stockQty: 0, minStock: 0 }))).toBe(0)
  })
})

describe('hitung fisik', () => {
  it('positif berarti barangnya lebih banyak dari catatan', () => {
    expect(selisihHitung(makeBarang({ stockQty: 10 }), 12)).toBe(2)
  })

  it('negatif berarti ada yang keluar tanpa tercatat', () => {
    expect(selisihHitung(makeBarang({ stockQty: 10 }), 7)).toBe(-3)
  })

  it('cocok berarti nol', () => {
    expect(selisihHitung(makeBarang({ stockQty: 10 }), 10)).toBe(0)
  })
})

describe('menyusun ulang stok dari mutasi', () => {
  const mutasi = (qtyChange: number, reason: StockMovement['reason']): StockMovement => ({
    id: `m-${qtyChange}-${reason}`,
    itemId: 'item-1',
    occurredAt: '2026-08-06T03:00:00.000Z',
    qtyChange,
    reason,
    note: null,
  })

  it('menjumlah seluruh pergerakan', () => {
    // Kulakan 100, terjual 3, terjual 2, rusak 1 → 94.
    expect(
      stokDariMutasi([
        mutasi(100, 'kulakan'),
        mutasi(-3, 'penjualan'),
        mutasi(-2, 'penjualan'),
        mutasi(-1, 'rusak'),
      ]),
    ).toBe(94)
  })

  it('koreksi ikut dihitung sebagai selisihnya, bukan angka akhirnya', () => {
    // Inilah sebabnya `adjust_stock` menyimpan selisih dan bukan hasil
    // hitung fisik: kalau yang disimpan angka akhirnya, penjumlahan ini
    // tidak akan pernah cocok lagi.
    expect(stokDariMutasi([mutasi(100, 'kulakan'), mutasi(-6, 'koreksi')])).toBe(94)
  })

  it('tanpa mutasi berarti nol, bukan NaN', () => {
    expect(stokDariMutasi([])).toBe(0)
  })
})
