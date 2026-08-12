import QRCode from 'qrcode'
import { jadikanDinamis } from './payload'

/**
 * Menggambar QR di layar.
 *
 * **SVG, bukan PNG.** Layar HP punya kerapatan piksel yang berbeda-beda,
 * dan QR yang digambar sebagai piksel lalu direntangkan jadi kabur di
 * tepinya — persis bagian yang dibaca kamera pembeli. SVG tajam di
 * ukuran berapa pun, dan berkasnya justru lebih kecil.
 *
 * **Tingkat koreksi galat `M`, bukan `H`.** Semakin tinggi koreksinya,
 * semakin padat kotaknya, dan QR padat di layar HP kecil justru lebih
 * susah dipindai. `M` adalah yang lazim dipakai QRIS cetak, dan layar
 * tidak menghadapi masalah yang dihadapi stiker: tidak ada tinta yang
 * pudar dan tidak ada permukaan yang tergores.
 */

/**
 * `margin: 4` adalah **zona sunyi** yang diwajibkan spesifikasi QR:
 * empat modul putih mengelilingi kode, supaya pemindai bisa menemukan
 * batasnya. Bukan hiasan, dan bukan pula sesuatu yang kegagalannya
 * kentara: kode berzona sempit masih terbaca di keadaan ideal, lalu
 * mulai rewel saat kertasnya miring atau lampunya kurang. Kesulitan
 * seperti itu muncul sebagai "kameranya lama", bukan sebagai bug yang
 * dilaporkan siapa pun.
 */
const OPSI = {
  errorCorrectionLevel: 'M',
  margin: 4,
  color: { dark: '#0f172a', light: '#ffffff' },
} as const

/** Muatan apa adanya → markah SVG. */
export async function gambarQr(muatan: string): Promise<string> {
  return QRCode.toString(muatan, { ...OPSI, type: 'svg' })
}

/**
 * Menggambar QRIS dengan nominal sudah terisi.
 *
 * Kalau penyisipan nominalnya gagal — muatan yang tidak dikenali,
 * nominal di luar batas — kodenya **tetap digambar apa adanya** dan
 * penelepon diberi tahu lewat `dinamis: false`. Menolak menggambar sama
 * sekali berarti pembeli yang sudah berdiri di depan meja tidak bisa
 * membayar; QRIS statis yang nominalnya diketik sendiri jauh lebih baik
 * daripada layar galat.
 */
export async function gambarQris(
  muatan: string,
  nominal: number,
): Promise<{ readonly svg: string; readonly dinamis: boolean }> {
  try {
    return { svg: await gambarQr(jadikanDinamis(muatan, nominal)), dinamis: true }
  } catch {
    return { svg: await gambarQr(muatan), dinamis: false }
  }
}
