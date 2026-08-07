import { describe, expect, it } from 'vitest'
import { rupiah } from '@/lib/money'
import {
  bookBalance,
  countsAsFlow,
  filterByBook,
  isLive,
  pairTransfer,
  reconcile,
  signedAmount,
  summarizeFlow,
  walletBalance,
} from './cash'
import {
  DOMPET_BELANJA,
  DOMPET_JAHIT,
  DOMPET_SNACK,
  expense,
  income,
  makeWallet,
  transfer,
} from './fixtures'

describe('penyaringan entri', () => {
  it('entri yang dibatalkan tidak ikut dihitung', () => {
    expect(isLive(income(30_000))).toBe(true)
    expect(isLive(income(30_000, 'jahit', { deletedAt: '2026-08-06T05:00:00Z' }))).toBe(
      false,
    )
  })

  it('pemindahan tidak ikut laporan penghasilan/biaya', () => {
    const [out, into] = transfer(
      50_000,
      { walletId: DOMPET_JAHIT, book: 'usaha' },
      { walletId: DOMPET_BELANJA, book: 'rumah' },
    )
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
      income(30_000, 'jahit'),
      income(5_000, 'snack'),
      expense(42_000, 'belanja'),
    ])

    expect(summary.income).toBe(35_000)
    expect(summary.expense).toBe(42_000)
    expect(summary.net).toBe(-7_000)
    expect(summary.entryCount).toBe(3)
  })

  it('merinci per kategori', () => {
    const summary = summarizeFlow([
      income(30_000, 'jahit'),
      income(35_000, 'jahit'),
      income(5_000, 'snack'),
    ])

    expect(summary.byCategory.get('jahit')).toBe(65_000)
    expect(summary.byCategory.get('snack')).toBe(5_000)
    expect(summary.byCategory.get('belanja')).toBeUndefined()
  })

  it('daftar kosong menghasilkan nol, bukan NaN', () => {
    const summary = summarizeFlow([])
    expect(summary.income).toBe(0)
    expect(summary.net).toBe(0)
    expect(summary.entryCount).toBe(0)
  })

  it('melewati entri yang dibatalkan', () => {
    const summary = summarizeFlow([
      income(30_000),
      income(99_000, 'jahit', { deletedAt: '2026-08-06T05:00:00Z' }),
    ])
    expect(summary.income).toBe(30_000)
  })

  it('pemindahan tidak menambah pemasukan maupun pengeluaran', () => {
    const [out, into] = transfer(
      50_000,
      { walletId: DOMPET_JAHIT, book: 'usaha' },
      { walletId: DOMPET_BELANJA, book: 'rumah' },
    )
    const summary = summarizeFlow([income(30_000), out, into])

    expect(summary.income).toBe(30_000)
    expect(summary.expense).toBe(0)
    expect(summary.entryCount).toBe(1)
  })
})

describe('pemisahan buku', () => {
  it('uang dari bapak tidak pernah masuk hitungan penghasilan ibu', () => {
    // Ini yang ibu sendiri tegaskan: rekapnya "di luar uang yang bapak
    // kasih". Aplikasi mengikuti pemisahan yang sudah dia jalankan.
    const entries = [
      income(30_000, 'jahit', { book: 'usaha', walletId: DOMPET_JAHIT }),
      income(5_000, 'snack', { book: 'usaha', walletId: DOMPET_SNACK }),
      income(1_400_000, 'dari_bapak', {
        book: 'rumah',
        walletId: DOMPET_BELANJA,
      }),
    ]

    expect(summarizeFlow(filterByBook(entries, 'usaha')).income).toBe(35_000)
    expect(summarizeFlow(filterByBook(entries, 'rumah')).income).toBe(1_400_000)
  })
})

