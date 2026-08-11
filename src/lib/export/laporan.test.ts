import { describe, expect, it } from 'vitest'
import { namaBerkas, susunLembar, type IsiEkspor } from './laporan'
import {
  KAS,
  expense,
  income,
  makeBarang,
  makeDebt,
  makeJasa,
  makeLine,
  makeSale,
  makeWallet,
} from '@/lib/domain/fixtures'
import { rupiah } from '@/lib/money'
import type { Lembar, Sel } from './xlsx'

const kosong: IsiEkspor = {
  namaUsaha: 'Warung Uji',
  items: [],
  sales: [],
  entries: [],
  wallets: [],
  debts: [],
  movements: [],
}

const ambil = (lembar: readonly Lembar[], nama: string): Lembar => {
  const l = lembar.find((x) => x.nama === nama)
  if (!l) throw new Error(`lembar "${nama}" tidak ada`)
  return l
}

const kolom = (lembar: Lembar, judul: string): number => {
  const i = (lembar.baris[0] ?? []).indexOf(judul)
  if (i < 0) throw new Error(`kolom "${judul}" tidak ada di ${lembar.nama}`)
  return i
}

const nilai = (lembar: Lembar, baris: number, judul: string): Sel =>
  lembar.baris[baris]?.[kolom(lembar, judul)] ?? null

describe('namaBerkas', () => {
  it('memakai nama usaha dan tanggalnya', () => {
    expect(namaBerkas('Warung Bu Ani', '2026-08-11')).toBe(
      'Ezura - Warung Bu Ani - 2026-08-11.xlsx',
    )
  })

  it('membuang aksara yang tidak boleh ada di nama berkas', () => {
    // Garis miring membuat sebagian peramban menyimpannya ke folder lain,
    // atau menolak unduhannya diam-diam.
    expect(namaBerkas('Toko A/B: "spesial"', '2026-08-11')).toBe(
      'Ezura - Toko AB spesial - 2026-08-11.xlsx',
    )
  })

  it('memakai nama cadangan kalau tidak ada yang tersisa', () => {
    expect(namaBerkas('///', '2026-08-11')).toBe('Ezura - Ezura - 2026-08-11.xlsx')
  })
})

