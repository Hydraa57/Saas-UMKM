import * as M from '@/lib/money'
import type { Rupiah } from '@/lib/money'
import { DEFAULT_TIMEZONE, hourOf } from './dates'
import { monthOf } from './recap'
import { outstanding } from './debt'
import type { Debt, ItemKind, LocalMonth, Sale } from './types'

/**
 * Laporan penjualan.
 *
 * `recap.ts` menjawab "berapa uang masuk dan keluar bulan ini" dari buku
 * kas. Modul ini menjawab pertanyaan yang tidak bisa dijawab buku kas,
 * karena jawabannya ada di isi struk, bukan di nominalnya:
 *
 * - **Mana yang paling laku?** Yang menentukan apa yang dikulak minggu
 *   depan, dan selama ini cuma ada di ingatan.
 * - **Berapa untungnya?** Buku kas cuma tahu omzet. Omzet besar dengan
 *   modal besar bukan usaha yang sehat, dan itu perbedaan yang tidak
 *   pernah terlihat di buku tulis ibu.
 * - **Jam berapa paling ramai?** Yang menentukan jam buka, jam belanja,
 *   dan kapan harus ada orang di depan.
 *
 * Semua di sini memakai `unitCost` yang **disalin saat transaksi**, bukan
 * harga modal katalog hari ini. Harga kulakan naik-turun; laba bulan lalu
 * harus tetap sama walau harga modalnya sudah diubah minggu ini.
 *
 * Yang dibatalkan tidak pernah ikut. Struk yang dicoret bukan penjualan,
 * dan barang di dalamnya tidak pernah benar-benar laku.
 */

export interface RingkasPenjualan {
  /** Uang yang benar-benar ditagih, sesudah potongan. */
  readonly omzet: Rupiah
  /** Modal barang yang keluar — harga kulakan saat transaksi. */
  readonly modal: Rupiah
  /** omzet − modal. */
  readonly laba: Rupiah
  readonly strukCount: number
  /** Jumlah potong barang/jasa yang berpindah tangan. */
  readonly qtyCount: number
}

export interface BarisTerlaris {
  /** `null` untuk barang di luar katalog. */
  readonly itemId: string | null
  readonly itemName: string
  readonly itemKind: ItemKind
  readonly qty: number
  readonly omzet: Rupiah
  readonly laba: Rupiah
}

export interface BarisJam {
  /** 0–23, jam di zona waktu usaha. */
  readonly jam: number
  readonly strukCount: number
  readonly omzet: Rupiah
}

const hidup = (sale: Sale): boolean => !sale.voidedAt

/** Struk yang jatuh pada satu bulan kalender di zona waktu usaha. */
export function salesInMonth(
  sales: readonly Sale[],
  month: LocalMonth,
  timeZone: string = DEFAULT_TIMEZONE,
): readonly Sale[] {
  return sales.filter(
    (sale) => hidup(sale) && monthOf(sale.occurredAt, timeZone) === month,
  )
}

/** Bulan-bulan yang punya struk, terbaru dulu. */
export function monthsWithSales(
  sales: readonly Sale[],
  timeZone: string = DEFAULT_TIMEZONE,
): readonly LocalMonth[] {
  const bulan = new Set<LocalMonth>()
  for (const sale of sales) {
    if (hidup(sale)) bulan.add(monthOf(sale.occurredAt, timeZone))
  }
  return [...bulan].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
}

const subtotalOf = (sale: Sale): Rupiah =>
  M.sum(sale.lines.map((line) => M.multiplyByQty(line.unitPrice, line.qty)))

const modalOf = (sale: Sale): Rupiah =>
  M.sum(sale.lines.map((line) => M.multiplyByQty(line.unitCost, line.qty)))

export function ringkasPenjualan(sales: readonly Sale[]): RingkasPenjualan {
  const dipakai = sales.filter(hidup)

  const omzet = M.sum(
    dipakai.map((sale) =>
      M.clampToZero(M.subtract(subtotalOf(sale), sale.discount)),
    ),
  )
  const modal = M.sum(dipakai.map(modalOf))

  return {
    omzet,
    modal,
    // Boleh negatif, dan memang harus boleh: jual rugi itu kejadian
    // nyata, dan menyembunyikannya di angka nol justru menghilangkan
    // satu-satunya tanda bahwa ada yang salah dengan harganya.
    laba: M.subtract(omzet, modal),
    strukCount: dipakai.length,
    qtyCount: dipakai.reduce(
      (total, sale) =>
        total + sale.lines.reduce((n, line) => n + line.qty, 0),
      0,
    ),
  }
}

