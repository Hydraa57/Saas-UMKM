'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db/local'
import { isConfigured, supabase } from '@/lib/supabase/client'
import { failedItems, flush, pendingCount } from './outbox'
import { createTransport } from './transport'
import { useSesi } from '@/lib/auth'

/**
 * Penjalan antrean kirim.
 *
 * Antrean dan penggolongan kegagalannya sudah ada dan teruji sejak lama —
 * yang tidak ada adalah **siapa pun yang menjalankannya.** Akibatnya
 * seluruh catatan cuma hidup di IndexedDB satu HP: ganti HP, bersihkan
 * data peramban, atau HP-nya rusak, dan semuanya hilang tanpa jejak.
 *
 * Kapan ia berjalan, dan kenapa hanya saat itu:
 *
 * - **Saat aplikasi dibuka.** Yang tercatat semalam saat sinyal mati
 *   harus terkirim sebelum pemiliknya sempat menutup aplikasi lagi.
 * - **Saat sambungan kembali ada.** Ini kejadian yang paling sering di
 *   warung — sinyal hilang lalu muncul lagi berkali-kali sehari.
 * - **Saat antrean bertambah.** Tiap penjualan langsung menyusul, jadi
 *   selisih antara "tercatat" dan "aman" sependek mungkin.
 * - **Berkala, setiap dua menit.** Jaring pengaman untuk kegagalan
 *   sementara yang sudah lewat masa tundanya.
 *
 * Yang **tidak** dilakukan: memblokir apa pun. Tidak ada satu layar pun
 * yang menunggu hasil pengiriman. Struk keluar karena penulisan lokal
 * berhasil, dan itu tidak berubah.
 */

const JEDA_BERKALA_MS = 2 * 60 * 1000

export interface StatusSync {
  /** Jumlah catatan yang belum sampai ke peladen. */
  readonly menunggu: number
  /** Catatan yang ditolak permanen dan butuh perhatian. */
  readonly gagal: number
  readonly sedangMengirim: boolean
  /** `false` kalau belum login atau Supabase belum dikonfigurasi. */
  readonly bisaMengirim: boolean
  readonly kirimSekarang: () => void
}

export function useSync(): StatusSync {
  const { status } = useSesi()
  const bisaMengirim = isConfigured() && status === 'masuk'

  const [sedangMengirim, setSedangMengirim] = useState(false)
  // Dipakai supaya dua pemicu yang datang bersamaan tidak mengirim
  // antrean yang sama dua kali. `useState` tidak cukup: nilainya baru
  // berubah pada render berikutnya, dan pemicunya bisa lebih cepat.
  const sedangJalan = useRef(false)

  const menunggu = useLiveQuery(() => pendingCount(db()), [], 0)
  const gagal = useLiveQuery(async () => (await failedItems(db())).length, [], 0)

  const kirim = useCallback(async () => {
    if (!bisaMengirim || sedangJalan.current) return
    sedangJalan.current = true
    setSedangMengirim(true)
    try {
      await flush(db(), createTransport(supabase()))
    } catch {
      // Kegagalan pengiriman tidak boleh merusak layar mana pun.
      // Antreannya tetap utuh dan akan dicoba lagi pada pemicu
      // berikutnya — itu memang gunanya antrean.
    } finally {
      sedangJalan.current = false
      setSedangMengirim(false)
    }
  }, [bisaMengirim])

  // Saat aplikasi dibuka, dan tiap kali antrean bertambah.
  useEffect(() => {
    if (!bisaMengirim) return
    void kirim()
  }, [bisaMengirim, kirim, menunggu])

  // Saat sambungan kembali ada.
  useEffect(() => {
    if (!bisaMengirim) return
    const saatOnline = () => void kirim()
    window.addEventListener('online', saatOnline)
    return () => window.removeEventListener('online', saatOnline)
  }, [bisaMengirim, kirim])

  // Jaring pengaman berkala.
  useEffect(() => {
    if (!bisaMengirim) return
    const jam = setInterval(() => void kirim(), JEDA_BERKALA_MS)
    return () => clearInterval(jam)
  }, [bisaMengirim, kirim])

  return {
    menunggu: menunggu ?? 0,
    gagal: gagal ?? 0,
    sedangMengirim,
    bisaMengirim,
    kirimSekarang: () => void kirim(),
  }
}
