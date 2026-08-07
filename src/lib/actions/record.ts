import type { LocalCashEntry, LocalDatabase, LocalQuickEntry } from '@/lib/db/local'
import { enqueue } from '@/lib/sync/outbox'
import type { Rupiah } from '@/lib/money'
import type { Book, Category } from '@/lib/domain/types'

/**
 * Jalur tulis di sisi klien.
 *
 * Satu aturan yang menjelaskan seluruh berkas ini:
 *
 * > **Tidak ada satu pun jalur mencatat yang menunggu jaringan.**
 *
 * Tiap aksi menulis ke IndexedDB lebih dulu, memasukkan panggilan RPC ke
 * antrean, lalu selesai. Layar berubah karena penulisan lokal berhasil,
 * bukan karena peladen menjawab.
 *
 * Pesaing aplikasi ini adalah buku tulis, dan buku tulis terbuka dalam
 * nol detik tanpa sinyal. Aplikasi yang menampilkan lingkaran berputar
 * saat penggunanya ingin mencatat Rp5.000 sudah kalah sebelum fiturnya
 * sempat dinilai.
 *
 * Baris lokal sengaja dibentuk sama persis dengan yang nanti dikirim
 * peladen, supaya hasil tarikan bisa menimpanya tanpa selisih yang
 * terlihat sebagai kedipan di layar.
 */

/** Dipisah supaya pengujian bisa memakai ID dan jam yang tetap. */
export interface ActionContext {
  readonly db: LocalDatabase
  readonly tenantId: string
  readonly newId?: () => string
  readonly now?: () => Date
}

function idFrom(context: ActionContext): string {
  return context.newId ? context.newId() : crypto.randomUUID()
}

function nowFrom(context: ActionContext): Date {
  return context.now ? context.now() : new Date()
}

export interface RecordEntryInput {
  readonly walletId: string
  readonly book: Book
  readonly kind: 'income' | 'expense'
  readonly amount: Rupiah
  readonly category: Category
  /** Keterangan bebas. Kalau diisi, ikut menumbuhkan pintasan. */
  readonly label?: string | null
  /** Untuk memindahkan catatan buku yang belum masuk. */
  readonly occurredAt?: Date
}

export interface RecordResult {
  readonly id: string
}

/**
 * Mencatat satu pemasukan atau pengeluaran.
 *
 * `book` dikirim eksplisit, tidak diambil dari dompet — itulah yang
 * membuat pengguna berdompet tunggal tetap bisa memisahkan uang usaha
 * dari uang rumah tangga.
 */
export async function recordEntry(
  context: ActionContext,
  input: RecordEntryInput,
): Promise<RecordResult> {
  const { db, tenantId } = context
  const id = idFrom(context)
  const now = nowFrom(context)
  const occurredAt = (input.occurredAt ?? now).toISOString()
  const label = input.label?.trim() || null

  const row: LocalCashEntry = {
    id,
    tenant_id: tenantId,
    wallet_id: input.walletId,
    book: input.book,
    occurred_at: occurredAt,
    direction: input.kind === 'income' ? 'in' : 'out',
    amount: input.amount,
    kind: input.kind,
    category: input.category,
    note: label,
    transfer_group_id: null,
    deleted_at: null,
    updated_at: now.toISOString(),
  }

  // Satu transaksi lokal: entri dan pintasannya tersimpan bersama, atau
  // tidak sama sekali. Kalau terpisah, aplikasi bisa menampilkan pintasan
  // untuk catatan yang gagal tersimpan.
  await db.transaction('rw', db.cashEntries, db.quickEntries, async () => {
    await db.cashEntries.put(row)
    if (label) await bumpQuickEntry(context, input, label, occurredAt)
  })

  await enqueue(db, {
    id,
    tenantId,
    rpc: 'record_entry',
    args: {
      p_entry_id: id,
      p_tenant_id: tenantId,
      p_wallet_id: input.walletId,
      p_book: input.book,
      p_kind: input.kind,
      p_amount: input.amount,
      p_category: input.category,
      p_occurred_at: occurredAt,
      p_label: label,
    },
    now,
  })

  return { id }
}

/**
 * Menaikkan pintasan yang sesuai, atau membuatnya kalau belum ada.
 *
 * Cerminan dari apa yang dilakukan peladen di `record_entry`. Keduanya
 * ada supaya daftar pintasan langsung berubah di layar, tanpa menunggu
 * hasil tarikan berikutnya — dan hasil tarikan itu yang jadi kebenaran
 * akhir kalau keduanya sempat berbeda.
 */
