import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { LocalDatabase, BUSINESS_NAME_KEY, TENANT_KEY, getMeta } from '@/lib/db/local'
import { rupiah } from '@/lib/money'
import { pendingCount } from '@/lib/sync/outbox'
import {
  adjustStock,
  archiveItem,
  recordExpense,
  recordPurchase,
  recordSale,
  saveItem,
  setupTenant,
  type ActionContext,
} from './pos'

/**
 * Yang diuji di sini bukan "tersimpan atau tidak", melainkan sifat yang
 * menentukan kasir ini dipakai atau ditinggalkan: mencatat penjualan
 * tidak pernah menunggu jaringan, stok jasa tidak pernah berkurang, dan
 * apa pun yang tercatat pasti terkirim.
 */

let db: LocalDatabase
let context: ActionContext
let counter = 0

const TENANT = 'tenant-1'
const KAS = 'wallet-kas'
const NOW = new Date('2026-08-06T03:00:00.000Z')

beforeEach(async () => {
  db = new LocalDatabase(`pos-${++counter}`)
  await db.open()
  let seq = 0
  context = { db, tenantId: TENANT, newId: () => `id-${++seq}`, now: () => NOW }
})

async function seedKatalog() {
  const barang = await saveItem(context, {
    kind: 'barang', name: 'Biskuit Roma', price: rupiah(5_000),
    costPrice: rupiah(3_500), stockQty: 100, minStock: 10,
  })
  const jasa = await saveItem(context, {
    kind: 'jasa', name: 'Potong celana', price: rupiah(30_000),
  })
  return { barang: barang.id, jasa: jasa.id }
}

describe('katalog', () => {
  it('barang punya stok, jasa tidak', async () => {
    const { barang, jasa } = await seedKatalog()

    expect((await db.items.get(barang))?.stock_qty).toBe(100)
    // Pembeda utama aplikasi ini.
    expect((await db.items.get(jasa))?.stock_qty).toBeNull()
  })

  it('stok yang dikirim untuk jasa diabaikan, bukan disimpan', async () => {
    const { id } = await saveItem(context, {
      kind: 'jasa', name: 'Vermak Levis', price: rupiah(25_000),
      stockQty: 999, minStock: 5,
    })
    expect((await db.items.get(id))?.stock_qty).toBeNull()
    expect((await db.items.get(id))?.min_stock).toBeNull()
  })

  it('menyunting katalog tidak mengubah stok yang sudah berjalan', async () => {
    const { barang } = await seedKatalog()
    await db.items.update(barang, { stock_qty: 42 })

    await saveItem(context, {
      id: barang, kind: 'barang', name: 'Biskuit Roma', price: rupiah(6_000),
      stockQty: 100,
    })

    expect((await db.items.get(barang))?.price).toBe(6_000)
    // Stok berubah lewat penjualan, kulakan, dan koreksi — bukan lewat
    // menyunting katalog.
    expect((await db.items.get(barang))?.stock_qty).toBe(42)
  })

  it('foto disimpan sebagai blob di perangkat, unggahannya menyusul', async () => {
    const foto = new Blob(['x'], { type: 'image/webp' })
    const { id } = await saveItem(context, {
      kind: 'barang', name: 'Oreo', price: rupiah(12_000), stockQty: 5, photo: foto,
    })

    const row = await db.photos.get(id)
    expect(row?.blob.size).toBe(1)
    expect(row?.uploaded_at).toBeNull()
  })

  it('stok awal ikut tercatat sebagai mutasi', async () => {
    const { barang, jasa } = await seedKatalog()

    // Tanpa mutasi awal, penjumlahan seluruh mutasi tidak akan pernah
    // cocok dengan `stock_qty` — selamanya meleset sebesar stok awalnya,
    // dan selisih stok yang tidak bisa dijelaskan adalah awal dari
    // berhenti memercayai angkanya.
    const mutasi = (await db.stockMovements.toArray()).filter(
      (m) => m.item_id === barang,
    )
    expect(mutasi).toHaveLength(1)
    expect(mutasi[0]?.reason).toBe('awal')
    expect(mutasi[0]?.qty_change).toBe(100)

    // Jasa tidak punya stok awal, jadi tidak punya mutasi apa pun.
    expect(
      (await db.stockMovements.toArray()).filter((m) => m.item_id === jasa),
    ).toHaveLength(0)
  })

  it('stok awal nol tidak menghasilkan mutasi kosong', async () => {
    const { id } = await saveItem(context, {
      kind: 'barang', name: 'Belum kulakan', price: rupiah(1_000), stockQty: 0,
    })
    expect(
      (await db.stockMovements.toArray()).filter((m) => m.item_id === id),
    ).toHaveLength(0)
  })

  it('menyunting katalog tidak melahirkan mutasi baru', async () => {
    const { barang } = await seedKatalog()
    await saveItem(context, {
      id: barang, kind: 'barang', name: 'Biskuit Roma', price: rupiah(6_000),
      stockQty: 999,
    })

    // Stoknya tidak berubah, jadi tidak ada yang perlu dijelaskan.
    expect(
      (await db.stockMovements.toArray()).filter((m) => m.item_id === barang),
    ).toHaveLength(1)
  })

  it('stok tersimpan selalu sama dengan penjumlahan mutasinya', async () => {
    // Inilah invarian yang membuat angka stok bisa diperiksa, dan
    // satu-satunya alasan riwayat pergerakan ada. Diuji lewat satu hari
    // kerja penuh: didaftarkan, terjual, dikulak, dikoreksi.
    const { barang } = await seedKatalog()

    await recordSale(context, {
      walletId: KAS, paid: rupiah(10_000),
      lines: [{ itemId: barang, itemKind: 'barang', itemName: 'Biskuit Roma',
                qty: 2, unitPrice: rupiah(5_000), unitCost: rupiah(3_500) }],
    })
    await recordPurchase(context, {
      walletId: KAS,
      lines: [{ itemId: barang, itemName: 'Biskuit Roma',
                qty: 20, unitCost: rupiah(3_000) }],
    })
    await adjustStock(context, barang, 100)

    const tersimpan = (await db.items.get(barang))?.stock_qty
    const dariMutasi = (await db.stockMovements.toArray())
      .filter((m) => m.item_id === barang)
      .reduce((sum, m) => sum + m.qty_change, 0)

    expect(tersimpan).toBe(100)
    expect(dariMutasi).toBe(tersimpan)
  })

  it('mengarsipkan menandai, tidak menghapus barisnya', async () => {
    const { barang } = await seedKatalog()
    await archiveItem(context, barang)

    // Barangnya sudah muncul di struk dan riwayat penjualan; menghapus
    // barisnya membuat laporan bulan lalu berubah setelah dicetak.
    expect(await db.items.get(barang)).toBeDefined()
    expect((await db.items.get(barang))?.archived_at).toBe(NOW.toISOString())
  })

  it('arsip ikut antre supaya perangkat lain tidak memunculkannya lagi', async () => {
    const { barang } = await seedKatalog()
    const sebelum = await pendingCount(db)
    await archiveItem(context, barang)

    expect(await pendingCount(db)).toBe(sebelum + 1)
    const antre = await db.outbox.get(`archive:${barang}`)
    expect(antre?.rpc).toBe('archive_item')
  })
})

