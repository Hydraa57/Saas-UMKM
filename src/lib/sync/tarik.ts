import type { SupabaseClient } from '@supabase/supabase-js'
import {
  BUSINESS_NAME_KEY,
  TENANT_KEY,
  getMeta,
  setMeta,
  type LocalDatabase,
} from '@/lib/db/local'
import { pendingCount } from './outbox'

/**
 * Menarik catatan dari peladen ke perangkat ini.
 *
 * Sampai sekarang aliran datanya cuma satu arah: perangkat menulis,
 * antrean mengirim, dan peladen menyimpan. Yang tidak pernah ada adalah
 * jalan pulangnya — dan itu membuat satu janji di layar ganti akun tidak
 * bisa ditepati sama sekali: *"yang sudah terkirim tetap aman di peladen
 * dan bisa ditarik lagi nanti."*
 *
 * Dua hal yang dibuka oleh berkas ini:
 *
 * 1. **HP kedua.** Dua HP melayani pembeli dan saling menyusul.
 * 2. **Pemulihan.** HP baru yang kosong adalah kasus HP kedua dengan
 *    watermark nol — jadi ia tidak butuh jalur tersendiri.
 *
 * ## Aturan bentrok, dan kenapa hampir tidak ada yang bentrok
 *
 * Yang biasanya membuat sinkronisasi dua arah berbahaya adalah dua
 * perangkat mengubah **baris yang sama**. Di aplikasi ini itu jarang,
 * karena antreannya tidak mengangkut baris melainkan **maksud**: yang
 * dikirim `record_sale`, bukan "tulis nilai stok jadi 8". Dua HP yang
 * menjual barang yang sama menghasilkan dua penjualan dengan UUID
 * berbeda, dan peladen yang menjumlahkan akibatnya.
 *
 * Karena itu aturannya bisa sesederhana ini:
 *
 * - **Peladen yang benar untuk angka hasil hitungan.** `stock_qty` dan
 *   `sold_count` adalah rollup. HP A menjual 2, HP B menjual 3; A
 *   mengira sisa 8, B mengira sisa 7, dan peladen tahu 5. Yang ditarik
 *   menimpa yang lokal, tanpa penggabungan per kolom.
 * - **Yang diubah manusia dipilih dari `updated_at`.** Nama dan harga
 *   barang memang bisa ditulis dua orang. Yang terakhir menang, dan itu
 *   sudah dipastikan peladen — yang ditarik selalu keadaan terakhir.
 * - **Tidak ada yang dihapus keras**, jadi tarikan tidak pernah perlu
 *   menghapus baris lokal. Struk dibatalkan lewat `voided_at`, barang
 *   lewat `archived_at`, kas dan utang lewat `deleted_at`. Ketiganya
 *   ikut menaikkan `updated_at`, jadi pembatalan di HP lain sampai ke
 *   sini sebagai perubahan biasa.
 *
 * ## Yang menahan tarikan
 *
 * **Tarikan tidak berjalan selama masih ada antrean yang belum
 * terkirim.** Kalau dilanggar, baris lokal yang perubahannya masih di
 * antrean akan ditimpa keadaan lama dari peladen — pengguna melihat
 * suntingannya kembali seperti semula, lalu berubah lagi beberapa detik
 * kemudian saat antreannya terkirim. Berkedip seperti itu di layar
 * kasir lebih merusak kepercayaan daripada data yang tertinggal
 * sebentar.
 *
 * Yang menahan cuma antrean **`pending`**. Yang sudah `failed` ditolak
 * permanen oleh peladen dan tidak akan pernah terkirim; membiarkannya
 * menahan tarikan selamanya berarti satu baris rusak menyandera seluruh
 * sinkronisasi HP itu.
 */

/** Watermark per tabel: `{ items: '2026-08-12T…', … }`. */
export const TARIK_KEY = 'tarik_sampai'

/** Sebanyak ini per permintaan, lalu diulang sampai habis. */
const SEHALAMAN = 500

/**
 * Urutannya induk lebih dulu, dan itu bukan soal kunci asing — Dexie
 * tidak menegakkannya. Alasannya layar: baris struk yang mendarat
 * sebelum struknya membuat riwayat menggambar penjualan tanpa kepala
 * selama sepersekian detik, dan tarikan pertama di HP baru berlangsung
 * cukup lama untuk terlihat.
 */
