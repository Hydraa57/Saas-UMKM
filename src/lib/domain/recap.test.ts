import { describe, expect, it } from 'vitest'
import {
  compareToPreviousMonth,
  findMonth,
  formatMonth,
  monthOf,
  monthlyRecap,
  yearTotal,
} from './recap'
import { KAS, REKENING, expense, income, transfer } from './fixtures'

const at = (iso: string) => ({ occurredAt: iso })

describe('monthOf', () => {
  it('memakai zona waktu usaha, bukan UTC', () => {
    // 00.30 WIB tanggal 1 September = 17.30 UTC tanggal 31 Agustus.
    // Kalau bulannya diambil dari UTC, transaksi ini masuk rekap Agustus
    // dan pemiliknya tidak akan pernah bisa menebak kenapa angkanya
    // meleset.
    expect(monthOf('2026-08-31T17:30:00.000Z')).toBe('2026-09')
    expect(monthOf('2026-08-31T16:30:00.000Z')).toBe('2026-08')
  })
})

describe('rekap bulanan', () => {
  it('mengelompokkan per bulan dan mengurutkan dari yang terbaru', () => {
    const recap = monthlyRecap([
      income(300_000, 'jasa', at('2026-06-10T03:00:00Z')),
      income(400_000, 'jasa', at('2026-07-10T03:00:00Z')),
      income(100_000, 'penjualan', at('2026-07-20T03:00:00Z')),
    ])

    expect(recap.months.map((row) => row.month)).toEqual(['2026-07', '2026-06'])
    expect(recap.months[0]?.income).toBe(500_000)
    expect(recap.months[1]?.income).toBe(300_000)
    expect(recap.totalIncome).toBe(800_000)
  })

  it('menyatukan penjualan barang dan pemasukan jasa dalam satu bulan', () => {
    // Usaha yang menjual barang sekaligus menerima jasa — jual kancing
    // sambil terima vermak — tetap punya satu angka pemasukan bulan itu.
    const recap = monthlyRecap([
      income(100_000, 'penjualan', at('2026-07-02T03:00:00Z')),
      income(30_000, 'jasa', at('2026-07-03T03:00:00Z')),
    ])
    expect(findMonth(recap, '2026-07')?.income).toBe(130_000)
  })

  it('pemindahan antar dompet tidak masuk rekap', () => {
    // Uang yang dipindahkan ke rekening bukan pemasukan baru.
    // Menghitungnya berarti rekap bulanan menghitung uang yang sama dua
    // kali, dan angkanya akan berbeda dari yang biasa dihitung sendiri.
    const [out, into] = transfer(50_000, KAS, REKENING, '2026-06-15T03:00:00Z')
    const recap = monthlyRecap([
      income(700_000, 'jasa', at('2026-06-10T03:00:00Z')),
      out,
      into,
    ])

    expect(recap.totalIncome).toBe(700_000)
    expect(recap.totalExpense).toBe(0)
  })

  it('menghitung pengeluaran dan sisa', () => {
    const recap = monthlyRecap([
      income(1_400_000, 'penjualan', at('2026-01-09T03:00:00Z')),
      expense(42_000, 'operasional', at('2026-01-19T03:00:00Z')),
      expense(107_000, 'modal', at('2026-01-16T03:00:00Z')),
    ])

    const januari = findMonth(recap, '2026-01')
    expect(januari?.income).toBe(1_400_000)
    expect(januari?.expense).toBe(149_000)
    expect(januari?.net).toBe(1_251_000)
  })

  it('bulan tanpa transaksi tidak muncul sebagai baris nol', () => {
    const recap = monthlyRecap([
      income(100_000, 'jasa', at('2026-01-10T03:00:00Z')),
      income(200_000, 'jasa', at('2026-06-10T03:00:00Z')),
    ])
    expect(recap.months).toHaveLength(2)
  })

  it('melewati entri yang dibatalkan', () => {
    const recap = monthlyRecap([
      income(300_000, 'jasa', at('2026-06-10T03:00:00Z')),
      income(999_000, 'jasa', {
        ...at('2026-06-11T03:00:00Z'),
        deletedAt: '2026-06-12T03:00:00Z',
      }),
    ])
    expect(recap.totalIncome).toBe(300_000)
  })

  it('daftar kosong aman', () => {
    const recap = monthlyRecap([])
    expect(recap.months).toHaveLength(0)
    expect(recap.totalIncome).toBe(0)
    expect(recap.totalNet).toBe(0)
  })
})

describe('total tahunan', () => {
  it('menjumlah satu tahun kalender — angka yang selama ini dijumlah tangan', () => {
    // Meniru halaman rekap di buku tulis: dua tahun berjalan di satu
    // daftar, dan yang digarisbawahi adalah total per tahun.
    const recap = monthlyRecap([
      income(865_000, 'jasa', at('2025-01-15T03:00:00Z')),
      income(866_000, 'jasa', at('2025-02-15T03:00:00Z')),
      income(1_706_000, 'jasa', at('2025-03-15T03:00:00Z')),
      income(761_000, 'jasa', at('2026-01-15T03:00:00Z')),
    ])

    expect(yearTotal(recap, 2025).income).toBe(3_437_000)
    expect(yearTotal(recap, 2026).income).toBe(761_000)
    expect(yearTotal(recap, 2024).income).toBe(0)
  })
})

describe('perbandingan bulan', () => {
  it('membandingkan dengan bulan sebelumnya', () => {
    const recap = monthlyRecap([
      income(700_000, 'jasa', at('2026-06-10T03:00:00Z')),
      income(900_000, 'jasa', at('2026-07-10T03:00:00Z')),
    ])

    const delta = compareToPreviousMonth(recap, '2026-07')
    expect(delta?.deltaIncome).toBe(200_000)
  })

  it('bulan pertama tidak punya pembanding, bukan turun 100%', () => {
    const recap = monthlyRecap([income(700_000, 'jasa', at('2026-06-10T03:00:00Z'))])
    expect(compareToPreviousMonth(recap, '2026-06')).toBeNull()
  })

  it('bulan yang tidak ada mengembalikan null', () => {
    const recap = monthlyRecap([income(700_000, 'jasa', at('2026-06-10T03:00:00Z'))])
    expect(compareToPreviousMonth(recap, '2026-12')).toBeNull()
  })
})

describe('formatMonth', () => {
  it('menulis bulan seperti judul di buku catatan', () => {
    expect(formatMonth('2026-08')).toBe('Agustus 2026')
    expect(formatMonth('2025-01')).toBe('Januari 2025')
    expect(formatMonth('2025-12')).toBe('Desember 2025')
  })

  it('menangani masukan tak terduga tanpa melempar', () => {
    expect(formatMonth('2026')).toBe('2026')
    expect(formatMonth('2026-13')).toBe('2026-13')
  })
})