describe('kasir', () => {
  it('menyimpan penjualan barang + jasa dalam satu struk', async () => {
    const { barang, jasa } = await seedKatalog()
    const hasil = await recordSale(context, {
      walletId: KAS,
      paid: rupiah(45_000),
      lines: [
        { itemId: barang, itemKind: 'barang', itemName: 'Biskuit Roma',
          qty: 3, unitPrice: rupiah(5_000), unitCost: rupiah(3_500) },
        { itemId: jasa, itemKind: 'jasa', itemName: 'Potong celana',
          qty: 1, unitPrice: rupiah(30_000), unitCost: rupiah(0) },
      ],
    })

    expect(hasil.total).toBe(45_000)
    expect(hasil.invoiceNo).toBe('2026-0001')
    expect(await db.saleItems.count()).toBe(2)

    // Urutan keranjang ikut tersimpan. Kunci utamanya UUID acak, jadi
    // tanpa `line_no` struk yang sama bisa tampil dengan urutan berbeda
    // tiap kali dibuka — dan pembeli yang baru melihat barangnya diketuk
    // satu per satu akan menghitung ulang.
    const baris = (await db.saleItems.toArray()).sort(
      (a, b) => a.line_no - b.line_no,
    )
    expect(baris.map((r) => r.item_name)).toEqual([
      'Biskuit Roma',
      'Potong celana',
    ])
  })

  it('stok barang berkurang, stok jasa tidak pernah ada', async () => {
    const { barang, jasa } = await seedKatalog()
    await recordSale(context, {
      walletId: KAS,
      paid: rupiah(45_000),
      lines: [
        { itemId: barang, itemKind: 'barang', itemName: 'Biskuit Roma',
          qty: 3, unitPrice: rupiah(5_000), unitCost: rupiah(3_500) },
        { itemId: jasa, itemKind: 'jasa', itemName: 'Potong celana',
          qty: 1, unitPrice: rupiah(30_000), unitCost: rupiah(0) },
      ],
    })

    expect((await db.items.get(barang))?.stock_qty).toBe(97)
    expect((await db.items.get(jasa))?.stock_qty).toBeNull()
    // Hanya barang yang menghasilkan mutasi penjualan. Mutasi `awal` dari
    // pendaftaran katalog sengaja tidak ikut dihitung di sini.
    expect(
      (await db.stockMovements.toArray()).filter((m) => m.reason === 'penjualan'),
    ).toHaveLength(1)
  })

  it('menjual jasa seratus kali tetap tidak menghabiskan apa pun', async () => {
    const { jasa } = await seedKatalog()
    await recordSale(context, {
      walletId: KAS,
      paid: rupiah(3_000_000),
      lines: [{ itemId: jasa, itemKind: 'jasa', itemName: 'Potong celana',
                qty: 100, unitPrice: rupiah(30_000), unitCost: rupiah(0) }],
    })

    expect((await db.items.get(jasa))?.stock_qty).toBeNull()
    // Nol mutasi **untuk jasa itu**, bukan nol mutasi di seluruh basis
    // data: barang di katalog yang sama punya mutasi stok awalnya sendiri.
    expect(
      (await db.stockMovements.toArray()).filter((m) => m.item_id === jasa),
    ).toHaveLength(0)
  })

  it('uang masuk buku kas sebesar yang dibayar', async () => {
    const { barang } = await seedKatalog()
    const { id } = await recordSale(context, {
      walletId: KAS, paid: rupiah(15_000),
      lines: [{ itemId: barang, itemKind: 'barang', itemName: 'Biskuit Roma',
                qty: 3, unitPrice: rupiah(5_000), unitCost: rupiah(3_500) }],
    })

    const entri = (await db.cashEntries.toArray()).find((r) => r.source_id === id)
    expect(entri?.amount).toBe(15_000)
    expect(entri?.category).toBe('penjualan')
  })

  it('kelebihan bayar jadi kembalian, bukan uang usaha', async () => {
    const { jasa } = await seedKatalog()
    const hasil = await recordSale(context, {
      walletId: KAS, paid: rupiah(50_000),
      lines: [{ itemId: jasa, itemKind: 'jasa', itemName: 'Potong celana',
                qty: 1, unitPrice: rupiah(30_000), unitCost: rupiah(0) }],
    })

    expect(hasil.paid).toBe(30_000)
    expect(hasil.outstanding).toBe(0)
  })

  it('kurang bayar dengan nama jadi piutang', async () => {
    const { barang } = await seedKatalog()
    await recordSale(context, {
      walletId: KAS, paid: rupiah(0), customerName: 'Bu Tetangga',
      lines: [{ itemId: barang, itemKind: 'barang', itemName: 'Biskuit Roma',
                qty: 2, unitPrice: rupiah(5_000), unitCost: rupiah(3_500) }],
    })

    const utang = await db.debts.toArray()
    expect(utang).toHaveLength(1)
    expect(utang[0]?.amount).toBe(10_000)
    expect(utang[0]?.person).toBe('Bu Tetangga')
    // Uangnya belum masuk, jadi belum ada entri kas.
    expect(await db.cashEntries.count()).toBe(0)
    // Tapi barangnya sudah keluar.
    expect((await db.items.get(barang))?.stock_qty).toBe(98)
  })

  it('kurang bayar tanpa nama tidak jadi piutang', async () => {
    const { barang } = await seedKatalog()
    await recordSale(context, {
      walletId: KAS, paid: rupiah(3_000),
      lines: [{ itemId: barang, itemKind: 'barang', itemName: 'Biskuit Roma',
                qty: 1, unitPrice: rupiah(5_000), unitCost: rupiah(3_500) }],
    })
    expect(await db.debts.count()).toBe(0)
  })

  it('barang di luar katalog tetap bisa dijual', async () => {
    const hasil = await recordSale(context, {
      walletId: KAS, paid: rupiah(7_000),
      lines: [{ itemId: null, itemKind: 'barang', itemName: 'Titipan tetangga',
                qty: 1, unitPrice: rupiah(7_000), unitCost: rupiah(0) }],
    })
    expect(hasil.total).toBe(7_000)
    expect(await db.stockMovements.count()).toBe(0)
  })

  it('nomor struk berurutan per tahun', async () => {
    const { jasa } = await seedKatalog()
    const line = { itemId: jasa, itemKind: 'jasa' as const, itemName: 'Potong celana',
                   qty: 1, unitPrice: rupiah(30_000), unitCost: rupiah(0) }

    const a = await recordSale(context, { walletId: KAS, paid: rupiah(30_000), lines: [line] })
    const b = await recordSale(context, { walletId: KAS, paid: rupiah(30_000), lines: [line] })

    expect(a.invoiceNo).toBe('2026-0001')
    expect(b.invoiceNo).toBe('2026-0002')
  })

  it('keranjang kosong ditolak', async () => {
    await expect(
      recordSale(context, { walletId: KAS, paid: rupiah(0), lines: [] }),
    ).rejects.toThrow('kosong')
    expect(await pendingCount(db)).toBe(0)
  })

  it('mengirim ID barisnya, supaya peladen memakai ID yang sama', async () => {
    const { barang } = await seedKatalog()
    const { id } = await recordSale(context, {
      walletId: KAS, paid: rupiah(5_000),
      lines: [{ itemId: barang, itemKind: 'barang', itemName: 'Biskuit Roma',
                qty: 1, unitPrice: rupiah(5_000), unitCost: rupiah(3_500) }],
    })

    const queued = await db.outbox.get(id)
    const local = (await db.saleItems.toArray()).map((r) => r.id)
    const sent = (queued?.args.p_items as Array<{ id: string }>).map((r) => r.id)
    expect(sent).toEqual(local)
  })
})