interface Rencana {
  /** Nama tabel di peladen. */
  readonly nama: string
  /** Nama tabel Dexie yang menampungnya. */
  readonly lokal:
    | 'wallets'
    | 'items'
    | 'sales'
    | 'saleItems'
    | 'stockMovements'
    | 'cashEntries'
    | 'debts'
  /**
   * Kolom yang dipakai sebagai watermark.
   *
   * `sale_items` tidak punya satu pun kolom waktu — barisnya lahir
   * bersama struknya dan tidak pernah berubah sesudahnya. Jadi ia
   * ditarik lewat induknya, bukan lewat waktu.
   */
  readonly waktu: 'updated_at' | 'created_at' | null
}

const RENCANA: readonly Rencana[] = [
  { nama: 'wallets', lokal: 'wallets', waktu: 'updated_at' },
  { nama: 'items', lokal: 'items', waktu: 'updated_at' },
  { nama: 'sales', lokal: 'sales', waktu: 'updated_at' },
  { nama: 'sale_items', lokal: 'saleItems', waktu: null },
  { nama: 'stock_movements', lokal: 'stockMovements', waktu: 'created_at' },
  { nama: 'cash_entries', lokal: 'cashEntries', waktu: 'updated_at' },
  { nama: 'debts', lokal: 'debts', waktu: 'updated_at' },
]

export interface HasilTarik {
  readonly berjalan: boolean
  /** Alasan kalau tidak berjalan, untuk ditulis apa adanya ke log. */
  readonly alasan?: 'antrean-belum-kosong' | 'tanpa-tenant'
  readonly perTabel: Readonly<Record<string, number>>
  readonly total: number
}

type Watermark = Record<string, string>

const KOSONG: HasilTarik = { berjalan: false, perTabel: {}, total: 0 }

export async function bacaWatermark(db: LocalDatabase): Promise<Watermark> {
  return (await getMeta<Watermark>(db, TARIK_KEY)) ?? {}
}

/**
 * Waktu paling akhir yang terlihat di sekumpulan baris.
 *
 * Dipakai sebagai watermark berikutnya, dan sengaja diambil dari **jam
 * peladen yang menempel di barisnya**, bukan dari jam perangkat. Jam HP
 * murah sering meleset berjam-jam, dan watermark yang lebih maju
 * daripada kenyataan berarti baris yang terlewat selamanya — kerusakan
 * yang tidak menimbulkan gejala apa pun sampai ada yang mencari struk
 * lama dan tidak menemukannya.
 */
function palingAkhir(baris: readonly Record<string, unknown>[], kolom: string): string | null {
  let akhir: string | null = null
  for (const b of baris) {
    const nilai = b[kolom]
    if (typeof nilai !== 'string') continue
    if (akhir === null || nilai > akhir) akhir = nilai
  }
  return akhir
}

/**
 * Menarik satu tabel, sehalaman demi sehalaman.
 *
 * Pembandingnya `>=`, bukan `>`. Dengan `>` sebuah baris yang ditulis
 * pada detik yang sama persis dengan watermark — dan dua penjualan dalam
 * satu detik itu biasa di jam ramai — akan terlewat selamanya. `>=`
 * berarti sebagian baris terambil dua kali, dan itu tidak apa-apa:
 * penyimpanannya `bulkPut`, yang menimpa berdasarkan `id`.
 */
async function tarikTabel(
  db: LocalDatabase,
  supabase: SupabaseClient,
  tenantId: string,
  rencana: Rencana,
  sejak: string | undefined,
): Promise<{ jumlah: number; sampai: string | null; id: string[] }> {
  if (rencana.waktu === null) return { jumlah: 0, sampai: null, id: [] }

  let jumlah = 0
  let sampai: string | null = null
  let awal = 0
  const id: string[] = []

  for (;;) {
    // Saringan lebih dulu, `range` paling akhir — urutan yang sama
    // dengan SQL yang dihasilkannya, dan satu-satunya urutan yang tidak
    // menuntut pembacanya tahu bahwa pembangun kueri ini masih bisa
    // dirantai sesudah dibatasi.
    const dasar = supabase.from(rencana.nama).select('*').eq('tenant_id', tenantId)
    const disaring = sejak ? dasar.gte(rencana.waktu, sejak) : dasar

    const { data, error } = await disaring
      .order(rencana.waktu, { ascending: true })
      .range(awal, awal + SEHALAMAN - 1)
    if (error) throw error

    const baris = (data ?? []) as Record<string, unknown>[]
    if (baris.length > 0) {
      await db.table(rencana.lokal).bulkPut(baris)
      jumlah += baris.length
      for (const b of baris) if (typeof b['id'] === 'string') id.push(b['id'])
      const akhir = palingAkhir(baris, rencana.waktu)
      if (akhir !== null && (sampai === null || akhir > sampai)) sampai = akhir
    }

    if (baris.length < SEHALAMAN) break
    awal += SEHALAMAN
  }

  return { jumlah, sampai, id }
}

