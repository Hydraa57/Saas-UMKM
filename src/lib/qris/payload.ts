/**
 * Muatan QRIS.
 *
 * QRIS mengikuti *EMV QR Code Specification for Payment Systems*: isinya
 * bukan URL melainkan rentetan **TLV** — tiap ruas berupa dua digit tag,
 * dua digit panjang, lalu isinya sepanjang itu. Empat digit terakhir
 * selalu CRC.
 *
 * ```
 *   00 02 01        format
 *   01 02 11        11 = statis (dipakai berulang), 12 = dinamis (sekali)
 *   26 …            informasi merchant
 *   54 05 15000     nominal — pada QRIS statis ruas ini tidak ada
 *   58 02 ID        negara
 *   59 …            nama merchant
 *   63 04 A1B2      CRC-16 atas seluruh muatan termasuk "6304"
 * ```
 *
 * **Kenapa ini ada, dan kenapa gratis.** QRIS dinamis biasanya dibeli
 * dari penyedia jasa pembayaran lewat API berbayar, dan itu menuntut
 * badan usaha terdaftar plus potongan tiap transaksi. Padahal ibu sudah
 * punya QRIS statis dari banknya — yang tertempel di dinding. Nominalnya
 * bisa disisipkan ke muatan itu **di HP, tanpa jaringan, tanpa biaya**:
 * ubah tag 01 jadi `12`, sisipkan tag 54, hitung ulang CRC-nya.
 *
 * Yang didapat: pembeli tidak perlu mengetik nominal, jadi tidak ada lagi
 * salah ketik dan kurang bayar — dua hal yang di warung diselesaikan
 * dengan berdebat.
 *
 * **Yang tidak bisa dilakukan, dan tidak boleh dipura-purakan.** Tidak
 * ada jalur balik dari bank ke aplikasi ini, jadi aplikasi **tidak pernah
 * tahu** uangnya sudah masuk. Yang tahu cuma ibu, dari notifikasi
 * banknya sendiri. Karena itu penjualannya baru tercatat setelah ibu
 * menekan tombol konfirmasi — bukan otomatis begitu QR-nya tampil.
 */

export interface RuasTlv {
  readonly tag: string
  readonly nilai: string
}

export class QrisError extends Error {}

// ── CRC-16/CCITT-FALSE ──────────────────────────────────────────────────

/**
 * Polinomial 0x1021, nilai awal 0xFFFF, tanpa pembalikan bit dan tanpa
 * XOR akhir. Ini yang dipakai EMVCo, dan bukan satu-satunya CRC-16 yang
 * ada — memilih varian yang salah menghasilkan kode yang ditolak semua
 * aplikasi pembayaran tanpa petunjuk apa pun tentang sebabnya.
 */
