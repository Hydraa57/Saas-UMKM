import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { LocalDatabase } from '@/lib/db/local'
import { rupiah } from '@/lib/money'
import { pendingCount } from '@/lib/sync/outbox'
import {
  deleteEntry,
  recordEntry,
  recordTransfer,
  type ActionContext,
} from './record'

/**
 * Yang diuji di sini bukan "tersimpan atau tidak", melainkan sifat yang
 * menentukan aplikasi ini dipakai atau ditinggalkan: mencatat tidak
 * pernah menunggu jaringan, dan apa pun yang tercatat pasti terkirim.
 */

let db: LocalDatabase
let context: ActionContext
let counter = 0

const TENANT = 'tenant-1'
const DOMPET = 'wallet-utama'
const REKENING = 'wallet-rekening'
const NOW = new Date('2026-08-06T03:00:00.000Z')

beforeEach(async () => {
  db = new LocalDatabase(`aksi-${++counter}`)
  await db.open()

  let seq = 0
  context = {
    db,
    tenantId: TENANT,
    newId: () => `id-${++seq}`,
    now: () => NOW,
  }
})

describe('mencatat pemasukan', () => {
  it('tersimpan lokal seketika, tanpa menyentuh jaringan', async () => {
    const { id } = await recordEntry(context, {
      walletId: DOMPET,
      book: 'usaha',
      kind: 'income',
      amount: rupiah(85_000),
      category: 'penjualan',
    })

    const row = await db.cashEntries.get(id)
    expect(row?.amount).toBe(85_000)
    expect(row?.direction).toBe('in')
    expect(row?.book).toBe('usaha')
  })

  it('masuk antrean kirim dengan ID yang sama', async () => {
    const { id } = await recordEntry(context, {
      walletId: DOMPET,
      book: 'usaha',
      kind: 'income',
      amount: rupiah(85_000),
      category: 'penjualan',
    })

    const queued = await db.outbox.get(id)
    expect(queued?.rpc).toBe('record_entry')
    // ID yang sama di baris lokal dan di antrean — itulah yang membuat
    // pengiriman ulang aman kalau balasannya hilang di jalan.
    expect(queued?.args.p_entry_id).toBe(id)
    expect(queued?.args.p_book).toBe('usaha')
  })

  it('arah ditentukan jenisnya, tidak dikirim terpisah', async () => {
    const masuk = await recordEntry(context, {
      walletId: DOMPET, book: 'usaha', kind: 'income',
      amount: rupiah(1000), category: 'penjualan',
    })
    const keluar = await recordEntry(context, {
      walletId: DOMPET, book: 'rumah', kind: 'expense',
      amount: rupiah(1000), category: 'belanja',
    })

    expect((await db.cashEntries.get(masuk.id))?.direction).toBe('in')
    expect((await db.cashEntries.get(keluar.id))?.direction).toBe('out')
  })

  it('bisa dicatat mundur', async () => {
    const { id } = await recordEntry(context, {
      walletId: DOMPET,
      book: 'usaha',
      kind: 'income',
      amount: rupiah(50_000),
      category: 'penjualan',
      occurredAt: new Date('2026-08-01T02:00:00.000Z'),
    })

    expect((await db.cashEntries.get(id))?.occurred_at).toBe(
      '2026-08-01T02:00:00.000Z',
    )
  })
})

describe('satu dompet, dua buku', () => {
  it('belanja rumah dari dompet yang sama tidak menyentuh buku usaha', async () => {
    await recordEntry(context, {
      walletId: DOMPET, book: 'usaha', kind: 'income',
      amount: rupiah(85_000), category: 'penjualan',
    })
    await recordEntry(context, {
      walletId: DOMPET, book: 'rumah', kind: 'expense',
      amount: rupiah(42_000), category: 'belanja',
    })

    const semua = await db.cashEntries.toArray()
    const usaha = semua.filter((row) => row.book === 'usaha')
    const rumah = semua.filter((row) => row.book === 'rumah')

    expect(usaha).toHaveLength(1)
    expect(rumah).toHaveLength(1)
    // Uangnya tetap di satu tempat.
    expect(semua.every((row) => row.wallet_id === DOMPET)).toBe(true)
  })
})

describe('pintasan tumbuh sendiri', () => {
  it('keterangan pertama melahirkan pintasan', async () => {
    await recordEntry(context, {
      walletId: DOMPET, book: 'usaha', kind: 'income',
      amount: rupiah(15_000), category: 'jasa', label: 'Potong rambut',
    })

    const quick = await db.quickEntries.toArray()
    expect(quick).toHaveLength(1)
    expect(quick[0]?.label).toBe('Potong rambut')
    expect(quick[0]?.use_count).toBe(1)
    expect(quick[0]?.default_amount).toBe(15_000)
  })

  it('pemakaian kedua menaikkan hitungan, bukan menggandakan', async () => {
    for (const amount of [15_000, 18_000]) {
      await recordEntry(context, {
        walletId: DOMPET, book: 'usaha', kind: 'income',
        amount: rupiah(amount), category: 'jasa', label: 'Potong rambut',
      })
    }

    const quick = await db.quickEntries.toArray()
    expect(quick).toHaveLength(1)
    expect(quick[0]?.use_count).toBe(2)
    // Nominal terakhir yang menang: harga naik, dan pintasan berharga
    // lama justru membuat pengguna membetulkannya tiap kali.
    expect(quick[0]?.default_amount).toBe(18_000)
  })

  it('keterangan kosong tidak melahirkan pintasan', async () => {
    await recordEntry(context, {
      walletId: DOMPET, book: 'usaha', kind: 'income',
      amount: rupiah(5_000), category: 'penjualan',
    })
    await recordEntry(context, {
      walletId: DOMPET, book: 'usaha', kind: 'income',
      amount: rupiah(5_000), category: 'penjualan', label: '   ',
    })

    expect(await db.quickEntries.count()).toBe(0)
  })

  it('label yang sama di buku berbeda adalah pintasan berbeda', async () => {
    await recordEntry(context, {
      walletId: DOMPET, book: 'usaha', kind: 'expense',
      amount: rupiah(20_000), category: 'modal', label: 'Belanja',
    })
    await recordEntry(context, {
      walletId: DOMPET, book: 'rumah', kind: 'expense',
      amount: rupiah(42_000), category: 'belanja', label: 'Belanja',
    })

    expect(await db.quickEntries.count()).toBe(2)
  })

  it('spasi berlebih tidak membuat pintasan kembar', async () => {
    await recordEntry(context, {
      walletId: DOMPET, book: 'usaha', kind: 'income',
      amount: rupiah(15_000), category: 'jasa', label: 'Potong rambut',
    })
    await recordEntry(context, {
      walletId: DOMPET, book: 'usaha', kind: 'income',
      amount: rupiah(15_000), category: 'jasa', label: '  Potong rambut  ',
    })

    expect(await db.quickEntries.count()).toBe(1)
  })
})

