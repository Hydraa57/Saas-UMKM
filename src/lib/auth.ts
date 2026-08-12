'use client'

import { useEffect, useState } from 'react'
import { isConfigured, supabase } from '@/lib/supabase/client'
import { db, PERNAH_MASUK_KEY, setMeta } from '@/lib/db/local'

/**
 * Menandai bahwa HP ini pernah berhasil masuk.
 *
 * Ditulis di sini, bukan di tombol masuk, supaya ia ikut tertulis pada
 * setiap jalan yang menghasilkan sesi — termasuk pendaftaran yang
 * langsung aktif dan sesi lama yang dipulihkan dari penyimpanan.
 */
function tandaiPernahMasuk(): void {
  void setMeta(db(), PERNAH_MASUK_KEY, true).catch(() => undefined)
}

/**
 * Sesi pengguna.
 *
 * Satu keputusan menjelaskan seluruh berkas ini:
 *
 * > **Login bukan gerbang. Login adalah cara mengamankan catatan yang
 * > sudah ada.**
 *
 * Aplikasinya jalan penuh tanpa akun — katalog, kasir, struk, stok,
 * semuanya. Tenant dibuat di perangkat dengan UUID sendiri, dan baru
 * "diklaim" oleh sebuah akun saat antrean pertama kali terkirim, karena
 * `create_tenant` menerima `p_tenant_id` dari perangkat.
 *
 * Kalau login diletakkan di depan, ia jadi gerbang sebelum manfaat
 * pertama terasa — dan itu persis tempat orang berhenti. Yang dipakai
 * sebagai gantinya: aplikasi menunjukkan bahwa catatannya baru ada di
 * satu HP, dan menawarkan mengamankannya.
 */

export type StatusSesi = 'memuat' | 'masuk' | 'keluar' | 'tanpa-peladen'

export interface Sesi {
  readonly status: StatusSesi
  readonly email: string | null
}

export function useSesi(): Sesi {
  const [sesi, setSesi] = useState<Sesi>({
    status: isConfigured() ? 'memuat' : 'tanpa-peladen',
    email: null,
  })

  useEffect(() => {
    if (!isConfigured()) return

    const klien = supabase()
    let dibatalkan = false

    klien.auth
      .getSession()
      .then(({ data }) => {
        if (dibatalkan) return
        if (data.session) tandaiPernahMasuk()
        setSesi({
          status: data.session ? 'masuk' : 'keluar',
          email: data.session?.user.email ?? null,
        })
      })
      .catch(() => {
        // Gagal memeriksa sesi bukan alasan memblokir aplikasi: seluruh
        // kasir jalan tanpa peladen. Diperlakukan sebagai belum masuk.
        if (!dibatalkan) setSesi({ status: 'keluar', email: null })
      })

    const { data: langganan } = klien.auth.onAuthStateChange((_, session) => {
      if (dibatalkan) return
      if (session) tandaiPernahMasuk()
      setSesi({
        status: session ? 'masuk' : 'keluar',
        email: session?.user.email ?? null,
      })
    })

    return () => {
      dibatalkan = true
      langganan.subscription.unsubscribe()
    }
  }, [])

  return sesi
}

export async function masuk(email: string, sandi: string): Promise<void> {
  const { error } = await supabase().auth.signInWithPassword({
    email: email.trim(),
    password: sandi,
  })
  if (error) throw new Error(pesanRamah(error.message))
}

export async function daftar(email: string, sandi: string): Promise<void> {
  const { error } = await supabase().auth.signUp({
    email: email.trim(),
    password: sandi,
  })
  if (error) throw new Error(pesanRamah(error.message))
}

export async function keluar(): Promise<void> {
  await supabase().auth.signOut()
}

/**
 * Pesan galat Supabase berbahasa Inggris dan bernada teknis.
 *
 * Yang membaca layar ini sedang khawatir catatannya tidak aman; "Invalid
 * login credentials" tidak membantu sama sekali. Yang tidak dikenali
 * dibiarkan apa adanya — pesan asing lebih baik daripada pesan salah
 * yang mengarahkan orang memperbaiki hal yang bukan penyebabnya.
 */
function pesanRamah(pesan: string): string {
  const p = pesan.toLowerCase()
  if (p.includes('invalid login credentials')) {
    return 'Email atau kata sandi salah.'
  }
  if (p.includes('already registered') || p.includes('already been registered')) {
    return 'Email ini sudah terdaftar. Coba masuk saja.'
  }
  if (p.includes('password should be at least')) {
    return 'Kata sandi minimal 6 huruf.'
  }
  if (p.includes('unable to validate email') || p.includes('invalid format')) {
    return 'Alamat emailnya belum benar.'
  }
  if (p.includes('failed to fetch') || p.includes('network')) {
    return 'Tidak ada sambungan. Catatannya tetap aman di HP ini.'
  }
  return pesan
}
