'use client'

import { usePathname } from 'next/navigation'
import { Ikon, type NamaIkon } from './Ikon'

/**
 * Bilah navigasi bawah.
 *
 * Empat tujuan tetap, dan **Kasir di tengah, menonjol.** Bukan karena
 * pola itu sedang lazim, tapi karena aplikasi ini dibuka saat ada
 * pembeli berdiri di depan meja: jalan ke kasir harus ada di tempat yang
 * sama di setiap layar, dan tepat di bawah ibu jari.
 *
 * Pengelompokannya: dua di kiri untuk **melihat keadaan sekarang**
 * (beranda, barang), dua di kanan untuk **melihat yang sudah terjadi**
 * (riwayat, utang).
 *
 * Yang tidak masuk ke sini — kulakan dan uang keluar — memang bukan
 * pekerjaan harian, dan keduanya sudah punya tempat di titik
 * kebutuhannya: kulakan di tab Stok, tepat setelah melihat apa yang mau
 * habis; uang keluar sebagai pintasan di beranda.
 */

interface Tujuan {
  readonly href: string
  readonly label: string
  readonly ikon: NamaIkon
}

// Tiga tujuan, bukan empat. "Katalog" dan "Stok" dulu berdiri sendiri di
// sini, dan bersama "Kulakan" mereka jadi tiga kata yang gampang
// tertukar — semua soal barang, dan tidak jelas dari namanya mana untuk
// apa. Sekarang ketiganya satu tujuan, dengan tab di dalamnya.
const KIRI: readonly Tujuan[] = [
  { href: '/', label: 'Beranda', ikon: 'beranda' },
  { href: '/katalog', label: 'Barang', ikon: 'katalog' },
]

const KANAN: readonly Tujuan[] = [
  { href: '/riwayat', label: 'Riwayat', ikon: 'riwayat' },
  { href: '/utang', label: 'Utang', ikon: 'utang' },
]

function aktif(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href)
}

function Tombol({ tujuan, pathname }: { tujuan: Tujuan; pathname: string }) {
  const sedang = aktif(pathname, tujuan.href)
  return (
    <a
      href={tujuan.href}
      aria-current={sedang ? 'page' : undefined}
      className={`flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-1
                  rounded-2xl text-xs font-semibold transition ${
                    sedang ? 'text-merek-600' : 'text-slate-400'
                  }`}
    >
      <Ikon nama={tujuan.ikon} ukuran={23} tebal={sedang ? 2.1 : 1.75} />
      {tujuan.label}
    </a>
  )
}

export function TabBar() {
  const pathname = usePathname()

  // Hanya di keempat tujuan tab, dan **persis** di situ — bukan "semua
  // kecuali daftar hitam". Aturan daftar hitam sempat dipakai, dan
  // layar yang terlupa (`/katalog/baru`) menampilkan bilah ini bertumpuk
  // dengan bilah aksinya sendiri: tombol Simpan terlihat tapi tidak
  // pernah bisa ditekan. Daftar putih tidak punya cara gagal seperti itu.
  const TUJUAN = ['/', '/katalog', '/riwayat', '/utang']
  if (!TUJUAN.includes(pathname)) return null

  return (
    <nav aria-label="Navigasi utama" className="bilah-bawah">
      <div className="flex items-end gap-1">
        {KIRI.map((t) => (
          <Tombol key={t.href} tujuan={t} pathname={pathname} />
        ))}

        {/* Ditinggikan dan diberi warna merek: satu-satunya tombol di
            bilah ini yang menghasilkan uang. */}
        <a
          href="/kasir"
          className="-mt-7 flex w-[4.5rem] shrink-0 flex-col items-center gap-1"
        >
          <span
            className="flex h-14 w-14 items-center justify-center rounded-[1.15rem]
                       bg-merek-600 text-white transition
                       active:scale-95 active:bg-merek-700"
          >
            <Ikon nama="kasir" ukuran={26} tebal={1.9} />
          </span>
          <span className="text-xs font-semibold text-merek-700">Kasir</span>
        </a>

        {KANAN.map((t) => (
          <Tombol key={t.href} tujuan={t} pathname={pathname} />
        ))}
      </div>
    </nav>
  )
}