/**
 * Baris struk, ditarik lewat induknya.
 *
 * `sale_items` tidak punya kolom waktu sama sekali, jadi ia tidak bisa
 * ikut pola watermark. Yang dipakai: id struk yang **baru saja** ditarik.
 * Itu cukup karena baris struk tidak pernah berubah setelah dibuat —
 * pembatalan menandai struknya, bukan barisnya.
 */
async function tarikBarisStruk(
  db: LocalDatabase,
  supabase: SupabaseClient,
  tenantId: string,
  idStruk: readonly string[],
): Promise<number> {
  let jumlah = 0
  for (let i = 0; i < idStruk.length; i += 100) {
    const sepotong = idStruk.slice(i, i + 100)
    const { data, error } = await supabase
      .from('sale_items')
      .select('*')
      .eq('tenant_id', tenantId)
      .in('sale_id', sepotong)
    if (error) throw error
    const baris = (data ?? []) as Record<string, unknown>[]
    if (baris.length > 0) {
      await db.saleItems.bulkPut(baris as never)
      jumlah += baris.length
    }
  }
  return jumlah
}

/** Identitas usaha, supaya HP kedua tahu nama yang tercetak di struk. */
async function tarikTenant(
  db: LocalDatabase,
  supabase: SupabaseClient,
  tenantId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('tenants')
    .select('name')
    .eq('id', tenantId)
    .maybeSingle()
  if (error) throw error
  const nama = (data as { name?: string } | null)?.name
  if (typeof nama === 'string' && nama.trim().length > 0) {
    await setMeta(db, BUSINESS_NAME_KEY, nama)
  }
  // Nomor WhatsApp sengaja tidak ikut: ia memang tidak pernah dikirim ke
  // peladen (lihat layar pengaturan), jadi tidak ada yang bisa ditarik.
}

export async function tarik(
  db: LocalDatabase,
  supabase: SupabaseClient,
): Promise<HasilTarik> {
  const tenantId = await getMeta<string>(db, TENANT_KEY)
  if (!tenantId) return { ...KOSONG, alasan: 'tanpa-tenant' }

  if ((await pendingCount(db)) > 0) {
    return { ...KOSONG, alasan: 'antrean-belum-kosong' }
  }

  const watermark = await bacaWatermark(db)
  const baru: Watermark = { ...watermark }
  const perTabel: Record<string, number> = {}
  let total = 0

  await tarikTenant(db, supabase, tenantId)

  // Struk yang tersentuh putaran ini. Bukan "yang baru di perangkat":
  // kalau tarikan barisnya gagal di putaran sebelumnya, struknya sudah
  // terlanjur tersimpan, dan patokan "baru di perangkat" akan
  // menganggapnya beres selamanya — struk tanpa satu pun baris, permanen.
  let strukTersentuh: readonly string[] = []

  for (const rencana of RENCANA) {
    if (rencana.waktu === null) continue

    const { jumlah, sampai, id } = await tarikTabel(
      db,
      supabase,
      tenantId,
      rencana,
      watermark[rencana.nama],
    )

    perTabel[rencana.nama] = jumlah
    total += jumlah
    if (sampai !== null) baru[rencana.nama] = sampai
    if (rencana.nama === 'sales') strukTersentuh = id
  }

  if (strukTersentuh.length > 0) {
    // Yang benar-benar diminta cuma struk yang **belum punya barisnya di
    // sini**. Daftar struk yang sudah lengkap dibaca dari indeks
    // `sale_id`, bukan dengan memindai seluruh barisnya: `uniqueKeys`
    // menyusuri indeksnya saja, jadi biayanya tetap kecil walau
    // riwayatnya sudah setahun.
    const sudahLengkap = new Set(await db.saleItems.orderBy('sale_id').uniqueKeys())
    const kurang = strukTersentuh.filter((id) => !sudahLengkap.has(id))

    if (kurang.length > 0) {
      const jumlah = await tarikBarisStruk(db, supabase, tenantId, kurang)
      perTabel['sale_items'] = jumlah
      total += jumlah
    }
  }

  // Watermark disimpan **paling akhir**, sesudah baris struknya ikut
  // mendarat. Kalau ia disimpan lebih dulu lalu tarikan barisnya gagal,
  // struk yang sama tidak akan pernah diminta ulang.
  await setMeta(db, TARIK_KEY, baru)
  return { berjalan: true, perTabel, total }
}
