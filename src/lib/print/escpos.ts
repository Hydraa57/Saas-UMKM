/**
 * Penyandi ESC/POS.
 *
 * Satu aturan yang membentuk seluruh berkas ini:
 *
 * > **Yang dicetak adalah teks yang sama persis dengan yang dilihat dan
 * > yang dikirim ke WhatsApp.**
 *
 * Karena itu fungsi di sini menerima **string**, bukan `Sale`. Kalau ia
 * menerima `Sale` dan menyusun sendiri barisnya, akan ada dua tempat yang
 * harus dijaga tetap sepadan — dan struk yang berbeda antara yang
 * dibagikan dan yang dicetak adalah persis jenis selisih yang membuat
 * pembeli curiga. Di sini tidak ada tempat kedua: `renderReceipt`
 * menghasilkan teksnya, berkas ini hanya membungkusnya jadi bita.
 *
 * Semua murni — tidak menyentuh Bluetooth, jaringan, maupun jam. Yang
 * berurusan dengan perangkat ada di `bluetooth.ts`.
 */

// Perintah ESC/POS yang dipakai. Sengaja sedikit: makin banyak perintah,
// makin besar kemungkinan salah satu tidak dikenali printer murah.
const ESC = 0x1b
const GS = 0x1d
const LF = 0x0a

export const CMD = {
  /** ESC @ — kembalikan printer ke keadaan awal. */
  init: [ESC, 0x40],
  alignLeft: [ESC, 0x61, 0],
  alignCenter: [ESC, 0x61, 1],
  boldOn: [ESC, 0x45, 1],
  boldOff: [ESC, 0x45, 0],
  /** GS V 66 0 — potong kertas, sisakan sedikit umpan. */
  cut: [GS, 0x56, 66, 0],
} as const

/**
 * Huruf beraksen diratakan ke ASCII sebelum dikirim.
 *
 * Printer termal murah beredar dengan halaman kode yang berbeda-beda dan
 * jarang menyebutkannya di mana pun. Satu-satunya yang semuanya sepakati
 * adalah ASCII. "Café" yang tercetak jadi "Caf?" masih terbaca; "Café"
 * yang tercetak jadi "CafÚ" membuat pemiliknya mengira printernya rusak.
 *
 * Bahasa Indonesia hampir seluruhnya ASCII, jadi yang terkena praktis
 * cuma nama usaha yang memakai huruf asing.
 */
export function toAscii(text: string): string {
  return (
    text
      // Memisahkan huruf dari tanda aksennya, lalu membuang tandanya.
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      // Tanda baca "pintar" yang sering ikut tersalin dari papan ketik HP.
      .replace(/[‘’‛]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—]/g, '-')
      .replace(/…/g, '...')
      .replace(/·/g, '-')
      .replace(/ /g, ' ')
      // Sisanya diganti tanda tanya, bukan dibuang: baris yang menyusut
      // merusak perataan kolom nominal, dan kolom nominal yang meleset
      // adalah hal pertama yang dilihat pembeli.
      .replace(/[^\x20-\x7e\n]/g, '?')
  )
}

export interface PrintOptions {
  /** Baris kosong sebelum potong, supaya sobekannya tidak memakan teks. */
  readonly feedLines?: number
  /** Kirim perintah potong. Banyak printer murah tidak punya pemotong. */
  readonly cut?: boolean
}

const DEFAULT_FEED = 4

/**
 * Teks struk → bita ESC/POS.
 *
 * Umpan baris di akhir bukan hiasan: tanpa itu baris terakhir berhenti di
 * dalam badan printer dan baru terbaca setelah struk berikutnya dicetak.
 */
export function encodeReceipt(
  text: string,
  options: PrintOptions = {},
): Uint8Array {
  const feed = options.feedLines ?? DEFAULT_FEED
  const bytes: number[] = [...CMD.init, ...CMD.alignLeft]

  const ascii = toAscii(text)
  for (let i = 0; i < ascii.length; i++) {
    const code = ascii.charCodeAt(i)
    bytes.push(code === 0x0a ? LF : code)
  }

  // Struk selalu diakhiri baris baru sendiri, supaya umpan di bawah tidak
  // menyambung ke baris terakhir yang belum ditutup.
  if (!ascii.endsWith('\n')) bytes.push(LF)
  for (let i = 0; i < feed; i++) bytes.push(LF)

  if (options.cut) bytes.push(...CMD.cut)

  return new Uint8Array(bytes)
}

/**
 * Memotong data jadi paket sebesar MTU.
 *
 * BLE mengirim dalam paket kecil — 20 bita kalau MTU-nya tidak
 * dinegosiasikan, yang lazim pada printer murah. Mengirim seluruh struk
 * sekaligus membuat panggilan tulisnya ditolak, atau lebih buruk:
 * separuh struk tercetak lalu berhenti di tengah baris.
 */
export function chunk(data: Uint8Array, size: number): readonly Uint8Array[] {
  if (size <= 0) throw new Error('Ukuran paket harus lebih dari nol')
  const out: Uint8Array[] = []
  for (let i = 0; i < data.length; i += size) {
    out.push(data.subarray(i, Math.min(i + size, data.length)))
  }
  return out
}
