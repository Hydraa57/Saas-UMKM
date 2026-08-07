import { describe, expect, it } from 'vitest'
import {
  compareToPreviousMonth,
  findMonth,
  formatMonth,
  monthOf,
  monthlyRecap,
  yearTotal,
} from './recap'
import {
  REKENING,
  DOMPET_UTAMA,
  expense,
  income,
  transfer,
} from './fixtures'

const at = (iso: string) => ({ occurredAt: iso })

describe('monthOf', () => {
  it('memakai zona waktu usaha, bukan UTC', () => {
    // 00.30 WIB tanggal 1 September = 17.30 UTC tanggal 31 Agustus.
    // Kalau bulannya diambil dari UTC, transaksi ini masuk rekap Agustus
    // dan ibu tidak akan pernah bisa menebak kenapa angkanya meleset.
    expect(monthOf('2026-08-31T17:30:00.000Z')).toBe('2026-09')
    expect(monthOf('2026-08-31T16:30:00.000Z')).toBe('2026-08')
  })
})

describe('rekap bulanan', () => {
  it('mengelompokkan per bulan dan mengurutkan dari yang terbaru', () => {
    const recap = monthlyRecap(
      [
        income(300_000, 'jasa', at('2026-06-10T03:00:00Z')),
        income(400_000, 'jasa', at('2026-07-10T03:00:00Z')),
        income(100_000, 'penjualan', at('2026-07-20T03:00:00Z')),
      ],
      'usaha',
    )

    expect(recap.months.map((row) => row.month)).toEqual(['2026-07', '2026-06'])
    expect(recap.months[0]?.income).toBe(500_000)
    expect(recap.months[1]?.income).toBe(300_000)
    expect(recap.totalIncome).toBe(800_000)
  })

  it('hanya menghitung buku yang diminta', () => {
    const entries = [
      income(700_000, 'jasa', at('2026-06-10T03:00:00Z')),
      income(1_400_000, 'gaji', {
        ...at('2026-06-01T03:00:00Z'),
        book: 'rumah',
        walletId: REKENING,
      }),
    ]

    expect(monthlyRecap(entries, 'usaha').totalIncome).toBe(700_000)
    expect(monthlyRecap(entries, 'rumah').totalIncome).toBe(1_400_000)
  })

  it('pemindahan antar dompet tidak masuk rekap mana pun', () => {
    // Uang yang dipindahkan ke rekening bukan pemasukan baru.
    // Menghitungnya berarti rekap bulanan menghitung uang yang sama dua
    // kali, dan angkanya akan berbeda dari yang biasa dihitung sendiri.
    const [out, into] = transfer(50_000, DOMPET_UTAMA, REKENING, '2026-06-15T03:00:00Z')
    const entries = [income(700_000, 'jasa', at('2026-06-10T03:00:00Z')), out, into]

    expect(monthlyRecap(entries, 'usaha').totalIncome).toBe(700_000)
    expect(monthlyRecap(entries, 'usaha').totalExpense).toBe(0)
    expect(monthlyRecap(entries, 'rumah').totalIncome).toBe(0)
  })

  it('menghitung pengeluaran dan sisa', () => {
    const recap = monthlyRecap(
      [
        income(1_400_000, 'gaji', {
          ...at('2026-01-09T03:00:00Z'),
          book: 'rumah',
        }),
        expense(42_000, 'belanja', { ...at('2026-01-19T03:00:00Z'), book: 'rumah' }),
        expense(107_000, 'utilitas', { ...at('2026-01-16T03:00:00Z'), book: 'rumah' }),
      ],
      'rumah',
    )

    const januari = findMonth(recap, '2026-01')
    expect(januari?.income).toBe(1_400_000)
    expect(januari?.expense).toBe(149_000)
    expect(januari?.net).toBe(1_251_000)
  })

  it('bulan tanpa transaksi tidak muncul sebagai baris nol', () => {
    const recap = monthlyRecap(
      [
        income(100_000, 'jasa', at('2026-01-10T03:00:00Z')),
        income(200_000, 'jasa', at('2026-06-10T03:00:00Z')),
      ],
      'usaha',
    )
    expect(recap.months).toHaveLength(2)
  })

  it('melewati entri yang dibatalkan', () => {
    const recap = monthlyRecap(
      [
        income(300_000, 'jasa', at('2026-06-10T03:00:00Z')),
        income(999_000, 'jasa', {
          ...at('2026-06-11T03:00:00Z'),
          deletedAt: '2026-06-12T03:00:00Z',
        }),
      ],
      'usaha',
    )
    expect(recap.totalIncome).toBe(300_000)
  })

  it('daftar kosong aman', () => {
    const recap = monthlyRecap([], 'usaha')
    expect(recap.months).toHaveLength(0)
    expect(recap.totalIncome).toBe(0)
    expect(recap.totalNet).toBe(0)
  })
})

describe('total tahunan', () => {
  it('menjumlah satu tahun kalender — angka yang ibu jumlah tangan', () => {
    // Meniru halaman rekap ibu: dua tahun berjalan di satu daftar, dan
    // yang dia garisbawahi adalah total per tahun.
    const recap = monthlyRecap(
      [
        income(865_000, 'jasa', at('2025-01-15T03:00:00Z')),
        income(866_000, 'jasa', at('2025-02-15T03:00:00Z')),
        income(1_706_000, 'jasa', at('2025-03-15T03:00:00Z')),
        income(761_000, 'jasa', at('2026-01-15T03:00:00Z')),
      ],
      'usaha',
    )

    expect(yearTotal(recap, 2025).income).toBe(3_437_000)
    expect(yearTotal(recap, 2026).income).toBe(761_000)
    expect(yearTotal(recap, 2024).income).toBe(0)
  })
})

describe('perbandingan bulan', () => {
  it('membandingkan dengan bulan sebelumnya', () => {
    const recap = monthlyRecap(
      [
        income(700_000, 'jasa', at('2026-06-10T03:00:00Z')),
        income(900_000, 'jasa', at('2026-07-10T03:00:00Z')),
      ],
      'usaha',
    )

    const delta = compareToPreviousMonth(recap, '2026-07')
    expect(delta?.deltaIncome).toBe(200_000)
  })

  it('bulan pertama tidak punya pembanding, bukan turun 100%', () => {
    const recap = monthlyRecap(
      [income(700_000, 'jasa', at('2026-06-10T03:00:00Z'))],
      'usaha',
    )
    expect(compareToPreviousMonth(recap, '2026-06')).toBeNull()
  })

  it('bulan yang tidak ada mengembalikan null', () => {
    const recap = monthlyRecap(
      [income(700_000, 'jasa', at('2026-06-10T03:00:00Z'))],
      'usaha',
    )
    expect(compareToPreviousMonth(recap, '2026-12')).toBeNull()
  })
})

describe('formatMonth', () => {
  it('menulis bulan seperti judul di buku ibu', () => {
    expect(formatMonth('2026-08')).toBe('Agustus 2026')
    expect(formatMonth('2025-01')).toBe('Januari 2025')
    expect(formatMonth('2025-12')).toBe('Desember 2025')
  })

  it('menangani masukan tak terduga tanpa melempar', () => {
    expect(formatMonth('2026')).toBe('2026')
    expect(formatMonth('2026-13')).toBe('2026-13')
  })
})
