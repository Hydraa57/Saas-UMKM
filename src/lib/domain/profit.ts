import * as M from '@/lib/money'
import type { Rupiah } from '@/lib/money'
import { calculateCart } from './cart'
import type { CashEntry, Sale, TailorOrder } from './types'

/**
 * Laba rugi — menjawab **"usaha saya untung berapa"**.
 *
 * Pasangan dari `cash.ts`, dan sengaja dihitung dengan cara yang berbeda.
 * Perbedaannya bukan detail teknis; inilah inti fitur yang membedakan
 * aplikasi ini dari buku tulis.
 *
 * Tiga aturan yang membuatnya benar:
 *
 * **1. Pendapatan diakui saat barang berpindah, bukan saat uang diterima.**
 * Snack yang diambil tetangga hari ini dan dibayar minggu depan adalah
 * pendapatan hari ini. Kalau tidak begitu, untung bulan ini akan naik-turun
 * mengikuti siapa yang kebetulan melunasi utang, bukan mengikuti dagangan
 * yang sebenarnya laku.
 *
 * **2. Kulakan bukan biaya — kulakan adalah persediaan.**
 * Sekarung snack yang dibeli hari ini belum jadi biaya. Ia jadi biaya
 * sedikit demi sedikit, tiap kali satu bungkus terjual. Inilah gunanya
 * `sale_items.unit_cost`: salinan modal saat barang itu benar-benar keluar.
 *
 * Tanpa aturan ini, hari kulakan akan selalu terlihat rugi besar dan hari
 * lain terlihat untung besar — dan angka bulanannya tetap salah kalau
 * jumlah kulakan di bulan itu kebetulan tidak sama dengan yang terjual.
 *
 * **3. Uang pribadi bukan urusan laba rugi.**
 * "Ambil buat rumah" mengurangi uang di laci, bukan untung usaha —
 * itu untung yang dibagikan, bukan biaya untuk menghasilkannya.
 * "Tambah modal" sebaliknya. Keduanya muncul di arus kas, tidak di sini.
 */

export interface ProfitSummary {
  /** Penjualan barang, setelah diskon, terbayar maupun belum. */
  readonly goodsRevenue: Rupiah
  /** Pendapatan jasa jahit dari order yang sudah selesai dikerjakan. */
  readonly serviceRevenue: Rupiah
  /** Pemasukan lain yang benar-benar pendapatan. */
  readonly otherRevenue: Rupiah
  /** Seluruh pendapatan. */
  readonly revenue: Rupiah
  /** Modal barang yang terjual — bukan yang dikulak. */
  readonly costOfGoodsSold: Rupiah
  /** revenue − costOfGoodsSold. */
  readonly grossProfit: Rupiah
  /** Biaya jalan: listrik, plastik, benang, ongkos. */
  readonly operatingExpense: Rupiah
  /** grossProfit − operatingExpense. Ini angka yang dicari. */
  readonly netProfit: Rupiah
}

/**
 * Order jahit diakui sebagai pendapatan begitu pekerjaannya selesai,
 * bukan saat DP diterima dan bukan saat pelanggan mengambilnya.
 *
 * `queued` dan `in_progress` belum menghasilkan apa-apa — kainnya masih
 * di mesin. `cancelled` jelas tidak. Yang tersisa, `done` dan `picked_up`,
 * adalah pekerjaan yang sudah benar-benar dikerjakan, dan haknya atas
 * uang itu sudah timbul entah pelanggannya sudah datang atau belum.
 */
const REVENUE_RECOGNIZED_STATUSES = new Set(['done', 'picked_up'])

export function isRevenueRecognized(order: TailorOrder): boolean {
  return REVENUE_RECOGNIZED_STATUSES.has(order.status)
}

export interface ProfitInput {
  readonly sales: readonly Sale[]
  readonly tailorOrders: readonly TailorOrder[]
  /** Entri kas periode yang sama; hanya kategori biaya yang dipakai. */
  readonly cashEntries: readonly CashEntry[]
}

