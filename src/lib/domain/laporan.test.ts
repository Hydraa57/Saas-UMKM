import { describe, expect, it } from 'vitest'
import {
  barangTerlaris,
  formatJam,
  jamTerramai,
  marjinPersen,
  monthsWithSales,
  piutangDariPenjualan,
  ringkasPenjualan,
  salesInMonth,
  sebaranJam,
} from './laporan'
import { makeDebt, makeLine, makeSale } from './fixtures'
import { rupiah } from '@/lib/money'

const baris = (
  itemId: string | null,
  itemName: string,
  qty: number,
  harga: number,
  modal = 0,
) =>
  makeLine({
    itemId,
    itemName,
    qty,
    unitPrice: rupiah(harga),
    unitCost: rupiah(modal),
  })

describe('ringkasPenjualan', () => {
  it('menghitung omzet, modal, dan laba dari isi struk', () => {
    const ringkas = ringkasPenjualan([
      makeSale({ lines: [baris('a', 'Biskuit', 2, 5_000, 3_500)] }),
      makeSale({ lines: [baris('b', 'Kopi', 3, 4_000, 2_500)] }),
    ])

    expect(ringkas.omzet).toBe(22_000)
    expect(ringkas.modal).toBe(14_500)
    expect(ringkas.laba).toBe(7_500)
    expect(ringkas.strukCount).toBe(2)
    expect(ringkas.qtyCount).toBe(5)
  })

  it('memakai harga modal saat transaksi, bukan harga katalog sekarang', () => {
    // Dua struk barang yang sama dengan harga kulakan berbeda. Kalau
    // laba dihitung dari katalog, salah satunya pasti keliru — dan yang
    // keliru itu justru laporan bulan lalu, yang seharusnya sudah beku.
    const ringkas = ringkasPenjualan([
      makeSale({ lines: [baris('a', 'Gula', 1, 15_000, 12_000)] }),
      makeSale({ lines: [baris('a', 'Gula', 1, 15_000, 13_500)] }),
    ])

    expect(ringkas.modal).toBe(25_500)
    expect(ringkas.laba).toBe(4_500)
  })

  it('tidak menghitung struk yang dibatalkan', () => {
    const ringkas = ringkasPenjualan([
      makeSale({ lines: [baris('a', 'Biskuit', 2, 5_000, 3_500)] }),
      makeSale({
        lines: [baris('a', 'Biskuit', 10, 5_000, 3_500)],
        voidedAt: '2026-08-06T04:00:00.000Z',
      }),
    ])

    expect(ringkas.omzet).toBe(10_000)
    expect(ringkas.qtyCount).toBe(2)
    expect(ringkas.strukCount).toBe(1)
  })

  it('mengurangi potongan dari omzet tapi tidak dari modal', () => {
    // Potongan mengurangi uang yang diterima; barangnya tetap keluar
    // dengan modal yang sama. Kalau modalnya ikut dikurangi, potongan
    // jadi terlihat tidak berbiaya.
    const ringkas = ringkasPenjualan([
      makeSale({
        lines: [baris('a', 'Biskuit', 4, 5_000, 3_500)],
        discount: rupiah(2_000),
      }),
    ])

    expect(ringkas.omzet).toBe(18_000)
    expect(ringkas.modal).toBe(14_000)
    expect(ringkas.laba).toBe(4_000)
  })

  it('membiarkan laba negatif kalau memang jual rugi', () => {
    const ringkas = ringkasPenjualan([
      makeSale({ lines: [baris('a', 'Telur', 1, 20_000, 26_000)] }),
    ])

    expect(ringkas.laba).toBe(-6_000)
  })
})

