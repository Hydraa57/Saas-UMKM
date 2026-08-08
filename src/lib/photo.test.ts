import { describe, expect, it } from 'vitest'
import { compressPhoto, fitWithin } from '@/lib/photo'

describe('fitWithin', () => {
  it('tidak memperbesar foto yang sudah kecil', () => {
    expect(fitWithin(320, 240, 800)).toEqual({ width: 320, height: 240 })
  })

  it('mengecilkan lewat sisi terpanjang, potret maupun lanskap', () => {
    expect(fitWithin(4000, 3000, 800)).toEqual({ width: 800, height: 600 })
    expect(fitWithin(3000, 4000, 800)).toEqual({ width: 600, height: 800 })
  })

  it('tidak pernah menghasilkan sisi nol', () => {
    // Kanvas bersisi nol melempar galat saat digambar, jadi foto panorama
    // yang ekstrem harus tetap menyisakan satu piksel.
    const hasil = fitWithin(4000, 1, 800)
    expect(hasil.height).toBe(1)
    expect(hasil.width).toBe(800)
  })

  it('menangani ukuran nol tanpa membagi nol', () => {
    expect(fitWithin(0, 0, 800)).toEqual({ width: 0, height: 0 })
  })
})

describe('compressPhoto', () => {
  it('mengembalikan berkas asli kalau tidak ada kanvas', async () => {
    // Di lingkungan tanpa DOM, menyimpan barang tidak boleh gagal cuma
    // gara-gara fotonya tidak bisa diproses.
    const asli = new Blob(['x'.repeat(1000)], { type: 'image/jpeg' })
    await expect(compressPhoto(asli)).resolves.toBe(asli)
  })
})
