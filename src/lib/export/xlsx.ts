/**
 * Penyandi berkas `.xlsx`, tanpa pustaka.
 *
 * Kenapa ditulis sendiri padahal pustakanya banyak: yang dibutuhkan di
 * sini cuma tabel datar dengan baris judul tebal. `exceljs` membawa lebih
 * dari satu megabita untuk itu, dan aplikasi ini dipakai di HP murah
 * dengan kuota yang dihitung. Ekspor dipakai sebulan sekali; kasir dibuka
 * puluhan kali sehari. Yang jarang tidak boleh membebani yang sering.
 *
 * `.xlsx` sebenarnya berkas ZIP berisi beberapa XML. Entrinya ditulis
 * **tanpa kompresi** (metode `stored`), jadi tidak ada deflate yang perlu
 * ditulis sendiri — cuma CRC-32 dan susunan header ZIP. Berkasnya jadi
 * lebih besar, tapi untuk beberapa ribu baris ukurannya masih puluhan
 * kilobita.
 *
 * Diperiksa dengan LibreOffice sungguhan, bukan cuma dengan tes buatan
 * sendiri: berkas yang lolos tes sendiri tapi ditolak aplikasi
 * spreadsheet adalah kegagalan yang paling mudah tidak disadari, dan
 * pemiliknya baru tahu saat dia benar-benar membutuhkan datanya.
 */

export type Sel = string | number | null

export interface Lembar {
  /** Nama tab. Dipangkas dan dibersihkan sesuai aturan Excel. */
  readonly nama: string
  /** Baris pertama dipakai sebagai judul dan ditebalkan. */
  readonly baris: readonly (readonly Sel[])[]
  /** Lebar kolom dalam satuan karakter. Boleh lebih pendek dari barisnya. */
  readonly lebar?: readonly number[]
}

// ── CRC-32 ──────────────────────────────────────────────────────────────

const TABEL_CRC = (() => {
  const tabel = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    tabel[i] = c >>> 0
  }
  return tabel
})()

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    c = TABEL_CRC[(c ^ (data[i] ?? 0)) & 0xff]! ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

// ── ZIP ─────────────────────────────────────────────────────────────────

interface Entri {
  readonly nama: string
  readonly data: Uint8Array
}

/**
 * Waktu tetap untuk semua entri.
 *
 * Bukan waktu sekarang, supaya isi yang sama selalu menghasilkan berkas
 * yang sama persis — kalau tidak, tidak ada cara membandingkan dua hasil
 * ekspor selain membukanya satu per satu. 1 Januari 2020, 00.00, dalam
 * penyandian tanggal DOS yang dipakai format ZIP.
 */
const TANGGAL_DOS = ((2020 - 1980) << 9) | (1 << 5) | 1
const WAKTU_DOS = 0

function tulis(bagian: readonly (Uint8Array | number[])[]): Uint8Array {
  const total = bagian.reduce((n, b) => n + b.length, 0)
  const keluar = new Uint8Array(total)
  let pos = 0
  for (const b of bagian) {
    keluar.set(b instanceof Uint8Array ? b : Uint8Array.from(b), pos)
    pos += b.length
  }
  return keluar
}

const u16 = (n: number): number[] => [n & 0xff, (n >>> 8) & 0xff]
const u32 = (n: number): number[] => [
  n & 0xff,
  (n >>> 8) & 0xff,
  (n >>> 16) & 0xff,
  (n >>> 24) & 0xff,
]

/** Bendera bit 11: nama entri disandikan UTF-8. */
const BENDERA_UTF8 = 0x0800

export function zip(entri: readonly Entri[]): Uint8Array {
  const penyandi = new TextEncoder()
  const lokal: Uint8Array[] = []
  const pusat: Uint8Array[] = []
  let offset = 0

  for (const e of entri) {
    const nama = penyandi.encode(e.nama)
    const crc = crc32(e.data)
    const n = e.data.length

    const header = tulis([
      u32(0x04034b50),
      u16(20), // versi minimum
      u16(BENDERA_UTF8),
      u16(0), // metode: stored
      u16(WAKTU_DOS),
      u16(TANGGAL_DOS),
      u32(crc),
      u32(n), // ukuran terkompresi
      u32(n), // ukuran asli
      u16(nama.length),
      u16(0), // panjang bidang tambahan
      nama,
    ])

    lokal.push(header, e.data)

    pusat.push(
      tulis([
        u32(0x02014b50),
        u16(20), // versi pembuat
        u16(20), // versi minimum
        u16(BENDERA_UTF8),
        u16(0),
        u16(WAKTU_DOS),
        u16(TANGGAL_DOS),
        u32(crc),
        u32(n),
        u32(n),
        u16(nama.length),
        u16(0), // tambahan
        u16(0), // komentar
        u16(0), // nomor cakram
        u16(0), // atribut internal
        u32(0), // atribut eksternal
        u32(offset),
        nama,
      ]),
    )

    offset += header.length + n
  }

  const isiPusat = tulis(pusat)
  const akhir = tulis([
    u32(0x06054b50),
    u16(0), // nomor cakram
    u16(0), // cakram tempat direktori pusat
    u16(entri.length),
    u16(entri.length),
    u32(isiPusat.length),
    u32(offset),
    u16(0), // panjang komentar
  ])

  return tulis([...lokal, isiPusat, akhir])
}

// ── XML ─────────────────────────────────────────────────────────────────

/**
 * Menyandikan teks untuk XML.
 *
 * Aksara kendali dibuang, bukan dilarikan: XML 1.0 memang tidak
 * mengizinkannya sama sekali, dan satu aksara nyasar dari tempelan nama
 * barang membuat seluruh berkas ditolak dibuka. Tab, ganti baris, dan
 * pindah baris tetap dipertahankan.
 */