describe('barangTerlaris', () => {
  it('mengurutkan menurut jumlah potong yang laku', () => {
    const terlaris = barangTerlaris([
      makeSale({
        lines: [baris('a', 'Biskuit', 2, 5_000), baris('b', 'Kopi', 7, 1_000)],
      }),
      makeSale({ lines: [baris('a', 'Biskuit', 3, 5_000)] }),
    ])

    expect(terlaris.map((row) => [row.itemName, row.qty])).toEqual([
      ['Kopi', 7],
      ['Biskuit', 5],
    ])
  })

  it('tetap menampilkan omzet, supaya yang laris tapi tipis tidak menyamar', () => {
    // Kopi menang jumlah, Biskuit menang uang. Daftar yang cuma
    // menampilkan jumlah akan menyarankan kulakan yang salah.
    const terlaris = barangTerlaris([
      makeSale({
        lines: [
          baris('a', 'Biskuit', 2, 25_000, 20_000),
          baris('b', 'Kopi', 7, 1_000, 900),
        ],
      }),
    ])

    expect(terlaris[0]?.itemName).toBe('Kopi')
    expect(terlaris[0]?.omzet).toBe(7_000)
    expect(terlaris[0]?.laba).toBe(700)
    expect(terlaris[1]?.omzet).toBe(50_000)
    expect(terlaris[1]?.laba).toBe(10_000)
  })

  it('menyatukan barang yang pernah diganti namanya lewat id', () => {
    // Nama di struk adalah salinan saat transaksi. Kalau nama yang jadi
    // kunci, satu barang muncul dua kali dan bersaing dengan dirinya
    // sendiri.
    const terlaris = barangTerlaris([
      makeSale({
        lines: [baris('a', 'Roma', 2, 5_000)],
        occurredAt: '2026-08-01T03:00:00.000Z',
      }),
      makeSale({
        lines: [baris('a', 'Biskuit Roma', 3, 5_000)],
        occurredAt: '2026-08-10T03:00:00.000Z',
      }),
    ])

    expect(terlaris).toHaveLength(1)
    expect(terlaris[0]?.qty).toBe(5)
    // Nama terbaru, karena itu yang dikenali sekarang.
    expect(terlaris[0]?.itemName).toBe('Biskuit Roma')
  })

  it('mengelompokkan barang di luar katalog menurut namanya', () => {
    const terlaris = barangTerlaris([
      makeSale({ lines: [baris(null, 'Es batu', 2, 1_000)] }),
      makeSale({ lines: [baris(null, 'Es batu', 3, 1_000)] }),
    ])

    expect(terlaris).toHaveLength(1)
    expect(terlaris[0]?.itemId).toBeNull()
    expect(terlaris[0]?.qty).toBe(5)
  })

  it('membagi potongan struk ke tiap baris sebanding nilainya', () => {
    // Subtotal 30.000 (Biskuit 10.000 + Jasa 20.000), potongan 3.000.
    // Bagiannya 1.000 dan 2.000, dan jumlahnya harus persis omzet
    // ringkasan — dua angka di layar yang sama tidak boleh berbeda.
    const sale = makeSale({
      lines: [baris('a', 'Biskuit', 2, 5_000), baris('b', 'Jahit', 1, 20_000)],
      discount: rupiah(3_000),
    })

    const terlaris = barangTerlaris([sale])
    const jumlah = terlaris.reduce((total, row) => total + row.omzet, 0)

    expect(terlaris.find((r) => r.itemName === 'Biskuit')?.omzet).toBe(9_000)
    expect(terlaris.find((r) => r.itemName === 'Jahit')?.omzet).toBe(18_000)
    expect(jumlah).toBe(ringkasPenjualan([sale]).omzet)
  })

  it('membagi habis potongan yang tidak habis dibagi', () => {
    // 3 baris sama besar, potongan 1.000 → 333,33 per baris. Sisanya
    // tidak boleh menguap: jumlah bagian harus tetap tepat 1.000.
    const sale = makeSale({
      lines: [
        baris('a', 'A', 1, 10_000),
        baris('b', 'B', 1, 10_000),
        baris('c', 'C', 1, 10_000),
      ],
      discount: rupiah(1_000),
    })

    const terlaris = barangTerlaris([sale])
    const jumlah = terlaris.reduce((total, row) => total + row.omzet, 0)

    expect(jumlah).toBe(29_000)
    expect(jumlah).toBe(ringkasPenjualan([sale]).omzet)
  })

  it('membatasi jumlah baris kalau diminta', () => {
    const terlaris = barangTerlaris(
      [
        makeSale({
          lines: [
            baris('a', 'A', 9, 1_000),
            baris('b', 'B', 5, 1_000),
            baris('c', 'C', 1, 1_000),
          ],
        }),
      ],
      2,
    )

    expect(terlaris.map((row) => row.itemName)).toEqual(['A', 'B'])
  })

  it('tidak menghitung struk yang dibatalkan', () => {
    const terlaris = barangTerlaris([
      makeSale({
        lines: [baris('a', 'Biskuit', 99, 5_000)],
        voidedAt: '2026-08-06T04:00:00.000Z',
      }),
      makeSale({ lines: [baris('b', 'Kopi', 1, 1_000)] }),
    ])

    expect(terlaris.map((row) => row.itemName)).toEqual(['Kopi'])
  })

  it('mengurutkan seri secara tetap, bukan menurut urutan masukan', () => {
    const lines = [baris('a', 'Zaitun', 2, 5_000), baris('b', 'Apel', 2, 5_000)]
    const maju = barangTerlaris([makeSale({ lines })])
    const mundur = barangTerlaris([makeSale({ lines: [...lines].reverse() })])

    expect(maju.map((r) => r.itemName)).toEqual(['Apel', 'Zaitun'])
    expect(mundur.map((r) => r.itemName)).toEqual(maju.map((r) => r.itemName))
  })
})

