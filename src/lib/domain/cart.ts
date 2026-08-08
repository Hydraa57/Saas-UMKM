import * as M from '@/lib/money'
import type { Rupiah } from '@/lib/money'
import { isBarang, type CartLine, type Item } from './types'

/**
 * Keranjang kasir.
 *
 * Semua fungsi murni: tidak menyentuh jaringan, penyimpanan, maupun jam.
 * Ini yang membuatnya bisa diuji habis, dan perhitungan uang di depan
 * pembeli memang harus diuji habis.
 */

export interface CartTotals {
  readonly subtotal: Rupiah
  /** Diskon yang benar-benar berlaku — tidak pernah melebihi subtotal. */
  readonly discount: Rupiah
  /** Yang harus dibayar. Tidak pernah negatif. */
  readonly total: Rupiah
  /** Modal barang yang keluar; dasar perhitungan untung. */
  readonly cost: Rupiah
  /** total − modal. Boleh negatif kalau dijual di bawah modal. */
  readonly profit: Rupiah
  readonly lineCount: number
  readonly itemCount: number
}

export function lineSubtotal(line: CartLine): Rupiah {
  return M.multiplyByQty(line.unitPrice, line.qty)
}

export function lineCost(line: CartLine): Rupiah {
  return M.multiplyByQty(line.unitCost, line.qty)
}

/**
 * Menghitung total keranjang.
 *
 * Diskon dibatasi tidak melebihi subtotal. Membiarkan total jadi negatif
 * berarti kasir mencatat uang keluar pada sebuah penjualan, dan saldo
 * tidak akan pernah cocok dengan laci lagi. Kalau diskonnya salah ketik,
 * yang benar adalah total nol — bukan toko yang berutang pada pembeli.
 */
export function calculateCart(
  lines: readonly CartLine[],
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
    lineCount: lines.length,
    itemCount: lines.reduce((sum, line) => sum + line.qty, 0),
  }
}

/** Kembalian. Nol kalau uangnya kurang — kekurangan itu piutang, bukan kembalian negatif. */
export function changeDue(total: Rupiah, cashGiven: Rupiah): Rupiah {
  return M.clampToZero(M.subtract(cashGiven, total))
}

/** Sisa yang belum dibayar. Nol kalau uangnya lebih. */
export function outstanding(total: Rupiah, paid: Rupiah): Rupiah {
  return M.clampToZero(M.subtract(total, paid))
}

/** Mengubah item katalog jadi baris keranjang, menyalin nama dan harganya. */
export function lineFromItem(item: Item, qty = 1): CartLine {
  return {
    itemId: item.id,
    itemKind: item.kind,
    itemName: item.name,
    qty,
    unitPrice: item.price,
    unitCost: item.costPrice,
  }
}

/**
 * Menambahkan item ke keranjang.
 *
 * Item yang sama dengan harga yang sama digabung jumlahnya — bukan jadi
 * baris baru. Kasir mengetuk foto barang yang sama tiga kali, dan yang
 * dia harapkan adalah satu baris berisi tiga.
 *
 * Baris tanpa `itemId` (tombol "lainnya") tidak pernah digabung: dua
 * catatan bebas berharga sama belum tentu barang yang sama.
 */
export function addLine(
  lines: readonly CartLine[],
  incoming: CartLine,
): CartLine[] {
  if (incoming.itemId) {
    const index = lines.findIndex(
      (line) =>
        line.itemId === incoming.itemId && line.unitPrice === incoming.unitPrice,
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
 * Mengubah jumlah pada satu baris. Nol atau kurang menghapus barisnya —
 * menekan tombol kurang sampai nol adalah cara paling wajar membatalkan
 * satu item.
 */
export function setQty(
  lines: readonly CartLine[],
  index: number,
  qty: number,
): CartLine[] {
  const target = lines[index]
  if (!target) return [...lines]
  if (qty <= 0) return lines.filter((_, i) => i !== index)

  const next = [...lines]
  next[index] = { ...target, qty }
  return next
}

export function removeLine(
  lines: readonly CartLine[],
  index: number,
): CartLine[] {
  return lines.filter((_, i) => i !== index)
}

/**
 * Berapa banyak sebuah barang sudah ada di keranjang.
 *
 * Dipakai untuk memperingatkan kalau keranjang sudah melebihi stok, dan
 * untuk menampilkan penanda jumlah di grid kasir.
 */
export function qtyInCart(lines: readonly CartLine[], itemId: string): number {
  return lines
    .filter((line) => line.itemId === itemId)
    .reduce((sum, line) => sum + line.qty, 0)
}

/**
 * Barang yang jumlahnya di keranjang melebihi stok.
 *
 * **Peringatan, bukan larangan.** Stok di aplikasi sering tertinggal dari
 * kenyataan — ada barang yang terlanjur terjual tanpa dicatat, atau
 * kulakan yang belum sempat dimasukkan. Menolak penjualan karena angka
 * stok akan membuat kasir berhenti dipakai tepat saat ada pembeli
 * menunggu; yang benar adalah memberi tahu, lalu tetap melayani.
 *
 * Jasa tidak pernah muncul di sini, apa pun jumlahnya.
 */
export function overStock(
  lines: readonly CartLine[],
  items: readonly Item[],
): Array<{ readonly item: Item; readonly wanted: number; readonly available: number }> {
  const byId = new Map(items.map((item) => [item.id, item]))
  const seen = new Set<string>()
  const result: Array<{ item: Item; wanted: number; available: number }> = []

  for (const line of lines) {
    if (!line.itemId || seen.has(line.itemId)) continue
    seen.add(line.itemId)

    const item = byId.get(line.itemId)
    if (!item || !isBarang(item)) continue

    const wanted = qtyInCart(lines, line.itemId)
    if (wanted > item.stockQty) {
      result.push({ item, wanted, available: item.stockQty })
    }
  }

  return result
}
