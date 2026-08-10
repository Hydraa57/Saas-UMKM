import { describe, expect, it } from 'vitest'
import { CMD, chunk, encodeReceipt, toAscii } from './escpos'
import { renderReceipt } from '@/lib/domain/receipt'
import { makeSale } from '@/lib/domain/fixtures'

const decode = (bytes: Uint8Array) => String.fromCharCode(...bytes)

describe('perataan ke ASCII', () => {
  it('membuang aksen tanpa membuang hurufnya', () => {
    expect(toAscii('Café Böhm')).toBe('Cafe Bohm')
  })

  it('meratakan tanda baca pintar dari papan ketik HP', () => {
    expect(toAscii('“Ani’s” — toko…')).toBe('"Ani\'s" - toko...')
  })

  it('mengganti sisanya dengan tanda tanya, bukan membuangnya', () => {
    // Baris yang menyusut merusak perataan kolom nominal, dan kolom
    // nominal yang meleset adalah hal pertama yang dilihat pembeli.
    const hasil = toAscii('Toko 日本')
    expect(hasil).toBe('Toko ??')
    expect(hasil).toHaveLength('Toko 日本'.length)
  })

  it('membiarkan teks Indonesia apa adanya', () => {
    const teks = 'Potong celana 2 x 30.000 = 60.000'
    expect(toAscii(teks)).toBe(teks)
  })

  it('mempertahankan baris baru', () => {
    expect(toAscii('a\nb')).toBe('a\nb')
  })
})

describe('penyandian struk', () => {
  it('diawali perintah init dan rata kiri', () => {
    const bytes = encodeReceipt('halo')
    expect([...bytes.subarray(0, 2)]).toEqual([...CMD.init])
    expect([...bytes.subarray(2, 5)]).toEqual([...CMD.alignLeft])
  })

  it('memuat teksnya apa adanya', () => {
    expect(decode(encodeReceipt('halo', { feedLines: 0 }))).toContain('halo')
  })

  it('selalu menutup baris terakhir lalu memberi umpan', () => {
    // Tanpa umpan, baris terakhir berhenti di dalam badan printer dan baru
    // terbaca setelah struk berikutnya dicetak.
    const bytes = encodeReceipt('halo', { feedLines: 3 })
    expect(decode(bytes).endsWith('halo\n\n\n\n')).toBe(true)
  })

  it('tidak menggandakan baris baru yang sudah ada', () => {
    const bytes = encodeReceipt('halo\n', { feedLines: 1 })
    expect(decode(bytes).endsWith('halo\n\n')).toBe(true)
  })

  it('perintah potong hanya dikirim kalau diminta', () => {
    const tanpa = [...encodeReceipt('halo')]
    const dengan = [...encodeReceipt('halo', { cut: true })]
    expect(tanpa.slice(-4)).not.toEqual([...CMD.cut])
    expect(dengan.slice(-4)).toEqual([...CMD.cut])
  })

  it('teks kosong tetap menghasilkan perintah yang sah', () => {
    const bytes = encodeReceipt('', { feedLines: 0 })
    expect([...bytes]).toEqual([...CMD.init, ...CMD.alignLeft, 0x0a])
  })
})

describe('yang dicetak sama dengan yang dilihat', () => {
  it('setiap baris struk muncul utuh di bita yang dikirim', () => {
    // Inilah alasan penyandi ini menerima string dan bukan `Sale`: tidak
    // ada tempat kedua yang menyusun barisnya, jadi tidak ada yang bisa
    // melenceng dari yang tampil di layar.
    const teks = renderReceipt(makeSale(), { businessName: 'Warung Bu Ani' })
    const dicetak = decode(encodeReceipt(teks))

    for (const baris of teks.split('\n')) {
      expect(dicetak).toContain(baris)
    }
  })

  it('lebarnya tidak berubah setelah disandikan', () => {
    const teks = renderReceipt(makeSale(), { businessName: 'Warung Bu Ani' })
    const dicetak = decode(encodeReceipt(teks, { feedLines: 0 }))
      // Buang awalan perintah dan umpan penutup.
      .slice(CMD.init.length + CMD.alignLeft.length)
      .replace(/\n$/, '')

    expect(dicetak.split('\n').map((b) => b.length)).toEqual(
      teks.split('\n').map((b) => b.length),
    )
  })
})

describe('pemotongan paket', () => {
  it('memotong sesuai ukuran MTU', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5])
    expect(chunk(data, 2).map((c) => [...c])).toEqual([[1, 2], [3, 4], [5]])
  })

  it('data yang lebih kecil dari satu paket tetap satu paket', () => {
    expect(chunk(new Uint8Array([1, 2]), 20)).toHaveLength(1)
  })

  it('data kosong tidak menghasilkan paket kosong', () => {
    expect(chunk(new Uint8Array([]), 20)).toHaveLength(0)
  })

  it('seluruh bita tetap utuh dan berurutan', () => {
    const data = new Uint8Array(Array.from({ length: 97 }, (_, i) => i % 256))
    const gabung = chunk(data, 20).flatMap((c) => [...c])
    expect(gabung).toEqual([...data])
  })

  it('ukuran nol ditolak, bukan menggantung selamanya', () => {
    expect(() => chunk(new Uint8Array([1]), 0)).toThrow('lebih dari nol')
  })
})