describe('sebaranJam', () => {
  it('memakai jam zona waktu usaha, bukan UTC', () => {
    // 12.00 UTC = 19.00 WIB. Jawaban "paling ramai jam 12" tidak berguna
    // bagi siapa pun yang berjualan di Indonesia.
    const jam = sebaranJam([
      makeSale({ occurredAt: '2026-08-06T12:00:00.000Z', lines: [] }),
    ])

    expect(jam.map((row) => row.jam)).toEqual([19])
  })

  it('membaca tengah malam sebagai jam 0, bukan 24', () => {
    // 17.00 UTC = 00.00 WIB keesokan harinya.
    const jam = sebaranJam([
      makeSale({ occurredAt: '2026-08-06T17:00:00.000Z', lines: [] }),
    ])

    expect(jam[0]?.jam).toBe(0)
  })

  it('hanya menampilkan jam yang ada isinya, urut dari pagi', () => {
    const jam = sebaranJam([
      makeSale({
        occurredAt: '2026-08-06T10:00:00.000Z', // 17.00 WIB
        lines: [baris('a', 'A', 1, 5_000)],
      }),
      makeSale({
        occurredAt: '2026-08-06T01:00:00.000Z', // 08.00 WIB
        lines: [baris('a', 'A', 1, 5_000)],
      }),
      makeSale({
        occurredAt: '2026-08-06T01:30:00.000Z', // 08.30 WIB
        lines: [baris('a', 'A', 1, 5_000)],
      }),
    ])

    expect(jam.map((row) => [row.jam, row.strukCount])).toEqual([
      [8, 2],
      [17, 1],
    ])
    expect(jam[0]?.omzet).toBe(10_000)
  })

  it('menemukan jam paling ramai', () => {
    const jam = sebaranJam([
      makeSale({ occurredAt: '2026-08-06T01:00:00.000Z', lines: [] }),
      makeSale({ occurredAt: '2026-08-06T10:00:00.000Z', lines: [] }),
      makeSale({ occurredAt: '2026-08-06T10:30:00.000Z', lines: [] }),
    ])

    expect(jamTerramai(jam)?.jam).toBe(17)
    expect(jamTerramai([])).toBeNull()
  })
})

describe('penyaringan bulan', () => {
  const sales = [
    makeSale({ occurredAt: '2026-07-31T17:30:00.000Z' }), // 1 Agt 00.30 WIB
    makeSale({ occurredAt: '2026-08-15T03:00:00.000Z' }),
    makeSale({ occurredAt: '2026-06-15T03:00:00.000Z' }),
    makeSale({
      occurredAt: '2026-08-20T03:00:00.000Z',
      voidedAt: '2026-08-20T04:00:00.000Z',
    }),
  ]

  it('memasukkan struk lewat tengah malam ke bulan yang benar', () => {
    expect(salesInMonth(sales, '2026-08')).toHaveLength(2)
    expect(salesInMonth(sales, '2026-07')).toHaveLength(0)
  })

  it('menyebut bulan yang punya penjualan, terbaru dulu', () => {
    expect(monthsWithSales(sales)).toEqual(['2026-08', '2026-06'])
  })
})