/**
 * Bagian omzet yang barangnya sudah keluar tapi uangnya belum masuk.
 *
 * Dihitung dari daftar utang, **bukan** dari selisih `total − paid` di
 * struknya. Perbedaannya penting dan sempat salah: `paid` adalah uang
 * yang berpindah di meja kasir saat itu, dan angka itu tidak pernah
 * berubah lagi. Saat pembeli melunasi seminggu kemudian, yang tercatat
 * adalah pelunasan di daftar utang — struknya tetap tertulis "dibayar
 * nol". Menghitung dari struk berarti menagih orang yang sudah membayar,
 * di layar yang seharusnya jadi rujukan.
 *
 * Ketahuan oleh uji asap, bukan oleh tes unit: keduanya baru berbeda
 * setelah ada pelunasan, dan itu langkah yang cuma ada di alur lengkap.
 */
export function piutangDariPenjualan(
  debts: readonly Debt[],
  sales: readonly Sale[],
): Rupiah {
  const idStruk = new Set(sales.filter(hidup).map((sale) => sale.id))

  return M.sum(
    debts
      .filter(
        (debt) =>
          debt.side === 'receivable' &&
          !debt.deletedAt &&
          // `saleId` boleh kosong: utang bisa dicatat lepas tanpa struk,
          // dan yang begitu memang bukan bagian dari omzet bulan ini.
          debt.saleId != null &&
          idStruk.has(debt.saleId),
      )
      .map(outstanding),
  )
}

/**
 * Membagi potongan tingkat struk ke tiap barisnya, sebanding nilainya.
 *
 * Kenapa repot: kalau potongannya tidak dibagi, jumlah omzet per barang
 * di daftar terlaris tidak akan sama dengan omzet di kartu ringkasan
 * pada layar yang sama. Pada aplikasi uang, dua angka yang seharusnya
 * sama tapi berbeda sedikit adalah cara tercepat kehilangan kepercayaan
 * — dan tidak ada cara bagi pemakainya menebak mana yang benar.
 *
 * Sisa pembagian diberikan ke baris bernilai terbesar lebih dulu
 * (*largest remainder*), sehingga jumlah seluruh bagian **persis** sama
 * dengan potongannya, bukan meleset satu-dua rupiah karena pembulatan.
 */
function bagiPotongan(sale: Sale): readonly Rupiah[] {
  const nilai = sale.lines.map((line) =>
    M.multiplyByQty(line.unitPrice, line.qty),
  )
  const subtotal = M.sum(nilai)
  const potongan = M.min(M.clampToZero(sale.discount), subtotal)

  if (M.isZero(potongan) || M.isZero(subtotal)) {
    return nilai.map(() => M.ZERO)
  }

  const tepat = nilai.map((n) => (n * potongan) / subtotal)
  const bagian = tepat.map((n) => Math.floor(n))
  let sisa = potongan - bagian.reduce((total, n) => total + n, 0)

  const urutan = tepat
    .map((n, index) => ({ index, pecahan: n - Math.floor(n) }))
    .sort((a, b) => b.pecahan - a.pecahan || a.index - b.index)

  for (const { index } of urutan) {
    if (sisa <= 0) break
    bagian[index] = (bagian[index] ?? 0) + 1
    sisa -= 1
  }

  return bagian.map((n) => M.rupiah(n))
}

/**
 * Barang dan jasa paling laku.
 *
 * Dikelompokkan menurut `itemId`, bukan namanya. Nama di struk adalah
 * salinan saat transaksi, jadi barang yang pernah diganti namanya akan
 * terpecah jadi dua baris kalau namanya yang dipakai sebagai kunci —
 * dan pemakainya akan melihat "Roma" dan "Biskuit Roma" bersaing satu
 * sama lain. Nama yang ditampilkan diambil dari transaksi terbaru,
 * karena itu nama yang dikenalinya sekarang.
 *
 * Barang di luar katalog (`itemId` kosong) dikelompokkan menurut nama —
 * memang tidak ada kunci lain untuknya.
 *
 * Diurutkan menurut **qty**, bukan omzet, karena pertanyaan yang dibawa
 * ke daftar ini adalah "apa yang harus saya kulak lagi". Omzet dan laba
 * tetap ditampilkan di baris yang sama supaya barang yang laris tapi
 * tipis untungnya tidak terlihat seperti kemenangan.
 */
