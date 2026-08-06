import { describe, it, expect } from 'vitest'
import * as M from './money'
import { rupiah, ZERO, MoneyError } from './money'

describe('rupiah()', () => {
  it('menerima bilangan bulat', () => {
    expect(rupiah(0)).toBe(0)
    expect(rupiah(5000)).toBe(5000)
    expect(rupiah(-12500)).toBe(-12500)
  })

  it('menolak pecahan — pembulatan harus eksplisit', () => {
    expect(() => rupiah(5000.5)).toThrow(MoneyError)
    expect(() => rupiah(0.1 + 0.2)).toThrow(MoneyError)
  })

  it('menolak NaN dan tak berhingga', () => {
    expect(() => rupiah(NaN)).toThrow(MoneyError)
    expect(() => rupiah(Infinity)).toThrow(MoneyError)
    expect(() => rupiah(-Infinity)).toThrow(MoneyError)
  })

  it('menolak nilai di luar batas wajar', () => {
    expect(() => rupiah(M.MAX_RUPIAH + 1)).toThrow(MoneyError)
    expect(() => rupiah(-M.MAX_RUPIAH - 1)).toThrow(MoneyError)
    expect(rupiah(M.MAX_RUPIAH)).toBe(M.MAX_RUPIAH)
  })
})

describe('fromDb()', () => {
  it('memperlakukan null/undefined sebagai nol', () => {
    expect(M.fromDb(null)).toBe(0)
    expect(M.fromDb(undefined)).toBe(0)
  })

  it('membaca bigint yang dikirim sebagai string', () => {
    expect(M.fromDb('45000')).toBe(45000)
  })

  it('gagal keras pada nilai rusak, bukan diam-diam jadi nol', () => {
    expect(() => M.fromDb('bukan angka')).toThrow(MoneyError)
  })
})

describe('aritmetika', () => {
  it('menjumlah dan mengurangi secara eksak', () => {
    expect(M.add(rupiah(1500), rupiah(2500))).toBe(4000)
    expect(M.subtract(rupiah(10000), rupiah(7500))).toBe(2500)
    expect(M.subtract(rupiah(5000), rupiah(8000))).toBe(-3000)
  })

  it('menjumlah daftar', () => {
    expect(M.sum([rupiah(1000), rupiah(2000), rupiah(3500)])).toBe(6500)
    expect(M.sum([])).toBe(0)
  })

  it('tetap eksak pada penjumlahan beruntun yang panjang', () => {
    // Inilah yang akan salah kalau uang disimpan sebagai pecahan rupiah.
    const items = Array.from({ length: 10_000 }, () => rupiah(333))
    expect(M.sum(items)).toBe(3_330_000)
  })

  it('clampToZero menahan nilai negatif', () => {
    expect(M.clampToZero(rupiah(-5000))).toBe(0)
    expect(M.clampToZero(rupiah(5000))).toBe(5000)
  })
})

describe('multiplyByQty()', () => {
  it('mengalikan jumlah bulat', () => {
    expect(M.multiplyByQty(rupiah(3500), 4)).toBe(14000)
    expect(M.multiplyByQty(rupiah(3500), 0)).toBe(0)
  })

  it('mengalikan jumlah pecahan — snack per ons dan per kilo', () => {
    expect(M.multiplyByQty(rupiah(30000), 0.25)).toBe(7500)
    expect(M.multiplyByQty(rupiah(45000), 1.5)).toBe(67500)
  })

  it('membulatkan setengah menjauh dari nol, simetris untuk retur', () => {
    expect(M.multiplyByQty(rupiah(10000), 0.3335)).toBe(3335)
    expect(M.multiplyByQty(rupiah(1001), 0.5)).toBe(501)
    // Retur harus persis membatalkan penjualan aslinya.
    expect(M.multiplyByQty(rupiah(1001), -0.5)).toBe(-501)
  })

  it('selalu menghasilkan bilangan bulat', () => {
    for (const qty of [0.333, 1.7, 2.05, 0.125, 3.999]) {
      const result = M.multiplyByQty(rupiah(12345), qty)
      expect(Number.isInteger(result)).toBe(true)
    }
  })

  it('menolak jumlah yang tidak valid', () => {
    expect(() => M.multiplyByQty(rupiah(1000), NaN)).toThrow(MoneyError)
    expect(() => M.multiplyByQty(rupiah(1000), Infinity)).toThrow(MoneyError)
  })
})

describe('applyPercent()', () => {
  it('menghitung diskon persen', () => {
    expect(M.applyPercent(rupiah(50000), 10)).toBe(5000)
    expect(M.applyPercent(rupiah(50000), 0)).toBe(0)
  })

  it('membulatkan ke rupiah terdekat', () => {
    expect(M.applyPercent(rupiah(3333), 10)).toBe(333)
    expect(M.applyPercent(rupiah(1005), 50)).toBe(503)
  })

  it('menghitung MDR QRIS 0,3%', () => {
    expect(M.applyPercent(rupiah(750_000), 0.3)).toBe(2250)
  })
})

describe('perbandingan', () => {
  it('membandingkan dua nilai', () => {
    expect(M.compare(rupiah(100), rupiah(200))).toBe(-1)
    expect(M.compare(rupiah(200), rupiah(200))).toBe(0)
    expect(M.compare(rupiah(300), rupiah(200))).toBe(1)
  })

  it('min dan max', () => {
    expect(M.min(rupiah(100), rupiah(200))).toBe(100)
    expect(M.max(rupiah(100), rupiah(200))).toBe(200)
  })

  it('predikat tanda', () => {
    expect(M.isZero(ZERO)).toBe(true)
    expect(M.isPositive(rupiah(1))).toBe(true)
    expect(M.isNegative(rupiah(-1))).toBe(true)
    expect(M.isPositive(ZERO)).toBe(false)
    expect(M.isNegative(ZERO)).toBe(false)
  })
})

