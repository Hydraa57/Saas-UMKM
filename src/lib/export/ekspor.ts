import { db } from '@/lib/db/local'
import { readSales } from '@/lib/db/sales'
import { toItem } from '@/lib/useApp'
import { fromDb } from '@/lib/money'
import { today } from '@/lib/domain/dates'
import { buatXlsx, TIPE_XLSX } from './xlsx'
import { namaBerkas, susunLembar } from './laporan'
import type { CashEntry, Category, Debt, Wallet } from '@/lib/domain/types'

/**
 * Mengumpulkan seluruh isi perangkat lalu mengunduhnya sebagai `.xlsx`.
 *
 * Dibaca dari IndexedDB, bukan dari peladen — jadi ekspornya tetap
 * bekerja tanpa sinyal, dan tetap bekerja walau akunnya belum dibuat.
 * Itu penting: yang paling butuh menyalin datanya keluar justru orang
 * yang belum mencadangkan apa pun.
 */

export async function eksporSemua(namaUsaha: string): Promise<string> {
  const database = db()

  const [items, sales, entries, wallets, debts, movements] = await Promise.all([
    database.items.toArray(),
    readSales(database),
    database.cashEntries.toArray(),
    database.wallets.toArray(),
    database.debts.toArray(),
    database.stockMovements.toArray(),
  ])

  const lembar = susunLembar({
    namaUsaha,
    items: items.map(toItem),
    sales,
    entries: entries.map(
      (row): CashEntry => ({
        id: row.id,
        walletId: row.wallet_id,
        occurredAt: row.occurred_at,
        direction: row.direction,
        amount: fromDb(row.amount),
        kind: row.kind,
        category: row.category as Category,
        note: row.note,
        transferGroupId: row.transfer_group_id,
        deletedAt: row.deleted_at,
      }),
    ),
    wallets: wallets.map(
      (row): Wallet => ({
        id: row.id,
        name: row.name,
        kind: row.kind,
        openingBalance: fromDb(row.opening_balance),
        isDefault: row.is_default,
        archivedAt: row.archived_at,
      }),
    ),
    debts: debts.map(
      (row): Debt => ({
        id: row.id,
        side: row.side,
        person: row.person,
        amount: fromDb(row.amount),
        paidAmount: fromDb(row.paid_amount),
        saleId: row.sale_id,
        occurredAt: row.occurred_at,
        note: row.note,
        settledAt: row.settled_at,
        deletedAt: row.deleted_at,
      }),
    ),
    movements: movements.map((row) => ({
      itemId: row.item_id,
      occurredAt: row.occurred_at,
      qtyChange: row.qty_change,
      reason: row.reason,
      note: row.note,
    })),
  })

  const nama = namaBerkas(namaUsaha, today())
  unduh(buatXlsx(lembar), nama)
  return nama
}

/**
 * Menyerahkan berkas ke pengelola unduhan peramban.
 *
 * Tautan sementara, bukan `window.open`: peramban di Android memblokir
 * jendela yang tidak lahir dari ketukan, dan hasilnya berkasnya diam-diam
 * tidak pernah turun. Alamat objeknya dibebaskan setelah jeda — melepasnya
 * seketika membatalkan unduhan yang belum sempat mulai.
 */
function unduh(data: Uint8Array, nama: string): void {
  const blob = new Blob([data as BlobPart], { type: TIPE_XLSX })
  const alamat = URL.createObjectURL(blob)

  const tautan = document.createElement('a')
  tautan.href = alamat
  tautan.download = nama
  tautan.rel = 'noopener'
  document.body.appendChild(tautan)
  tautan.click()
  tautan.remove()

  setTimeout(() => URL.revokeObjectURL(alamat), 60_000)
}