export function barangTerlaris(
  sales: readonly Sale[],
  batas?: number,
): readonly BarisTerlaris[] {
  interface Ember {
    itemId: string | null
    itemName: string
    itemKind: ItemKind
    qty: number
    omzet: Rupiah
    modal: Rupiah
    terakhir: string
  }

  const ember = new Map<string, Ember>()

  for (const sale of sales) {
    if (!hidup(sale)) continue
    const potongan = bagiPotongan(sale)

    sale.lines.forEach((line, index) => {
      const kunci = line.itemId ?? `nama:${line.itemName}`
      const nilai = M.multiplyByQty(line.unitPrice, line.qty)
      const bersih = M.clampToZero(
        M.subtract(nilai, potongan[index] ?? M.ZERO),
      )
      const modal = M.multiplyByQty(line.unitCost, line.qty)

      const ada = ember.get(kunci)
      if (!ada) {
        ember.set(kunci, {
          itemId: line.itemId,
          itemName: line.itemName,
          itemKind: line.itemKind,
          qty: line.qty,
          omzet: bersih,
          modal,
          terakhir: sale.occurredAt,
        })
        return
      }

      ada.qty += line.qty
      ada.omzet = M.add(ada.omzet, bersih)
      ada.modal = M.add(ada.modal, modal)
      if (sale.occurredAt > ada.terakhir) {
        ada.terakhir = sale.occurredAt
        ada.itemName = line.itemName
      }
    })
  }

  const baris = [...ember.values()]
    .map(
      (e): BarisTerlaris => ({
        itemId: e.itemId,
        itemName: e.itemName,
        itemKind: e.itemKind,
        qty: e.qty,
        omzet: e.omzet,
        laba: M.subtract(e.omzet, e.modal),
      }),
    )
    // Seri diputus oleh omzet lalu nama, supaya urutannya tidak
    // berubah-ubah tiap kali layarnya dibuka ulang.
    .sort(
      (a, b) =>
        b.qty - a.qty ||
        M.compare(b.omzet, a.omzet) ||
        a.itemName.localeCompare(b.itemName, 'id'),
    )

  return batas === undefined ? baris : baris.slice(0, batas)
}

/**
 * Sebaran penjualan menurut jam.
 *
 * Hanya jam yang benar-benar ada isinya. Menampilkan 24 baris dengan
 * dua puluh di antaranya nol membuat yang penting tenggelam, dan warung
 * memang tidak buka dua puluh empat jam.
 *
 * Diurutkan menurut jam, bukan menurut ramainya: bentuk hari itu sendiri
 * yang jadi jawabannya — ramai pagi lalu sepi, atau menumpuk sore
 * menjelang tutup.
 */
export function sebaranJam(
  sales: readonly Sale[],
  timeZone: string = DEFAULT_TIMEZONE,
): readonly BarisJam[] {
  const ember = new Map<number, { strukCount: number; omzet: Rupiah }>()

  for (const sale of sales) {
    if (!hidup(sale)) continue
    const jam = hourOf(sale.occurredAt, timeZone)
    const ada = ember.get(jam) ?? { strukCount: 0, omzet: M.ZERO }
    ada.strukCount += 1
    ada.omzet = M.add(
      ada.omzet,
      M.clampToZero(M.subtract(subtotalOf(sale), sale.discount)),
    )
    ember.set(jam, ada)
  }

  return [...ember.entries()]
    .map(([jam, isi]): BarisJam => ({ jam, ...isi }))
    .sort((a, b) => a.jam - b.jam)
}

/** Jam dengan struk terbanyak. `null` kalau belum ada penjualan. */
export function jamTerramai(baris: readonly BarisJam[]): BarisJam | null {
  let juara: BarisJam | null = null
  for (const b of baris) {
    if (!juara || b.strukCount > juara.strukCount) juara = b
  }
  return juara
}

/** `14` → `14.00`. Format jam yang dipakai orang Indonesia menulis waktu. */
export function formatJam(jam: number): string {
  return `${String(jam).padStart(2, '0')}.00`
}

/**
 * Marjin laba dalam persen, dibulatkan ke bilangan bulat.
 *
 * `null` kalau omzetnya nol — bukan 0%, karena tidak berjualan sama
 * sekali bukan berarti untungnya nol persen, dan menampilkannya sebagai
 * angka membuat bulan kosong terlihat seperti bulan rugi.
 */
export function marjinPersen(ringkas: RingkasPenjualan): number | null {
  if (M.isZero(ringkas.omzet)) return null
  return Math.round((ringkas.laba / ringkas.omzet) * 100)
}