describe('pindah dompet', () => {
  it('menghasilkan dua entri berpasangan tanpa buku', async () => {
    const { transferId } = await recordTransfer(context, {
      fromWalletId: DOMPET,
      toWalletId: REKENING,
      amount: rupiah(50_000),
    })

    const pair = (await db.cashEntries.toArray()).filter(
      (row) => row.transfer_group_id === transferId,
    )

    expect(pair).toHaveLength(2)
    // Tanpa buku, jadi tidak mungkin bocor ke laporan mana pun.
    expect(pair.every((row) => row.book === null)).toBe(true)
    expect(pair.find((row) => row.direction === 'out')?.wallet_id).toBe(DOMPET)
    expect(pair.find((row) => row.direction === 'in')?.wallet_id).toBe(REKENING)
  })

  it('menolak dompet asal dan tujuan yang sama', async () => {
    await expect(
      recordTransfer(context, {
        fromWalletId: DOMPET,
        toWalletId: DOMPET,
        amount: rupiah(50_000),
      }),
    ).rejects.toThrow('sama')

    expect(await db.cashEntries.count()).toBe(0)
    expect(await pendingCount(db)).toBe(0)
  })

  it('mengirim ID kedua sisinya, supaya peladen memakai ID yang sama', async () => {
    const { transferId } = await recordTransfer(context, {
      fromWalletId: DOMPET, toWalletId: REKENING, amount: rupiah(50_000),
    })

    const queued = await db.outbox.get(transferId)
    const local = (await db.cashEntries.toArray()).map((row) => row.id).sort()

    expect(
      [queued?.args.p_out_entry_id, queued?.args.p_in_entry_id].sort(),
    ).toEqual(local)
  })
})

describe('urung', () => {
  it('menandai batal, bukan menghapus barisnya', async () => {
    const { id } = await recordEntry(context, {
      walletId: DOMPET, book: 'usaha', kind: 'income',
      amount: rupiah(85_000), category: 'penjualan',
    })

    await deleteEntry(context, id)

    const row = await db.cashEntries.get(id)
    expect(row).toBeDefined()
    expect(row?.deleted_at).toBe(NOW.toISOString())
  })

  it('membatalkan pemindahan membatalkan kedua sisinya', async () => {
    const { transferId } = await recordTransfer(context, {
      fromWalletId: DOMPET, toWalletId: REKENING, amount: rupiah(50_000),
    })
    const pair = (await db.cashEntries.toArray()).filter(
      (row) => row.transfer_group_id === transferId,
    )

    await deleteEntry(context, pair[0]!.id)

    const after = (await db.cashEntries.toArray()).filter(
      (row) => row.transfer_group_id === transferId,
    )
    // Membatalkan satu sisi saja akan membuat uang seolah lenyap dari
    // salah satu dompet.
    expect(after.every((row) => row.deleted_at)).toBe(true)
  })

  it('membatalkan yang sudah batal tidak melakukan apa-apa', async () => {
    const { id } = await recordEntry(context, {
      walletId: DOMPET, book: 'usaha', kind: 'income',
      amount: rupiah(85_000), category: 'penjualan',
    })

    await deleteEntry(context, id)
    const before = await pendingCount(db)
    await deleteEntry(context, id)

    expect(await pendingCount(db)).toBe(before)
  })

  it('entri yang tidak ada diabaikan diam-diam', async () => {
    await expect(deleteEntry(context, 'entah-apa')).resolves.toBeUndefined()
  })
})

describe('apa pun yang tercatat pasti terkirim', () => {
  it('tiap aksi meninggalkan tepat satu antrean', async () => {
    await recordEntry(context, {
      walletId: DOMPET, book: 'usaha', kind: 'income',
      amount: rupiah(85_000), category: 'penjualan', label: 'Penjualan',
    })
    await recordEntry(context, {
      walletId: DOMPET, book: 'rumah', kind: 'expense',
      amount: rupiah(42_000), category: 'belanja',
    })
    await recordTransfer(context, {
      fromWalletId: DOMPET, toWalletId: REKENING, amount: rupiah(10_000),
    })

    // Dua entri biasa + dua sisi pemindahan = empat baris lokal,
    // tapi hanya tiga panggilan RPC.
    expect(await db.cashEntries.count()).toBe(4)
    expect(await pendingCount(db)).toBe(3)
  })
})
