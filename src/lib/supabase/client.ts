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

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL
const key = () => process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

export function supabase(): SupabaseClient {
  if (client) return client

  const u = url()
  const k = key()

  if (!u || !k) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ' +
        'belum diisi. Salin .env.example menjadi .env.local.',
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