export function crc16(teks: string): number {
  let crc = 0xffff
  for (let i = 0; i < teks.length; i++) {
    crc ^= (teks.charCodeAt(i) & 0xff) << 8
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc & 0xffff
}

const hexCrc = (n: number): string => n.toString(16).toUpperCase().padStart(4, '0')

// ── Bongkar & pasang ────────────────────────────────────────────────────

const TAG_FORMAT = '00'
const TAG_METODE = '01'
const TAG_NOMINAL = '54'
const TAG_NEGARA = '58'
const TAG_NAMA = '59'
const TAG_KOTA = '60'
const TAG_CRC = '63'

const STATIS = '11'
const DINAMIS = '12'

/**
 * Membongkar muatan jadi ruas-ruas tingkat pertama.
 *
 * Tidak masuk ke sub-ruas di dalam tag 26–51 dan 62: yang perlu diubah
 * semuanya ada di tingkat pertama, dan membongkar lebih dalam berarti
 * menyusunnya kembali dengan risiko mengubah sesuatu yang tidak dipahami.
 * Muatan milik orang lain sebaiknya disentuh sesedikit mungkin.
 */
export function bongkar(muatan: string): readonly RuasTlv[] {
  const ruas: RuasTlv[] = []
  let i = 0

  while (i < muatan.length) {
    if (i + 4 > muatan.length) {
      throw new QrisError('Kode ini terpotong di tengah — coba pindai ulang.')
    }
    const tag = muatan.slice(i, i + 2)
    const panjang = Number(muatan.slice(i + 2, i + 4))
    if (!/^\d{2}$/.test(tag) || !Number.isInteger(panjang)) {
      throw new QrisError('Ini bukan kode QRIS.')
    }
    const mulai = i + 4
    const akhir = mulai + panjang
    if (akhir > muatan.length) {
      throw new QrisError('Kode ini terpotong di tengah — coba pindai ulang.')
    }
    ruas.push({ tag, nilai: muatan.slice(mulai, akhir) })
    i = akhir
  }

  return ruas
}

const tlv = (tag: string, nilai: string): string =>
  tag + String(nilai.length).padStart(2, '0') + nilai

/** Menyusun ulang ruas jadi muatan, dengan CRC dihitung ulang di akhir. */
export function pasang(ruas: readonly RuasTlv[]): string {
  const tanpaCrc = ruas
    .filter((r) => r.tag !== TAG_CRC)
    .map((r) => tlv(r.tag, r.nilai))
    .join('')

  // CRC dihitung atas muatan **termasuk** "6304" — tag dan panjangnya
  // ikut, isinya belum. Ini jebakan paling sering pada penerapan QRIS.
  const dasar = `${tanpaCrc}${TAG_CRC}04`
  return dasar + hexCrc(crc16(dasar))
}

export const cari = (ruas: readonly RuasTlv[], tag: string): string | null =>
  ruas.find((r) => r.tag === tag)?.nilai ?? null

// ── Pemeriksaan ─────────────────────────────────────────────────────────

export interface KeteranganQris {
  readonly namaMerchant: string | null
  readonly kota: string | null
  readonly statis: boolean
}

/**
 * Memastikan yang dipindai benar-benar QRIS, bukan QR lain.
 *
 * Ibu akan mengarahkan kamera ke apa saja yang berbentuk kotak hitam
 * putih. QR wifi, tautan promo, dan barcode belanjaan semuanya terbaca
 * sebagai teks — dan tanpa pemeriksaan ini, salah satunya akan tersimpan
 * sebagai "QRIS usaha" lalu ditunjukkan ke pembeli.
 */
export function periksaQris(muatan: string): KeteranganQris {
  const bersih = muatan.trim()
  if (bersih.length < 20) throw new QrisError('Ini bukan kode QRIS.')

  const ruas = bongkar(bersih)

  if (cari(ruas, TAG_FORMAT) !== '01') {
    throw new QrisError('Ini bukan kode QRIS.')
  }

  // Tag 26–51 memuat identitas merchant di jaringan pembayaran. QRIS
  // tanpa satu pun di antaranya bukan kode yang bisa dibayari.
  const punyaMerchant = ruas.some((r) => {
    const n = Number(r.tag)
    return n >= 26 && n <= 51
  })
  if (!punyaMerchant) throw new QrisError('Ini bukan kode QRIS.')

  const crcTersimpan = cari(ruas, TAG_CRC)
  if (!crcTersimpan) throw new QrisError('Ini bukan kode QRIS.')

  const potong = bersih.lastIndexOf(`${TAG_CRC}04`)
  const dihitung = hexCrc(crc16(bersih.slice(0, potong + 4)))
  if (dihitung !== crcTersimpan.toUpperCase()) {
    // Bukan "bukan QRIS": bentuknya benar tapi isinya rusak, dan
    // penyebab paling sering adalah pemindaian yang meleset.
    throw new QrisError('Kode QRIS-nya terbaca rusak. Coba pindai ulang.')
  }

  return {
    namaMerchant: cari(ruas, TAG_NAMA),
    kota: cari(ruas, TAG_KOTA),
    statis: (cari(ruas, TAG_METODE) ?? STATIS) === STATIS,
  }
}

// ── Statis → dinamis ────────────────────────────────────────────────────

/** Batas panjang ruas nominal menurut spesifikasi EMVCo. */
const MAKS_DIGIT_NOMINAL = 13

/**
 * Menyisipkan nominal ke muatan QRIS statis.
 *
 * Tiga perubahan, dan ketiganya wajib bersamaan:
 *
 * 1. tag 01 jadi `12`, menandai kode ini sekali pakai;
 * 2. tag 54 berisi nominal, disisipkan **menurut urutan tag** — ruas
 *    tingkat pertama pada QRIS nyata selalu menaik, dan sebagian aplikasi
 *    pembayaran menolak yang tidak;
 * 3. CRC dihitung ulang. Tanpa langkah ini, kodenya ditolak seluruh
 *    aplikasi pembayaran — dan itu justru kegagalan yang paling ramah,
 *    karena ketahuan seketika di depan pembeli alih-alih diam-diam.
 *
 * Nominal ditulis sebagai bilangan bulat rupiah tanpa pemisah ribuan dan
 * tanpa desimal. Rupiah memang tidak punya pecahan yang dipakai, dan
 * menambahkan `.00` cuma memperbesar QR-nya tanpa menambah arti.
 */
export function jadikanDinamis(muatan: string, nominal: number): string {
  if (!Number.isInteger(nominal) || nominal <= 0) {
    throw new QrisError('Nominal harus bilangan bulat lebih dari nol.')
  }
  const angka = String(nominal)
  if (angka.length > MAKS_DIGIT_NOMINAL) {
    throw new QrisError('Nominalnya terlalu besar untuk QRIS.')
  }

  periksaQris(muatan)
  const ruas = bongkar(muatan.trim())

  const tanpaNominal = ruas.filter(
    (r) => r.tag !== TAG_NOMINAL && r.tag !== TAG_CRC,
  )
  const baru: RuasTlv[] = tanpaNominal.map((r) =>
    r.tag === TAG_METODE ? { tag: TAG_METODE, nilai: DINAMIS } : r,
  )

  // Kalau muatan aslinya tidak punya tag 01 sama sekali — sah menurut
  // spesifikasi, artinya statis — ruasnya ditambahkan tepat setelah
  // format, bukan dibiarkan hilang. Kode dinamis tanpa penanda dinamis
  // bisa dipindai berkali-kali oleh pembeli yang sama.
  if (!baru.some((r) => r.tag === TAG_METODE)) {
    const posisiFormat = baru.findIndex((r) => r.tag === TAG_FORMAT)
    baru.splice(posisiFormat + 1, 0, { tag: TAG_METODE, nilai: DINAMIS })
  }

  const sisip = baru.findIndex((r) => r.tag > TAG_NOMINAL)
  const ruasNominal: RuasTlv = { tag: TAG_NOMINAL, nilai: angka }
  if (sisip < 0) baru.push(ruasNominal)
  else baru.splice(sisip, 0, ruasNominal)

  return pasang(baru)
}

/** Ruas negara, untuk menampilkan asal kode. Nyaris selalu `ID`. */
export const negaraDari = (muatan: string): string | null =>
  cari(bongkar(muatan.trim()), TAG_NEGARA)