export function summarizeProfit({
  sales,
  tailorOrders,
  cashEntries,
}: ProfitInput): ProfitSummary {
  let goodsRevenue = M.ZERO
  let costOfGoodsSold = M.ZERO

  for (const sale of sales) {
    if (sale.voidedAt) continue
    const totals = calculateCart(sale.lines, sale.discountAmount)
    goodsRevenue = M.add(goodsRevenue, totals.total)
    costOfGoodsSold = M.add(costOfGoodsSold, totals.cost)
  }

  const serviceRevenue = M.sum(
    tailorOrders.filter(isRevenueRecognized).map((order) => order.price),
  )

  let otherRevenue = M.ZERO
  let operatingExpense = M.ZERO

  for (const entry of cashEntries) {
    // `purchase` sengaja tidak ikut — itu persediaan, bukan biaya.
    // `owner_draw`, `capital`, dan `receivable` juga tidak, karena
    // ketiganya memindahkan uang tanpa menghasilkan atau menghabiskannya.
    if (entry.category === 'other_in') {
      otherRevenue = M.add(otherRevenue, entry.amount)
    } else if (
      entry.category === 'operational' ||
      entry.category === 'other_out'
    ) {
      operatingExpense = M.add(operatingExpense, entry.amount)
    }
  }

  const revenue = M.sum([goodsRevenue, serviceRevenue, otherRevenue])
  const grossProfit = M.subtract(revenue, costOfGoodsSold)

  return {
    goodsRevenue,
    serviceRevenue,
    otherRevenue,
    revenue,
    costOfGoodsSold,
    grossProfit,
    operatingExpense,
    netProfit: M.subtract(grossProfit, operatingExpense),
  }
}

/**
 * Margin dalam persen, dibulatkan satu angka di belakang koma.
 * Nol kalau tidak ada pendapatan — membagi dengan nol pada layar
 * laporan menghasilkan "NaN%", dan itu terbaca seperti aplikasi rusak.
 */
export function marginPercent(summary: ProfitSummary): number {
  if (M.isZero(summary.revenue)) return 0
  return Math.round((summary.netProfit / summary.revenue) * 1000) / 10
}

/**
 * Untung per produk, diurutkan dari yang paling menguntungkan.
 * Ini yang menjawab "snack mana yang paling menghasilkan" — pertanyaan
 * yang berbeda dari "snack mana yang paling laku", dan sering
 * jawabannya juga berbeda.
 *
 * Catatan: diskon di tingkat transaksi tidak dibagi ke tiap baris, jadi
 * angka di sini adalah untung sebelum diskon. Selama diskon jarang
 * dipakai — dan pada jualan snack rumahan memang jarang — selisihnya
 * kecil. Kalau nanti diskon jadi sering, bagi diskon proporsional
 * terhadap subtotal tiap baris.
 */
export interface ProductProfit {
  readonly productId: string | null
  readonly itemName: string
  readonly qtySold: number
  readonly revenue: Rupiah
  readonly cost: Rupiah
  readonly profit: Rupiah
}

export function profitByProduct(sales: readonly Sale[]): ProductProfit[] {
  const buckets = new Map<string, ProductProfit>()

  for (const sale of sales) {
    if (sale.voidedAt) continue

    for (const line of sale.lines) {
      // Baris tanpa produk (tombol "Lainnya") dikelompokkan menurut
      // namanya, supaya catatan bebas yang berulang tetap terbaca
      // sebagai satu barang.
      const key = line.productId ?? `free:${line.itemName}`
      const revenue = M.multiplyByQty(line.unitPrice, line.qty)
      const cost = M.multiplyByQty(line.unitCost, line.qty)
      const existing = buckets.get(key)

      buckets.set(key, {
        productId: line.productId ?? null,
        itemName: line.itemName,
        qtySold: (existing?.qtySold ?? 0) + line.qty,
        revenue: M.add(existing?.revenue ?? M.ZERO, revenue),
        cost: M.add(existing?.cost ?? M.ZERO, cost),
        profit: M.add(
          existing?.profit ?? M.ZERO,
          M.subtract(revenue, cost),
        ),
      })
    }
  }

  return [...buckets.values()].sort((a, b) => M.compare(b.profit, a.profit))
}
