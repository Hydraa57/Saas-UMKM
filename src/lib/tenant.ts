import type { SupabaseClient } from '@supabase/supabase-js'
import {
  BUSINESS_NAME_KEY,
  TENANT_KEY,
  getMeta,
  setMeta,
  type LocalDatabase,
} from '@/lib/db/local'

/**
 * Menyambungkan akun dengan usaha yang sudah dimilikinya.
 *
 * Ini bagian yang hilang, dan ketiadaannya membuat seluruh janji
 * sinkronisasi tidak pernah benar.
 *
 * ## Apa yang rusak
 *
 * `tenant_id` dibuat **di perangkat**, sebagai UUID acak, saat pengaturan
 * awal. Itu keputusan yang benar: ia membuat penulisan idempoten dan
 * membuat aplikasinya jalan penuh sebelum ada sinyal. Tapi tidak pernah
 * ada satu pun kode yang menanyakan hal sebaliknya — **akun ini sudah
 * punya usaha yang mana?** Tabel `memberships` tidak pernah dibaca sama
 * sekali.
 *
 * Akibatnya, HP kedua yang masuk dengan akun yang sama membuat UUID
 * baru, mengirim `create_tenant`, dan peladen dengan patuh membuat
 * **usaha kedua** beserta membership kedua untuk akun yang sama —
 * `create_tenant` cuma idempoten terhadap UUID yang dikirim, dan UUID
 * itu memang berbeda.
 *
 * Jadi satu akun berakhir memiliki dua warung yang tidak saling melihat.
 * Penarikan datanya sendiri berjalan rajin sepanjang waktu, menarik untuk
 * tenant yang salah — yang memang kosong. Yang terlihat pemiliknya:
 * "masuk pakai akun yang sama, tapi kok seperti daftar dari awal."
 *
 * ## Aturannya sekarang
 *
 * Sesudah sesi ada, perangkat **bertanya lebih dulu**, sebelum membuat
 * apa pun:
 *
 * - **Akun punya usaha, perangkat belum** → adopsi. Ini kasus HP kedua
 *   dan HP pengganti, dan sesudah ini penarikan mengisi sendiri.
 * - **Keduanya ada dan sama** → tidak ada yang perlu dilakukan.
 * - **Akun belum punya usaha** → perangkat yang menentukan, seperti
 *   sebelumnya. Pengaturan awal berjalan seperti biasa.
 * - **Keduanya ada tapi berbeda** → **berhenti dan tanya.** Ini
 *   satu-satunya keadaan yang tidak boleh diputuskan diam-diam: memilih
 *   sendiri berarti entah menelantarkan catatan yang sudah ada di HP
 *   ini, atau membuat usaha kedua — dan yang kedua itulah bug yang
 *   sedang diperbaiki di sini.
 */

/** Usaha yang belum pernah dikenal perangkat ini. */
export interface UsahaPeladen {
  readonly id: string
  readonly nama: string
}

export type HasilSambung =
  /** Tidak ada yang perlu diputuskan. */
  | { readonly jenis: 'sudah-cocok' }
  /** Usaha dari akun diadopsi; catatannya akan menyusul lewat tarikan. */
  | { readonly jenis: 'diadopsi'; readonly usaha: UsahaPeladen }
  /** Akun ini belum punya usaha sama sekali. */
  | { readonly jenis: 'belum-punya' }
  /** Perangkat dan akun memegang usaha yang berbeda. Harus ditanya. */
  | { readonly jenis: 'bentrok'; readonly lokal: string; readonly peladen: UsahaPeladen }
  /** Peladen tidak terjangkau. Bukan kegagalan — coba lagi nanti. */
  | { readonly jenis: 'tak-terjangkau' }

/**
 * Usaha yang dimiliki akun yang sedang masuk.
 *
 * Dibaca lewat `memberships`, yang RLS-nya memang cuma membolehkan
 * seseorang melihat keanggotaannya sendiri.
 */
export async function usahaAkun(
  supabase: SupabaseClient,
): Promise<UsahaPeladen[] | null> {
  const { data, error } = await supabase
    .from('memberships')
    .select('tenant_id, tenants(id, name)')
    .order('created_at', { ascending: true })

  if (error) return null

  const baris = (data ?? []) as {
    tenant_id: string
    tenants: { id: string; name: string } | { id: string; name: string }[] | null
  }[]

  return baris.flatMap((b) => {
    // PostgREST mengembalikan relasi sebagai objek atau larik tergantung
    // bentuk kunci asingnya; keduanya diterima supaya perubahan skema
    // tidak diam-diam mengosongkan daftar ini.
    const t = Array.isArray(b.tenants) ? b.tenants[0] : b.tenants
    if (!t) return []
    return [{ id: t.id, nama: t.name }]
  })
}

export async function sambungkanUsaha(
  db: LocalDatabase,
  supabase: SupabaseClient,
): Promise<HasilSambung> {
  const daftar = await usahaAkun(supabase)
  if (daftar === null) return { jenis: 'tak-terjangkau' }

  const lokal = (await getMeta<string>(db, TENANT_KEY)) ?? null

  if (daftar.length === 0) return { jenis: 'belum-punya' }

  // Kalau akunnya punya beberapa — bisa terjadi karena bug ini sendiri,
  // pada akun yang terlanjur memakai dua HP — yang dipakai **yang paling
  // awal dibuat**. Itu yang paling mungkin berisi catatan sungguhan;
  // yang belakangan lahir dari perangkat yang menyangka dirinya baru.
  const pertama = daftar[0]
  if (!pertama) return { jenis: 'belum-punya' }

  if (lokal === null) {
    await setMeta(db, TENANT_KEY, pertama.id)
    await setMeta(db, BUSINESS_NAME_KEY, pertama.nama)
    return { jenis: 'diadopsi', usaha: pertama }
  }

  if (daftar.some((u) => u.id === lokal)) return { jenis: 'sudah-cocok' }

  return { jenis: 'bentrok', lokal, peladen: pertama }
}

/**
 * Memakai usaha dari akun, dan **membuang** catatan lokal yang tidak
 * termasuk di dalamnya.
 *
 * Dipakai hanya sesudah pemiliknya memilihnya sendiri di layar bentrok.
 * Penghapusannya menyeluruh dan disengaja: menyisakan baris milik tenant
 * lama berarti daftar yang bercampur dua warung, dan angka yang tidak
 * bisa dijelaskan oleh siapa pun.
 */
export async function pakaiUsahaPeladen(
  db: LocalDatabase,
  usaha: UsahaPeladen,
): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.wallets,
      db.items,
      db.photos,
      db.sales,
      db.saleItems,
      db.stockMovements,
      db.cashEntries,
      db.debts,
      db.outbox,
      db.meta,
    ],
    async () => {
      await Promise.all([
        db.wallets.clear(),
        db.items.clear(),
        db.photos.clear(),
        db.sales.clear(),
        db.saleItems.clear(),
        db.stockMovements.clear(),
        db.cashEntries.clear(),
        db.debts.clear(),
        db.outbox.clear(),
      ])
      await setMeta(db, TENANT_KEY, usaha.id)
      await setMeta(db, BUSINESS_NAME_KEY, usaha.nama)
      // Watermark ikut dibuang: yang tersimpan milik tenant lama, dan
      // memakainya berarti tarikan pertama melewatkan seluruh catatan
      // yang lebih tua dari itu.
      await db.meta.delete('tarik_sampai')
    },
  )
}
