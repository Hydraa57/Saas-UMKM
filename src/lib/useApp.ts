'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import {
  ACTIVE_BOOK_KEY,
  HOUSEHOLD_KEY,
  TENANT_KEY,
  db,
  getMeta,
  setMeta,
} from '@/lib/db/local'
import { fromDb } from '@/lib/money'
import type { ActionContext } from '@/lib/actions/record'
import type { Book, Wallet } from '@/lib/domain/types'

/**
 * Konteks aplikasi: tenant aktif dan dompet-dompetnya.
 *
 * Dibaca dari IndexedDB, bukan dari jaringan — layar mana pun harus bisa
 * terbuka penuh tanpa sinyal, termasuk saat baru dibuka pagi hari.
 */

export interface AppContext {
  readonly tenantId: string | null
  readonly wallets: readonly Wallet[]
  readonly defaultWallet: Wallet | null
  readonly householdBook: boolean
  /** Buku yang terakhir dipilih; bertahan antar layar. */
  readonly activeBook: Book
  /** `false` selama pembacaan pertama, supaya layar tidak berkedip. */
  readonly ready: boolean
}

export async function setActiveBook(book: Book): Promise<void> {
  await setMeta(db(), ACTIVE_BOOK_KEY, book)
}

export function useApp(): AppContext {
  const data = useLiveQuery(async () => {
    const tenantId = (await getMeta<string>(db(), TENANT_KEY)) ?? null
    const householdBook = (await getMeta<boolean>(db(), HOUSEHOLD_KEY)) ?? true
    const activeBook =
      (await getMeta<Book>(db(), ACTIVE_BOOK_KEY)) ?? ('usaha' as Book)

    const wallets = (await db().wallets.toArray())
      .filter((row) => !row.archived_at)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(
        (row): Wallet => ({
          id: row.id,
          name: row.name,
          kind: row.kind,
          defaultBook: row.default_book,
          openingBalance: fromDb(row.opening_balance),
          isDefault: row.is_default,
          archivedAt: row.archived_at,
        }),
      )

    return { tenantId, wallets, householdBook, activeBook }
  }, [])

  return {
    tenantId: data?.tenantId ?? null,
    wallets: data?.wallets ?? [],
    defaultWallet:
      data?.wallets.find((wallet) => wallet.isDefault) ?? data?.wallets[0] ?? null,
    householdBook: data?.householdBook ?? true,
    // Buku rumah yang dimatikan tidak boleh menyisakan buku aktif yang
    // tak terjangkau — pemilihnya disembunyikan, jadi tidak ada jalan
    // kembali ke buku usaha.
    activeBook:
      data?.householdBook === false ? 'usaha' : (data?.activeBook ?? 'usaha'),
    ready: data !== undefined,
  }
}

/** Konteks untuk aksi tulis. Melempar kalau dipanggil sebelum siap. */
export function actionContext(tenantId: string): ActionContext {
  return { db: db(), tenantId }
}
