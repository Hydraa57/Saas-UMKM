import { describe, expect, it } from 'vitest'
import { rupiah } from '@/lib/money'
import {
  countsAsFlow,
  isLive,
  pairTransfer,
  reconcile,
  signedAmount,
  summarizeFlow,
  totalBalance,
  walletBalance,
} from './cash'
import { KAS, REKENING, expense, income, makeWallet, transfer } from './fixtures'

describe('penyaringan entri', () => {
  it('entri yang dibatalkan tidak ikut dihitung', () => {
    expect(isLive(income(30_000))).toBe(true)
    expect(
      isLive(income(30_000, 'penjualan', { deletedAt: '2026-08-06T05:00:00Z' })),
    ).toBe(false)
  })

  it('pemindahan tidak ikut laporan penghasilan/biaya', () => {
    const [out, into] = transfer(50_000, KAS, REKENING)
    expect(countsAsFlow(out)).toBe(false)
    expect(countsAsFlow(into)).toBe(false)
    expect(countsAsFlow(income(30_000))).toBe(true)
  })

  it('memberi tanda sesuai arah', () => {
    expect(signedAmount(income(30_000))).toBe(30_000)
    expect(signedAmount(expense(42_000))).toBe(-42_000)
  })
})

describe('ringkasan arus', () => {
  it('memisahkan pemasukan dan pengeluaran', () => {
    const summary = summarizeFlow([
      income(30_000, 'jasa'),
      income(5_000, 'penjualan'),
      expense(42_000, 'operasional'),
    ])

    expect(summary.income).toBe(35_000)
    expect(summary.expense).toBe(42_000)
    expect(summary.net).toBe(-7_000)
    expect(summary.entryCount).toBe(3)
  })

  it('merinci per kategori', () => {
    // Beda penjualan barang dan pemasukan jasa harus tetap terbaca:
    // itu yang menjawab "sebenarnya yang menghidupi usaha ini apa".
    const summary = summarizeFlow([
      income(30_000, 'jasa'),
      income(35_000, 'jasa'),
      income(5_000, 'penjualan'),
    ])

    expect(summary.byCategory.get('jasa')).toBe(65_000)
    expect(summary.byCategory.get('penjualan')).toBe(5_000)
    expect(summary.byCategory.get('operasional')).toBeUndefined()
  })

  it('daftar kosong menghasilkan nol, bukan NaN', () => {
    const summary = summarizeFlow([])
    expect(summary.income).toBe(0)
    expect(summary.net).toBe(0)
  })

  it('melewati entri yang dibatalkan', () => {
    const summary = summarizeFlow([
      income(30_000),
      income(99_000, 'penjualan', { deletedAt: '2026-08-06T05:00:00Z' }),
    ])
    expect(summary.income).toBe(30_000)
  })

  it('pemindahan tidak menambah pemasukan maupun pengeluaran', () => {
    const [out, into] = transfer(50_000, KAS, REKENING)
    const summary = summarizeFlow([income(30_000), out, into])

    expect(summary.income).toBe(30_000)
    expect(summary.expense).toBe(0)
    expect(summary.entryCount).toBe(1)
  })

  it('kulakan mengurangi sisa bulan ini, bukan cuma menambah stok', () => {
    // Kulakan menulis satu entri kas berkategori `modal`. Kalau ia hanya
    // menambah stok tanpa mengurangi kas, "sisa" di beranda akan selalu
    // terlihat lebih besar daripada isi laci — dan angka yang selalu
    // terlalu bagus lebih cepat ditinggalkan daripada tidak ada angka.
    const summary = summarizeFlow([
      income(85_000, 'penjualan'),
      expense(60_000, 'modal'),
    ])
    expect(summary.net).toBe(25_000)
  })
})

describe('saldo dompet', () => {
  it('saldo awal ditambah seluruh mutasi', () => {
    const wallet = makeWallet({ openingBalance: rupiah(100_000) })
    expect(walletBalance(wallet, [income(30_000), income(35_000)])).toBe(165_000)
  })

  it('pemindahan menggerakkan saldo — uangnya memang berpindah', () => {
    const [out, into] = transfer(50_000, KAS, REKENING)
    const entries = [income(65_000), out, into]

    expect(walletBalance(makeWallet(), entries)).toBe(15_000)
    expect(
      walletBalance(makeWallet({ id: REKENING, isDefault: false }), entries),
    ).toBe(50_000)
  })

  it('mengabaikan entri dompet lain', () => {
    const entries = [
      income(30_000, 'penjualan', { walletId: KAS }),
      income(5_000, 'penjualan', { walletId: REKENING }),
    ]
    expect(walletBalance(makeWallet(), entries)).toBe(30_000)
  })

  it('mengabaikan entri yang dibatalkan', () => {
    const entries = [
      income(30_000),
      income(99_000, 'penjualan', { deletedAt: '2026-08-06T05:00:00Z' }),
    ]
    expect(walletBalance(makeWallet(), entries)).toBe(30_000)
  })

  it('boleh negatif — dompet bisa minus kalau ada yang belum tercatat', () => {
    expect(walletBalance(makeWallet(), [expense(50_000, 'modal')])).toBe(-50_000)
  })
})

describe('total seluruh dompet', () => {
  it('menjumlah semua tempat uang', () => {
    const wallets = [
      makeWallet(),
      makeWallet({ id: REKENING, name: 'Rekening', kind: 'bank', isDefault: false }),
    ]
    const entries = [
      income(30_000, 'penjualan', { walletId: KAS }),
      income(5_000, 'penjualan', { walletId: REKENING }),
    ]
    expect(totalBalance(wallets, entries)).toBe(35_000)
  })

  it('pemindahan antar dompet tidak mengubah totalnya', () => {
    const wallets = [makeWallet(), makeWallet({ id: REKENING, isDefault: false })]
    const [out, into] = transfer(50_000, KAS, REKENING)

    expect(totalBalance(wallets, [income(80_000)])).toBe(80_000)
    expect(totalBalance(wallets, [income(80_000), out, into])).toBe(80_000)
  })

  it('melewati dompet yang diarsipkan', () => {
    const wallets = [
      makeWallet(),
      makeWallet({
        id: REKENING,
        isDefault: false,
        archivedAt: '2026-07-01T00:00:00Z',
      }),
    ]
    const entries = [
      income(30_000, 'penjualan', { walletId: KAS }),
      income(5_000, 'penjualan', { walletId: REKENING }),
    ]
    expect(totalBalance(wallets, entries)).toBe(30_000)
  })
})

describe('cocokkan dompet', () => {
  it('cocok kalau sama persis', () => {
    const result = reconcile(rupiah(165_000), rupiah(165_000))
    expect(result.matches).toBe(true)
    expect(result.difference).toBe(0)
  })

  it('selisih positif berarti isi dompet lebih banyak dari catatan', () => {
    expect(reconcile(rupiah(170_000), rupiah(165_000)).difference).toBe(5_000)
  })

  it('selisih negatif berarti catatan lebih banyak dari isi dompet', () => {
    expect(reconcile(rupiah(160_000), rupiah(165_000)).difference).toBe(-5_000)
  })
})

describe('pasangan pemindahan', () => {
  it('menemukan kedua sisinya untuk ditampilkan sebagai satu baris', () => {
    const [out, into] = transfer(50_000, KAS, REKENING)
    const pair = pairTransfer([income(30_000), out, into], out.transferGroupId!)

    expect(pair.out?.walletId).toBe(KAS)
    expect(pair.in?.walletId).toBe(REKENING)
  })
})
