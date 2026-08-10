import { chunk, encodeReceipt, type PrintOptions } from './escpos'

/**
 * Mengirim struk ke printer termal lewat Web Bluetooth.
 *
 * Sengaja setipis mungkin. Semua yang bisa salah dalam menyusun struk
 * sudah selesai di `escpos.ts` dan diuji di sana; yang tersisa di sini
 * cuma urusan perangkat, dan urusan perangkat tidak bisa diuji tanpa
 * printer sungguhan.
 *
 * Dua hal yang menentukan bentuknya:
 *
 * **1. Pemilihan printer harus lahir dari ketukan pengguna.** Peramban
 * hanya membuka dialognya kalau dipanggil langsung dari sebuah gestur.
 * Karena itu tidak ada penyambungan otomatis di latar; tombol Cetak yang
 * memulainya.
 *
 * **2. Gagal mencetak bukan gagal menyimpan.** Penjualannya sudah tercatat
 * jauh sebelum tombol Cetak disentuh. Printer mati, Bluetooth mati, atau
 * peramban yang tidak mendukung sama sekali — semuanya berakhir sebagai
 * pesan yang bisa dimengerti, bukan sebagai transaksi yang hilang.
 */

/**
 * Layanan serial-over-BLE yang dipakai hampir semua printer termal murah
 * bermerek RPP/GOOJPRT/XPrinter. Dua UUID karena ada dua keluarga papan
 * yang beredar, dan tidak ada cara mengetahui yang mana sebelum mencoba.
 */
const SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '0000ff00-0000-1000-8000-00805f9b34fb',
] as const

/**
 * Paket 20 bita: MTU bawaan BLE sebelum dinegosiasikan. Printer murah
 * jarang menegosiasikannya, dan paket yang kebesaran membuat separuh
 * struk tercetak lalu berhenti di tengah baris.
 */
const MTU = 20

/** Jeda antar paket. Tanpa ini penyangga printer penuh dan bita hilang. */
const JEDA_MS = 20

export class PrinterError extends Error {
  constructor(
    message: string,
    /** `true` kalau mencoba lagi masuk akal. */
    readonly bisaDiulang = true,
  ) {
    super(message)
    this.name = 'PrinterError'
  }
}

export function bluetoothTersedia(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'bluetooth' in navigator &&
    typeof (navigator as Navigator & { bluetooth?: unknown }).bluetooth === 'object'
  )
}

// Bentuk seperlunya dari Web Bluetooth. Ditulis tangan, bukan diambil
// dari `@types/web-bluetooth`, supaya tidak menambah dependensi hanya
// untuk empat metode — dan supaya bagian yang dipakai terbaca di sini.
interface Karakteristik {
  readonly properties: {
    readonly write: boolean
    readonly writeWithoutResponse: boolean
  }
  writeValueWithoutResponse?(value: Uint8Array): Promise<void>
  writeValue(value: Uint8Array): Promise<void>
}

interface Layanan {
  getCharacteristics(): Promise<readonly Karakteristik[]>
}

interface Server {
  getPrimaryService(uuid: string): Promise<Layanan>
}

interface Gatt {
  connect(): Promise<Server>
  disconnect(): void
}

interface BluetoothLike {
  requestDevice(options: unknown): Promise<{
    readonly name?: string
    readonly gatt?: Gatt
  }>
}

const tidur = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Membuka dialog pemilihan printer lalu mencetak.
 *
 * Harus dipanggil langsung dari penanganan ketukan — peramban menolak
 * membuka dialognya kalau tidak.
 */
export async function cetakStruk(
  teks: string,
  options: PrintOptions = {},
): Promise<{ readonly namaPrinter: string }> {
  if (!bluetoothTersedia()) {
    throw new PrinterError(
      'Peramban ini belum bisa mencetak lewat Bluetooth. Buka lewat Chrome di Android, ' +
        'atau bagikan struknya lewat WhatsApp.',
      false,
    )
  }

  const bt = (navigator as unknown as { bluetooth: BluetoothLike }).bluetooth

  let device
  try {
    device = await bt.requestDevice({
      // Menampilkan semua perangkat, bukan hanya yang menyiarkan layanan
      // printernya: banyak printer murah tidak menyiarkan UUID apa pun
      // sampai tersambung, jadi penyaringan justru membuat daftarnya
      // kosong dan pemiliknya mengira printernya tidak terdeteksi.
      acceptAllDevices: true,
      optionalServices: [...SERVICES],
    })
  } catch {
    // Termasuk saat pengguna menutup dialognya — itu bukan galat.
    throw new PrinterError('Tidak ada printer yang dipilih.')
  }

  const gatt = device.gatt
  if (!gatt) throw new PrinterError('Printer ini tidak bisa disambungkan.')

  const server = await gatt.connect().catch(() => {
    throw new PrinterError('Gagal menyambung. Pastikan printernya menyala dan dekat.')
  })

  try {
    let tulis: ((v: Uint8Array) => Promise<void>) | null = null

    for (const uuid of SERVICES) {
      try {
        const service = await server.getPrimaryService(uuid)
        for (const c of await service.getCharacteristics()) {
          if (c.properties.writeWithoutResponse && c.writeValueWithoutResponse) {
            tulis = (v) => c.writeValueWithoutResponse!(v)
            break
          }
          if (c.properties.write) {
            tulis = (v) => c.writeValue(v)
            break
          }
        }
      } catch {
        // Layanan ini tidak ada di papan tersebut; coba yang berikutnya.
      }
      if (tulis) break
    }

    if (!tulis) {
      throw new PrinterError(
        'Perangkat ini tersambung tapi bukan printer struk.',
        false,
      )
    }

    const paket = chunk(encodeReceipt(teks, options), MTU)
    for (const p of paket) {
      await tulis(p)
      await tidur(JEDA_MS)
    }

    return { namaPrinter: device.name ?? 'Printer' }
  } finally {
    // Selalu diputus, juga saat gagal di tengah: sambungan yang
    // menggantung membuat percobaan berikutnya tidak menemukan
    // printernya sama sekali.
    try {
      gatt.disconnect()
    } catch {
      // Sudah terputus sendiri.
    }
  }
}
