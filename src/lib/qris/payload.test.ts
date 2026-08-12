import { describe, expect, it } from 'vitest'
import {
  bongkar,
  cari,
  crc16,
  jadikanDinamis,
  pasang,
  periksaQris,
  QrisError,
} from './payload'

/**
 * Muatan uji ini **tidak** dibuat oleh kode yang diujinya.
 *
 * Susunan TLV dan CRC-nya dihitung dengan `binascii.crc_hqx` milik Python
 * — penerapan CRC-16/CCITT-FALSE yang berdiri sendiri. Kalau tebakannya
 * diambil dari keluaran modul ini, tesnya cuma membuktikan modul itu
 * konsisten dengan dirinya sendiri, dan varian CRC yang salah akan lolos
 * dengan mulus sampai ada pembeli yang QR-nya ditolak di depan meja.
 */
const STATIS =
  '00020101021126430014ID.CO.QRIS.WWW0215ID1024300000000303UMI5204549953033605802ID5913WARUNG BU ANI6007BANDUNG61054012363041459'

/** Bentuk yang seharusnya dihasilkan untuk nominal 15.000. */
const DINAMIS_15000 =
  '00020101021226430014ID.CO.QRIS.WWW0215ID1024300000000303UMI5204549953033605405150005802ID5913WARUNG BU ANI6007BANDUNG6105401236304577F'

/** Sah menurut spesifikasi: tanpa tag 01 berarti statis. */
const TANPA_01 =
  '00020126430014ID.CO.QRIS.WWW0215ID1024300000000303UMI53033605802ID5913WARUNG BU ANI6304EA76'

describe('crc16', () => {
  it('cocok dengan vektor baku CRC-16/CCITT-FALSE', () => {
    // Vektor rujukan yang sama dipakai seluruh dunia untuk varian ini.
    // Ada belasan varian CRC-16, dan memilih yang salah menghasilkan kode
    // yang ditolak semua aplikasi pembayaran tanpa petunjuk apa pun.
    expect(crc16('123456789')).toBe(0x29b1)
    expect(crc16('')).toBe(0xffff)
    expect(crc16('A')).toBe(0xb915)
  })
})

describe('bongkar', () => {
  it('memecah muatan jadi ruas tingkat pertama', () => {
    const ruas = bongkar(STATIS)
    expect(cari(ruas, '00')).toBe('01')
    expect(cari(ruas, '01')).toBe('11')
    expect(cari(ruas, '59')).toBe('WARUNG BU ANI')
    expect(cari(ruas, '60')).toBe('BANDUNG')
    expect(cari(ruas, '63')).toBe('1459')
  })

  it('tidak ikut membongkar isi ruas merchant', () => {
    // Sub-ruas di dalam tag 26 dibiarkan utuh sebagai teks. Tidak ada
    // yang perlu diubah di dalamnya, dan muatan milik orang lain
    // sebaiknya disentuh sesedikit mungkin.
    expect(cari(bongkar(STATIS), '26')).toBe(
      '0014ID.CO.QRIS.WWW0215ID1024300000000303UMI',
    )
  })

  it('menolak muatan yang terpotong', () => {
    expect(() => bongkar(STATIS.slice(0, 40))).toThrow(QrisError)
  })

  it('menolak yang panjangnya melebihi sisa muatan', () => {
    // Ruas yang mengaku 99 aksara padahal sisanya cuma tiga.
    expect(() => bongkar('00029901')).toThrow(/terpotong/)
  })
})

describe('pasang', () => {
  it('membangun ulang muatan yang sama persis', () => {
    // Pulang-pergi yang utuh: kalau penyusunannya menggeser satu aksara
    // saja, CRC-nya berubah dan hasilnya tidak akan sama.
    expect(pasang(bongkar(STATIS))).toBe(STATIS)
  })

  it('menghitung CRC atas muatan termasuk "6304"', () => {
    // Jebakan paling sering pada penerapan QRIS: menghitung CRC hanya
    // atas isi sebelum tag 63, sehingga hasilnya selalu meleset.
    const hasil = pasang([
      { tag: '00', nilai: '01' },
      { tag: '26', nilai: '0014ID.CO.QRIS.WWW0215ID1024300000000303UMI' },
      { tag: '53', nilai: '360' },
      { tag: '58', nilai: 'ID' },
      { tag: '59', nilai: 'WARUNG BU ANI' },
    ])
    expect(hasil).toBe(TANPA_01)
  })
})

