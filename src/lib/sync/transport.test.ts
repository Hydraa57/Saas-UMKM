import { describe, expect, it } from 'vitest'
import { classifyError } from './transport'

/**
 * Penggolongan kegagalan menentukan nasib catatan ibu: diulang sampai
 * berhasil, atau disingkirkan. Salah di salah satu arah sama-sama
 * merugikan, jadi keduanya diuji.
 */

const permanent = (error: unknown): boolean => {
  const outcome = classifyError(error)
  return !outcome.ok && outcome.kind === 'permanent'
}

const transient = (error: unknown): boolean => {
  const outcome = classifyError(error)
  return !outcome.ok && outcome.kind === 'transient'
}

describe('kegagalan permanen — mengulang tidak akan mengubah hasilnya', () => {
  it('pelanggaran integritas', () => {
    expect(permanent({ code: '23503', message: 'foreign key' })).toBe(true)
    expect(permanent({ code: '23505', message: 'duplicate' })).toBe(true)
    expect(permanent({ code: '23514', message: 'check' })).toBe(true)
    expect(permanent({ code: '23502', message: 'not null' })).toBe(true)
  })

  it('policy RLS menahan penulisan', () => {
    expect(permanent({ code: '42501', message: 'permission denied' })).toBe(true)
  })

  it('aturan usaha yang ditegakkan fungsi jalur tulis', () => {
    expect(
      permanent({ code: 'P0001', message: 'Kategori sale dibuat lewat record_sale' }),
    ).toBe(true)
  })

  it('nilai yang tidak bisa diterima peladen', () => {
    expect(permanent({ code: '22003', message: 'numeric out of range' })).toBe(true)
  })

  it('permintaan salah bentuk', () => {
    expect(permanent({ code: 'PGRST202', message: 'function not found' })).toBe(true)
    expect(permanent({ status: 400, message: 'bad request' })).toBe(true)
    expect(permanent({ status: 404, message: 'not found' })).toBe(true)
  })

  it('ditolak aksesnya', () => {
    expect(permanent({ status: 403, message: 'forbidden' })).toBe(true)
  })
})

describe('kegagalan sementara — akan berhasil nanti', () => {
  it('perangkat luring', () => {
    expect(transient(new TypeError('Failed to fetch'))).toBe(true)
    expect(transient({ message: 'NetworkError when attempting to fetch' })).toBe(true)
  })

  it('peladen sedang bermasalah', () => {
    expect(transient({ status: 500, message: 'internal error' })).toBe(true)
    expect(transient({ status: 502, message: 'bad gateway' })).toBe(true)
    expect(transient({ status: 503, message: 'unavailable' })).toBe(true)
  })

  it('token kedaluwarsa — akan diperbarui otomatis', () => {
    // Kalau ini digolongkan permanen, catatan ibu terbuang hanya karena
    // dia membuka aplikasi setelah lama tidak dipakai.
    expect(transient({ status: 401, message: 'JWT expired' })).toBe(true)
  })

  it('permintaan kedaluwarsa dan pembatasan laju', () => {
    expect(transient({ status: 408, message: 'timeout' })).toBe(true)
    expect(transient({ status: 429, message: 'too many requests' })).toBe(true)
  })

  it('galat yang tidak dikenali dianggap sementara', () => {
    // Bertahan pada yang tidak dikenal paling buruk membuat antrean
    // tersendat. Membuangnya berarti transaksi hilang tanpa jejak.
    expect(transient({})).toBe(true)
    expect(transient(null)).toBe(true)
    expect(transient(undefined)).toBe(true)
    expect(transient({ code: 'ENTAHAPA', message: 'aneh' })).toBe(true)
  })
})

describe('pesan galat', () => {
  it('diteruskan supaya bisa dijelaskan ke pengguna', () => {
    const outcome = classifyError({ code: '23503', message: 'Produk tidak ditemukan' })
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.message).toBe('Produk tidak ditemukan')
  })

  it('punya pesan cadangan kalau kosong', () => {
    const outcome = classifyError({})
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.message).toBe('Gagal mengirim')
  })
})
