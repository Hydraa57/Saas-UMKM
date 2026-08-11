import { describe, expect, it } from 'vitest'
import { unzipSync } from 'node:zlib'
import {
  buatXlsx,
  crc32,
  namaKolom,
  namaLembarAman,
  xmlAman,
  zip,
} from './xlsx'

const teks = (data: Uint8Array): string => new TextDecoder().decode(data)
const byte = (s: string): Uint8Array => new TextEncoder().encode(s)

/**
 * Membaca entri dari ZIP hasil buatan sendiri.
 *
 * Sengaja **tidak** memakai ulang kode penulisnya: pembaca yang berbagi
 * anggapan dengan penulisnya akan sama-sama salah dan tetap cocok satu
 * sama lain. Ini membaca direktori pusat dari belakang, seperti yang
 * dilakukan pembaca ZIP sungguhan.
 */
function bacaZip(data: Uint8Array): Map<string, Uint8Array> {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength)

  let akhir = data.length - 22
  while (akhir >= 0 && dv.getUint32(akhir, true) !== 0x06054b50) akhir--
  if (akhir < 0) throw new Error('penanda akhir direktori tidak ditemukan')

  const jumlah = dv.getUint16(akhir + 10, true)
  let pos = dv.getUint32(akhir + 16, true)

  const isi = new Map<string, Uint8Array>()
  for (let i = 0; i < jumlah; i++) {
    if (dv.getUint32(pos, true) !== 0x02014b50) {
      throw new Error('penanda direktori pusat salah')
    }
    const metode = dv.getUint16(pos + 10, true)
    const crc = dv.getUint32(pos + 16, true)
    const ukuran = dv.getUint32(pos + 24, true)
    const panjangNama = dv.getUint16(pos + 28, true)
    const offsetLokal = dv.getUint32(pos + 42, true)
    const nama = teks(data.subarray(pos + 46, pos + 46 + panjangNama))

    if (dv.getUint32(offsetLokal, true) !== 0x04034b50) {
      throw new Error(`penanda berkas lokal salah untuk ${nama}`)
    }
    const namaLokal = dv.getUint16(offsetLokal + 26, true)
    const tambahanLokal = dv.getUint16(offsetLokal + 28, true)
    const mulai = offsetLokal + 30 + namaLokal + tambahanLokal

    const mentah = data.subarray(mulai, mulai + ukuran)
    const badan = metode === 0 ? mentah : unzipSync(mentah)
    if (crc32(badan) !== crc) throw new Error(`CRC tidak cocok untuk ${nama}`)

    isi.set(nama, badan)
    pos += 46 + panjangNama + dv.getUint16(pos + 30, true) + dv.getUint16(pos + 32, true)
  }
  return isi
}

describe('crc32', () => {
  it('cocok dengan nilai baku yang sudah dikenal', () => {
    // Nilai rujukan dari spesifikasi, bukan dari jalannya kode ini
    // sendiri — kalau tebakannya diambil dari keluaran sendiri, tesnya
    // cuma membuktikan kodenya konsisten dengan dirinya.
    expect(crc32(byte(''))).toBe(0)
    expect(crc32(byte('a'))).toBe(0xe8b7be43)
    expect(crc32(byte('123456789'))).toBe(0xcbf43926)
    expect(crc32(byte('The quick brown fox jumps over the lazy dog'))).toBe(
      0x414fa339,
    )
  })
})

describe('zip', () => {
  it('menghasilkan arsip yang bisa dibaca ulang dari direktori pusatnya', () => {
    const arsip = zip([
      { nama: 'satu.txt', data: byte('isi pertama') },
      { nama: 'map/dua.txt', data: byte('isi kedua') },
    ])

    const isi = bacaZip(arsip)
    expect([...isi.keys()]).toEqual(['satu.txt', 'map/dua.txt'])
    expect(teks(isi.get('satu.txt')!)).toBe('isi pertama')
    expect(teks(isi.get('map/dua.txt')!)).toBe('isi kedua')
  })

  it('menyimpan aksara di luar ASCII apa adanya', () => {
    const isi = bacaZip(zip([{ nama: 'a.txt', data: byte('Roti Manis — 5rb') }]))
    expect(teks(isi.get('a.txt')!)).toBe('Roti Manis — 5rb')
  })

  it('menghasilkan berkas yang sama persis untuk isi yang sama', () => {
    // Waktunya tetap, bukan waktu sekarang. Tanpa itu tidak ada cara
    // membandingkan dua hasil ekspor selain membukanya satu per satu.
    const buat = () => zip([{ nama: 'a.txt', data: byte('halo') }])
    expect(buat()).toEqual(buat())
  })
})

describe('xmlAman', () => {
  it('melarikan aksara yang punya arti di XML', () => {
    expect(xmlAman('Roti & "Susu" <baru>')).toBe(
      'Roti &amp; &quot;Susu&quot; &lt;baru&gt;',
    )
  })

  it('membuang aksara kendali yang tidak sah di XML', () => {
    // Satu aksara nyasar dari tempelan membuat seluruh berkas ditolak
    // dibuka — dan pesan penolakannya tidak menyebut penyebabnya.
    expect(xmlAman('Ro\x00ti\x07')).toBe('Roti')
  })

  it('mempertahankan ganti baris dan tab', () => {
    expect(xmlAman('a\nb\tc')).toBe('a\nb\tc')
  })
})

