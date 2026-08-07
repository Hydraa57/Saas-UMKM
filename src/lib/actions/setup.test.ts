import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { HOUSEHOLD_KEY, LocalDatabase, TENANT_KEY, getMeta } from '@/lib/db/local'
import { rupiah } from '@/lib/money'
import { setupTenant } from './setup'
import { recordEntry } from './record'

let db: LocalDatabase
let counter = 0
const NOW = new Date('2026-08-06T03:00:00.000Z')

function context() {
  let seq = 0
  return { db, newId: () => `id-${++seq}`, now: () => NOW }
}

beforeEach(async () => {
  db = new LocalDatabase(`setup-${++counter}`)
  await db.open()
})

describe('pengaturan awal', () => {
  it('membuat satu dompet bawaan, bukan beberapa', async () => {
    await setupTenant(context(), {
      name: 'Warung Bu Ani',
      businessType: 'dagang',
      householdBook: true,
    })

    const wallets = await db.wallets.toArray()
    expect(wallets).toHaveLength(1)
    expect(wallets[0]?.is_default).toBe(true)
    // Tidak terikat buku mana pun — pemisahan terjadi per catatan.
    expect(wallets[0]?.default_book).toBeNull()
  })

  it('menyimpan tenant dan pilihan buku rumah', async () => {
    const { tenantId } = await setupTenant(context(), {
      name: 'Warung Bu Ani',
      businessType: 'dagang',
      householdBook: false,
    })

    expect(await getMeta<string>(db, TENANT_KEY)).toBe(tenantId)
    expect(await getMeta<boolean>(db, HOUSEHOLD_KEY)).toBe(false)
  })

  it('menyemai pintasan sesuai jenis usaha', async () => {
    await setupTenant(context(), {
      name: 'Jasa Jahit',
      businessType: 'jasa',
      householdBook: false,
    })

    const quick = await db.quickEntries.toArray()
    expect(quick.map((row) => row.category).sort()).toEqual([
      'jasa',
      'operasional',
    ])
    // Nominal nol: usulan bentuk catatan, bukan tebakan harga.
    expect(quick.every((row) => row.default_amount === 0)).toBe(true)
    expect(quick.every((row) => row.use_count === 0)).toBe(true)
  })

  it('usaha campuran disemai pintasan barang sekaligus jasa', async () => {
    await setupTenant(context(), {
      name: 'Toko & Jahit',
      businessType: 'campuran',
      householdBook: false,
    })

    const kategori = (await db.quickEntries.toArray()).map((row) => row.category)
    expect(kategori).toContain('penjualan')
    expect(kategori).toContain('jasa')
  })

  it('buku rumah yang dimatikan tidak disemai pintasan', async () => {
    await setupTenant(context(), {
      name: 'Toko',
      businessType: 'dagang',
      householdBook: false,
    })

    const rumah = (await db.quickEntries.toArray()).filter(
      (row) => row.book === 'rumah',
    )
    expect(rumah).toHaveLength(0)
  })

  it('buku rumah yang menyala disemai belanja dan transportasi', async () => {
    await setupTenant(context(), {
      name: 'Toko',
      businessType: 'dagang',
      householdBook: true,
    })

    const rumah = (await db.quickEntries.toArray()).filter(
      (row) => row.book === 'rumah',
    )
    expect(rumah.map((row) => row.category).sort()).toEqual([
      'belanja',
      'transportasi',
    ])
  })
})

describe('kesepadanan dengan peladen', () => {
  it('mengirim ID dompet, tidak membiarkan peladen membuatnya sendiri', async () => {
    // Kalau ID-nya berbeda, entri pertama yang menyusul akan menunjuk
    // dompet yang tidak ada di peladen dan gagal karena kunci asing —
    // tepat setelah pengguna mengira catatannya sudah aman.
    const { tenantId, walletId } = await setupTenant(context(), {
      name: 'Warung', businessType: 'dagang', householdBook: true,
    })

    const queued = await db.outbox.get(tenantId)
    expect(queued?.rpc).toBe('create_tenant')
    expect(queued?.args.p_wallet_id).toBe(walletId)
    expect(queued?.args.p_tenant_id).toBe(tenantId)
  })

  it('nama dirapikan dari spasi berlebih', async () => {
    const { tenantId } = await setupTenant(context(), {
      name: '  Warung Bu Ani  ', businessType: 'dagang', householdBook: true,
    })
    expect((await db.outbox.get(tenantId))?.args.p_name).toBe('Warung Bu Ani')
  })
})

describe('langsung bisa mencatat setelah pengaturan', () => {
  it('entri pertama memakai dompet yang baru dibuat', async () => {
    const { tenantId, walletId } = await setupTenant(context(), {
      name: 'Warung', businessType: 'dagang', householdBook: true,
    })

    const { id } = await recordEntry(
      { db, tenantId, newId: () => 'entry-1', now: () => NOW },
      {
        walletId,
        book: 'usaha',
        kind: 'income',
        amount: rupiah(85_000),
        category: 'penjualan',
      },
    )

    expect((await db.cashEntries.get(id))?.wallet_id).toBe(walletId)
    // Pengaturan + entri pertama = dua panggilan yang menunggu kirim,
    // dan urutannya terjaga karena antrean diproses berurutan.
    expect(await db.outbox.count()).toBe(2)
  })
})