describe('piutangDariPenjualan', () => {
  it('menjumlahkan sisa tagihan dari struk bulan itu', () => {
    const struk = makeSale({ lines: [baris('a', 'Jahit', 1, 25_000)] })

    expect(
      piutangDariPenjualan(
        [makeDebt({ saleId: struk.id, amount: rupiah(25_000) })],
        [struk],
      ),
    ).toBe(25_000)
  })

  it('tidak lagi menagih struk yang utangnya sudah dilunasi', () => {
    // Inti kesalahan yang pernah terjadi: `paid` di struk adalah uang
    // yang berpindah di meja kasir saat itu dan tidak pernah berubah
    // lagi. Pelunasan seminggu kemudian tercatat di daftar utang, bukan
    // di struknya — jadi menghitung dari `total − paid` akan terus
    // menagih orang yang sudah membayar.
    const struk = makeSale({
      lines: [baris('a', 'Jahit', 1, 25_000)],
      paid: rupiah(0),
    })

    expect(
      piutangDariPenjualan(
        [
          makeDebt({
            saleId: struk.id,
            amount: rupiah(25_000),
            paidAmount: rupiah(25_000),
            settledAt: '2026-08-09T03:00:00.000Z',
          }),
        ],
        [struk],
      ),
    ).toBe(0)
  })

  it('menghitung pelunasan sebagian', () => {
    const struk = makeSale({ lines: [baris('a', 'Jahit', 1, 25_000)] })

    expect(
      piutangDariPenjualan(
        [
          makeDebt({
            saleId: struk.id,
            amount: rupiah(25_000),
            paidAmount: rupiah(10_000),
          }),
        ],
        [struk],
      ),
    ).toBe(15_000)
  })

  it('mengabaikan utang dari struk bulan lain dan utang ke pemasok', () => {
    const struk = makeSale({ lines: [baris('a', 'Jahit', 1, 25_000)] })

    expect(
      piutangDariPenjualan(
        [
          makeDebt({ saleId: 'struk-bulan-lain', amount: rupiah(90_000) }),
          // Utang usaha ke pemasok bukan omzet yang belum dibayar.
          makeDebt({ side: 'payable', saleId: struk.id, amount: rupiah(70_000) }),
          // Catatan utang lepas, tanpa struk.
          makeDebt({ saleId: null, amount: rupiah(50_000) }),
        ],
        [struk],
      ),
    ).toBe(0)
  })

  it('mengabaikan tagihan dari struk yang sudah dibatalkan', () => {
    const struk = makeSale({
      lines: [baris('a', 'Jahit', 1, 25_000)],
      voidedAt: '2026-08-07T03:00:00.000Z',
    })

    expect(
      piutangDariPenjualan([makeDebt({ saleId: struk.id })], [struk]),
    ).toBe(0)
  })
})

describe('marjinPersen', () => {
  it('menghitung persentase laba terhadap omzet', () => {
    const ringkas = ringkasPenjualan([
      makeSale({ lines: [baris('a', 'A', 1, 10_000, 7_500)] }),
    ])

    expect(marjinPersen(ringkas)).toBe(25)
  })

  it('mengembalikan null saat belum ada penjualan', () => {
    // Bukan 0%. Bulan tanpa jualan bukan bulan tanpa untung.
    expect(marjinPersen(ringkasPenjualan([]))).toBeNull()
  })
})

describe('formatJam', () => {
  it('menulis jam seperti orang Indonesia menulisnya', () => {
    expect(formatJam(8)).toBe('08.00')
    expect(formatJam(19)).toBe('19.00')
    expect(formatJam(0)).toBe('00.00')
  })
})
