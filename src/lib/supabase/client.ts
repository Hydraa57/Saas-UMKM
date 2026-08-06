import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Klien Supabase untuk peramban.
 *
 * Hanya kunci publik yang dipakai di sini. Kunci `service_role`
 * mem-bypass RLS sepenuhnya, jadi ia tidak boleh pernah sampai ke berkas
 * mana pun yang ikut terkirim ke perangkat — tempatnya hanya di route
 * server atau Edge Function.
 */

let client: SupabaseClient | null = null

export function supabase(): SupabaseClient {
  if (client) return client

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY belum diisi. ' +
        'Salin .env.example menjadi .env.local.',
    )
  }

  client = createBrowserClient(url, key)
  return client
}

/** Apakah konfigurasi Supabase tersedia — untuk mode pengembangan lokal. */
export function isConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  )
}
