import type { SupabaseClient } from '@supabase/supabase-js'
import type { LocalDatabase } from '@/lib/db/local'

/**
 * Mengunggah foto barang ke Storage.
 *
 * Terpisah dari antrean RPC, dan itu disengaja. Antrean `outbox`
 * mengangkut panggilan fungsi berisi JSON kecil; foto adalah blob puluhan
 * kilobita yang tidak boleh ikut menumpuk di sana — satu katalog berisi
 * lima puluh barang akan membuat antrean penjualan tersandera di
 * belakang lima puluh unggahan gambar, tepat saat yang paling perlu
 * segera aman justru penjualannya.
 *
 * Kenapa perlu sama sekali: katalog sudah tersalin ke peladen, tapi
 * fotonya belum. Kalau HP-nya hilang, yang kembali adalah daftar barang
 * **tanpa satu pun fotonya** — dan pada kasir yang seluruh cara pakainya
 * "ketuk fotonya", katalog tanpa foto praktis harus diisi ulang dari nol.
 *
 * Urutannya dijaga: berkasnya diunggah lebih dulu, baru `photo_path`
 * dituliskan ke barangnya. Kalau dibalik, akan ada baris yang menunjuk
 * berkas yang tidak pernah ada — dan perangkat kedua akan menampilkan
 * petak kosong tanpa cara mengetahui sebabnya.
 */

export const EMBER_FOTO = 'foto-barang'

/** `<tenant>/<item>` — segmen pertama itulah yang diperiksa policy. */
export function jalurFoto(tenantId: string, itemId: string): string {
  return `${tenantId}/${itemId}.webp`
}

export interface HasilUnggah {
  readonly terkirim: number
  readonly gagal: number
}

/**
 * Mengunggah semua foto yang belum tersalin.
 *
 * Kegagalan satu foto tidak menghentikan sisanya: sinyal yang putus di
 * tengah katalog lima puluh barang tidak boleh membuat empat puluh
 * sembilan foto berikutnya ikut menunggu percobaan berikutnya.
 */
export async function unggahFoto(
  db: LocalDatabase,
  supabase: SupabaseClient,
  batas = 5,
): Promise<HasilUnggah> {
  // `uploaded_at` yang masih kosong = belum tersalin. Indeksnya sudah ada
  // sejak tabelnya dibuat; niatnya memang ini sejak awal.
  const menunggu = await db.photos
    .filter((row) => row.uploaded_at === null)
    .limit(batas)
    .toArray()

  let terkirim = 0
  let gagal = 0

  for (const foto of menunggu) {
    const jalur = jalurFoto(foto.tenant_id, foto.item_id)
    try {
      const { error: galatUnggah } = await supabase.storage
        .from(EMBER_FOTO)
        .upload(jalur, foto.blob, {
          contentType: foto.blob.type || 'image/webp',
          // Foto barang bisa diganti; yang kedua harus menimpa yang
          // pertama alih-alih ditolak sebagai duplikat.
          upsert: true,
        })
      if (galatUnggah) throw galatUnggah

      const { error: galatTanda } = await supabase.rpc('set_item_photo', {
        p_item_id: foto.item_id,
        p_photo_path: jalur,
      })
      if (galatTanda) throw galatTanda

      await db.photos.update(foto.item_id, {
        uploaded_at: new Date().toISOString(),
      })
      terkirim += 1
    } catch {
      // Tidak dicatat sebagai gagal permanen dan tidak dibuang. Foto yang
      // gagal terkirim tetap ada utuh di perangkat, dan percobaan
      // berikutnya akan menemukannya lagi karena `uploaded_at` masih
      // kosong. Foto bukan uang; tidak ada yang rusak kalau ia menyusul
      // nanti.
      gagal += 1
    }
  }

  return { terkirim, gagal }
}

/** Berapa foto yang belum tersalin. Untuk penanda keadaan di layar. */
export async function fotoTertunda(db: LocalDatabase): Promise<number> {
  return db.photos.filter((row) => row.uploaded_at === null).count()
}