describe('susunLembar', () => {
  it('selalu menyusun keenam lembar, walau datanya kosong', () => {
    // Berkas yang lembarnya berubah-ubah menurut isi membuat orang yang
    // membukanya bulan depan tidak tahu apakah lembar yang hilang itu
    // kosong atau gagal diekspor.
    expect(susunLembar(kosong).map((l) => l.nama)).toEqual([
      'Rekap bulanan',
      'Penjualan',
      'Buku kas',
      'Barang & jasa',
      'Utang & piutang',
      'Pergerakan stok',
    ])
  })

  it('memberi tiap lembar baris judul', () => {
    for (const l of susunLembar(kosong)) {
      expect(l.baris[0]?.length, `${l.nama} tanpa judul`).toBeGreaterThan(0)
    }
  })

  describe('rekap bulanan', () => {
    const lembar = () =>
      ambil(
        susunLembar({
          ...kosong,
          entries: [
            income(300_000, 'penjualan', { occurredAt: '2026-07-10T03:00:00Z' }),
            income(100_000, 'penjualan', { occurredAt: '2026-08-10T03:00:00Z' }),
            expense(40_000, 'modal', { occurredAt: '2026-08-11T03:00:00Z' }),
          ],
        }),
        'Rekap bulanan',
      )

    it('menulis satu baris per bulan dengan angka sebagai angka', () => {
      const l = lembar()
      expect(nilai(l, 1, 'Bulan')).toBe('Agustus 2026')
      expect(nilai(l, 1, 'Masuk')).toBe(100_000)
      expect(nilai(l, 1, 'Keluar')).toBe(40_000)
      expect(nilai(l, 1, 'Sisa')).toBe(60_000)
    })

    it('memisahkan baris TOTAL dengan satu baris kosong', () => {
      // Tanpa jeda, TOTAL terbaca seperti bulan berikutnya dan ikut
      // tersalin saat orang menyeleksi datanya untuk dihitung ulang.
      const l = lembar()
      const total = l.baris[l.baris.length - 1]
      const sebelum = l.baris[l.baris.length - 2]

      expect(sebelum).toEqual([])
      expect(total?.[0]).toBe('TOTAL')
      expect(total?.[1]).toBe(400_000)
      expect(total?.[3]).toBe(360_000)
    })
  })

  describe('penjualan', () => {
    const isi: IsiEkspor = {
      ...kosong,
      sales: [
        makeSale({
          invoiceNo: 'INV-2',
          occurredAt: '2026-08-11T12:30:00.000Z', // 19.30 WIB
          lines: [
            makeLine({
              itemName: 'Biskuit',
              qty: 2,
              unitPrice: rupiah(5_000),
              unitCost: rupiah(3_000),
            }),
            makeLine({
              itemKind: 'jasa',
              itemName: 'Potong celana',
              qty: 1,
              unitPrice: rupiah(30_000),
              unitCost: rupiah(0),
            }),
          ],
        }),
        makeSale({
          invoiceNo: 'INV-1',
          occurredAt: '2026-08-10T03:00:00.000Z',
          lines: [makeLine({ itemName: 'Kopi', qty: 1, unitPrice: rupiah(2_000) })],
          voidedAt: '2026-08-10T04:00:00.000Z',
        }),
      ],
    }

    it('menulis satu baris per barang, dengan nomor urut barisnya', () => {
      const l = ambil(susunLembar(isi), 'Penjualan')
      // Terlama dulu: INV-1 (dibatalkan) lalu dua baris INV-2.
      expect(l.baris.slice(1).map((r) => [r[2], r[3], r[5]])).toEqual([
        ['INV-1', 1, 'Kopi'],
        ['INV-2', 1, 'Biskuit'],
        ['INV-2', 2, 'Potong celana'],
      ])
    })

    it('menghitung subtotal dan untung kotor per baris', () => {
      const l = ambil(susunLembar(isi), 'Penjualan')
      expect(nilai(l, 2, 'Subtotal')).toBe(10_000)
      expect(nilai(l, 2, 'Untung kotor')).toBe(4_000)
      // Jasa tanpa modal: seluruh nilainya untung kotor.
      expect(nilai(l, 3, 'Untung kotor')).toBe(30_000)
    })

    it('menulis jam dalam waktu setempat, bukan UTC', () => {
      // 12.30 UTC = 19.30 WIB. Berkas ekspor yang jamnya UTC membuat
      // seluruh isinya tidak bisa dicocokkan dengan ingatan pemiliknya.
      const l = ambil(susunLembar(isi), 'Penjualan')
      expect(nilai(l, 2, 'Jam')).toBe('19.30')
      expect(nilai(l, 2, 'Tanggal')).toBe('2026-08-11')
    })

    it('menyertakan struk yang dibatalkan, dengan tandanya', () => {
      // Cadangan yang diam-diam membuang sebagian isi bukan cadangan.
      // Yang dibuang justru baris yang paling mungkin dipertanyakan.
      const l = ambil(susunLembar(isi), 'Penjualan')
      expect(nilai(l, 1, 'Status')).toBe('DIBATALKAN')
      expect(nilai(l, 2, 'Status')).toBe('')
    })
  })

  describe('barang & jasa', () => {
    const lembar = () =>
      ambil(
        susunLembar({
          ...kosong,
          items: [
            makeBarang({ name: 'Biskuit', stockQty: 0, minStock: 5 }),
            makeJasa({ name: 'Potong celana' }),
            makeBarang({ name: 'Kopi lama', archivedAt: '2026-07-01T00:00:00Z' }),
          ],
        }),
        'Barang & jasa',
      )

    it('mengosongkan kolom stok untuk jasa, bukan mengisinya nol', () => {
      // Pembeda utama produk ini, dan ia harus selamat sampai ke berkas
      // ekspornya: "potong celana" tidak pernah habis, sedangkan biskuit
      // yang tinggal nol memang habis. Keduanya tidak boleh terlihat sama.
      const l = lembar()
      expect(nilai(l, 1, 'Sisa stok')).toBe(0)
      expect(nilai(l, 2, 'Sisa stok')).toBeNull()
      expect(nilai(l, 2, 'Stok minimum')).toBeNull()
    })

    it('menyertakan yang diarsipkan, dengan tandanya', () => {
      const l = lembar()
      expect(nilai(l, 3, 'Nama')).toBe('Kopi lama')
      expect(nilai(l, 3, 'Status')).toBe('DIARSIPKAN')
    })
  })

  describe('buku kas', () => {
    const lembar = () =>
      ambil(
        susunLembar({
          ...kosong,
          wallets: [makeWallet({ id: KAS, name: 'Laci' })],
          entries: [
            income(50_000, 'penjualan', { occurredAt: '2026-08-10T03:00:00Z' }),
            expense(20_000, 'operasional', { occurredAt: '2026-08-11T03:00:00Z' }),
          ],
        }),
        'Buku kas',
      )

    it('menulis nominal selalu positif dengan arahnya di kolom sendiri', () => {
      // Nominal bertanda membuat penjumlahan satu kolom terlihat masuk
      // akal padahal mencampur pemasukan dan pengeluaran.
      const l = lembar()
      expect(nilai(l, 1, 'Arah')).toBe('Masuk')
      expect(nilai(l, 1, 'Jumlah')).toBe(50_000)
      expect(nilai(l, 2, 'Arah')).toBe('Keluar')
      expect(nilai(l, 2, 'Jumlah')).toBe(20_000)
    })

    it('menerjemahkan kategori dan menyebut nama dompetnya', () => {
      const l = lembar()
      expect(nilai(l, 1, 'Kategori')).toBe('Penjualan')
      expect(nilai(l, 1, 'Dompet')).toBe('Laci')
    })
  })

  describe('utang & piutang', () => {
    it('menghitung sisanya dan membedakan kedua arah', () => {
      const l = ambil(
        susunLembar({
          ...kosong,
          debts: [
            makeDebt({
              person: 'Bu Sri',
              amount: rupiah(25_000),
              paidAmount: rupiah(10_000),
              occurredAt: '2026-08-10T03:00:00Z',
            }),
            makeDebt({
              side: 'payable',
              person: 'Pemasok',
              amount: rupiah(80_000),
              paidAmount: rupiah(80_000),
              settledAt: '2026-08-11T03:00:00Z',
              occurredAt: '2026-08-11T03:00:00Z',
            }),
          ],
        }),
        'Utang & piutang',
      )

      expect(nilai(l, 1, 'Pihak')).toBe('Orang berutang')
      expect(nilai(l, 1, 'Sisa')).toBe(15_000)
      expect(nilai(l, 1, 'Status')).toBe('Belum lunas')
      expect(nilai(l, 2, 'Pihak')).toBe('Usaha berutang')
      expect(nilai(l, 2, 'Sisa')).toBe(0)
      expect(nilai(l, 2, 'Status')).toBe('Lunas')
    })
  })

  describe('pergerakan stok', () => {
    it('memakai nama barang, bukan pengenalnya', () => {
      // Pengenal UUID di berkas yang dibaca manusia sama saja dengan
      // tidak menuliskan apa-apa.
      const barang = makeBarang({ name: 'Biskuit' })
      const l = ambil(
        susunLembar({
          ...kosong,
          items: [barang],
          movements: [
            {
              itemId: barang.id,
              occurredAt: '2026-08-10T03:00:00Z',
              qtyChange: 20,
              reason: 'kulakan',
              note: null,
            },
          ],
        }),
        'Pergerakan stok',
      )

      expect(nilai(l, 1, 'Barang')).toBe('Biskuit')
      expect(nilai(l, 1, 'Perubahan')).toBe(20)
      expect(nilai(l, 1, 'Sebab')).toBe('Kulakan')
    })

    it('tetap menulis barisnya walau barangnya sudah tidak ada', () => {
      const l = ambil(
        susunLembar({
          ...kosong,
          movements: [
            {
              itemId: 'sudah-hilang',
              occurredAt: '2026-08-10T03:00:00Z',
              qtyChange: -1,
              reason: 'terjual',
              note: null,
            },
          ],
        }),
        'Pergerakan stok',
      )

      expect(nilai(l, 1, 'Barang')).toBe('sudah-hilang')
      expect(nilai(l, 1, 'Perubahan')).toBe(-1)
    })
  })

  it('mengurutkan menurut waktu, bukan menurut urutan penyimpanan', () => {
    // Kunci utama IndexedDB berupa UUID acak, jadi tanpa pengurutan ini
    // dua ekspor dari data yang sama tidak bisa dibandingkan sama sekali.
    const susun = (urutTerbalik: boolean) => {
      const entri = [
        income(1_000, 'penjualan', { occurredAt: '2026-08-01T03:00:00Z' }),
        income(2_000, 'penjualan', { occurredAt: '2026-08-02T03:00:00Z' }),
        income(3_000, 'penjualan', { occurredAt: '2026-08-03T03:00:00Z' }),
      ]
      return ambil(
        susunLembar({ ...kosong, entries: urutTerbalik ? [...entri].reverse() : entri }),
        'Buku kas',
      ).baris.slice(1)
    }

    expect(susun(false)).toEqual(susun(true))
    expect(susun(true).map((r) => r[3])).toEqual([1_000, 2_000, 3_000])
  })
})
