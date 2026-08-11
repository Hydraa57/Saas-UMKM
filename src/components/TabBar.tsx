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
 * Yang tidak masuk ke sini — kulakan, piutang, uang keluar — memang
 * bukan pekerjaan harian. Menaruhnya di bilah berarti menyita tempat
 * dari yang dipakai puluhan kali sehari demi yang dipakai seminggu
 * sekali.
 */

interface Tujuan {
  readonly href: string
  readonly label: string
  readonly ikon: NamaIkon
}

const KIRI: readonly Tujuan[] = [
  { href: '/', label: 'Beranda', ikon: 'beranda' },
  { href: '/katalog', label: 'Katalog', ikon: 'katalog' },
]

const KANAN: readonly Tujuan[] = [
  { href: '/stok', label: 'Stok', ikon: 'stok' },
  { href: '/riwayat', label: 'Riwayat', ikon: 'riwayat' },
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
  const TUJUAN = ['/', '/katalog', '/stok', '/riwayat']
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
                       bg-merek-600 text-white shadow-tombol transition
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
