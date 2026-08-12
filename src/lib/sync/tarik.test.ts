import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  BUSINESS_NAME_KEY,
  TENANT_KEY,
  getMeta,
  setMeta,
  LocalDatabase,
} from '@/lib/db/local'
import { bacaWatermark, tarik, TARIK_KEY } from './tarik'

/**
 * Yang diuji di sini bukan "apakah datanya turun" — itu bagian yang
 * paling sulit salah. Yang diuji adalah **kapan ia menolak turun, dan
 * apa yang terjadi kalau turunnya gagal di tengah.**
 *
 * Tiga kerusakan yang mungkin, dan ketiganya diam:
 *
 * 1. Tarikan menimpa suntingan yang masih di antrean.
 * 2. Watermark maju padahal barisnya belum semua mendarat → yang
 *    terlewat tidak akan pernah diminta lagi.
 * 3. Struk turun tanpa baris-barisnya → riwayat berisi struk kosong,
 *    permanen.
 */

let db: LocalDatabase
let counter = 0

const TENANT = 'tenant-1'

interface Permintaan {
  tabel: string
  gte?: [string, string]
  in?: [string, string[]]
}

interface Isi {
  [tabel: string]: Record<string, unknown>[]
}

function palsu(
  isi: Isi,
  jejak: Permintaan[],
  opsi: { gagalPada?: string } = {},
): SupabaseClient {
  return {
    from(tabel: string) {
      const permintaan: Permintaan = { tabel }
      let baris = [...(isi[tabel] ?? [])]

      const bangun = () => {
        const hasil = {
          eq(_kolom: string, _nilai: unknown) {
            return hasil
          },
          gte(kolom: string, nilai: string) {
            permintaan.gte = [kolom, nilai]
            baris = baris.filter((b) => String(b[kolom]) >= nilai)
            return hasil
          },
          // Ada supaya kontrol negatifnya berarti. Kodenya tidak pernah
          // memanggil `gt`; tanpa tiruan ini, mengganti `>=` jadi `>`
          // untuk menguji apakah tesnya peka akan gagal sebagai
          // TypeError — yaitu gagal karena alasan yang salah, dan itu
          // membuat kontrolnya tidak membuktikan apa-apa.
          gt(kolom: string, nilai: string) {
            permintaan.gte = [kolom, nilai]
            baris = baris.filter((b) => String(b[kolom]) > nilai)
            return hasil
          },
          in(kolom: string, nilai: string[]) {
            permintaan.in = [kolom, nilai]
            baris = baris.filter((b) => nilai.includes(String(b[kolom])))
            return hasil
          },
          order(kolom: string) {
            baris.sort((a, b) => String(a[kolom]).localeCompare(String(b[kolom])))
            return hasil
          },
          range(dari: number, sampai: number) {
            jejak.push(permintaan)
            if (opsi.gagalPada === tabel) {
              return Promise.resolve({ data: null, error: { message: 'putus' } })
            }
            return Promise.resolve({ data: baris.slice(dari, sampai + 1), error: null })
          },
          maybeSingle() {
            jejak.push(permintaan)
            return Promise.resolve({ data: baris[0] ?? null, error: null })
          },
          // `sale_items` tidak memakai `range`; hasilnya ditunggu langsung.
          then(
            selesai: (n: { data: unknown; error: unknown }) => unknown,
            gagal?: (e: unknown) => unknown,
          ) {
            jejak.push(permintaan)
            if (opsi.gagalPada === tabel) {
              return Promise.resolve({ data: null, error: { message: 'putus' } }).then(
                selesai,
                gagal,
              )
            }
            return Promise.resolve({ data: baris, error: null }).then(selesai, gagal)
          },
        }
        return hasil
      }

      return { select: () => bangun() }
    },
  } as unknown as SupabaseClient
}

const struk = (id: string, updated: string) => ({
  id,
  tenant_id: TENANT,
  invoice_no: id,
  occurred_at: updated,
  subtotal: 5000,
  discount: 0,
  total: 5000,
  paid: 5000,
  payment_method: 'tunai',
  wallet_id: null,
  customer_name: null,
  note: null,
  voided_at: null,
  updated_at: updated,
})

const barisStruk = (id: string, saleId: string) => ({
  id,
  tenant_id: TENANT,
  sale_id: saleId,
  item_id: null,
  item_kind: 'barang',
  item_name: 'Biskuit',
  qty: 1,
  unit_price: 5000,
  unit_cost: 3000,
  subtotal: 5000,
  line_no: 0,
})

beforeEach(async () => {
  db = new LocalDatabase(`tarik-${counter++}`)
  await db.open()
  await setMeta(db, TENANT_KEY, TENANT)
})

