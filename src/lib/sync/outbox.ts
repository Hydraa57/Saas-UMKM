import type { LocalDatabase, OutboxItem } from '@/lib/db/local'

/**
 * Antrean kirim.
 *
 * Menyimpan panggilan RPC yang belum sampai ke peladen dan memutarnya
 * ulang saat koneksi kembali. Tiga hal yang menentukan benarnya:
 *
 * **Urutan dijaga.** Pembayaran bisa merujuk penjualan yang dibuat saat
 * luring. Mengirimnya lebih dulu berarti membayar sesuatu yang belum
 * ada. Karena itu antrean diproses berurutan, dan kegagalan sementara
 * menghentikan proses alih-alih melompatinya.
 *
 * **Kegagalan dibedakan.** Sinyal hilang tidak sama dengan data ditolak.
 * Yang pertama harus dicoba lagi selamanya; yang kedua tidak akan pernah
 * berhasil dan hanya akan membekukan antrean kalau terus diulang.
 *
 * **Pengiriman ulang aman.** Setiap panggilan membawa UUID dari
 * perangkat, dan setiap fungsi di peladen idempoten terhadap UUID itu.
 * Ini yang menutup celah paling merusak: permintaan yang *berhasil* di
 * peladen lalu putus sebelum balasannya sampai. Tanpa itu, klien akan
 * mengira gagal, mengirim ulang, dan penjualan tercatat dua kali.
 */

export type SyncOutcome =
  | { readonly ok: true; readonly data?: unknown }
  /**
   * Gagal karena keadaan, bukan karena isinya: sinyal hilang, peladen
   * sedang bermasalah, permintaan kedaluwarsa. Akan berhasil nanti.
   */
  | { readonly ok: false; readonly kind: 'transient'; readonly message: string }
  /**
   * Ditolak karena isinya: melanggar aturan, data rujukan tidak ada,
   * tidak berhak. Mengulangnya seribu kali tidak mengubah apa pun.
   */
  | { readonly ok: false; readonly kind: 'permanent'; readonly message: string }

export type Transport = (
  rpc: string,
  args: Record<string, unknown>,
) => Promise<SyncOutcome>

export interface EnqueueInput {
  readonly id: string
  readonly tenantId: string
  readonly rpc: string
  readonly args: Record<string, unknown>
  readonly now?: Date
}

export async function enqueue(
  db: LocalDatabase,
  input: EnqueueInput,
): Promise<void> {
  const now = input.now ?? new Date()
  const timestamp = now.toISOString()

  // `put`, bukan `add`: menekan tombol simpan dua kali pada aksi yang
  // sama menghasilkan satu antrean, bukan dua. Kunci idempotensi yang
  // sama juga dipakai peladen, jadi perlindungannya berlapis.
  await db.outbox.put({
    id: input.id,
    tenant_id: input.tenantId,
    rpc: input.rpc,
    args: input.args,
    created_at: timestamp,
    attempts: 0,
    next_attempt_at: timestamp,
    status: 'pending',
    last_error: null,
  })
}

const BASE_DELAY_MS = 2_000
const MAX_DELAY_MS = 5 * 60_000

/**
 * Jeda sebelum percobaan berikutnya: 2 detik, 4, 8, 16, … dibatasi lima
 * menit.
 *
 * Batas atasnya penting. Mundur tanpa batas berarti perangkat yang
 * sempat lama luring akan menunggu berjam-jam setelah sinyal kembali —
 * dan bagi ibu itu tidak bisa dibedakan dari catatannya hilang.
 */
export function backoffMs(attempts: number): number {
  return Math.min(BASE_DELAY_MS * 2 ** Math.max(attempts - 1, 0), MAX_DELAY_MS)
}

export interface FlushResult {
  readonly sent: number
  readonly failed: number
  /** Berhenti karena kegagalan sementara; sisanya menunggu giliran. */
  readonly stalled: boolean
  readonly remaining: number
}

/**
 * Mengirimkan antrean, berurutan, sampai habis atau tersendat.
 *
 * Item yang ditolak permanen disingkirkan ke status `failed` dan proses
 * lanjut ke item berikutnya — satu catatan bermasalah tidak boleh
 * menyandera seluruh catatan hari itu. Item yang gagal sementara
 * menghentikan proses, karena melompatinya akan mengacak urutan.
 */
export async function flush(
  db: LocalDatabase,
  transport: Transport,
  now: Date = new Date(),
): Promise<FlushResult> {
  const timestamp = now.toISOString()
  const queue = await db.outbox
    .where('status')
    .equals('pending')
    .sortBy('created_at')

  const ready = queue.filter((item) => item.next_attempt_at <= timestamp)

  let sent = 0
  let failed = 0
  let stalled = false

  for (const item of ready) {
    const outcome = await transport(item.rpc, item.args)

    if (outcome.ok) {
      await db.outbox.delete(item.id)
      sent += 1
      continue
    }

    if (outcome.kind === 'permanent') {
      await db.outbox.update(item.id, {
        status: 'failed',
        last_error: outcome.message,
        attempts: item.attempts + 1,
      })
      failed += 1
      continue
    }

    const attempts = item.attempts + 1
    await db.outbox.update(item.id, {
      attempts,
      last_error: outcome.message,
      next_attempt_at: new Date(now.getTime() + backoffMs(attempts)).toISOString(),
    })
    stalled = true
    break
  }

  return {
    sent,
    failed,
    stalled,
    remaining: await db.outbox.where('status').equals('pending').count(),
  }
}

export function pendingCount(db: LocalDatabase): Promise<number> {
  return db.outbox.where('status').equals('pending').count()
}

export function failedItems(db: LocalDatabase): Promise<OutboxItem[]> {
  return db.outbox.where('status').equals('failed').toArray()
}

/**
 * Mengembalikan item yang ditolak ke antrean.
 *
 * Dipakai setelah penyebabnya diperbaiki — misalnya produk yang dirujuk
 * baru tersinkron dari perangkat lain.
 */
export async function retryFailed(
  db: LocalDatabase,
  ids?: readonly string[],
  now: Date = new Date(),
): Promise<number> {
  const targets = ids
    ? (await db.outbox.bulkGet([...ids])).filter(
        (item): item is OutboxItem => item?.status === 'failed',
      )
    : await failedItems(db)

  await db.outbox.bulkPut(
    targets.map((item) => ({
      ...item,
      status: 'pending' as const,
      attempts: 0,
      next_attempt_at: now.toISOString(),
      last_error: null,
    })),
  )

  return targets.length
}

/**
 * Membuang item yang ditolak permanen.
 *
 * Hanya boleh dipanggil setelah pengguna melihat isinya dan memutuskan
 * catatan itu memang tidak jadi. Membuangnya diam-diam berarti sebuah
 * transaksi hilang tanpa jejak, dan selisihnya baru ketahuan berminggu-
 * minggu kemudian saat saldo tidak cocok dengan laci.
 */
export async function discardFailed(
  db: LocalDatabase,
  ids: readonly string[],
): Promise<void> {
  await db.outbox.bulkDelete([...ids])
}
