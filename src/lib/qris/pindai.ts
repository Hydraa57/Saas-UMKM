/**
 * Membaca kode QR dari kamera atau dari berkas gambar.
 *
 * Dua jalan, dan urutannya disengaja:
 *
 * 1. **`BarcodeDetector`**, bawaan peramban. Nol bita tambahan, dan
 *    dikerjakan oleh kode asli sistem — jauh lebih cepat di HP murah,
 *    yang justru HP yang dipakai. Tersedia di Chrome Android, dan itu
 *    persis sasarannya.
 * 2. **`jsqr`**, kalau yang pertama tidak ada. Sekitar 60 kB, dimuat
 *    hanya saat dibutuhkan, jadi yang HP-nya sudah mendukung tidak ikut
 *    membayarnya.
 *
 * Memindai cuma dilakukan sekali, saat memasang QRIS usaha — bukan tiap
 * transaksi. Karena itu seluruh berkas ini boleh dimuat belakangan.
 */

interface PendeteksiBawaan {
  detect(sumber: CanvasImageSource): Promise<{ rawValue: string }[]>
}

interface JendelaDenganPendeteksi {
  BarcodeDetector?: new (opsi: { formats: string[] }) => PendeteksiBawaan
}

function pendeteksiBawaan(): PendeteksiBawaan | null {
  if (typeof window === 'undefined') return null
  const Kelas = (window as unknown as JendelaDenganPendeteksi).BarcodeDetector
  if (!Kelas) return null
  try {
    return new Kelas({ formats: ['qr_code'] })
  } catch {
    return null
  }
}

/**
 * Membaca satu bingkai.
 *
 * Mengembalikan `null` kalau tidak ada QR di bingkai itu — bukan galat.
 * Sebagian besar bingkai memang kosong: kameranya sedang diarahkan.
 */
export async function bacaBingkai(
  kanvas: HTMLCanvasElement,
): Promise<string | null> {
  const bawaan = pendeteksiBawaan()
  if (bawaan) {
    try {
      const hasil = await bawaan.detect(kanvas)
      return hasil[0]?.rawValue ?? null
    } catch {
      // Sebagian peramban punya kelasnya tapi gagal saat dipakai.
      // Turun ke jalan kedua alih-alih menyerah.
    }
  }

  const konteks = kanvas.getContext('2d', { willReadFrequently: true })
  if (!konteks) return null
  const gambar = konteks.getImageData(0, 0, kanvas.width, kanvas.height)

  const { default: jsQR } = await import('jsqr')
  const kode = jsQR(gambar.data, gambar.width, gambar.height, {
    // Stiker QRIS dicetak gelap di atas putih. Membatasi ke satu arah
    // membuat pembacaannya jauh lebih cepat pada HP lambat.
    inversionAttempts: 'dontInvert',
  })
  return kode?.data ?? null
}

/** Menyalin bingkai video ke kanvas, mengembalikan `false` kalau belum siap. */
export function salinBingkai(
  video: HTMLVideoElement,
  kanvas: HTMLCanvasElement,
): boolean {
  if (video.readyState < video.HAVE_CURRENT_DATA) return false
  const lebar = video.videoWidth
  const tinggi = video.videoHeight
  if (lebar === 0 || tinggi === 0) return false

  kanvas.width = lebar
  kanvas.height = tinggi
  const konteks = kanvas.getContext('2d', { willReadFrequently: true })
  if (!konteks) return false
  konteks.drawImage(video, 0, 0, lebar, tinggi)
  return true
}

export function kameraTersedia(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  )
}

/**
 * Menyalakan kamera belakang.
 *
 * `facingMode: 'environment'` diminta, bukan diwajibkan (`ideal`, bukan
 * `exact`): di HP yang cuma punya kamera depan, permintaan yang memaksa
 * gagal total dan pemakainya tidak bisa memindai sama sekali. Kamera
 * depan yang canggung tetap lebih baik daripada tidak ada.
 */
export async function nyalakanKamera(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' } },
    audio: false,
  })
}

export function matikanKamera(aliran: MediaStream | null): void {
  aliran?.getTracks().forEach((jalur) => jalur.stop())
}

/**
 * Membaca QR dari berkas gambar.
 *
 * Jalan cadangan untuk keadaan yang sangat nyata: QRIS-nya dikirim
 * banknya sebagai gambar lewat WhatsApp dan tidak pernah dicetak, jadi
 * tidak ada yang bisa dipindai kameranya.
 */
export async function bacaDariBerkas(berkas: File): Promise<string | null> {
  const alamat = URL.createObjectURL(berkas)
  try {
    const gambar = await new Promise<HTMLImageElement>((selesai, gagal) => {
      const el = new Image()
      el.onload = () => selesai(el)
      el.onerror = () => gagal(new Error('Gambarnya tidak bisa dibuka.'))
      el.src = alamat
    })

    const kanvas = document.createElement('canvas')
    kanvas.width = gambar.naturalWidth
    kanvas.height = gambar.naturalHeight
    const konteks = kanvas.getContext('2d', { willReadFrequently: true })
    if (!konteks) return null
    konteks.drawImage(gambar, 0, 0)

    return await bacaBingkai(kanvas)
  } finally {
    URL.revokeObjectURL(alamat)
  }
}