describe('periksaQris', () => {
  it('menerima QRIS yang sah dan menyebut nama merchantnya', () => {
    // Nama merchant ditampilkan ke ibu setelah memindai, supaya dia bisa
    // memastikan yang terbaca memang kodenya sendiri.
    const keterangan = periksaQris(STATIS)
    expect(keterangan.namaMerchant).toBe('WARUNG BU ANI')
    expect(keterangan.kota).toBe('BANDUNG')
    expect(keterangan.statis).toBe(true)
  })

  it('menganggap muatan tanpa tag 01 sebagai statis', () => {
    expect(periksaQris(TANPA_01).statis).toBe(true)
  })

  it('mengenali muatan yang sudah dinamis', () => {
    expect(periksaQris(DINAMIS_15000).statis).toBe(false)
  })

  it('menolak QR yang bukan QRIS', () => {
    // Ibu akan mengarahkan kamera ke apa saja yang berbentuk kotak hitam
    // putih. Tanpa pemeriksaan ini, QR wifi tersimpan sebagai "QRIS
    // usaha" lalu ditunjukkan ke pembeli.
    for (const bukan of [
      'https://wa.me/628123456789',
      'WIFI:S:WarungAni;T:WPA;P:rahasia123;;',
      'halo dunia ini bukan apa-apa',
      '',
    ]) {
      expect(() => periksaQris(bukan), bukan).toThrow(QrisError)
    }
  })

  it('menolak muatan tanpa informasi merchant', () => {
    // Bentuknya TLV yang benar, formatnya QRIS, tapi tidak ada satu pun
    // tag 26–51 — tidak ada yang bisa dibayari.
    const palsu = pasang([
      { tag: '00', nilai: '01' },
      { tag: '01', nilai: '11' },
      { tag: '58', nilai: 'ID' },
    ])
    expect(() => periksaQris(palsu)).toThrow(/bukan kode QRIS/)
  })

  it('membedakan kode rusak dari kode yang bukan QRIS', () => {
    // Bentuknya benar tapi CRC-nya tidak cocok — hampir selalu karena
    // pemindaian meleset, dan pesannya harus menyuruh memindai ulang,
    // bukan menyuruh mencari kode lain.
    const rusak = STATIS.slice(0, -4) + '0000'
    expect(() => periksaQris(rusak)).toThrow(/pindai ulang/)
  })

  it('tidak peduli huruf besar-kecil pada CRC', () => {
    expect(() => periksaQris(STATIS.slice(0, -4) + '1459'.toLowerCase())).not.toThrow()
  })
})

describe('jadikanDinamis', () => {
  it('menghasilkan muatan yang sama dengan hitungan di luar kode ini', () => {
    // Tebakan ini disusun Python, bukan oleh modul yang diujinya.
    expect(jadikanDinamis(STATIS, 15_000)).toBe(DINAMIS_15000)
  })

  it('mengubah penanda jadi sekali pakai', () => {
    const ruas = bongkar(jadikanDinamis(STATIS, 15_000))
    expect(cari(ruas, '01')).toBe('12')
  })

  it('menyisipkan nominal menurut urutan tag, bukan di ujung', () => {
    // Ruas tingkat pertama pada QRIS nyata selalu menaik, dan sebagian
    // aplikasi pembayaran menolak yang tidak.
    const tag = bongkar(jadikanDinamis(STATIS, 15_000)).map((r) => r.tag)
    expect(tag).toEqual([...tag].sort())
    expect(tag.indexOf('54')).toBeGreaterThan(tag.indexOf('53'))
    expect(tag.indexOf('54')).toBeLessThan(tag.indexOf('58'))
  })

  it('menambahkan penanda dinamis kalau muatan aslinya tidak punya', () => {
    // Kode dinamis tanpa penanda dinamis bisa dipindai berkali-kali oleh
    // pembeli yang sama.
    const ruas = bongkar(jadikanDinamis(TANPA_01, 5_000))
    expect(cari(ruas, '01')).toBe('12')
    expect(ruas[0]?.tag).toBe('00')
    expect(ruas[1]?.tag).toBe('01')
  })

  it('menghasilkan muatan yang lolos pemeriksaannya sendiri', () => {
    const hasil = jadikanDinamis(STATIS, 7_500)
    expect(() => periksaQris(hasil)).not.toThrow()
    expect(periksaQris(hasil).statis).toBe(false)
    expect(periksaQris(hasil).namaMerchant).toBe('WARUNG BU ANI')
  })

  it('mengganti nominal lama alih-alih menambah ruas kedua', () => {
    // Dua ruas tag 54 dalam satu muatan membuat aplikasi pembayaran
    // membaca yang mana saja — termasuk yang salah.
    const sekali = jadikanDinamis(STATIS, 15_000)
    const dua = jadikanDinamis(sekali, 20_000)
    const nominal = bongkar(dua).filter((r) => r.tag === '54')

    expect(nominal).toHaveLength(1)
    expect(nominal[0]?.nilai).toBe('20000')
  })

  it('menulis nominal sebagai bilangan bulat tanpa pemisah', () => {
    expect(cari(bongkar(jadikanDinamis(STATIS, 1_250_000)), '54')).toBe('1250000')
  })

  it('menolak nominal yang tidak masuk akal', () => {
    for (const buruk of [0, -1, 1.5, Number.NaN]) {
      expect(() => jadikanDinamis(STATIS, buruk), String(buruk)).toThrow(QrisError)
    }
    // Lebih dari 13 digit tidak muat di ruas nominal EMVCo.
    expect(() => jadikanDinamis(STATIS, 99_999_999_999_999)).toThrow(/terlalu besar/)
  })

  it('menolak muatan yang bukan QRIS sebelum menyentuh nominalnya', () => {
    expect(() => jadikanDinamis('https://contoh.id', 5_000)).toThrow(QrisError)
  })

  it('tidak mengubah data merchant sedikit pun', () => {
    // Yang berubah cuma tiga ruas. Sisanya milik bank penerbit, dan
    // menggesernya berarti uangnya bisa mendarat di tempat lain.
    const asal = bongkar(STATIS)
    const jadi = bongkar(jadikanDinamis(STATIS, 15_000))
    const bolehBerubah = new Set(['01', '54', '63'])

    for (const r of asal) {
      if (bolehBerubah.has(r.tag)) continue
      expect(cari(jadi, r.tag), `tag ${r.tag} berubah`).toBe(r.nilai)
    }
  })
})