describe('yang menahan tarikan', () => {
  it('menolak jalan selama antrean kirim belum kosong', async () => {
    await db.outbox.put({
      id: 'o1',
      tenant_id: TENANT,
      rpc: 'record_sale',
      args: {},
      created_at: '2026-08-12T00:00:00Z',
      attempts: 0,
      next_attempt_at: '2026-08-12T00:00:00Z',
      status: 'pending',
      last_error: null,
    })

    const jejak: Permintaan[] = []
    const hasil = await tarik(db, palsu({}, jejak))

    expect(hasil.berjalan).toBe(false)
    expect(hasil.alasan).toBe('antrean-belum-kosong')
    // Dan benar-benar tidak menyentuh jaringan sama sekali.
    expect(jejak).toHaveLength(0)
  })

  it('tetap jalan walau ada antrean yang sudah gagal permanen', async () => {
    // Yang `failed` tidak akan pernah terkirim. Kalau ia ikut menahan,
    // satu baris rusak menyandera sinkronisasi HP itu selamanya.
    await db.outbox.put({
      id: 'o1',
      tenant_id: TENANT,
      rpc: 'record_sale',
      args: {},
      created_at: '2026-08-12T00:00:00Z',
      attempts: 9,
      next_attempt_at: '2026-08-12T00:00:00Z',
      status: 'failed',
      last_error: 'ditolak',
    })

    const hasil = await tarik(db, palsu({}, []))
    expect(hasil.berjalan).toBe(true)
  })

  it('menolak jalan sebelum tenant-nya diketahui', async () => {
    await db.meta.delete(TENANT_KEY)
    const hasil = await tarik(db, palsu({}, []))
    expect(hasil.alasan).toBe('tanpa-tenant')
  })
})

describe('tarikan bertahap', () => {
  it('menurunkan barisnya dan menyimpan watermark dari jam peladen', async () => {
    const isi: Isi = {
      tenants: [{ name: 'Warung Uji' }],
      sales: [struk('s1', '2026-08-10T01:00:00Z'), struk('s2', '2026-08-11T02:00:00Z')],
      sale_items: [barisStruk('b1', 's1'), barisStruk('b2', 's2')],
    }

    const hasil = await tarik(db, palsu(isi, []))

    expect(hasil.berjalan).toBe(true)
    expect(await db.sales.count()).toBe(2)
    expect(await db.saleItems.count()).toBe(2)

    // Watermark diambil dari `updated_at` barisnya, bukan dari jam
    // perangkat: jam HP murah sering meleset berjam-jam, dan watermark
    // yang lebih maju daripada kenyataan berarti baris yang terlewat
    // selamanya.
    const wm = await bacaWatermark(db)
    expect(wm['sales']).toBe('2026-08-11T02:00:00Z')
  })

  it('nama usaha ikut turun, supaya kepala struk di HP kedua sama', async () => {
    await tarik(db, palsu({ tenants: [{ name: 'Warung Uji' }] }, []))
    expect(await getMeta<string>(db, BUSINESS_NAME_KEY)).toBe('Warung Uji')
  })

  it('putaran kedua hanya meminta yang lebih baru dari watermark', async () => {
    const isi: Isi = {
      sales: [struk('s1', '2026-08-10T01:00:00Z')],
      sale_items: [barisStruk('b1', 's1')],
    }
    await tarik(db, palsu(isi, []))

    const jejak: Permintaan[] = []
    isi.sales!.push(struk('s2', '2026-08-12T03:00:00Z'))
    isi.sale_items!.push(barisStruk('b2', 's2'))
    await tarik(db, palsu(isi, jejak))

    const minta = jejak.find((p) => p.tabel === 'sales')
    expect(minta?.gte).toEqual(['updated_at', '2026-08-10T01:00:00Z'])
    expect(await db.sales.count()).toBe(2)
  })

  it('memakai >= supaya dua catatan pada detik yang sama tidak terlewat', async () => {
    // Dengan `>` yang kedua hilang selamanya, dan dua penjualan dalam
    // satu detik itu biasa di jam ramai.
    const sama = '2026-08-10T01:00:00Z'
    const isi: Isi = {
      sales: [struk('s1', sama)],
      sale_items: [barisStruk('b1', 's1')],
    }
    await tarik(db, palsu(isi, []))
    expect(await db.sales.count()).toBe(1)

    isi.sales!.push(struk('s2', sama))
    isi.sale_items!.push(barisStruk('b2', 's2'))
    await tarik(db, palsu(isi, []))

    expect(await db.sales.count()).toBe(2)
  })

  it('yang ditarik menimpa angka rollup yang lokal', async () => {
    // HP ini mengira sisa 8 karena baru menjual 2; peladen tahu 5 karena
    // HP kedua menjual 3 lagi. Yang benar peladen.
    await db.items.put({
      id: 'i1',
      tenant_id: TENANT,
      kind: 'barang',
      name: 'Biskuit',
      photo_path: null,
      price: 5000,
      cost_price: 3000,
      unit: 'pcs',
      stock_qty: 8,
      min_stock: 0,
      barcode: null,
      sold_count: 2,
      sort_order: 0,
      archived_at: null,
    })

    await tarik(
      db,
      palsu(
        {
          items: [
            {
              id: 'i1',
              tenant_id: TENANT,
              kind: 'barang',
              name: 'Biskuit',
              photo_path: null,
              price: 5000,
              cost_price: 3000,
              unit: 'pcs',
              stock_qty: 5,
              min_stock: 0,
              barcode: null,
              sold_count: 5,
              sort_order: 0,
              archived_at: null,
              updated_at: '2026-08-12T04:00:00Z',
            },
          ],
        },
        [],
      ),
    )

    const item = await db.items.get('i1')
    expect(item?.stock_qty).toBe(5)
    expect(item?.sold_count).toBe(5)
  })

  it('pembatalan di HP lain sampai ke sini sebagai perubahan biasa', async () => {
    const isi: Isi = {
      sales: [struk('s1', '2026-08-10T01:00:00Z')],
      sale_items: [barisStruk('b1', 's1')],
    }
    await tarik(db, palsu(isi, []))
    expect((await db.sales.get('s1'))?.voided_at).toBeNull()

    isi.sales = [
      { ...struk('s1', '2026-08-12T05:00:00Z'), voided_at: '2026-08-12T05:00:00Z' },
    ]
    await tarik(db, palsu(isi, []))

    expect((await db.sales.get('s1'))?.voided_at).toBe('2026-08-12T05:00:00Z')
  })
})