async function bumpQuickEntry(
  context: ActionContext,
  input: RecordEntryInput,
  label: string,
  occurredAt: string,
): Promise<void> {
  const { db, tenantId } = context

  const existing = await db.quickEntries
    .where('[book+kind]')
    .equals([input.book, input.kind])
    .filter(
      (row) =>
        row.tenant_id === tenantId &&
        row.category === input.category &&
        row.label === label,
    )
    .first()

  if (existing) {
    await db.quickEntries.update(existing.id, {
      use_count: existing.use_count + 1,
      // Nominal terakhir yang menang: harga naik, dan pintasan yang
      // menawarkan harga lama justru membuat pengguna membetulkannya
      // tiap kali.
      default_amount: input.amount,
      last_used_at: occurredAt,
      archived_at: null,
    })
    return
  }

  const fresh: LocalQuickEntry = {
    id: idFrom(context),
    tenant_id: tenantId,
    book: input.book,
    kind: input.kind,
    category: input.category,
    label,
    default_amount: input.amount,
    use_count: 1,
    last_used_at: occurredAt,
    archived_at: null,
  }
  await db.quickEntries.put(fresh)
}

export interface RecordTransferInput {
  readonly fromWalletId: string
  readonly toWalletId: string
  readonly amount: Rupiah
  readonly note?: string | null
  readonly occurredAt?: Date
}

/**
 * Memindahkan uang antar dompet.
 *
 * Dua entri berpasangan, tanpa buku — memindahkan uang bukan kegiatan
 * usaha maupun rumah tangga, jadi tidak pernah masuk laporan mana pun.
 */
export async function recordTransfer(
  context: ActionContext,
  input: RecordTransferInput,
): Promise<{ readonly transferId: string }> {
  const { db, tenantId } = context

  if (input.fromWalletId === input.toWalletId) {
    throw new Error('Dompet asal dan tujuan sama')
  }

  const transferId = idFrom(context)
  const outId = idFrom(context)
  const inId = idFrom(context)
  const now = nowFrom(context)
  const occurredAt = (input.occurredAt ?? now).toISOString()

  const base = {
    tenant_id: tenantId,
    book: null,
    occurred_at: occurredAt,
    amount: input.amount,
    kind: 'transfer' as const,
    category: 'pindah',
    note: input.note ?? null,
    transfer_group_id: transferId,
    deleted_at: null,
    updated_at: now.toISOString(),
  }

  await db.cashEntries.bulkPut([
    { ...base, id: outId, wallet_id: input.fromWalletId, direction: 'out' },
    { ...base, id: inId, wallet_id: input.toWalletId, direction: 'in' },
  ])

  await enqueue(db, {
    id: transferId,
    tenantId,
    rpc: 'record_transfer',
    args: {
      p_transfer_id: transferId,
      p_tenant_id: tenantId,
      p_from_wallet: input.fromWalletId,
      p_to_wallet: input.toWalletId,
      p_amount: input.amount,
      p_occurred_at: occurredAt,
      p_note: input.note ?? null,
      p_out_entry_id: outId,
      p_in_entry_id: inId,
    },
    now,
  })

  return { transferId }
}

/**
 * Membatalkan sebuah catatan.
 *
 * Penghapusan lunak, dan pemindahan dibatalkan sepasang — membatalkan
 * satu sisinya saja akan membuat uang seolah lenyap dari salah satu
 * dompet.
 *
 * Dipakai oleh tombol urung yang muncul beberapa detik setelah
 * menyimpan. Salah tekan pada aplikasi keuangan harus bisa dibatalkan
 * tanpa memikirkan caranya.
 */
export async function deleteEntry(
  context: ActionContext,
  entryId: string,
): Promise<void> {
  const { db, tenantId } = context
  const now = nowFrom(context)
  const stamp = now.toISOString()

  const entry = await db.cashEntries.get(entryId)
  if (!entry || entry.deleted_at) return

  const group = entry.transfer_group_id
  const ids = group
    ? (await db.cashEntries.toArray())
        .filter((row) => row.transfer_group_id === group)
        .map((row) => row.id)
    : [entryId]

  await db.cashEntries.bulkUpdate(
    ids.map((id) => ({ key: id, changes: { deleted_at: stamp, updated_at: stamp } })),
  )

  await enqueue(db, {
    id: `delete:${entryId}`,
    tenantId,
    rpc: 'delete_entry',
    args: { p_entry_id: entryId, p_tenant_id: tenantId },
    now,
  })
}
