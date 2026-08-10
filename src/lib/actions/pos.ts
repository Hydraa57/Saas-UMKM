import {
  BUSINESS_NAME_KEY,
  BUSINESS_PHONE_KEY,
  TENANT_KEY,
  setMeta,
  type LocalDatabase,
  type LocalSaleItem,
  type LocalStockMovement,
} from '@/lib/db/local'
import { enqueue } from '@/lib/sync/outbox'
import { calculateCart } from '@/lib/domain/cart'
import * as M from '@/lib/money'
import type { Rupiah } from '@/lib/money'
import type {
  BusinessType,
  CartLine,
  Category,
  ItemKind,
  PaymentMethod,
} from '@/lib/domain/types'

/**
 * Jalur tulis di sisi klien.
 *
 * Satu aturan menjelaskan seluruh berkas ini:
 *
 * > **Tidak ada satu pun jalur di kasir yang menunggu jaringan.**
 *
 * Tiap aksi menulis ke IndexedDB lebih dulu, memasukkan panggilan RPC ke
 * antrean, lalu selesai. Struk muncul karena penulisan lokal berhasil,
 * bukan karena peladen menjawab.
 *
 * Akibatnya nomor struk harus dibuat di perangkat juga — pembeli tidak
 * bisa disuruh menunggu sinyal untuk menerima struknya. Peladen tetap
 * memberi nomor resminya saat antrean terkirim; kalau berbeda, yang
 * menang adalah nomor peladen, dan strukku yang sudah tercetak tetap sah
 * karena penjualannya dikenali lewat UUID, bukan lewat nomornya.
 */

export interface ActionContext {
  readonly db: LocalDatabase
  readonly tenantId: string
  readonly newId?: () => string
  readonly now?: () => Date
}

const idFrom = (c: ActionContext | { newId?: () => string }): string =>
  c.newId ? c.newId() : crypto.randomUUID()

const nowFrom = (c: ActionContext | { now?: () => Date }): Date =>
  c.now ? c.now() : new Date()

// ── Katalog ──────────────────────────────────────────────────────────────

export interface ItemInput {
  readonly id?: string
  readonly kind: ItemKind
  readonly name: string
  readonly price: Rupiah
  readonly costPrice?: Rupiah
  readonly unit?: string
  /** Diabaikan untuk jasa. */
  readonly stockQty?: number
  readonly minStock?: number
  readonly barcode?: string | null
  readonly photo?: Blob | null
}

/**
 * Menyimpan barang atau jasa.
 *
 * Stok hanya berlaku untuk barang. Untuk jasa nilainya dipaksa kosong di
 * sini, di peladen, dan di constraint tabel — tiga lapis, karena ini
 * pembeda utama aplikasi dan satu kebocoran saja membuat "Potong celana"
 * bisa kehabisan stok.
 */