describe('saldo dompet', () => {
  it('saldo awal ditambah seluruh mutasi', () => {
    const wallet = makeWallet({ openingBalance: rupiah(100_000) })
    const balance = walletBalance(wallet, [
      income(30_000, 'jahit', { walletId: DOMPET_JAHIT }),
      income(35_000, 'jahit', { walletId: DOMPET_JAHIT }),
    ])
    expect(balance).toBe(165_000)
  })

  it('pemindahan ikut menggerakkan saldo — uangnya memang berpindah', () => {
    const [out, into] = transfer(
      50_000,
      { walletId: DOMPET_JAHIT, book: 'usaha' },
      { walletId: DOMPET_BELANJA, book: 'rumah' },
    )
    const entries = [income(65_000, 'jahit', { walletId: DOMPET_JAHIT }), out, into]

    expect(walletBalance(makeWallet(), entries)).toBe(15_000)
    expect(
      walletBalance(
        makeWallet({ id: DOMPET_BELANJA, book: 'rumah' }),
        entries,
      ),
    ).toBe(50_000)
  })

  it('mengabaikan entri dompet lain', () => {
    const entries = [
      income(30_000, 'jahit', { walletId: DOMPET_JAHIT }),
      income(5_000, 'snack', { walletId: DOMPET_SNACK }),
    ]
    expect(walletBalance(makeWallet(), entries)).toBe(30_000)
  })

  it('mengabaikan entri yang dibatalkan', () => {
    const entries = [
      income(30_000, 'jahit', { walletId: DOMPET_JAHIT }),
      income(99_000, 'jahit', {
        walletId: DOMPET_JAHIT,
        deletedAt: '2026-08-06T05:00:00Z',
      }),
    ]
    expect(walletBalance(makeWallet(), entries)).toBe(30_000)
  })

  it('boleh negatif — dompet memang bisa minus kalau ada yang belum tercatat', () => {
    expect(
      walletBalance(makeWallet(), [
        expense(50_000, 'operasional', {
          book: 'usaha',
          walletId: DOMPET_JAHIT,
        }),
      ]),
    ).toBe(-50_000)
  })
})

describe('saldo per buku', () => {
  it('menjumlah seluruh dompet dalam satu buku', () => {
    const wallets = [
      makeWallet({ id: DOMPET_JAHIT, book: 'usaha' }),
      makeWallet({ id: DOMPET_SNACK, name: 'Dompet Snack', book: 'usaha', isDefault: false }),
      makeWallet({ id: DOMPET_BELANJA, name: 'Dompet Belanja', book: 'rumah' }),
    ]
    const entries = [
      income(30_000, 'jahit', { walletId: DOMPET_JAHIT }),
      income(5_000, 'snack', { walletId: DOMPET_SNACK }),
      income(1_400_000, 'dari_bapak', { book: 'rumah', walletId: DOMPET_BELANJA }),
    ]

    expect(bookBalance(wallets, entries, 'usaha')).toBe(35_000)
    expect(bookBalance(wallets, entries, 'rumah')).toBe(1_400_000)
  })

  it('melewati dompet yang diarsipkan', () => {
    const wallets = [
      makeWallet({ id: DOMPET_JAHIT, book: 'usaha' }),
      makeWallet({
        id: DOMPET_SNACK,
        book: 'usaha',
        archivedAt: '2026-07-01T00:00:00Z',
      }),
    ]
    const entries = [
      income(30_000, 'jahit', { walletId: DOMPET_JAHIT }),
      income(5_000, 'snack', { walletId: DOMPET_SNACK }),
    ]
    expect(bookBalance(wallets, entries, 'usaha')).toBe(30_000)
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
    const [out, into] = transfer(
      50_000,
      { walletId: DOMPET_JAHIT, book: 'usaha' },
      { walletId: DOMPET_BELANJA, book: 'rumah' },
    )
    const pair = pairTransfer([income(30_000), out, into], out.transferGroupId!)

    expect(pair.out?.walletId).toBe(DOMPET_JAHIT)
    expect(pair.in?.walletId).toBe(DOMPET_BELANJA)
  })
})
