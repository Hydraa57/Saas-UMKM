import type { Barang, StockMovement } from './types'

/**
 * Aturan stok.
 *
 * Semua murni: tidak menyentuh jaringan, penyimpanan, maupun jam. Yang
 * dihitung di sini menentukan kapan pemiliknya berangkat kulakan dan
 * berapa yang dibawa pulang, jadi kesalahannya mahal dan harus bisa
 * diuji habis.
 *
 * Satu hal yang **tidak** ada di berkas ini, dan itu disengaja: tidak
 * ada satu pun fungsi yang menerima jasa. Tipe `Barang` yang menolaknya,
 * bukan pemeriksaan di dalam badan fungsi — sesuatu yang tidak punya
 * stok tidak boleh bisa sampai ke perhitungan stok sama sekali.
 */

export type StatusStok = 'habis' | 'menipis' | 'aman'

export const STATUS_STOK_LABEL: Readonly<Record<StatusStok, string>> = {
  habis: 'Stok habis',
  menipis: 'menipis',
  aman: 'Aman',
}

/**
 * Stok boleh minus.
 *
 * Angka stok sering tertinggal dari kenyataan — ada yang diambil sendiri,
 * ada yang belum sempat dicatat. Menolak penjualan karena angkanya nol
 * akan membuat kasir ditinggalkan tepat saat pembeli menunggu, jadi
 * penjualan tetap jalan dan sisanya jadi minus. Minus tetap "habis":
 * yang perlu dilakukan pemiliknya sama saja.
 */
export function statusStok(item: Barang): StatusStok {
  if (item.stockQty <= 0) return 'habis'
  // Ambang nol berarti "tidak diminta diingatkan", bukan "ingatkan saat
  // tinggal nol" — itu sudah ditangani cabang di atas.
  if (item.minStock > 0 && item.stockQty <= item.minStock) return 'menipis'
  return 'aman'
}

export function perluDitindak(item: Barang): boolean {
  return statusStok(item) !== 'aman'
}

const PERINGKAT: Readonly<Record<StatusStok, number>> = {
  habis: 0,
  menipis: 1,
  aman: 2,
}

/**
 * Urutan untuk layar stok: yang perlu ditindak lebih dulu.
 *
 * Daftar berabjad memaksa pemiliknya membaca seluruh katalog untuk
 * menemukan tiga barang yang justru jadi alasan dia membuka layarnya.
 * Di dalam tiap kelompok urutannya abjad, supaya letak barang tidak
 * berpindah-pindah setiap kali stoknya bergerak sedikit.
 */
export function urutkanUntukDitindak(items: readonly Barang[]): readonly Barang[] {
  return [...items].sort(
    (a, b) =>
      PERINGKAT[statusStok(a)] - PERINGKAT[statusStok(b)] ||
      a.name.localeCompare(b.name, 'id'),
  )
}

/**
 * Berapa yang perlu dibeli supaya kembali ke ambang aman.
 *
 * Dipakai sebagai usulan jumlah kulakan — usulan, bukan keputusan.
 * Pemiliknya yang tahu apakah minggu ini ramai atau tidak.
 */
export function saranKulakan(item: Barang): number {
  if (!perluDitindak(item)) return 0
  // Kalau ambangnya belum disetel, tidak ada dasar untuk mengusulkan
  // angka apa pun. Mengarang angka di layar kulakan lebih buruk daripada
  // membiarkannya kosong: yang dikarang akan ikut terbeli.
  if (item.minStock <= 0) return 0
  return Math.max(0, item.minStock - item.stockQty)
}

/**
 * Selisih antara hitung fisik dan angka di aplikasi.
 *
 * Positif berarti barangnya lebih banyak daripada catatan; negatif
 * berarti ada yang keluar tanpa tercatat.
 */
export function selisihHitung(item: Barang, countedQty: number): number {
  return countedQty - item.stockQty
}

/**
 * Menyusun ulang stok dari nol lewat seluruh mutasinya.
 *
 * `items.stock_qty` adalah rollup yang disimpan supaya grid kasir tidak
 * perlu menjumlah riwayat tiap kali digambar. Fungsi ini adalah cara
 * memeriksanya: kalau hasilnya berbeda dari angka tersimpan, yang benar
 * adalah yang di sini — mutasinya yang punya asal-usul.
 */
export function stokDariMutasi(movements: readonly StockMovement[]): number {
  return movements.reduce((sum, m) => sum + m.qtyChange, 0)
}
