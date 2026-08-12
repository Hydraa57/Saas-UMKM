'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useApp } from '@/lib/useApp'
import type { Route } from 'next'
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
  readonly href: Route
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
                  rounded-kartu text-xs font-semibold transition ${
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
  const { tenantId, ready } = useApp()

  // Sebelum pengaturan awal selesai, belum ada apa pun untuk dituju.
  // Bilah yang tetap tergambar di layar pembuka membuat "Barang" dan
  // "Riwayat" terlihat siap dipakai, padahal keduanya cuma mendarat di
  // layar "pengaturan awal belum selesai" — menu yang menipu lebih buruk
  // daripada menu yang belum ada.
  if (!ready || !tenantId) return null

  // Hanya di keempat tujuan tab, dan **persis** di situ — bukan "semua
  // kecuali daftar hitam". Aturan daftar hitam sempat dipakai, dan
  // layar yang terlupa (`/katalog/baru`) menampilkan bilah ini bertumpuk
  // dengan bilah aksinya sendiri: tombol Simpan terlihat tapi tidak
  // pernah bisa ditekan. Daftar putih tidak punya cara gagal seperti itu.
  const TUJUAN = ['/', '/katalog', '/riwayat', '/utang']
  // Bilah bawah cuma di keempat rute utama: di layar dalam seperti
  // "tambah barang" atau "bayar", tempatnya sudah dipakai bilah aksi.
  //
  // Bilah samping **tidak** ikut aturan itu. Di layar lebar tempatnya
  // tidak diperebutkan siapa pun, dan navigasi yang menghilang saat
  // masuk ke layar dalam memaksa orang menekan "kembali" untuk sesuatu
  // yang seharusnya sekali klik. Itu juga yang membuat aplikasi terasa
  // seperti HP yang dilebarkan, bukan aplikasi laptop.

  return (
    <>
      {/* HP: bilah di dasar layar, Kasir di tengah dan menonjol. */}
      {TUJUAN.includes(pathname) && (
      <nav aria-label="Navigasi utama" className="bilah-bawah lg:hidden">
        <div className="flex items-end gap-1">
          {KIRI.map((t) => (
            <Tombol key={t.href} tujuan={t} pathname={pathname} />
          ))}

          {/* Ditinggikan dan diberi warna merek: satu-satunya tombol di
              bilah ini yang menghasilkan uang. */}
          <Link
            href="/kasir"
            className="-mt-7 flex w-[4.5rem] shrink-0 flex-col items-center gap-1"
          >
            <span
              className="flex h-14 w-14 items-center justify-center rounded-kartu
                         bg-merek-600 text-white transition
                         active:scale-95 active:bg-merek-700"
            >
              <Ikon nama="kasir" ukuran={26} tebal={1.9} />
            </span>
            <span className="text-xs font-semibold text-merek-700">Kasir</span>
          </Link>

          {KANAN.map((t) => (
            <Tombol key={t.href} tujuan={t} pathname={pathname} />
          ))}
        </div>
      </nav>
      )}

      {/* Layar lebar: bilahnya berdiri di samping.
          Tonjolan tombol Kasir tidak ikut ke sini — ia menjawab jempol
          yang memegang HP, dan di layar lebar tidak ada jempol. Yang
          menggantikannya: petak nila terisi penuh, tetap satu-satunya
          yang berwarna, dan tetap paling atas. */}
      <nav
        aria-label="Navigasi utama"
        className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-1
                   border-r border-garis bg-white p-3 lg:flex"
      >
        <span className="px-3 py-4 text-xl font-bold">Ezura</span>

        <Link
          href="/kasir"
          className={`flex min-h-touch items-center gap-3 rounded-kartu px-3
                      font-semibold transition ${
                        pathname.startsWith('/kasir')
                          ? 'bg-merek-600 text-white'
                          : 'bg-merek-50 text-merek-700 hover:bg-merek-100'
                      }`}
        >
          <Ikon nama="kasir" ukuran={22} />
          Kasir
        </Link>

        <span className="mt-3 px-3 pb-1 text-sm font-medium text-slate-400">
          Sekarang
        </span>
        {KIRI.map((t) => (
          <Samping key={t.href} tujuan={t} pathname={pathname} />
        ))}

        <span className="mt-3 px-3 pb-1 text-sm font-medium text-slate-400">
          Yang sudah lewat
        </span>
        {KANAN.map((t) => (
          <Samping key={t.href} tujuan={t} pathname={pathname} />
        ))}

        <Link
          href="/pengaturan"
          className={`mt-auto flex min-h-touch items-center gap-3 rounded-kartu px-3
                      font-semibold transition ${
                        pathname.startsWith('/pengaturan')
                          ? 'bg-slate-100 text-slate-900'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
        >
          <Ikon nama="setelan" ukuran={22} />
          Pengaturan
        </Link>
      </nav>
    </>
  )
}

/** Satu baris di bilah samping. */
function Samping({ tujuan, pathname }: { tujuan: Tujuan; pathname: string }) {
  const sedang = aktif(pathname, tujuan.href)
  return (
    <Link
      href={tujuan.href}
      aria-current={sedang ? 'page' : undefined}
      className={`flex min-h-touch items-center gap-3 rounded-kartu px-3
                  font-semibold transition ${
                    sedang
                      ? 'bg-slate-100 text-slate-900'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
    >
      <Ikon nama={tujuan.ikon} ukuran={22} />
      {tujuan.label}
    </Link>
  )
}
