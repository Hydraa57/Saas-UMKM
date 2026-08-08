import { describe, expect, it } from 'vitest'
import { rupiah } from '@/lib/money'
import {
  RECEIPT_WIDTH,
  formatQty,
  normalizePhone,
  receiptForWhatsapp,
  renderReceipt,
  summarizeReceipt,
  whatsappShareUrl,
} from './receipt'
import { lineOf, makeBarang, makeJasa, makeSale } from './fixtures'

const HEADER = { businessName: 'Toko Bu Ani', phone: '081234567890' }

describe('bentuk struk', () => {
  it('setiap baris muat di lebar kertas termal', () => {
    // Lebar 32 karakter adalah format bawaan kertas 58mm. Baris yang
    // lebih panjang akan dipotong printer di tempat yang tak terduga.
    const sale = makeSale({
      lines: [lineOf(makeBarang(), 3), lineOf(makeJasa(), 1)],
      paid: rupiah(45_000),
    })

    for (const line of renderReceipt(sale, HEADER).split('\n')) {
      expect(line.length).toBeLessThanOrEqual(RECEIPT_WIDTH)
    }
  })

  it('memuat nomor struk, nama usaha, dan total', () => {
    const sale = makeSale({
      invoiceNo: '2026-0041',
      lines: [lineOf(makeBarang(), 3)],
      paid: rupiah(15_000),
    })
    const teks = renderReceipt(sale, HEADER)

    expect(teks).toContain('TOKO BU ANI')
    expect(teks).toContain('2026-0041')
    expect(teks).toContain('TOTAL')
    expect(teks).toContain('15.000')
  })

  it('menulis nama barang di baris sendiri supaya tidak terpotong', () => {
    const panjang = makeBarang({ name: 'Biskuit Roma Kelapa Kemasan Besar' })
    const teks = renderReceipt(makeSale({ lines: [lineOf(panjang, 1)] }), HEADER)
    expect(teks).toContain('Biskuit Roma Kelapa Kemasan Besa')
  })

  it('menampilkan kembalian kalau uangnya lebih', () => {
    const sale = makeSale({ lines: [lineOf(makeJasa(), 1)], paid: rupiah(50_000) })
    const teks = renderReceipt(sale, HEADER)
    expect(teks).toContain('Kembali')
    expect(teks).toContain('20.000')
  })

  it('menampilkan kekurangan kalau uangnya kurang', () => {
    const sale = makeSale({ lines: [lineOf(makeJasa(), 1)], paid: rupiah(10_000) })
    const teks = renderReceipt(sale, HEADER)
    expect(teks).toContain('KURANG')
    expect(teks).toContain('20.000')
  })

  it('tidak menampilkan kembalian maupun kekurangan kalau uangnya pas', () => {
    const sale = makeSale({ lines: [lineOf(makeJasa(), 1)], paid: rupiah(30_000) })
    const teks = renderReceipt(sale, HEADER)
    expect(teks).not.toContain('Kembali')
    expect(teks).not.toContain('KURANG')
  })

  it('menampilkan diskon hanya kalau ada', () => {
    const tanpa = renderReceipt(makeSale({ discount: rupiah(0) }), HEADER)
    const dengan = renderReceipt(
      makeSale({ lines: [lineOf(makeBarang(), 4)], discount: rupiah(2_000) }),
      HEADER,
    )
    expect(tanpa).not.toContain('Diskon')
    expect(dengan).toContain('Diskon')
  })

  it('menyebut nama pembeli kalau ada', () => {
    const teks = renderReceipt(makeSale({ customerName: 'Bu Tetangga' }), HEADER)
    expect(teks).toContain('Bu Tetangga')
  })

  it('jalan tanpa nomor telepon dan alamat', () => {
    const teks = renderReceipt(makeSale(), { businessName: 'Warung' })
    expect(teks).toContain('WARUNG')
  })
})

describe('formatQty', () => {
  it('bilangan bulat tanpa koma', () => {
    expect(formatQty(1)).toBe('1')
    expect(formatQty(12)).toBe('12')
  })

  it('pecahan pakai koma, tanpa nol mubazir', () => {
    expect(formatQty(0.25)).toBe('0,25')
    expect(formatQty(1.5)).toBe('1,5')
  })
})

describe('normalizePhone', () => {
  it('mengubah nomor lokal ke bentuk internasional', () => {
    // wa.me hanya menerima bentuk internasional; nomor salah bentuk
    // membuka percakapan kosong tanpa pesan galat apa pun.
    expect(normalizePhone('081234567890')).toBe('6281234567890')
    expect(normalizePhone('0812-3456-7890')).toBe('6281234567890')
    expect(normalizePhone('+62 812 3456 7890')).toBe('6281234567890')
    expect(normalizePhone('6281234567890')).toBe('6281234567890')
  })

  it('menolak yang jelas bukan nomor', () => {
    expect(normalizePhone(null)).toBeNull()
    expect(normalizePhone('')).toBeNull()
    expect(normalizePhone('123')).toBeNull()
    expect(normalizePhone('bukan nomor')).toBeNull()
  })
})

describe('berbagi ke WhatsApp', () => {
  it('tanpa nomor, WhatsApp membuka pemilih kontak', () => {
    const url = whatsappShareUrl('halo')
    expect(url.startsWith('https://wa.me/?text=')).toBe(true)
  })

  it('dengan nomor, langsung ke percakapannya', () => {
    expect(whatsappShareUrl('halo', '081234567890')).toContain('wa.me/6281234567890')
  })

  it('mengenkode teks strukyang punya baris baru dan spasi', () => {
    const url = whatsappShareUrl('baris satu\nbaris dua')
    expect(url).toContain('%0A')
    expect(url).not.toContain('\n')
  })

  it('dibungkus blok kode supaya kolomnya tetap lurus di WhatsApp', () => {
    const teks = receiptForWhatsapp(makeSale(), HEADER)
    expect(teks.startsWith('```\n')).toBe(true)
    expect(teks.endsWith('\n```')).toBe(true)
  })
})

describe('ringkasan struk', () => {
  it('menghitung total, kembalian, dan kekurangan', () => {
    const lunas = summarizeReceipt(
      makeSale({ lines: [lineOf(makeJasa(), 1)], paid: rupiah(50_000) }),
    )
    expect(lunas.total).toBe(30_000)
    expect(lunas.change).toBe(20_000)
    expect(lunas.outstanding).toBe(0)

    const kurang = summarizeReceipt(
      makeSale({ lines: [lineOf(makeJasa(), 1)], paid: rupiah(10_000) }),
    )
    expect(kurang.change).toBe(0)
    expect(kurang.outstanding).toBe(20_000)
  })

  it('memperhitungkan diskon', () => {
    const hasil = summarizeReceipt(
      makeSale({
        lines: [lineOf(makeBarang(), 4)],
        discount: rupiah(5_000),
        paid: rupiah(15_000),
      }),
    )
    expect(hasil.total).toBe(15_000)
    expect(hasil.outstanding).toBe(0)
  })
})
