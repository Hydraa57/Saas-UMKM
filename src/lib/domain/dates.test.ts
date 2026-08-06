import { describe, it, expect } from 'vitest'
import {
  addDays,
  dayRange,
  daysBetween,
  describeRelativeDay,
  endOfMonth,
  formatLocalDate,
  rangeBetween,
  startOfMonth,
  today,
  toLocalDate,
} from './dates'

describe('toLocalDate', () => {
  it('mengubah instan UTC ke tanggal kalender WIB', () => {
    expect(toLocalDate('2026-08-06T03:00:00.000Z')).toBe('2026-08-06')
  })

  it('transaksi malam hari tetap tercatat di hari yang benar', () => {
    // 23.30 WIB tanggal 6 = 16.30 UTC tanggal 6.
    expect(toLocalDate('2026-08-06T16:30:00.000Z')).toBe('2026-08-06')
    // 00.30 WIB tanggal 7 = 17.30 UTC tanggal 6. Inilah kasus yang
    // akan salah kalau tanggalnya diambil langsung dari UTC.
    expect(toLocalDate('2026-08-06T17:30:00.000Z')).toBe('2026-08-07')
  })

  it('menghormati zona waktu lain', () => {
    expect(toLocalDate('2026-08-06T17:30:00.000Z', 'Asia/Jayapura')).toBe('2026-08-07')
    expect(toLocalDate('2026-08-06T17:30:00.000Z', 'UTC')).toBe('2026-08-06')
  })

  it('menolak waktu yang tidak valid', () => {
    expect(() => toLocalDate('bukan waktu')).toThrow()
  })

  it('today() memakai jam yang diberikan', () => {
    expect(today(new Date('2026-08-06T17:30:00.000Z'))).toBe('2026-08-07')
  })
})

describe('daysBetween', () => {
  it('menghitung selisih hari', () => {
    expect(daysBetween('2026-08-01', '2026-08-06')).toBe(5)
    expect(daysBetween('2026-08-06', '2026-08-06')).toBe(0)
    expect(daysBetween('2026-08-06', '2026-08-01')).toBe(-5)
  })

  it('menyeberangi batas bulan dan tahun', () => {
    expect(daysBetween('2026-01-31', '2026-02-01')).toBe(1)
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1)
  })

  it('memperhitungkan tahun kabisat', () => {
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2)
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1)
  })

  it('menolak tanggal yang tidak valid', () => {
    expect(() => daysBetween('06-08-2026', '2026-08-06')).toThrow()
  })
})

describe('addDays', () => {
  it('menambah dan mengurangi hari', () => {
    expect(addDays('2026-08-06', 1)).toBe('2026-08-07')
    expect(addDays('2026-08-06', -1)).toBe('2026-08-05')
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('kebalikan dari daysBetween', () => {
    expect(daysBetween('2026-08-06', addDays('2026-08-06', 37))).toBe(37)
  })
})

describe('batas bulan', () => {
  it('menemukan awal dan akhir bulan', () => {
    expect(startOfMonth('2026-08-06')).toBe('2026-08-01')
    expect(endOfMonth('2026-08-06')).toBe('2026-08-31')
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28')
    expect(endOfMonth('2028-02-10')).toBe('2028-02-29')
    expect(endOfMonth('2026-04-10')).toBe('2026-04-30')
  })
})

describe('rentang instan', () => {
  it('satu hari WIB dimulai jam 17.00 UTC hari sebelumnya', () => {
    const range = dayRange('2026-08-06')
    expect(range.from).toBe('2026-08-05T17:00:00.000Z')
    expect(range.to).toBe('2026-08-06T17:00:00.000Z')
  })

  it('rentang mencakup seluruh hari terakhir', () => {
    const range = rangeBetween('2026-08-01', '2026-08-31')
    expect(range.from).toBe('2026-07-31T17:00:00.000Z')
    expect(range.to).toBe('2026-08-31T17:00:00.000Z')
  })

  it('transaksi jam 23.59 WIB masuk ke hari yang benar', () => {
    const range = dayRange('2026-08-06')
    const lateSale = '2026-08-06T16:59:00.000Z' // 23.59 WIB
    expect(lateSale >= range.from && lateSale < range.to).toBe(true)
  })

  it('bekerja untuk zona waktu lain', () => {
    expect(dayRange('2026-08-06', 'UTC').from).toBe('2026-08-06T00:00:00.000Z')
  })
})

describe('tampilan tanggal', () => {
  it('menulis tanggal dalam bahasa Indonesia', () => {
    expect(formatLocalDate('2026-08-06')).toBe('Kamis, 6 Agustus')
  })

  it('menyebut hari secara relatif seperti orang bicara', () => {
    const today = '2026-08-06'
    expect(describeRelativeDay('2026-08-06', today)).toBe('Hari ini')
    expect(describeRelativeDay('2026-08-07', today)).toBe('Besok')
    expect(describeRelativeDay('2026-08-05', today)).toBe('Kemarin')
    expect(describeRelativeDay('2026-08-09', today)).toBe('3 hari lagi')
    expect(describeRelativeDay('2026-08-04', today)).toBe('Telat 2 hari')
  })
})