describe('format()', () => {
  it('memakai pemisah ribuan Indonesia', () => {
    expect(M.format(rupiah(5000))).toBe('Rp 5.000')
    expect(M.format(rupiah(1_250_000))).toBe('Rp 1.250.000')
    expect(M.format(ZERO)).toBe('Rp 0')
  })

  it('menaruh minus sebelum Rp, bukan sesudahnya', () => {
    expect(M.format(rupiah(-12500))).toBe('-Rp 12.500')
  })

  it('bisa tanpa awalan dan dengan tanda plus', () => {
    expect(M.format(rupiah(5000), { withPrefix: false })).toBe('5.000')
    expect(M.format(rupiah(5000), { withSign: true })).toBe('+Rp 5.000')
    expect(M.format(ZERO, { withSign: true })).toBe('Rp 0')
  })
})

describe('formatCompact()', () => {
  it('menampilkan penuh di bawah sepuluh ribu', () => {
    expect(M.formatCompact(rupiah(5000))).toBe('Rp 5.000')
    expect(M.formatCompact(rupiah(9999))).toBe('Rp 9.999')
  })

  it('meringkas ribuan dan jutaan', () => {
    expect(M.formatCompact(rupiah(85_000))).toBe('Rp 85rb')
    expect(M.formatCompact(rupiah(1_200_000))).toBe('Rp 1,2jt')
    expect(M.formatCompact(rupiah(2_000_000))).toBe('Rp 2jt')
    expect(M.formatCompact(rupiah(1_500_000_000))).toBe('Rp 1,5mlr')
  })

  it('menangani nilai negatif', () => {
    expect(M.formatCompact(rupiah(-85_000))).toBe('-Rp 85rb')
  })
})

describe('parse()', () => {
  it('membaca angka polos', () => {
    expect(M.parse('5000')).toBe(5000)
    expect(M.parse('0')).toBe(0)
  })

  it('membaca titik sebagai pemisah ribuan', () => {
    expect(M.parse('5.000')).toBe(5000)
    expect(M.parse('1.250.000')).toBe(1250000)
  })

  it('membaca awalan Rp', () => {
    expect(M.parse('Rp 12.500')).toBe(12500)
    expect(M.parse('rp12500')).toBe(12500)
    expect(M.parse('Rp. 12.500')).toBe(12500)
  })

  it('membaca sufiks ribu', () => {
    expect(M.parse('5rb')).toBe(5000)
    expect(M.parse('5 ribu')).toBe(5000)
    expect(M.parse('5k')).toBe(5000)
    expect(M.parse('2.5k')).toBe(2500)
    expect(M.parse('2,5rb')).toBe(2500)
  })

  it('membaca sufiks juta dan miliar', () => {
    expect(M.parse('1jt')).toBe(1_000_000)
    expect(M.parse('1,5jt')).toBe(1_500_000)
    expect(M.parse('2 juta')).toBe(2_000_000)
    expect(M.parse('1,5milyar')).toBe(1_500_000_000)
  })

  it('menolak "m" sendirian karena artinya ambigu', () => {
    expect(M.parse('5m')).toBeNull()
  })

  it('membaca nilai negatif', () => {
    expect(M.parse('-5000')).toBe(-5000)
    expect(M.parse('-5rb')).toBe(-5000)
  })

  it('mengembalikan null untuk input yang belum lengkap, bukan melempar', () => {
    expect(M.parse('')).toBeNull()
    expect(M.parse('   ')).toBeNull()
    expect(M.parse('Rp')).toBeNull()
    expect(M.parse('-')).toBeNull()
    expect(M.parse('.')).toBeNull()
    expect(M.parse('abc')).toBeNull()
    expect(M.parse('12ab')).toBeNull()
  })

  it('membulatkan hasil pecahan ke rupiah utuh', () => {
    expect(M.parse('1,2345rb')).toBe(1235)
  })

  it('menolak nilai di luar batas', () => {
    expect(M.parse('999999999milyar')).toBeNull()
  })

  it('bolak-balik dengan format()', () => {
    for (const value of [0, 500, 5000, 12500, 1_250_000, -7500]) {
      const formatted = M.format(rupiah(value))
      expect(M.parse(formatted)).toBe(value)
    }
  })
})

describe('papan angka', () => {
  it('menambahkan digit dalam rupiah utuh', () => {
    let amount = ZERO
    amount = M.appendDigit(amount, 1)
    amount = M.appendDigit(amount, 2)
    amount = M.appendDigit(amount, 5)
    expect(amount).toBe(125)
    expect(M.appendDigit(amount, 0)).toBe(1250)
  })

  it('menolak digit yang tidak valid', () => {
    expect(() => M.appendDigit(ZERO, 10)).toThrow(MoneyError)
    expect(() => M.appendDigit(ZERO, -1)).toThrow(MoneyError)
    expect(() => M.appendDigit(ZERO, 1.5)).toThrow(MoneyError)
  })

  it('berhenti diam-diam di batas, bukan melempar saat mengetik', () => {
    const large = rupiah(M.MAX_RUPIAH)
    expect(M.appendDigit(large, 9)).toBe(M.MAX_RUPIAH)
  })

  it('menghapus digit terakhir', () => {
    expect(M.removeDigit(rupiah(1250))).toBe(125)
    expect(M.removeDigit(rupiah(5))).toBe(0)
    expect(M.removeDigit(ZERO)).toBe(0)
  })
})
