'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db/local'
import { isConfigured, supabase } from '@/lib/supabase/client'
import { failedItems, flush, pendingCount } from './outbox'
import { fotoBelumTurun, fotoTertunda, unduhFoto, unggahFoto } from './foto'
import { createTransport } from './transport'
import { tarik } from './tarik'
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
  /** Foto katalog yang belum tersalin. Terpisah karena bukan uang. */
  readonly fotoMenunggu: number
  /** Foto yang ada di peladen tapi belum turun ke HP ini. */
  readonly fotoMenyusul: number
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
  const fotoMenunggu = useLiveQuery(() => fotoTertunda(db()), [], 0)
  const fotoMenyusul = useLiveQuery(() => fotoBelumTurun(db()), [], 0)
  const gagal = useLiveQuery(async () => (await failedItems(db())).length, [], 0)

  const kirim = useCallback(async () => {
    if (!bisaMengirim || sedangJalan.current) return
    sedangJalan.current = true
    setSedangMengirim(true)
    try {
      // Antrean panggilan lebih dulu, foto menyusul. Yang harus segera
      // aman adalah penjualannya; foto katalog yang menyusul semenit
      // kemudian tidak merugikan siapa pun.
      await flush(db(), createTransport(supabase()))

      // Tarikan **sesudah** kiriman, dan itu urutan yang menentukan.
      // Kalau dibalik, keadaan lama dari peladen menimpa baris yang
      // perubahannya masih di antrean — suntingan terlihat kembali
      // seperti semula lalu berubah lagi beberapa detik kemudian.
      // `tarik` sendiri menolak jalan selama antreannya belum kosong,
      // jadi aturan itu tetap berlaku walau urutannya suatu saat
      // tergeser.
      await tarik(db(), supabase())

      // Foto paling belakang, dua arah sekaligus. Keduanya paling berat
      // dan paling tidak mendesak: yang harus segera aman penjualannya.
      await unggahFoto(db(), supabase())
      await unduhFoto(db(), supabase())
    } catch {
      // Kegagalan pengiriman tidak boleh merusak layar mana pun.
      // Antreannya tetap utuh dan akan dicoba lagi pada pemicu
      // berikutnya — itu memang gunanya antrean.
    } finally {
      sedangJalan.current = false
      setSedangMengirim(false)
    }
  }, [bisaMengirim])

  // Saat aplikasi dibuka, dan tiap kali antrean bertambah — termasuk
  // saat yang bertambah cuma fotonya.
  useEffect(() => {
    if (!bisaMengirim) return
    void kirim()
  }, [bisaMengirim, kirim, menunggu, fotoMenunggu])

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
    fotoMenunggu: fotoMenunggu ?? 0,
    fotoMenyusul: fotoMenyusul ?? 0,
    gagal: gagal ?? 0,
    sedangMengirim,
    bisaMengirim,
    kirimSekarang: () => void kirim(),
  }
}
