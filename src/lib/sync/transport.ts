import type { SupabaseClient } from '@supabase/supabase-js'
import type { SyncOutcome, Transport } from './outbox'

/**
 * Penghubung antrean kirim ke Supabase.
 *
 * Bagian yang paling menentukan di berkas ini bukan pemanggilan RPC-nya,
 * melainkan **penggolongan kegagalan**. Salah menggolongkan punya dua
 * akibat yang sama-sama buruk:
 *
 *   - Menganggap kegagalan permanen sebagai sementara → antrean mencoba
 *     ulang selamanya dan tidak pernah maju. Catatan hari itu tersandera
 *     satu baris yang tidak akan pernah diterima.
 *   - Menganggap kegagalan sementara sebagai permanen → catatan ibu
 *     disingkirkan padahal cuma sinyal yang hilang sebentar.
 *
 * Karena itu penggolongannya ditulis eksplisit dan diuji, bukan
 * disimpulkan dari tebakan atas isi pesan galat.
 */

/**
 * Kode galat PostgreSQL yang berarti "isinya ditolak".
 *
 * Kelas 23 adalah pelanggaran integritas (unik, kunci asing, `check`,
 * `not null`). 42501 berarti tidak berhak — yang di sini berarti policy
 * RLS menahan penulisan. P0001 adalah `raise exception` dari fungsi
 * jalur tulis, yaitu aturan usaha yang sengaja ditegakkan.
 *
 * Ketiganya tidak akan berubah hasilnya kalau diulang.
 */
const PERMANENT_PG_CODES = new Set([
  '23502', // not_null_violation
  '23503', // foreign_key_violation
  '23505', // unique_violation
  '23514', // check_violation
  '42501', // insufficient_privilege
  'P0001', // raise_exception
])

/** Galat PostgREST yang berarti permintaannya sendiri salah bentuk. */
const PERMANENT_PGRST_PREFIX = 'PGRST'

interface ErrorLike {
  code?: string | null
  message?: string | null
  status?: number | null
  name?: string | null
}

export function classifyError(error: unknown): SyncOutcome {
  const err = (error ?? {}) as ErrorLike
  const message = err.message ?? 'Gagal mengirim'
  const code = err.code ?? ''

  if (PERMANENT_PG_CODES.has(code)) {
    return { ok: false, kind: 'permanent', message }
  }

  // Kelas 22 (data_exception) dan 23 secara umum: nilai yang tidak bisa
  // diterima peladen. Diulang pun hasilnya sama.
  if (code.startsWith('22') || code.startsWith('23')) {
    return { ok: false, kind: 'permanent', message }
  }

  if (code.startsWith(PERMANENT_PGRST_PREFIX)) {
    return { ok: false, kind: 'permanent', message }
  }

  const status = err.status ?? 0

  // 401 sengaja **tidak** permanen: token yang kedaluwarsa akan
  // diperbarui otomatis, dan percobaan berikutnya berhasil. Menganggapnya
  // permanen berarti membuang catatan ibu hanya karena dia membuka
  // aplikasi setelah lama tidak dipakai.
  if (status === 401 || status === 408 || status === 429) {
    return { ok: false, kind: 'transient', message }
  }

  if (status === 403) {
    return { ok: false, kind: 'permanent', message }
  }

  if (status >= 400 && status < 500) {
    return { ok: false, kind: 'permanent', message }
  }

  // Sisanya — gagal jaringan, peladen bermasalah, permintaan kedaluwarsa,
  // dan apa pun yang tidak dikenali — digolongkan sementara.
  //
  // Ini pilihan yang disengaja: bertahan pada galat yang tidak dikenal
  // paling buruk membuat antrean tersendat sampai penyebabnya diperiksa,
  // sedangkan membuangnya berarti transaksi hilang tanpa jejak dan baru
  // ketahuan berminggu-minggu kemudian saat saldo tidak cocok.
  return { ok: false, kind: 'transient', message }
}

export function createTransport(supabase: SupabaseClient): Transport {
  return async (rpc, args) => {
    try {
      const { data, error } = await supabase.rpc(rpc, args)
      if (error) return classifyError(error)
      return { ok: true, data }
    } catch (caught) {
      // `fetch` melempar, bukan mengembalikan galat, saat perangkat luring.
      return classifyError(caught)
    }
  }
}
