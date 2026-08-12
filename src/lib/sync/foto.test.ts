import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { LocalDatabase } from '@/lib/db/local'
import type { SupabaseClient } from '@supabase/supabase-js'
import { EMBER_FOTO, fotoTertunda, jalurFoto, unggahFoto } from './foto'

/**
 * Yang diuji: **apa yang terjadi saat unggahannya gagal.**
 *
 * Bagian yang berhasil hampir tidak punya cara salah. Yang menentukan
 * fitur ini merugikan atau tidak adalah jalur gagalnya — foto yang
 * ditandai terkirim padahal tidak akan hilang diam-diam, dan `photo_path`
 * yang tertulis sebelum berkasnya ada akan membuat perangkat kedua
 * menampilkan petak kosong tanpa cara mengetahui sebabnya.
 */

let db: LocalDatabase
let counter = 0

const TENANT = 'tenant-1'

interface Jejak {
  unggah: string[]
  rpc: { rpc: string; args: unknown }[]
}

function palsu(
  jejak: Jejak,
  opsi: { gagalUnggah?: boolean; gagalRpc?: boolean } = {},
): SupabaseClient {
  return {
    storage: {
      from(ember: string) {
        return {
          async upload(jalur: string) {
            jejak.unggah.push(`${ember}:${jalur}`)
            return opsi.gagalUnggah
              ? { data: null, error: { message: 'jaringan putus' } }
              : { data: { path: jalur }, error: null }
          },
        }
      },
    },
    async rpc(rpc: string, args: unknown) {
      jejak.rpc.push({ rpc, args })
      return opsi.gagalRpc
        ? { data: null, error: { message: 'ditolak' } }
        : { data: null, error: null }
    },
  } as unknown as SupabaseClient
}

const blob = () => new Blob(['xx'], { type: 'image/webp' })

async function tambahFoto(itemId: string, uploadedAt: string | null = null) {
  await db.photos.put({
    item_id: itemId,
    tenant_id: TENANT,
    blob: blob(),
    uploaded_at: uploadedAt,
  })
}

beforeEach(async () => {
  db = new LocalDatabase(`foto-${++counter}`)
  await db.open()
})

describe('jalurFoto', () => {
  it('menaruh tenant sebagai folder pertama', () => {
    // Seluruh keamanannya bertumpu di sini: policy Storage memeriksa
    // segmen folder pertama. Bentuk lain apa pun akan ditolak peladen —
    // atau, kalau policy-nya ikut salah, membocorkan foto tenant lain.
    expect(jalurFoto('t-1', 'i-9')).toBe('t-1/i-9.webp')
  })
})

describe('unggahFoto', () => {
  it('mengunggah berkasnya lalu menuliskan jalurnya ke barang', async () => {
    await tambahFoto('item-1')
    const jejak: Jejak = { unggah: [], rpc: [] }

    const hasil = await unggahFoto(db, palsu(jejak))

    expect(hasil).toEqual({ terkirim: 1, gagal: 0 })
    expect(jejak.unggah).toEqual([`${EMBER_FOTO}:${TENANT}/item-1.webp`])
    expect(jejak.rpc).toEqual([
      { rpc: 'set_item_photo', args: { p_item_id: 'item-1', p_photo_path: `${TENANT}/item-1.webp` } },
    ])
  })

  it('menandai foto yang sudah terkirim supaya tidak diulang', async () => {
    await tambahFoto('item-1')
    const jejak: Jejak = { unggah: [], rpc: [] }

    await unggahFoto(db, palsu(jejak))
    await unggahFoto(db, palsu(jejak))

    expect(jejak.unggah).toHaveLength(1)
    expect((await db.photos.get('item-1'))?.uploaded_at).not.toBeNull()
  })

  it('melewati foto yang memang sudah tersalin', async () => {
    await tambahFoto('item-lama', '2026-08-01T00:00:00.000Z')
    const jejak: Jejak = { unggah: [], rpc: [] }

    expect(await unggahFoto(db, palsu(jejak))).toEqual({ terkirim: 0, gagal: 0 })
    expect(jejak.unggah).toHaveLength(0)
  })

  it('tidak menandai terkirim kalau unggahannya gagal', async () => {
    // Foto yang ditandai terkirim padahal tidak akan hilang diam-diam:
    // tidak ada percobaan berikutnya, dan tidak ada gejala apa pun.
    await tambahFoto('item-1')
    const jejak: Jejak = { unggah: [], rpc: [] }

    const hasil = await unggahFoto(db, palsu(jejak, { gagalUnggah: true }))

    expect(hasil).toEqual({ terkirim: 0, gagal: 1 })
    expect((await db.photos.get('item-1'))?.uploaded_at).toBeNull()
    // Jalurnya tidak boleh dituliskan ke barang: berkasnya tidak ada.
    expect(jejak.rpc).toHaveLength(0)
  })

  it('tidak menandai terkirim kalau penulisan jalurnya gagal', async () => {
    // Berkasnya sudah naik tapi barangnya belum menunjuk ke sana. Dicoba
    // lagi nanti; `upsert: true` membuat unggahan kedua menimpa, bukan
    // menggandakan.
    await tambahFoto('item-1')
    const jejak: Jejak = { unggah: [], rpc: [] }

    expect(await unggahFoto(db, palsu(jejak, { gagalRpc: true }))).toEqual({
      terkirim: 0,
      gagal: 1,
    })
    expect((await db.photos.get('item-1'))?.uploaded_at).toBeNull()
  })

  it('tidak pernah membuang blob-nya, sekalipun gagal', async () => {
    // Foto bukan uang, tapi ia juga tidak bisa dibuat ulang: barangnya
    // sudah masuk rak dan tidak akan difoto dua kali.
    await tambahFoto('item-1')
    const jejak: Jejak = { unggah: [], rpc: [] }

    await unggahFoto(db, palsu(jejak, { gagalUnggah: true }))

    expect(await db.photos.get('item-1')).toBeDefined()
    expect((await db.photos.get('item-1'))?.blob.size).toBeGreaterThan(0)
  })

  it('meneruskan sisanya walau satu foto gagal', async () => {
    // Sinyal putus di tengah katalog lima puluh barang tidak boleh
    // membuat empat puluh sembilan foto berikutnya ikut menunggu.
    await tambahFoto('item-1')
    await tambahFoto('item-2')
    const jejak: Jejak = { unggah: [], rpc: [] }

    const hasil = await unggahFoto(db, palsu(jejak, { gagalUnggah: true }))

    expect(hasil.gagal).toBe(2)
    expect(jejak.unggah).toHaveLength(2)
  })

  it('membatasi berapa foto sekali jalan', async () => {
    // Katalog lima puluh barang tidak boleh jadi lima puluh unggahan
    // serentak di sambungan yang seret.
    for (let i = 0; i < 8; i++) await tambahFoto(`item-${i}`)
    const jejak: Jejak = { unggah: [], rpc: [] }

    expect((await unggahFoto(db, palsu(jejak), 3)).terkirim).toBe(3)
    expect(jejak.unggah).toHaveLength(3)
    expect(await fotoTertunda(db)).toBe(5)
  })
})

describe('fotoTertunda', () => {
  it('menghitung yang belum tersalin saja', async () => {
    await tambahFoto('a')
    await tambahFoto('b', '2026-08-01T00:00:00.000Z')
    await tambahFoto('c')

    expect(await fotoTertunda(db)).toBe(2)
  })
})