export async function saveItem(
  context: ActionContext,
  input: ItemInput,
): Promise<{ readonly id: string }> {
  const { db, tenantId } = context
  const id = input.id ?? idFrom(context)
  const now = nowFrom(context)
  const stamp = now.toISOString()

  const isBarang = input.kind === 'barang'
  const stockQty = isBarang ? (input.stockQty ?? 0) : null
  const minStock = isBarang ? (input.minStock ?? 0) : null
  const existing = await db.items.get(id)
  const movementId = idFrom(context)

  await db.items.put({
    id,
    tenant_id: tenantId,
    kind: input.kind,
    name: input.name.trim(),
    photo_path: existing?.photo_path ?? null,
    price: input.price,
    cost_price: input.costPrice ?? M.ZERO,
    unit: input.unit ?? 'pcs',
    // Menyunting katalog tidak mengubah jumlah stok yang sudah berjalan;
    // stok berubah lewat penjualan, kulakan, dan koreksi.
    stock_qty: existing ? existing.stock_qty : stockQty,
    min_stock: minStock,
    barcode: input.barcode?.trim() || null,
    sold_count: existing?.sold_count ?? 0,
    sort_order: existing?.sort_order ?? 0,
    archived_at: null,
    updated_at: stamp,
  })

  // Stok awal butuh mutasinya sendiri.
  //
  // Tanpa ini, `stock_qty` bergerak tanpa baris yang menjelaskan dari
  // mana angka pertamanya datang, dan penjumlahan seluruh mutasi tidak
  // akan pernah cocok dengan angka tersimpan — untuk selamanya, sebesar
  // stok awalnya. Selisih stok yang tidak bisa dijelaskan adalah awal
  // dari berhenti memercayai angkanya.
  //
  // Hanya saat barangnya benar-benar baru: menyunting katalog tidak
  // mengubah stok, jadi tidak ada mutasi yang boleh lahir dari situ.
  if (!existing && isBarang && stockQty !== null && stockQty !== 0) {
    await db.stockMovements.put({
      id: movementId,
      tenant_id: tenantId,
      item_id: id,
      occurred_at: stamp,
      qty_change: stockQty,
      reason: 'awal',
      source_type: null,
      source_id: null,
      note: 'Stok saat barang didaftarkan',
    })
  }

  if (input.photo) {
    await db.photos.put({
      item_id: id,
      tenant_id: tenantId,
      blob: input.photo,
      uploaded_at: null,
    })
  }

  await enqueue(db, {
    id: `item:${id}`,
    tenantId,
    rpc: 'upsert_item',
    args: {
      p_item_id: id,
      p_tenant_id: tenantId,
      p_kind: input.kind,
      p_name: input.name.trim(),
      p_price: input.price,
      p_cost_price: input.costPrice ?? 0,
      p_unit: input.unit ?? 'pcs',
      p_stock_qty: stockQty,
      p_min_stock: minStock,
      p_barcode: input.barcode?.trim() || null,
      p_movement_id: existing ? null : movementId,
    },
    now,
  })

  return { id }
}

/**
 * Menyembunyikan barang atau jasa dari kasir dan katalog.
 *
 * Diarsipkan, bukan dihapus: barangnya sudah muncul di struk dan di
 * riwayat penjualan, dan menghapusnya membuat laporan bulan lalu berubah
 * setelah dicetak.
 */
export async function archiveItem(
  context: ActionContext,
  itemId: string,
): Promise<void> {
  const { db, tenantId } = context
  const now = nowFrom(context)
  const stamp = now.toISOString()

  await db.items.update(itemId, { archived_at: stamp, updated_at: stamp })

  await enqueue(db, {
    id: `archive:${itemId}`,
    tenantId,
    rpc: 'archive_item',
    args: { p_item_id: itemId, p_archived: true },
    now,
  })
}

// ── Kasir ────────────────────────────────────────────────────────────────

export interface SaleInput {
  readonly lines: readonly CartLine[]
  readonly walletId: string
  readonly paid: Rupiah
  readonly discount?: Rupiah
  readonly method?: PaymentMethod
  readonly customerName?: string | null
  readonly note?: string | null
  readonly occurredAt?: Date
}

export interface SaleResult {
  readonly id: string
  readonly invoiceNo: string
  readonly total: Rupiah
  readonly paid: Rupiah
  readonly outstanding: Rupiah
}

/**
 * Menyimpan satu transaksi kasir.
 *
 * Satu operasi lokal, empat akibat — sama persis dengan yang dilakukan
 * peladen nanti:
 *
 *   penjualan + barisnya → stok berkurang (barang saja) → uang masuk
 *                        → piutang kalau bayarnya kurang
 *
 * Semuanya dalam satu transaksi IndexedDB. Kalau terpisah, aplikasi bisa
 * menampilkan struk untuk penjualan yang stoknya gagal tersimpan.
 */
