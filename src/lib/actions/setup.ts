import {
  HOUSEHOLD_KEY,
  TENANT_KEY,
  setMeta,
  type LocalQuickEntry,
} from '@/lib/db/local'
import { enqueue } from '@/lib/sync/outbox'
import type { ActionContext } from './record'
import type { Book, BusinessType, Category } from '@/lib/domain/types'

/**
 * Pengaturan awal.
 *
 * Cerminan dari `create_tenant` di peladen: tenant, satu dompet bawaan,
 * dan beberapa pintasan semaian. Dikerjakan di perangkat lebih dulu
 * supaya pengguna bisa langsung mencatat — termasuk kalau pendaftarannya
 * dilakukan di tempat tanpa sinyal, yang justru sering terjadi.
 *
 * Sengaja **satu dompet saja**. Mayoritas usaha mikro memang cuma punya
 * satu tempat uang, dan meminta mereka menyiapkan beberapa dompet di
 * awal adalah persis jenis gerbang yang membuat orang berhenti sebelum
 * manfaat pertama terasa. Yang sudah memisahkan uangnya tinggal
 * menambah sendiri; pemisahan dua buku tetap jalan tanpa itu.
 */

interface Seed {
  readonly book: Book
  readonly kind: 'income' | 'expense'
  readonly category: Category
  readonly label: string
}

/**
 * Pintasan semaian per jenis usaha.
 *
 * Sedikit, dan bernominal nol: ini usulan bentuk catatan, bukan tebakan
 * harga. Yang tidak terpakai tenggelam sendiri karena daftar diurutkan
 * menurut frekuensi.
 */
const SEEDS: Readonly<Record<BusinessType, readonly Seed[]>> = {
  dagang: [
    { book: 'usaha', kind: 'income', category: 'penjualan', label: 'Penjualan hari ini' },
    { book: 'usaha', kind: 'expense', category: 'modal', label: 'Belanja kulakan' },
  ],
  makanan: [
    { book: 'usaha', kind: 'income', category: 'penjualan', label: 'Penjualan hari ini' },
    { book: 'usaha', kind: 'expense', category: 'modal', label: 'Belanja bahan' },
  ],
  jasa: [
    { book: 'usaha', kind: 'income', category: 'jasa', label: 'Jasa hari ini' },
    { book: 'usaha', kind: 'expense', category: 'operasional', label: 'Ongkos usaha' },
  ],
  campuran: [
    { book: 'usaha', kind: 'income', category: 'penjualan', label: 'Penjualan hari ini' },
    { book: 'usaha', kind: 'income', category: 'jasa', label: 'Jasa hari ini' },
    { book: 'usaha', kind: 'expense', category: 'modal', label: 'Belanja kulakan' },
  ],
  lainnya: [
    { book: 'usaha', kind: 'income', category: 'penjualan', label: 'Pemasukan hari ini' },
    { book: 'usaha', kind: 'expense', category: 'operasional', label: 'Pengeluaran usaha' },
  ],
}

const SEEDS_RUMAH: readonly Seed[] = [
  { book: 'rumah', kind: 'expense', category: 'belanja', label: 'Belanja dapur' },
  { book: 'rumah', kind: 'expense', category: 'transportasi', label: 'Bensin' },
]

export interface SetupInput {
  readonly name: string
  readonly businessType: BusinessType
  readonly householdBook: boolean
}

export interface SetupResult {
  readonly tenantId: string
  readonly walletId: string
}

export async function setupTenant(
  context: Omit<ActionContext, 'tenantId'> & { readonly tenantId?: string },
  input: SetupInput,
): Promise<SetupResult> {
  const { db } = context
  const newId = context.newId ?? (() => crypto.randomUUID())
  const now = context.now ? context.now() : new Date()

  const tenantId = context.tenantId ?? newId()
  const walletId = newId()
  const stamp = now.toISOString()

  await db.transaction('rw', db.wallets, db.quickEntries, db.meta, async () => {
    await db.wallets.put({
      id: walletId,
      tenant_id: tenantId,
      name: 'Dompet Utama',
      kind: 'tunai',
      default_book: null,
      opening_balance: 0,
      is_default: true,
      sort_order: 1,
      archived_at: null,
      updated_at: stamp,
    })

    const seeds = [
      ...SEEDS[input.businessType],
      ...(input.householdBook ? SEEDS_RUMAH : []),
    ]

    const rows: LocalQuickEntry[] = seeds.map((seed) => ({
      id: newId(),
      tenant_id: tenantId,
      book: seed.book,
      kind: seed.kind,
      category: seed.category,
      label: seed.label,
      default_amount: 0,
      use_count: 0,
      last_used_at: null,
      archived_at: null,
      updated_at: stamp,
    }))
    await db.quickEntries.bulkPut(rows)

    await setMeta(db, TENANT_KEY, tenantId)
    await setMeta(db, HOUSEHOLD_KEY, input.householdBook)
  })

  await enqueue(db, {
    id: tenantId,
    tenantId,
    rpc: 'create_tenant',
    args: {
      p_tenant_id: tenantId,
      p_name: input.name.trim(),
      p_business_type: input.businessType,
      p_household_book: input.householdBook,
      // Dikirim, bukan dibiarkan peladen membuatnya sendiri: entri
      // pertama yang menyusul menunjuk dompet ini, dan ID yang berbeda
      // akan membuatnya gagal karena kunci asing.
      p_wallet_id: walletId,
    },
    now,
  })

  return { tenantId, walletId }
}
