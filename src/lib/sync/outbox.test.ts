import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LocalDatabase } from '@/lib/db/local'
import {
  backoffMs,
  discardFailed,
  enqueue,
  failedItems,
  flush,
  pendingCount,
  retryFailed,
  type SyncOutcome,
  type Transport,
} from './outbox'

let db: LocalDatabase
let counter = 0

beforeEach(async () => {
  db = new LocalDatabase(`test-${++counter}`)
  await db.open()
})

const AT = (iso: string): Date => new Date(iso)
const T0 = AT('2026-08-06T10:00:00.000Z')

async function queue(id: string, rpc = 'record_sale', now = T0): Promise<void> {
  await enqueue(db, { id, tenantId: 'tenant-1', rpc, args: { p_sale_id: id }, now })
}

const ok: Transport = async () => ({ ok: true })
const offline: Transport = async () => ({
  ok: false,
  kind: 'transient',
  message: 'Tidak ada koneksi',
})
const rejected: Transport = async () => ({
  ok: false,
  kind: 'permanent',
  message: 'Produk tidak ditemukan',
})

describe('enqueue', () => {
  it('menyimpan maksud, bukan barisnya', async () => {
    await queue('sale-1')
    const item = await db.outbox.get('sale-1')

    expect(item?.rpc).toBe('record_sale')
    expect(item?.args).toEqual({ p_sale_id: 'sale-1' })
    expect(item?.status).toBe('pending')
    expect(item?.attempts).toBe(0)
  })

  it('menekan simpan dua kali menghasilkan satu antrean', async () => {
    await queue('sale-1')
    await queue('sale-1')
    expect(await db.outbox.count()).toBe(1)
  })
})

describe('flush', () => {
  it('mengirim dan menghapus dari antrean', async () => {
    await queue('sale-1')
    await queue('sale-2')

    const result = await flush(db, ok, T0)

    expect(result.sent).toBe(2)
    expect(result.remaining).toBe(0)
    expect(await db.outbox.count()).toBe(0)
  })

  it('antrean kosong bukan kesalahan', async () => {
    const result = await flush(db, ok, T0)
    expect(result).toEqual({ sent: 0, failed: 0, stalled: false, remaining: 0 })
  })

  it('menjaga urutan pengiriman', async () => {
    // Pembayaran bisa merujuk penjualan yang dibuat saat luring.
    // Mengirimnya terbalik berarti membayar sesuatu yang belum ada.
    const seen: string[] = []
    const recording: Transport = async (rpc, args) => {
      seen.push(String(args.p_sale_id ?? rpc))
      return { ok: true }
    }

    await queue('sale-1', 'record_sale', AT('2026-08-06T10:00:00Z'))
    await queue('sale-2', 'record_sale', AT('2026-08-06T10:00:01Z'))
    await queue('sale-3', 'record_sale', AT('2026-08-06T10:00:02Z'))

    await flush(db, recording, AT('2026-08-06T11:00:00Z'))
    expect(seen).toEqual(['sale-1', 'sale-2', 'sale-3'])
  })

  it('berhenti di kegagalan sementara, tidak melompatinya', async () => {
    await queue('sale-1', 'record_sale', AT('2026-08-06T10:00:00Z'))
    await queue('sale-2', 'record_sale', AT('2026-08-06T10:00:01Z'))

    const result = await flush(db, offline, AT('2026-08-06T11:00:00Z'))

    expect(result.sent).toBe(0)
    expect(result.stalled).toBe(true)
    expect(result.remaining).toBe(2)
    // Yang kedua tidak boleh ikut terhitung mencoba.
    expect((await db.outbox.get('sale-2'))?.attempts).toBe(0)
  })

  it('menyingkirkan penolakan permanen dan melanjutkan', async () => {
    // Satu catatan bermasalah tidak boleh menyandera catatan hari itu.
    let call = 0
    const mixed: Transport = async () => {
      call += 1
      return call === 1
        ? { ok: false, kind: 'permanent', message: 'Ditolak' }
        : { ok: true }
    }

    await queue('sale-1', 'record_sale', AT('2026-08-06T10:00:00Z'))
    await queue('sale-2', 'record_sale', AT('2026-08-06T10:00:01Z'))

    const result = await flush(db, mixed, AT('2026-08-06T11:00:00Z'))

    expect(result.failed).toBe(1)
    expect(result.sent).toBe(1)
    expect(result.stalled).toBe(false)
    expect((await db.outbox.get('sale-1'))?.status).toBe('failed')
    expect(await db.outbox.get('sale-2')).toBeUndefined()
  })

  it('menyimpan pesan kegagalan supaya bisa dijelaskan ke pengguna', async () => {
    await queue('sale-1')
    await flush(db, rejected, T0)
    expect((await db.outbox.get('sale-1'))?.last_error).toBe('Produk tidak ditemukan')
  })

  it('menghormati jeda mundur — belum waktunya, belum dikirim', async () => {
    await queue('sale-1')
    await flush(db, offline, T0)

    const attempt = await db.outbox.get('sale-1')
    expect(attempt?.attempts).toBe(1)
    expect(attempt?.next_attempt_at).toBe('2026-08-06T10:00:02.000Z')

    // Satu detik kemudian: masih terlalu cepat.
    const tooSoon = await flush(db, ok, AT('2026-08-06T10:00:01Z'))
    expect(tooSoon.sent).toBe(0)

    // Setelah jedanya lewat.
    const later = await flush(db, ok, AT('2026-08-06T10:00:03Z'))
    expect(later.sent).toBe(1)
  })

  it('jeda memanjang tiap kegagalan, sampai batasnya', async () => {
    expect(backoffMs(1)).toBe(2_000)
    expect(backoffMs(2)).toBe(4_000)
    expect(backoffMs(3)).toBe(8_000)
    expect(backoffMs(10)).toBe(300_000)
    // Batas atas penting: mundur tanpa batas tidak bisa dibedakan dari
    // catatan yang hilang.
    expect(backoffMs(100)).toBe(300_000)
  })
})

