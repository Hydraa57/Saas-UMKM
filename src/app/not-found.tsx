import Link from 'next/link'

/**
 * Halaman yang tidak ada.
 *
 * Paling sering bukan karena salah ketik alamat — aplikasi ini dipakai
 * dari ikon di layar depan, bukan dari bilah alamat. Yang benar-benar
 * terjadi: pintasan lama ke struk atau barang yang sudah dihapus, dan
 * tautan yang tersimpan di WhatsApp lalu dibuka berminggu-minggu
 * kemudian.
 *
 * Karena itu bahasanya bukan "404 Not Found" melainkan apa yang
 * sebenarnya terjadi, dan jalan keluarnya menuju kasir — bukan ke
 * beranda. Yang membuka aplikasi ini hampir selalu sedang mau melayani
 * pembeli.
 */

export default function TidakAda() {
  return (
    <main className="flex flex-1 flex-col justify-center gap-4 p-4">
      <div className="kartu">
        <p className="text-xl font-bold">Halamannya sudah tidak ada</p>
        <p className="mt-1 text-slate-600">
          Mungkin catatannya sudah dihapus, atau tautannya sudah lama. Tidak ada
          yang rusak — catatan lain tetap aman.
        </p>
      </div>

      <Link href="/kasir" className="btn-primer btn-besar">
        Buka kasir
      </Link>
      <Link href="/" className="btn-sekunder">
        Ke beranda
      </Link>
    </main>
  )
}