describe('kulakan & stok', () => {
  it('kulakan menambah stok, memperbarui modal, dan mencatat uang keluar', async () => {
    const { barang } = await seedKatalog()
    const hasil = await recordPurchase(context, {
      walletId: KAS,
      supplierName: 'Toko Grosir',
      lines: [{ itemId: barang, itemName: 'Biskuit Roma', qty: 50, unitCost: rupiah(3_600) }],
    })

    expect(hasil.total).toBe(180_000)
    const item = await db.items.get(barang)
    expect(item?.stock_qty).toBe(150)
    expect(item?.cost_price).toBe(3_600)

    const entri = (await db.cashEntries.toArray()).find((r) => r.source_id === hasil.id)
    expect(entri?.direction).toBe('out')
    expect(entri?.category).toBe('modal')
  })

  it('koreksi mencatat selisihnya, bukan angka akhirnya', async () => {
    const { barang } = await seedKatalog()
    const { delta } = await adjustStock(context, barang, 95, 'Hitung fisik')

    expect(delta).toBe(-5)
    expect((await db.items.get(barang))?.stock_qty).toBe(95)

    // Yang disimpan selisihnya, bukan hasil hitung fisiknya. Kalau yang
    // disimpan angka akhirnya, penjumlahan mutasi berhenti bisa dipakai
    // memeriksa `stock_qty` sama sekali.
    const koreksi = (await db.stockMovements.toArray()).filter(
      (m) => m.reason === 'koreksi',
    )
    expect(koreksi).toHaveLength(1)
    expect(koreksi[0]?.qty_change).toBe(-5)
  })

  it('koreksi tanpa selisih tidak mencatat apa pun', async () => {
    const { barang } = await seedKatalog()
    const { delta } = await adjustStock(context, barang, 100)
    expect(delta).toBe(0)
    expect(
      (await db.stockMovements.toArray()).filter((m) => m.reason === 'koreksi'),
    ).toHaveLength(0)
  })

  it('jasa tidak bisa dikoreksi stoknya', async () => {
    const { jasa } = await seedKatalog()
    await expect(adjustStock(context, jasa, 10)).rejects.toThrow('Jasa')
  })
})

