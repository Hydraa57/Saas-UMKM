'use client'

import { db, PERNAH_MASUK_KEY, setMeta } from '@/lib/db/local'
import { isConfigured, supabase } from '@/lib/supabase/client'
import { pendingCount } from '@/lib/sync/outbox'

/**
 * Berganti akun.
 *
 * Keluar dari akun saja **tidak cukup**, dan itu lubang yang mudah tidak
 * disadari: sesi Supabase-nya hilang, tapi seluruh isi IndexedDB — katalog,
 * penjualan, utang — masih milik akun sebelumnya. Orang berikutnya yang
 * masuk di HP itu akan melihat dagangan orang lain, lalu penjualannya
 * sendiri ikut menempel ke tenant yang bukan miliknya. Tidak ada gejala
 * apa pun sampai angkanya tidak masuk akal.
 *
 * Jadi berganti akun berarti **mengosongkan perangkat**, bukan sekadar
 * keluar. Yang tersisa cuma yang ada di peladen.
 */

export interface KeadaanGanti {
  /** Catatan yang belum sempat terkirim. Hilang kalau diteruskan. */
  readonly belumTerkirim: number
}

export async function periksaSebelumGanti(): Promise<KeadaanGanti> {
  return { belumTerkirim: await pendingCount(db()) }
}

/**
 * Keluar, kosongkan perangkat, lalu kembali ke gerbang.
 *
 * Urutannya disengaja. Sesi dihapus lebih dulu supaya tidak ada pengiriman
 * yang menyusul di tengah penghapusan dan menulis balik baris yang baru
 * saja dibuang. Basis datanya dihapus seluruhnya — bukan tabel per tabel —
 * karena tabel yang terlupa hari ini adalah data orang lain yang bocor
 * bulan depan.
 *
 * Halamannya dimuat ulang lewat alamat penuh, bukan router: yang harus
 * dibangun ulang bukan cuma tampilan melainkan seluruh keadaan di memori,
 * termasuk pegangan Dexie ke basis data yang sudah tidak ada.
 */
export async function gantiAkun(): Promise<void> {
  if (isConfigured()) {
    await supabase()
      .auth.signOut()
      .catch(() => undefined)
  }

  // Ditulis sebelum dihapus supaya niatnya tercatat; kalau penghapusannya
  // gagal di tengah, yang terjadi paling buruk adalah gerbang tertutup
  // lagi — bukan perangkat yang setengah kosong tapi terbuka.
  await setMeta(db(), PERNAH_MASUK_KEY, false).catch(() => undefined)
  await db().delete()

  window.location.replace('/masuk')
}