export async function recordSale(
  context: ActionContext,
  input: SaleInput,
): Promise<SaleResult> {
  const { db, tenantId } = context
  const id = idFrom(context)
  const now = nowFrom(context)
  const occurredAt = (input.occurredAt ?? now).toISOString()
  const stamp = now.toISOString()

  if (input.lines.length === 0) throw new Error('Keranjang kosong')

  const totals = calculateCart(input.lines, input.discount ?? M.ZERO)
  const paid = M.min(M.max(input.paid, M.ZERO), totals.total)
  const outstandingAmount = M.subtract(totals.total, paid)
  const customer = input.customerName?.trim() || null
  const invoiceNo = await nextLocalInvoice(context, now)

  const cashEntryId = idFrom(context)
  const debtId = idFrom(context)

  // `line_no` ikut disimpan karena struk harus terbaca dalam urutan
  // barangnya diketuk. Tanpa itu urutannya mengikuti UUID acak, dan struk
  // yang sama bisa tampil berbeda tiap kali dibuka.
  const saleItems: LocalSaleItem[] = input.lines.map((line, index) => ({
    id: idFrom(context),
    tenant_id: tenantId,
    sale_id: id,
    item_id: line.itemId,
    item_kind: line.itemKind,
    item_name: line.itemName,
    qty: line.qty,
    unit_price: line.unitPrice,
    unit_cost: line.unitCost,
    subtotal: M.multiplyByQty(line.unitPrice, line.qty),
    line_no: index,
  }))

  // Hanya barang yang menggerakkan stok. Jasa dilewati — bukan sebagai
  // kasus khusus yang perlu diingat, tapi karena `stock_qty`-nya memang
  // kosong dan tidak ada yang bisa dikurangi.
  const movements: LocalStockMovement[] = input.lines
    .filter((line) => line.itemId && line.itemKind === 'barang')
    .map((line) => ({
      id: idFrom(context),
      tenant_id: tenantId,
      item_id: line.itemId!,
      occurred_at: occurredAt,
      qty_change: -line.qty,
      reason: 'penjualan',
      source_type: 'sale',
      source_id: id,
      note: null,
    }))

  await db.transaction(
    'rw',
    // Bentuk larik, bukan argumen berjajar: Dexie hanya punya deklarasi
    // tipe sampai lima tabel, dan penjualan menyentuh enam.
    [db.sales, db.saleItems, db.stockMovements, db.items, db.cashEntries, db.debts],
    async () => {
      await db.sales.put({
        id,
        tenant_id: tenantId,
        invoice_no: invoiceNo,
        occurred_at: occurredAt,
        subtotal: totals.subtotal,
        discount: totals.discount,
        total: totals.total,
        paid,
        payment_method: M.isZero(paid) ? 'utang' : (input.method ?? 'tunai'),
        wallet_id: input.walletId,
        customer_name: customer,
        note: input.note ?? null,
        voided_at: null,
        updated_at: stamp,
      })
      await db.saleItems.bulkPut(saleItems)
      await db.stockMovements.bulkPut(movements)

      for (const line of input.lines) {
        if (!line.itemId) continue
        const item = await db.items.get(line.itemId)
        if (!item) continue
        await db.items.update(line.itemId, {
          sold_count: item.sold_count + 1,
          stock_qty:
            item.stock_qty === null ? null : item.stock_qty - line.qty,
          updated_at: stamp,
        })
      }

      if (M.isPositive(paid)) {
        await db.cashEntries.put({
          id: cashEntryId,
          tenant_id: tenantId,
          wallet_id: input.walletId,
          occurred_at: occurredAt,
          direction: 'in',
          amount: paid,
          kind: 'income',
          category: 'penjualan',
          note: `Struk ${invoiceNo}`,
          source_type: 'sale',
          source_id: id,
          transfer_group_id: null,
          deleted_at: null,
          updated_at: stamp,
        })
      }

      // Piutang hanya dibuat kalau tahu siapa yang berutang. Piutang
      // tanpa nama tidak bisa ditagih, dan cuma jadi angka yang membuat
      // laporan terlihat salah.
      if (M.isPositive(outstandingAmount) && customer) {
        await db.debts.put({
          id: debtId,
          tenant_id: tenantId,
          side: 'receivable',
          person: customer,
          amount: outstandingAmount,
          paid_amount: 0,
          sale_id: id,
          occurred_at: occurredAt,
          note: `Struk ${invoiceNo}`,
          settled_at: null,
          deleted_at: null,
          updated_at: stamp,
        })
      }
    },
  )

  await enqueue(db, {
    id,
    tenantId,
    rpc: 'record_sale',
    args: {
      p_sale_id: id,
      p_tenant_id: tenantId,
      p_items: saleItems.map((row) => ({
        id: row.id,
        item_id: row.item_id,
        item_kind: row.item_kind,
        item_name: row.item_name,
        qty: row.qty,
        unit_price: row.unit_price,
        unit_cost: row.unit_cost,
      })),
      p_wallet_id: input.walletId,
      p_paid: paid,
      p_discount: totals.discount,
      p_method: input.method ?? 'tunai',
      p_customer_name: customer,
      p_occurred_at: occurredAt,
      p_note: input.note ?? null,
      p_cash_entry_id: cashEntryId,
      p_debt_id: debtId,
    },
    now,
  })

  return { id, invoiceNo, total: totals.total, paid, outstanding: outstandingAmount }
}