describe('biaya lain', () => {
  it('tercatat sebagai uang keluar', async () => {
    const { id } = await recordExpense(context, {
      walletId: KAS, amount: rupiah(25_000),
      category: 'operasional', note: 'Plastik & label',
    })

    const entri = await db.cashEntries.get(id)
    expect(entri?.direction).toBe('out')
    expect(entri?.category).toBe('operasional')
  })
})

describe('pengaturan awal', () => {
  it('membuat satu dompet dan menyimpan identitas usaha', async () => {
    const { tenantId, walletId } = await setupTenant(
      { db, newId: () => `s-${++counter}`, now: () => NOW },
      { name: '  Toko Bu Ani  ', businessType: 'campuran', phone: '081234567890' },
    )

    expect(await db.wallets.count()).toBe(1)
    expect(await getMeta<string>(db, TENANT_KEY)).toBe(tenantId)
    expect(await getMeta<string>(db, BUSINESS_NAME_KEY)).toBe('Toko Bu Ani')
    expect((await db.outbox.get(tenantId))?.args.p_wallet_id).toBe(walletId)
  })
})

describe('apa pun yang tercatat pasti terkirim', () => {
  it('tiap aksi meninggalkan tepat satu antrean', async () => {
    const { barang } = await seedKatalog()   // 2 antrean (dua item)
    await recordSale(context, {              // 1
      walletId: KAS, paid: rupiah(5_000),
      lines: [{ itemId: barang, itemKind: 'barang', itemName: 'Biskuit Roma',
                qty: 1, unitPrice: rupiah(5_000), unitCost: rupiah(3_500) }],
    })
    await recordPurchase(context, {          // 1
      walletId: KAS,
      lines: [{ itemId: barang, itemName: 'Biskuit Roma', qty: 10, unitCost: rupiah(3_600) }],
    })
    await recordExpense(context, {           // 1
      walletId: KAS, amount: rupiah(5_000), category: 'operasional',
    })

    expect(await pendingCount(db)).toBe(5)
  })
})
