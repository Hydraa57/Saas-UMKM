import { describe, expect, it } from 'vitest'
import { bisaBeresSendiri, pesanGalat } from './galat'

/**
 * Yang diuji bukan kata demi katanya — kalimatnya akan berubah — melainkan
 * **sifat** pesannya: yang normal tidak boleh terdengar seperti kerusakan,
 * dan yang benar-benar rusak tidak boleh disamarkan jadi "coba lagi nanti".
 */

describe('pesan untuk pengguna', () => {
  it('melewatkan aturan usaha apa adanya, karena sudah berbahasa Indonesia', () => {
    // Menerjemahkannya ulang di sini berarti dua tempat yang harus
    // dijaga tetap sepadan, dan yang di peladen sudah dirancang untuk
    // dibaca pemiliknya.
    expect(pesanGalat({ code: 'P0001', message: 'Jasa tidak punya stok' })).toBe(
      'Jasa tidak punya stok',
    )
  })

  it('tidak memakai pesan P0001 yang kosong', () => {
    const pesan = pesanGalat({ code: 'P0001', message: '' })
    expect(pesan.length).toBeGreaterThan(10)
  })

  it('sinyal hilang tidak terdengar seperti kerusakan', () => {
    const pesan = pesanGalat(
      Object.assign(new TypeError('Failed to fetch'), { name: 'TypeError' }),
    )
    expect(pesan).toMatch(/sinyal|sambungan/i)
    // Yang paling penting: menyebut catatannya sudah aman. Tanpa itu,
    // pemiliknya akan mencatat ulang di kertas — dan sesudah terkirim,
    // angkanya jadi dobel.
    expect(pesan).toMatch(/tersimpan|aman/i)
  })

  it('peladen bermasalah dinyatakan sebagai bukan salah HP-nya', () => {
    expect(pesanGalat({ status: 503, message: 'Service Unavailable' })).toMatch(
      /peladen/i,
    )
  })

  it('sesi kedaluwarsa memberi tahu apa yang harus ditekan', () => {
    const pesan = pesanGalat({ status: 401, message: 'JWT expired' })
    expect(pesan).toMatch(/masuk/i)
    expect(pesan).not.toMatch(/JWT/)
  })

  it('kiriman kembar dinyatakan sebagai kabar baik, bukan galat', () => {
    // Ini sering muncul saat pengiriman diulang sesudah sambungan putus
    // di tengah. Menampilkannya sebagai kegagalan membuat pemiliknya
    // mengira penjualannya tidak tercatat, lalu mencatatnya lagi.
    const pesan = pesanGalat({ code: '23505', message: 'duplicate key value' })
    expect(pesan).toMatch(/sudah pernah tersimpan/i)
    expect(pesan).not.toMatch(/duplicate|constraint/i)
  })

  it('tidak pernah membocorkan istilah teknis berbahasa Inggris', () => {
    const contoh: unknown[] = [
      { code: '23505', message: 'duplicate key value violates unique constraint' },
      { code: '42501', message: 'new row violates row-level security policy' },
      { code: 'PGRST301', message: 'JWSError' },
      { code: '23502', message: 'null value in column "total"' },
      { status: 500, message: 'Internal Server Error' },
      new Error('Something exploded'),
      null,
      undefined,
      'bukan objek galat',
    ]

    for (const e of contoh) {
      const pesan = pesanGalat(e)
      expect(pesan).not.toMatch(
        /constraint|violates|null value|Internal Server|JWSError|exploded|row-level/i,
      )
      // Dan selalu berupa kalimat, bukan potongan kata.
      expect(pesan.length).toBeGreaterThan(15)
      expect(pesan.trim().endsWith('.')).toBe(true)
    }
  })

  it('yang tidak dikenali tidak dijanjikan beres sendiri', () => {
    // Menjanjikan "coba lagi nanti" untuk sesuatu yang tidak akan pernah
    // berhasil membuat orang menunggu hal yang tidak akan datang.
    const pesan = pesanGalat(new Error('entah apa'))
    expect(pesan).not.toMatch(/coba lagi nanti|akan terkirim sendiri/i)
  })
})

describe('galat masuk akun', () => {
  it('sandi salah dikatakan sebagai sandi salah', () => {
    const pesan = pesanGalat({ status: 400, message: 'Invalid login credentials' })
    expect(pesan).toMatch(/sandi/i)
    expect(pesan).not.toMatch(/credentials/i)
  })

  it('email sudah terdaftar mengarahkan ke masuk, bukan daftar lagi', () => {
    expect(pesanGalat({ message: 'User already registered' })).toMatch(/masuk saja/i)
  })

  it('menyebut angkanya saat sandi kependekan', () => {
    expect(pesanGalat({ message: 'Password should be at least 8 characters' })).toMatch(
      /8/,
    )
  })

  it('kalimat Supabase yang belum dikenali tidak bocor ke layar', () => {
    // Cocok-mencocokkan kalimat memang rapuh: Supabase bisa mengubahnya
    // sewaktu-waktu. Yang tidak boleh terjadi adalah kalimat baru itu
    // muncul mentah di layar.
    const pesan = pesanGalat({ message: 'Signups are disabled for this instance' })
    expect(pesan).not.toMatch(/Signups|instance/i)
  })
})

describe('mana yang beres sendiri', () => {
  it('jaringan, sesi, dan peladen sibuk beres sendiri', () => {
    expect(
      bisaBeresSendiri(Object.assign(new TypeError('Failed to fetch'), { name: 'TypeError' })),
    ).toBe(true)
    expect(bisaBeresSendiri({ status: 401 })).toBe(true)
    expect(bisaBeresSendiri({ status: 429 })).toBe(true)
    expect(bisaBeresSendiri({ status: 502 })).toBe(true)
    // Menunjuk barang yang belum tersinkron: beres begitu katalognya menyusul.
    expect(bisaBeresSendiri({ code: '23503' })).toBe(true)
  })

  it('isian yang ditolak dan hak akses tidak beres sendiri', () => {
    expect(bisaBeresSendiri({ code: '23514' })).toBe(false)
    expect(bisaBeresSendiri({ code: '42501', status: 403 })).toBe(false)
    expect(bisaBeresSendiri({ code: 'P0001', message: 'Jasa tidak punya stok' })).toBe(false)
  })
})
