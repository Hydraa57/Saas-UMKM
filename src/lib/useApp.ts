'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import {
  BUSINESS_NAME_KEY,
  BUSINESS_PHONE_KEY,
  TENANT_KEY,
  db,
  getMeta,
  type LocalItem,
} from '@/lib/db/local'
import { fromDb } from '@/lib/money'
import type { ActionContext } from '@/lib/actions/pos'
import type { Item, Wallet } from '@/lib/domain/types'

/**
 * Konteks aplikasi: tenant aktif, dompet, dan identitas usaha.
 *
 * Dibaca dari IndexedDB, bukan dari jaringan — layar mana pun harus bisa
 * terbuka penuh tanpa sinyal, termasuk kasir saat pembeli sudah menunggu.
 */

export interface AppContext {
  readonly tenantId: string | null
  readonly businessName: string
  readonly businessPhone: string | null
  readonly wallets: readonly Wallet[]
  readonly defaultWallet: Wallet | null
  /** `false` selama pembacaan pertama, supaya layar tidak berkedip. */
  readonly ready: boolean
}

export function useApp(): AppContext {
  const data = useLiveQuery(async () => {
    const tenantId = (await getMeta<string>(db(), TENANT_KEY)) ?? null
    const businessName = (await getMeta<string>(db(), BUSINESS_NAME_KEY)) ?? 'Usaha'
    const businessPhone = (await getMeta<string>(db(), BUSINESS_PHONE_KEY)) ?? null

    const wallets = (await db().wallets.toArray())
      .filter((row) => !row.archived_at)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(
        (row): Wallet => ({
          id: row.id,
          name: row.name,
          kind: row.kind,
          openingBalance: fromDb(row.opening_balance),
          isDefault: row.is_default,
          archivedAt: row.archived_at,
        }),
      )

    return { tenantId, businessName, businessPhone, wallets }
  }, [])

  return {
    tenantId: data?.tenantId ?? null,
    businessName: data?.businessName ?? 'Usaha',
    businessPhone: data?.businessPhone ?? null,
    wallets: data?.wallets ?? [],
    defaultWallet:
      data?.wallets.find((w) => w.isDefault) ?? data?.wallets[0] ?? null,
    ready: data !== undefined,
  }
}

/**
 * Baris katalog lokal → tipe domain.
 *
 * Pemisahan barang/jasa dikembalikan ke tipe di sini: `stockQty` hanya
 * ada pada barang, jadi kode yang mencoba mengurangi stok sebuah jasa
 * tidak akan lolos pemeriksaan tipe sama sekali.
 */
export function toItem(row: LocalItem): Item {
  const base = {
    id: row.id,
    name: row.name,
    photoPath: row.photo_path,
    price: fromDb(row.price),
    costPrice: fromDb(row.cost_price),
    unit: row.unit,
    barcode: row.barcode,
    soldCount: row.sold_count,
    archivedAt: row.archived_at,
  }

  return row.kind === 'barang'
    ? { ...base, kind: 'barang', stockQty: row.stock_qty ?? 0, minStock: row.min_stock ?? 0 }
    : { ...base, kind: 'jasa' }
}

/** Katalog aktif, diurutkan dari yang paling sering terjual. */
export function useCatalog(): readonly Item[] {
  return (
    useLiveQuery(async () =>
      (await db().items.toArray())
        .filter((row) => !row.archived_at)
        .sort((a, b) => b.sold_count - a.sold_count || a.name.localeCompare(b.name))
        .map(toItem),
    ) ?? []
  )
}

export function actionContext(tenantId: string): ActionContext {
  return { db: db(), tenantId }
}