export function xmlAman(teks: string): string {
  return teks
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** `0` → `A`, `25` → `Z`, `26` → `AA`. */
export function namaKolom(index: number): string {
  let n = index
  let nama = ''
  do {
    nama = String.fromCharCode(65 + (n % 26)) + nama
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return nama
}

/**
 * Membersihkan nama tab.
 *
 * Excel menolak `[ ] : * ? / \` dan nama yang lebih dari 31 aksara, dan
 * penolakannya berupa berkas rusak — bukan pesan yang menjelaskan.
 */
export function namaLembarAman(nama: string, cadangan = 'Lembar'): string {
  const bersih = nama.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31)
  return bersih.length > 0 ? bersih : cadangan
}

function selXml(nilai: Sel, ref: string, tebal: boolean): string {
  const gaya = tebal ? ' s="1"' : ''

  if (nilai === null || nilai === '') return ''

  if (typeof nilai === 'number') {
    // Angka yang tidak terhingga tidak punya wakil di SpreadsheetML;
    // menuliskannya membuat berkasnya gagal dibuka, jadi diturunkan jadi
    // teks agar isinya tetap terlihat.
    if (Number.isFinite(nilai)) {
      return `<c r="${ref}"${gaya}><v>${nilai}</v></c>`
    }
    return `<c r="${ref}"${gaya} t="inlineStr"><is><t>${xmlAman(String(nilai))}</t></is></c>`
  }

  // `xml:space="preserve"` supaya spasi di awal/akhir tidak dibuang —
  // nama barang yang ditempel dari tempat lain sering membawanya.
  return (
    `<c r="${ref}"${gaya} t="inlineStr">` +
    `<is><t xml:space="preserve">${xmlAman(nilai)}</t></is></c>`
  )
}

function lembarXml(lembar: Lembar): string {
  const kolom = (lembar.lebar ?? [])
    .map(
      (w, i) =>
        `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`,
    )
    .join('')

  const baris = lembar.baris
    .map((isi, r) => {
      const sel = isi
        .map((nilai, c) => selXml(nilai, `${namaKolom(c)}${r + 1}`, r === 0))
        .join('')
      return `<row r="${r + 1}">${sel}</row>`
    })
    .join('')

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    (kolom ? `<cols>${kolom}</cols>` : '') +
    `<sheetData>${baris}</sheetData>` +
    '</worksheet>'
  )
}

/**
 * Gaya paling sedikit yang masih diterima: satu huruf biasa dan satu
 * tebal. Dua isian dan yang kedua `gray125` bukan pilihan gaya melainkan
 * syarat — Excel menolak berkas yang isian bawaannya kurang dari itu.
 */
const STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="2">' +
  '<font><sz val="11"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
  '</fonts>' +
  '<fills count="2">' +
  '<fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  '</fills>' +
  '<borders count="1"><border/></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="2">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '</cellXfs>' +
  // Gaya bernama "Normal" wajib ada. Tanpanya berkasnya masih terbaca,
  // tapi pembacanya memakai gaya bawaannya sendiri — dan pembaca yang
  // menambal kekurangan diam-diam adalah pembaca yang sedang memaafkan
  // berkas cacat. Excel tidak selalu semurah hati itu.
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>'

/**
 * Nama tab harus unik di dalam satu buku; kalau tidak, berkasnya rusak
 * tanpa penjelasan. Bentrokan bisa lahir dari pemangkasan 31 aksara,
 * bukan cuma dari nama yang memang sama.
 */
function namaUnik(lembar: readonly Lembar[]): string[] {
  const terpakai = new Set<string>()
  return lembar.map((l, i) => {
    const dasar = namaLembarAman(l.nama, `Lembar${i + 1}`)
    let nama = dasar
    let n = 2
    while (terpakai.has(nama.toLowerCase())) {
      const akhiran = ` (${n++})`
      nama = dasar.slice(0, 31 - akhiran.length) + akhiran
    }
    terpakai.add(nama.toLowerCase())
    return nama
  })
}

export function buatXlsx(lembar: readonly Lembar[]): Uint8Array {
  if (lembar.length === 0) {
    throw new Error('Berkas Excel harus punya sedikitnya satu lembar')
  }

  const penyandi = new TextEncoder()
  const nama = namaUnik(lembar)
  const b = (teks: string): Uint8Array => penyandi.encode(teks)

  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    lembar
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ` +
          'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>',
      )
      .join('') +
    '</Types>'

  const rels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" ' +
    'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" ' +
    'Target="xl/workbook.xml"/>' +
    '</Relationships>'

  const workbook =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets>' +
    nama
      .map(
        (n, i) =>
          `<sheet name="${xmlAman(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
      )
      .join('') +
    '</sheets></workbook>'

  const workbookRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    lembar
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" ` +
          'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ' +
          `Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join('') +
    `<Relationship Id="rId${lembar.length + 1}" ` +
    'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" ' +
    'Target="styles.xml"/>' +
    '</Relationships>'

  return zip([
    { nama: '[Content_Types].xml', data: b(contentTypes) },
    { nama: '_rels/.rels', data: b(rels) },
    { nama: 'xl/workbook.xml', data: b(workbook) },
    { nama: 'xl/_rels/workbook.xml.rels', data: b(workbookRels) },
    { nama: 'xl/styles.xml', data: b(STYLES_XML) },
    ...lembar.map((l, i) => ({
      nama: `xl/worksheets/sheet${i + 1}.xml`,
      data: b(lembarXml(l)),
    })),
  ])
}

export const TIPE_XLSX =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
