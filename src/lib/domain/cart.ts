import * as M from '@/lib/money'
import type { Rupiah } from '@/lib/money'
import type { SaleLine } from './types'

/**
 * Perhitungan keranjang belanja.
 *
 * Semua fungsi di sini murni: tidak menyentuh jaringan, tidak menyentuh
 * penyimpanan, tidak membaca jam. Ini yang membuatnya bisa diuji habis,
 * dan perhitungan uang memang harus diuji habis.
 */

export interface CartTotals {
  /** Jumlah seluruh baris sebelum diskon. */
  readonly subtotal: Rupiah
  /** Diskon yang benar-benar berlaku — tidak pernah melebihi subtotal. */
  readonly discount: Rupiah
  /** Yang harus dibayar pembeli. Tidak pernah negatif. */
  readonly total: Rupiah
  /** Modal barang yang keluar. Dasar perhitungan untung. */
  readonly cost: Rupiah
  /** Untung transaksi ini: total − modal. Boleh negatif kalau jual rugi. */
  readonly profit: Rupiah
  readonly itemCount: number
}

export function lineSubtotal(line: SaleLine): Rupiah {
  return M.multiplyByQty(line.unitPrice, line.qty)
}

export function lineCost(line: SaleLine): Rupiah {
  return M.multiplyByQty(line.unitCost, line.qty)
}

/**
 * Menghitung total keranjang.
 *
 * Diskon dibatasi tidak melebihi subtotal. Membiarkan total menjadi
 * negatif akan berarti aplikasi mencatat uang keluar pada transaksi
 * penjualan, dan saldo tidak akan pernah cocok dengan laci lagi.
 * Kalau ibu salah ketik diskon, yang benar adalah total nol —
 * bukan aplikasi yang berutang pada pembeli.
 */
export function calculateCart(
  lines: readonly SaleLine[],
  discount: Rupiah = M.ZERO,
): CartTotals {
  const subtotal = M.sum(lines.map(lineSubtotal))
  const cost = M.sum(lines.map(lineCost))

  const effectiveDiscount = M.min(M.max(discount, M.ZERO), subtotal)
  const total = M.subtract(subtotal, effectiveDiscount)

  return {
    subtotal,
    discount: effectiveDiscount,
    total,
    cost,
    profit: M.subtract(total, cost),
    itemCount: lines.length,
  }
}

/**
 * Kembalian. Nol kalau uang yang dibayarkan kurang — kekurangannya
 * urusan `outstanding`, bukan kembalian.
 */
export function changeDue(total: Rupiah, cashGiven: Rupiah): Rupiah {
  return M.clampToZero(M.subtract(cashGiven, total))
}

/**
 * Menambahkan satu item ke keranjang.
 *
 * Kalau produk yang sama sudah ada dengan harga satuan yang sama,
 * jumlahnya digabung — bukan ditambah sebagai baris baru. Ibu menekan
 * foto snack yang sama tiga kali, dan yang dia harapkan adalah satu
 * baris berisi tiga, bukan tiga baris.
 *
 * Baris tanpa `productId` (tombol "Lainnya") tidak pernah digabung,
 * karena dua catatan bebas dengan harga sama belum tentu barang sama.
 */
export function addLine(
  lines: readonly SaleLine[],
  incoming: SaleLine,
): SaleLine[] {
  if (incoming.productId) {
    const index = lines.findIndex(
      (line) =>
        line.productId === incoming.productId &&
        line.unitPrice === incoming.unitPrice,
    )
    const existing = lines[index]
    if (existing) {
      const merged = [...lines]
      merged[index] = { ...existing, qty: existing.qty + incoming.qty }
      return merged
    }
  }
  return [...lines, incoming]
}

/**
 * Mengubah jumlah pada satu baris. Jumlah nol atau kurang menghapus
 * barisnya — menekan tombol kurang sampai nol adalah cara paling wajar
 * membatalkan satu item.
 */
export function setLineQty(
  lines: readonly SaleLine[],
  index: number,
  qty: number,
): SaleLine[] {
  const target = lines[index]
  if (!target) return [...lines]
  if (qty <= 0) return lines.filter((_, i) => i !== index)

  const next = [...lines]
  next[index] = { ...target, qty }
  return next
}
