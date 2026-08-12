import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Klien Supabase untuk peramban.
 *
 * Hanya kunci publishable yang dipakai di sini, dan itu memang ikut
 * terkirim ke perangkat pengguna. Yang menjaga datanya adalah RLS, bukan
 * kerahasiaan kunci — sebuah kunci yang harus dirahasiakan tapi dikirim
 * ke ratusan HP bukan rahasia sama sekali.
 *
 * Kunci `service_role` mem-bypass RLS sepenuhnya, jadi ia tidak boleh
 * pernah sampai ke berkas mana pun yang ikut terkirim ke perangkat —
 * tempatnya hanya di route server atau Edge Function.
 */

let client: SupabaseClient | null = null

/**
 * Nama kunci lingkungannya, diekspor supaya layar galat menyebut nama
 * yang **persis sama** dengan yang dibaca di sini.
 *
 * Sebelumnya layar galat menuliskan namanya sendiri, dan salah satu di
 * antaranya keliru: ia menyuruh memasang `..._ANON_KEY` padahal yang
 * dibaca `..._PUBLISHABLE_KEY`. Pemasangnya menuruti layar, kuncinya
 * tetap kosong, dan aplikasinya tetap menolak jalan tanpa satu petunjuk
 * pun bahwa yang salah justru petunjuknya. Dua daftar nama yang harus
 * dijaga tetap sepadan selalu berakhir begitu; sekarang cuma ada satu.
 */
export const NAMA_ENV = {
  url: 'NEXT_PUBLIC_SUPABASE_URL',
  kunci: 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  kunciLama: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
} as const

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL

/**
 * Supabase mengganti nama "anon key" jadi "publishable key", dan proyek
 * yang dibuat sebelum penggantian masih memakai nama lama. Keduanya
 * diterima: menolak yang lama cuma memindahkan kebingungan, bukan
 * menghilangkannya.
 *
 * Ditulis sebagai dua pembacaan terpisah, bukan satu lewat variabel:
 * Next mengganti `process.env.NEXT_PUBLIC_*` dengan nilainya saat build,
 * dan penggantian itu hanya bekerja pada penyebutan yang harfiah.
 */
const key = () =>
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export function supabase(): SupabaseClient {
  if (client) return client

  const u = url()
  const k = key()

  if (!u || !k) {
    throw new Error(
      `${NAMA_ENV.url} dan ${NAMA_ENV.kunci} belum diisi. ` +
        'Salin .env.example menjadi .env.local.',
    )
  }

  client = createBrowserClient(u, k)
  return client
}

/**
 * Apakah konfigurasi Supabase tersedia.
 *
 * Dipakai antrean kirim untuk memutuskan apakah pengiriman perlu dicoba
 * sama sekali. Aplikasinya tetap jalan penuh tanpa ini — seluruh kasir
 * menulis ke perangkat lebih dulu, dan peladen hanya menyusul.
 */
export function isConfigured(): boolean {
  return Boolean(url() && key())
}
