import { describe, expect, it } from 'vitest'
import type { OutboxItem } from '@/lib/db/local'
import { rupaAntrean } from './rupa'

/**
 * Yang diuji: apakah barisnya bisa **dikenali** pemiliknya.
 *
 * Ini bukan soal keindahan kalimat. Keputusan yang harus diambil di layar
 * catatan tertolak adalah buang atau coba lagi, dan keputusan itu tidak
 * bisa diambil dari tulisan `record_sale`.
 */

const antrean = (rpc: string, args: Record<string, unknown>): OutboxItem => ({
  id: 'o1',
  tenant_id: 't1',
  rpc,
  args,
  created_at: '2026-08-12T03:00:00Z',
  attempts: 9,
  next_attempt_at: '2026-08-12T03:00:00Z',
  status: 'failed',
  last_error: 'ditolak',
})

describe('menyebut isi antrean', () => {
  it('penjualan disebut dengan nominal dan nama pembelinya', () => {
    const rupa = rupaAntrean(
      antrean('record_sale', {
        p_paid: 45000,
        p_customer_name: 'Bu Sri',
        p_items: [{}, {}],
      }),
    )
    expect(rupa.judul).toContain('Rp 45.000')
    expect(rupa.rincian).toContain('Bu Sri')
    expect(rupa.rincian).toContain('2 baris')
  })

  it('penjualan tanpa nama tetap bisa dikenali dari nominalnya', () => {
    const rupa = rupaAntrean(antrean('record_sale', { p_paid: 5000, p_items: [{}] }))
    expect(rupa.judul).toContain('Rp 5.000')
    expect(rupa.rincian).toBe('1 baris')
  })

  it('uang keluar menyebut nominal dan kategorinya', () => {
    const rupa = rupaAntrean(
      antrean('record_expense', { p_amount: 25000, p_category: 'Gas & listrik' }),
    )
    expect(rupa.judul).toContain('Rp 25.000')
    expect(rupa.rincian).toBe('Gas & listrik')
  })

  it('perubahan katalog disebut dengan nama barangnya', () => {
    const rupa = rupaAntrean(antrean('upsert_item', { p_name: 'Biskuit Roma' }))
    expect(rupa.judul).toBe('Biskuit Roma')
  })

  it('kulakan menyebut pemasoknya kalau ada', () => {
    const rupa = rupaAntrean(
      antrean('record_purchase', { p_items: [{}, {}, {}], p_supplier_name: 'Toko Jaya' }),
    )
    expect(rupa.judul).toBe('Kulakan')
    expect(rupa.rincian).toBe('3 barang · dari Toko Jaya')
  })

  it('argumen yang tidak lengkap tidak membuatnya gagal digambar', () => {
    // Antrean lama bisa saja dibuat versi aplikasi sebelumnya. Layar yang
    // ikut rusak karenanya berarti catatan tertolak jadi tidak bisa
    // diurus sama sekali — persis keadaan yang layar itu ada untuk
    // menyelesaikannya.
    for (const rpc of [
      'record_sale',
      'record_purchase',
      'record_expense',
      'pay_debt',
      'adjust_stock',
      'void_sale',
      'upsert_item',
    ]) {
      const rupa = rupaAntrean(antrean(rpc, {}))
      expect(rupa.judul.length).toBeGreaterThan(0)
    }
  })

  it('rpc yang belum didaftarkan menyebut namanya apa adanya', () => {
    // Sengaja bukan "Catatan lain": kalau suatu saat ada RPC baru yang
    // lupa didaftarkan, yang muncul harus bisa dicari di kode.
    expect(rupaAntrean(antrean('rpc_baru_yang_lupa', {})).judul).toBe(
      'rpc_baru_yang_lupa',
    )
  })

  it('tidak pernah menampilkan p_tenant_id atau UUID apa pun', () => {
    const rupa = rupaAntrean(
      antrean('record_sale', {
        p_sale_id: '0f1c2d3e-4a5b-6c7d-8e9f-0a1b2c3d4e5f',
        p_tenant_id: '11111111-2222-3333-4444-555555555555',
        p_paid: 5000,
        p_items: [{}],
      }),
    )
    const semua = `${rupa.judul} ${rupa.rincian ?? ''}`
    expect(semua).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i)
  })
})