/**
 * Nomor struk sementara, dibuat di perangkat.
 *
 * Pembeli tidak bisa disuruh menunggu sinyal untuk menerima strukya.
 * Nomor resminya diberikan peladen saat antrean terkirim; kalau berbeda,
 * yang menang adalah nomor peladen — dan struk yang sudah tercetak tetap
 * sah, karena penjualannya dikenali lewat UUID, bukan lewat nomornya.
 */
async function nextLocalInvoice(
  context: ActionContext,
  now: Date,
): Promise<string> {
  const year = Number(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
    }).format(now),
  )
  const prefix = `${year}-`
  const count = (await context.db.sales.toArray()).filter((row) =>
    row.invoice_no.startsWith(prefix),
  ).length

  return prefix + String(count + 1).padStart(4, '0')
}

// ── Kulakan & stok ───────────────────────────────────────────────────────

export interface PurchaseLine {
  readonly itemId: string | null
  readonly itemName: string
  readonly qty: number
  readonly unitCost: Rupiah
}

export async function recordPurchase(
  context: ActionContext,
  input: {
    readonly lines: readonly PurchaseLine[]
    readonly walletId: string
    readonly supplierName?: string | null
    readonly note?: string | null
    readonly occurredAt?: Date
  },
): Promise<{ readonly id: string; readonly total: Rupiah }> {
  const { db, tenantId } = context
  const id = idFrom(context)
  const now = nowFrom(context)
  const occurredAt = (input.occurredAt ?? now).toISOString()
  const stamp = now.toISOString()

  if (input.lines.length === 0) throw new Error('Kulakan kosong')

  const total = M.sum(
    input.lines.map((line) => M.multiplyByQty(line.unitCost, line.qty)),
  )
  const cashEntryId = idFrom(context)

  await db.transaction(
    'rw', db.stockMovements, db.items, db.cashEntries,
    async () => {
      for (const line of input.lines) {
        if (!line.itemId) continue
        const item = await db.items.get(line.itemId)
        if (!item || item.kind !== 'barang') continue

        await db.stockMovements.put({
          id: idFrom(context),
          tenant_id: tenantId,
          item_id: line.itemId,
          occurred_at: occurredAt,
          qty_change: line.qty,
          reason: 'kulakan',
          source_type: 'purchase',
          source_id: id,
          note: null,
        })
        await db.items.update(line.itemId, {
          stock_qty: (item.stock_qty ?? 0) + line.qty,
          cost_price: line.unitCost,
          updated_at: stamp,
        })
      }

      await db.cashEntries.put({
        id: cashEntryId,
        tenant_id: tenantId,
        wallet_id: input.walletId,
        occurred_at: occurredAt,
        direction: 'out',
        amount: total,
        kind: 'expense',
        category: 'modal',
        note: input.note ?? input.supplierName ?? null,
        source_type: 'purchase',
        source_id: id,
        transfer_group_id: null,
        deleted_at: null,
        updated_at: stamp,
      })
    },
  )

  await enqueue(db, {
    id,
    tenantId,
    rpc: 'record_purchase',
    args: {
      p_purchase_id: id,
      p_tenant_id: tenantId,
      p_items: input.lines.map((line) => ({
        item_id: line.itemId,
        item_name: line.itemName,
        qty: line.qty,
        unit_cost: line.unitCost,
      })),
      p_wallet_id: input.walletId,
      p_supplier_name: input.supplierName ?? null,
      p_occurred_at: occurredAt,
      p_note: input.note ?? null,
      p_cash_entry_id: cashEntryId,
    },
    now,
  })

  return { id, total }
}