describe('namaKolom', () => {
  it('menghitung seperti Excel, bukan seperti bilangan basis 26', () => {
    expect(namaKolom(0)).toBe('A')
    expect(namaKolom(25)).toBe('Z')
    expect(namaKolom(26)).toBe('AA')
    expect(namaKolom(51)).toBe('AZ')
    expect(namaKolom(52)).toBe('BA')
    expect(namaKolom(701)).toBe('ZZ')
    expect(namaKolom(702)).toBe('AAA')
  })
})

describe('namaLembarAman', () => {
  it('membuang aksara yang ditolak Excel', () => {
    expect(namaLembarAman('Buku kas [2026]')).toBe('Buku kas  2026')
    expect(namaLembarAman('a/b\\c:d*e?f')).toBe('a b c d e f')
  })

  it('memangkas di 31 aksara', () => {
    expect(namaLembarAman('x'.repeat(40))).toHaveLength(31)
  })

  it('memakai nama cadangan kalau tidak ada yang tersisa', () => {
    expect(namaLembarAman('///', 'Lembar1')).toBe('Lembar1')
  })
})

describe('buatXlsx', () => {
  const contoh = () =>
    buatXlsx([
      {
        nama: 'Rekap',
        baris: [
          ['Bulan', 'Masuk', 'Keluar'],
          ['Agustus 2026', 101_000, 25_000],
          ['Juli 2026', 0, -5_000],
        ],
        lebar: [18, 14, 14],
      },
      { nama: 'Kosong', baris: [['Tidak ada isi']] },
    ])

  it('menyusun seluruh bagian yang diwajibkan format OOXML', () => {
    const isi = bacaZip(contoh())
    for (const bagian of [
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/worksheets/sheet1.xml',
      'xl/worksheets/sheet2.xml',
    ]) {
      expect(isi.has(bagian), `bagian hilang: ${bagian}`).toBe(true)
    }
  })

  it('menulis angka sebagai angka, bukan teks', () => {
    // Ini seluruh gunanya mengekspor ke Excel, bukan ke teks biasa:
    // angka yang tersimpan sebagai teks tidak bisa dijumlah, dan yang
    // membuka berkasnya tidak akan tahu kenapa SUM-nya nol.
    const sheet = teks(bacaZip(contoh()).get('xl/worksheets/sheet1.xml')!)
    expect(sheet).toContain('<c r="B2"><v>101000</v></c>')
    expect(sheet).toContain('<c r="C3"><v>-5000</v></c>')
  })

  it('menebalkan baris judul saja', () => {
    const sheet = teks(bacaZip(contoh()).get('xl/worksheets/sheet1.xml')!)
    expect(sheet).toContain('<c r="A1" s="1" t="inlineStr">')
    expect(sheet).not.toContain('<c r="A2" s="1"')
  })

  it('menghubungkan tiap lembar ke berkasnya masing-masing', () => {
    const isi = bacaZip(contoh())
    const wb = teks(isi.get('xl/workbook.xml')!)
    const rels = teks(isi.get('xl/_rels/workbook.xml.rels')!)

    expect(wb).toContain('<sheet name="Rekap" sheetId="1" r:id="rId1"/>')
    expect(wb).toContain('<sheet name="Kosong" sheetId="2" r:id="rId2"/>')
    expect(rels).toContain('Id="rId1"')
    expect(rels).toContain('Target="worksheets/sheet1.xml"')
    expect(rels).toContain('Target="worksheets/sheet2.xml"')
    expect(rels).toContain('Target="styles.xml"')
  })

  it('membuat nama tab yang bentrok jadi unik', () => {
    // Nama tab yang sama membuat berkasnya rusak tanpa penjelasan, dan
    // bentrokan bisa lahir dari pemangkasan 31 aksara — bukan cuma dari
    // nama yang memang ditulis sama.
    const wb = teks(
      bacaZip(
        buatXlsx([
          { nama: 'Penjualan', baris: [['a']] },
          { nama: 'Penjualan', baris: [['b']] },
        ]),
      ).get('xl/workbook.xml')!,
    )

    expect(wb).toContain('name="Penjualan"')
    expect(wb).toContain('name="Penjualan (2)"')
  })

  it('melarikan nama barang yang mengandung aksara XML', () => {
    const sheet = teks(
      bacaZip(
        buatXlsx([{ nama: 'A', baris: [['Nama'], ['Roti & <Susu>']] }]),
      ).get('xl/worksheets/sheet1.xml')!,
    )
    expect(sheet).toContain('Roti &amp; &lt;Susu&gt;')
  })

  it('melewati sel kosong alih-alih menulisnya sebagai teks kosong', () => {
    const sheet = teks(
      bacaZip(
        buatXlsx([{ nama: 'A', baris: [['Nama', 'Sisa'], ['Jasa', null]] }]),
      ).get('xl/worksheets/sheet1.xml')!,
    )
    // Jasa memang tidak punya sisa stok. Sel kosong berbeda dari nol, dan
    // pembeda itu justru inti produknya.
    expect(sheet).toContain('<row r="2"><c r="A2" t="inlineStr">')
    expect(sheet).not.toContain('r="B2"')
  })

  it('menolak buku tanpa lembar sama sekali', () => {
    expect(() => buatXlsx([])).toThrow(/sedikitnya satu lembar/)
  })
})