describe('idempotensi', () => {
  it('pengiriman ulang setelah balasan hilang tidak menggandakan apa pun', async () => {
    // Kegagalan paling merusak: peladen berhasil memproses, lalu
    // koneksi putus sebelum balasannya sampai.
    const calls: Array<Record<string, unknown>> = []
    const flaky: Transport = async (_rpc, args) => {
      calls.push(args)
      return calls.length === 1
        ? { ok: false, kind: 'transient', message: 'Koneksi terputus' }
        : { ok: true }
    }

    await queue('sale-1')
    await flush(db, flaky, T0)
    await flush(db, flaky, AT('2026-08-06T10:00:05Z'))

    expect(calls).toHaveLength(2)
    // Argumen identik, termasuk UUID — itulah yang membuat peladen bisa
    // mengenali pengiriman kedua sebagai pengulangan.
    expect(calls[0]).toEqual(calls[1])
    expect(await db.outbox.count()).toBe(0)
  })
})

describe('pemulihan', () => {
  it('mengembalikan yang ditolak ke antrean', async () => {
    await queue('sale-1')
    await flush(db, rejected, T0)
    expect(await pendingCount(db)).toBe(0)

    const restored = await retryFailed(db, undefined, AT('2026-08-06T12:00:00Z'))

    expect(restored).toBe(1)
    expect(await pendingCount(db)).toBe(1)
    expect((await db.outbox.get('sale-1'))?.attempts).toBe(0)
    expect((await db.outbox.get('sale-1'))?.last_error).toBeNull()
  })

  it('bisa memilih item tertentu saja', async () => {
    await queue('sale-1')
    await queue('sale-2')
    await flush(db, rejected, T0)

    await retryFailed(db, ['sale-1'], AT('2026-08-06T12:00:00Z'))

    expect(await pendingCount(db)).toBe(1)
    expect((await failedItems(db)).map((item) => item.id)).toEqual(['sale-2'])
  })

  it('membuang hanya yang diminta', async () => {
    await queue('sale-1')
    await queue('sale-2')
    await flush(db, rejected, T0)

    await discardFailed(db, ['sale-1'])

    expect((await failedItems(db)).map((item) => item.id)).toEqual(['sale-2'])
  })
})

describe('perilaku saat luring berkepanjangan', () => {
  it('catatan sehari penuh tetap utuh dan terkirim berurutan saat sinyal kembali', async () => {
    const sent: string[] = []
    let online = false
    const transport: Transport = async (_rpc, args) => {
      if (!online) {
        return { ok: false, kind: 'transient', message: 'Luring' } as SyncOutcome
      }
      sent.push(String(args.p_sale_id))
      return { ok: true }
    }

    // Ibu mencatat sepanjang hari tanpa sinyal.
    for (let i = 1; i <= 20; i++) {
      await queue(
        `sale-${String(i).padStart(2, '0')}`,
        'record_sale',
        AT(`2026-08-06T06:${String(i * 2).padStart(2, '0')}:00Z`),
      )
    }

    await flush(db, transport, AT('2026-08-06T20:00:00Z'))
    expect(await pendingCount(db)).toBe(20)

    online = true
    // Jeda mundurnya sudah lewat.
    const result = await flush(db, transport, AT('2026-08-06T21:00:00Z'))

    expect(result.sent).toBe(20)
    expect(await pendingCount(db)).toBe(0)
    expect(sent[0]).toBe('sale-01')
    expect(sent[19]).toBe('sale-20')
  })
})

describe('ketahanan', () => {
  it('galat tak terduga dari transport tidak menghapus antrean', async () => {
    const broken: Transport = async () => {
      throw new Error('Transport meledak')
    }

    await queue('sale-1')
    await expect(flush(db, broken, T0)).rejects.toThrow('Transport meledak')

    // Catatan ibu harus tetap ada. Antrean yang hilang karena bug adalah
    // uang yang hilang dari laporan.
    expect(await db.outbox.get('sale-1')).toBeDefined()
    expect(await pendingCount(db)).toBe(1)
  })

  it('tidak memanggil transport untuk item yang sudah gagal permanen', async () => {
    await queue('sale-1')
    await flush(db, rejected, T0)

    const spy = vi.fn<Transport>(async () => ({ ok: true }))
    await flush(db, spy, AT('2026-08-06T12:00:00Z'))

    expect(spy).not.toHaveBeenCalled()
  })
})