describe('kalau turunnya gagal di tengah', () => {
  it('watermark tidak maju, jadi barisnya diminta lagi', async () => {
    const isi: Isi = {
      sales: [struk('s1', '2026-08-10T01:00:00Z')],
      sale_items: [barisStruk('b1', 's1')],
    }

    await expect(tarik(db, palsu(isi, [], { gagalPada: 'sale_items' }))).rejects.toBeTruthy()

    // Struknya sudah terlanjur mendarat — itu tidak apa-apa. Yang tidak
    // boleh adalah watermark ikut maju, karena itu berarti struk tanpa
    // baris yang tidak akan pernah diminta ulang.
    expect(await db.sales.count()).toBe(1)
    expect(await bacaWatermark(db)).toEqual({})
  })

  it('putaran berikutnya melengkapi struk yang barisnya belum ada', async () => {
    const isi: Isi = {
      sales: [struk('s1', '2026-08-10T01:00:00Z')],
      sale_items: [barisStruk('b1', 's1')],
    }
    await expect(tarik(db, palsu(isi, [], { gagalPada: 'sale_items' }))).rejects.toBeTruthy()
    expect(await db.saleItems.count()).toBe(0)

    const hasil = await tarik(db, palsu(isi, []))

    expect(hasil.berjalan).toBe(true)
    expect(await db.saleItems.count()).toBe(1)
  })

  it('tidak meminta ulang baris struk yang sudah lengkap', async () => {
    const isi: Isi = {
      sales: [struk('s1', '2026-08-10T01:00:00Z')],
      sale_items: [barisStruk('b1', 's1')],
    }
    await tarik(db, palsu(isi, []))

    // Struk yang sama ikut tertarik lagi karena pembandingnya `>=`.
    // Baris-barisnya tidak boleh ikut diminta ulang: pada riwayat setahun
    // itu berarti ratusan permintaan sia-sia tiap dua menit.
    const jejak: Permintaan[] = []
    await tarik(db, palsu(isi, jejak))

    expect(jejak.some((p) => p.tabel === 'sale_items')).toBe(false)
  })

  it('menyimpan watermark hanya sekali, di paling akhir', async () => {
    const isi: Isi = {
      items: [
        {
          id: 'i1',
          tenant_id: TENANT,
          kind: 'jasa',
          name: 'Potong celana',
          photo_path: null,
          price: 30000,
          cost_price: 0,
          unit: 'pcs',
          stock_qty: null,
          min_stock: null,
          barcode: null,
          sold_count: 0,
          sort_order: 0,
          archived_at: null,
          updated_at: '2026-08-10T01:00:00Z',
        },
      ],
      sales: [struk('s1', '2026-08-10T02:00:00Z')],
      sale_items: [barisStruk('b1', 's1')],
    }

    await expect(tarik(db, palsu(isi, [], { gagalPada: 'sale_items' }))).rejects.toBeTruthy()

    // Barang sudah turun duluan dan tidak apa-apa; yang penting tidak ada
    // satu pun watermark yang tersimpan, termasuk milik tabel yang sudah
    // selesai. Kalau `items` tersimpan sendiri, kegagalan di tabel lain
    // meninggalkan keadaan setengah yang urutan pemulihannya berbeda tiap
    // kali.
    expect(await db.items.count()).toBe(1)
    expect(await getMeta(db, TARIK_KEY)).toBeUndefined()
  })
})