/** Menyetel stok ke hasil hitung fisik. Yang dicatat adalah selisihnya. */
export async function adjustStock(
  context: ActionContext,
  itemId: string,
  countedQty: number,
  note?: string,
): Promise<{ readonly delta: number }> {
  const { db, tenantId } = context
  const item = await db.items.get(itemId)
  if (!item) throw new Error('Barang tidak ditemukan')
  if (item.kind !== 'barang') throw new Error('Jasa tidak punya stok')

  const delta = countedQty - (item.stock_qty ?? 0)
  if (delta === 0) return { delta: 0 }

  const id = idFrom(context)
  const now = nowFrom(context)
  const stamp = now.toISOString()

  await db.transaction('rw', db.stockMovements, db.items, async () => {
    await db.stockMovements.put({
      id,
      tenant_id: tenantId,
      item_id: itemId,
      occurred_at: stamp,
      qty_change: delta,
      reason: 'koreksi',
      source_type: null,
      source_id: null,
      note: note ?? null,
    })
    await db.items.update(itemId, { stock_qty: countedQty, updated_at: stamp })
  })

  await enqueue(db, {
    id,
    tenantId,
    rpc: 'adjust_stock',
    args: {
      p_movement_id: id,
      p_tenant_id: tenantId,
      p_item_id: itemId,
      p_counted_qty: countedQty,
      p_note: note ?? null,
    },
    now,
  })

  return { delta }
}

// ── Biaya lain ───────────────────────────────────────────────────────────

export async function recordExpense(
  context: ActionContext,
  input: {
    readonly walletId: string
    readonly amount: Rupiah
    readonly category: Category
    readonly note?: string | null
    readonly occurredAt?: Date
  },
): Promise<{ readonly id: string }> {
  const { db, tenantId } = context
  const id = idFrom(context)
  const now = nowFrom(context)
  const occurredAt = (input.occurredAt ?? now).toISOString()

  await db.cashEntries.put({
    id,
    tenant_id: tenantId,
    wallet_id: input.walletId,
    occurred_at: occurredAt,
    direction: 'out',
    amount: input.amount,
    kind: 'expense',
    category: input.category,
    note: input.note ?? null,
    source_type: 'manual',
    source_id: null,
    transfer_group_id: null,
    deleted_at: null,
    updated_at: now.toISOString(),
  })

  await enqueue(db, {
    id,
    tenantId,
    rpc: 'record_expense',
    args: {
      p_entry_id: id,
      p_tenant_id: tenantId,
      p_wallet_id: input.walletId,
      p_amount: input.amount,
      p_category: input.category,
      p_occurred_at: occurredAt,
      p_note: input.note ?? null,
    },
    now,
  })

  return { id }
}

// ── Pengaturan awal ──────────────────────────────────────────────────────

export async function setupTenant(
  context: Omit<ActionContext, 'tenantId'> & { readonly tenantId?: string },
  input: {
    readonly name: string
    readonly businessType: BusinessType
    readonly phone?: string | null
  },
): Promise<{ readonly tenantId: string; readonly walletId: string }> {
  const { db } = context
  const newId = context.newId ?? (() => crypto.randomUUID())
  const now = nowFrom(context)
  const tenantId = context.tenantId ?? newId()
  const walletId = newId()
  const stamp = now.toISOString()

  await db.transaction('rw', db.wallets, db.meta, async () => {
    await db.wallets.put({
      id: walletId,
      tenant_id: tenantId,
      name: 'Kas Utama',
      kind: 'tunai',
      opening_balance: 0,
      is_default: true,
      sort_order: 1,
      archived_at: null,
      updated_at: stamp,
    })
    await setMeta(db, TENANT_KEY, tenantId)
    await setMeta(db, BUSINESS_NAME_KEY, input.name.trim())
    if (input.phone) await setMeta(db, BUSINESS_PHONE_KEY, input.phone.trim())
  })

  await enqueue(db, {
    id: tenantId,
    tenantId,
    rpc: 'create_tenant',
    args: {
      p_tenant_id: tenantId,
      p_name: input.name.trim(),
      p_business_type: input.businessType,
      // Dikirim, bukan dibiarkan peladen membuatnya sendiri: penjualan
      // pertama menunjuk dompet ini, dan ID yang berbeda akan membuatnya
      // gagal karena kunci asing.
      p_wallet_id: walletId,
    },
    now,
  })

  return { tenantId, walletId }
}
