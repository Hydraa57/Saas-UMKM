/**
 * Memperkecil foto barang sebelum disimpan.
 *
 * Foto dari kamera ponsel hari ini biasanya 3–6 MB. Grid kasir memuat
 * puluhan sekaligus, dan seluruhnya dibaca dari IndexedDB — kalau ukuran
 * aslinya yang disimpan, membuka kasir jadi menunggu, lalu kuota
 * penyimpanan peramban habis, lalu penulisan berikutnya gagal justru saat
 * pembeli sedang menunggu.
 *
 * Karena itu pengecilan dilakukan di perangkat, sebelum menyentuh basis
 * data, bukan nanti saat diunggah: yang tersimpan di perangkat harus
 * sudah kecil sejak awal, sinyal ada atau tidak.
 *
 * Targetnya foto katalog, bukan arsip: sisi terpanjang 800 px sudah jauh
 * di atas ukuran petak grid, dan WebP q75 membawanya ke puluhan kilobita.
 */

export interface CompressOptions {
  /** Sisi terpanjang setelah diperkecil. */
  readonly maxEdge?: number
  /** Mutu awal WebP, 0–1. */
  readonly quality?: number
  /** Berhenti menurunkan mutu setelah ukurannya di bawah ini. */
  readonly targetBytes?: number
}

const MAX_EDGE = 800
const QUALITY = 0.75
const TARGET_BYTES = 60 * 1024
const MIN_QUALITY = 0.4

/** Ukuran setelah dipaskan ke dalam kotak `maxEdge`, tanpa memperbesar. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
): { readonly width: number; readonly height: number } {
  const longest = Math.max(width, height)
  if (longest <= maxEdge || longest === 0) {
    return { width: Math.round(width), height: Math.round(height) }
  }
  const scale = maxEdge / longest
  // Sekurang-kurangnya 1 px: gambar 2000×1 tidak boleh menjadi setinggi 0,
  // karena kanvas bersisi nol melempar galat saat digambar.
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

async function toBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    // `imageOrientation` penting: foto potret dari ponsel menyimpan arah
    // di EXIF, dan tanpa ini semuanya masuk katalog dalam keadaan miring.
    return createImageBitmap(file, { imageOrientation: 'from-image' })
  }

  const url = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Foto tidak bisa dibaca'))
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

function encode(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/**
 * Mengecilkan satu foto. Selalu mengembalikan sesuatu yang bisa disimpan.
 *
 * Kalau peramban tidak bisa membaca atau menyandikan berkasnya, yang
 * dikembalikan adalah berkas aslinya — foto besar masih jauh lebih baik
 * daripada penyimpanan barang yang gagal gara-gara fotonya.
 */
export async function compressPhoto(
  file: Blob,
  options: CompressOptions = {},
): Promise<Blob> {
  const maxEdge = options.maxEdge ?? MAX_EDGE
  const targetBytes = options.targetBytes ?? TARGET_BYTES
  let quality = options.quality ?? QUALITY

  if (typeof document === 'undefined') return file

  try {
    const source = await toBitmap(file)
    const sourceWidth =
      'width' in source ? source.width : (source as HTMLImageElement).naturalWidth
    const sourceHeight =
      'height' in source
        ? source.height
        : (source as HTMLImageElement).naturalHeight

    const { width, height } = fitWithin(sourceWidth, sourceHeight, maxEdge)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(source, 0, 0, width, height)
    if ('close' in source) source.close()

    // WebP kalau peramban mendukungnya; kalau tidak, `toBlob` diam-diam
    // mengembalikan PNG, dan PNG dari foto justru lebih besar dari
    // aslinya — karena itu hasilnya diperiksa, bukan dipercaya.
    let hasil = await encode(canvas, 'image/webp', quality)
    if (!hasil || hasil.type !== 'image/webp') {
      hasil = await encode(canvas, 'image/jpeg', quality)
    }
    if (!hasil) return file

    // Foto ramai (rak dagangan, kain bermotif) tetap besar di q75. Mutu
    // diturunkan bertahap, bukan sekali potong ke mutu terendah: foto
    // sederhana sudah lolos di putaran pertama dan tidak perlu dikorbankan.
    while (hasil.size > targetBytes && quality > MIN_QUALITY) {
      quality = Math.max(MIN_QUALITY, quality - 0.15)
      const lagi = await encode(canvas, hasil.type, quality)
      if (!lagi) break
      hasil = lagi
    }

    return hasil.size < file.size ? hasil : file
  } catch {
    return file
  }
}
