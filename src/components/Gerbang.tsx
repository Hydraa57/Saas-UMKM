'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { usePathname } from 'next/navigation'
import { db, getMeta, PERNAH_MASUK_KEY } from '@/lib/db/local'
import { isConfigured, NAMA_ENV } from '@/lib/supabase/client'
import { useSesi } from '@/lib/auth'

/**
 * Gerbang masuk aplikasi.
 *
 * **Perubahan arah yang disengaja, dan perlu dicatat sebabnya.** Versi
 * sebelumnya menempatkan login sebagai pilihan, bukan syarat, dengan
 * alasan bahwa gerbang sebelum manfaat pertama adalah tempat orang
 * berhenti. Alasan itu masih benar untuk produk yang dicari sendiri oleh
 * orang asing di internet. Ia tidak berlaku di sini: penggunanya diantar
 * langsung oleh pembuatnya, dan yang lebih menentukan — **catatan yang
 * tidak pernah dicadangkan adalah catatan yang akan hilang.** Tanpa akun,
 * seluruh isi aplikasi cuma hidup di satu HP, dan pemiliknya baru tahu
 * saat HP itu sudah tidak ada.
 *
 * Yang dijaga supaya perubahan ini tidak berbalik jadi bencana:
 *
 * **Gerbangnya hanya di awal, bukan tiap kali buka.** Sekali sebuah HP
 * pernah berhasil masuk, ia ditandai dan tidak pernah dikunci lagi.
 * Alasannya keras: kasir yang menolak terbuka karena sinyal mati adalah
 * kasir yang ditinggalkan hari itu juga — dan pembeli tidak menunggu
 * sambil ibu mencari sinyal. Pemeriksaan sesi ke peladen tidak pernah
 * jadi syarat untuk membuka aplikasinya.
 *
 * **Tanpa peladen, gerbangnya tidak membuka diam-diam.** Versi pertama
 * berkas ini melakukan itu — kalau Supabase belum dikonfigurasi, aplikasi
 * dibiarkan jalan penuh tanpa akun. Niatnya supaya pengembangan tidak
 * terkunci; akibatnya sebuah pemasangan yang lupa memasang kunci
 * lingkungannya terlihat **jalan sempurna** sambil diam-diam tidak
 * mencadangkan apa pun. Persis kegagalan yang gerbang ini dibuat untuk
 * mencegahnya, cuma lebih licin karena tidak ada gejalanya.
 *
 * Sekarang keadaan itu berhenti di layarnya sendiri, dengan sebab yang
 * disebut terang-terangan. Yang membacanya pengembang, bukan ibu.
 */

/** Halaman yang justru harus terbuka saat gerbangnya tertutup. */
const BEBAS = ['/masuk']

export function Gerbang({ children }: { readonly children: React.ReactNode }) {
  const pathname = usePathname()
  const { status } = useSesi()

  /**
   * Jawabannya dipaksa jadi boolean di dalam query, bukan dibiarkan
   * `undefined` saat kuncinya belum ada.
   *
   * `useLiveQuery` memakai nilai awal yang sama untuk "masih memuat" dan
   * untuk "hasilnya memang `undefined`". Kunci yang belum pernah ditulis
   * mengembalikan `undefined`, jadi versi pertama berkas ini menganggap
   * dirinya **selamanya sedang memuat** — dan yang tampil bukan gerbang
   * melainkan layar kosong. Ketahuan oleh uji asap, bukan oleh
   * pembacaan ulang.
   */
  const pernah = useLiveQuery(
    async () => (await getMeta<boolean>(db(), PERNAH_MASUK_KEY)) === true,
    [],
    null,
  )

  // Belum tahu jawabannya. Menampilkan layar kosong sesaat jauh lebih
  // baik daripada mengedipkan formulir masuk ke orang yang sebenarnya
  // sudah masuk — kedipan itu terbaca sebagai "aku dikeluarkan lagi".
  if (pernah === null) {
    return <main className="flex-1 p-4" aria-busy="true" />
  }

  if (!isConfigured()) return <PeladenBelumDisetel />

  const terbuka = pernah === true || status === 'masuk' || BEBAS.includes(pathname)
  if (terbuka) return <>{children}</>

  return <Ajakan />
}

/**
 * Layar yang menggantikan seluruh aplikasi selama belum ada akun.
 *
 * Bukan formulirnya sendiri: formulir masuk dan daftar sudah ada di
 * `/masuk`, dan menyalinnya ke sini berarti dua tempat yang harus dijaga
 * tetap sepadan. Yang ada di sini cuma **alasannya** — dan alasan itu
 * ditulis sebagai janji, bukan sebagai syarat, karena orang yang membaca
 * "harus login dulu" berhenti membaca di situ.
 */
function Ajakan() {
  return (
    <main className="flex flex-1 flex-col justify-center gap-6 p-6">
      <div className="animate-naik">
        <span
          className="mb-5 flex h-16 w-16 items-center justify-center rounded-kartu-lg
                     bg-merek-600 text-white"
        >
          <IkonKasir />
        </span>
        <h1 className="text-2xl font-bold">Ezura</h1>
        <p className="mt-2 text-slate-600">
          Jual barang dan jasa, cetak struk — stok dan catatannya ikut terisi
          sendiri.
        </p>
      </div>

      <div className="kartu animate-naik">
        <p className="font-semibold">Buat akun dulu, sekali saja</p>
        <p className="mt-1 text-slate-600">
          Catatan penjualan ibu disalin ke tempat yang tidak ikut hilang kalau
          HP-nya rusak atau berganti. Sesudah itu aplikasinya jalan seperti
          biasa — termasuk saat tidak ada sinyal.
        </p>
      </div>

      <a href="/masuk" className="btn-primer btn-besar animate-naik">
        Mulai
      </a>
    </main>
  )
}

/**
 * Berhenti terang-terangan alih-alih jalan setengah.
 *
 * Pesannya ditujukan ke pengembang, dan sengaja menyebut nama kuncinya:
 * yang menemui layar ini butuh tahu **apa yang harus dipasang**, bukan
 * bahwa ada sesuatu yang salah.
 */
function PeladenBelumDisetel() {
  return (
    <main className="flex flex-1 flex-col justify-center gap-4 p-6">
      <span
        className="flex h-14 w-14 items-center justify-center rounded-kartu-lg
                   bg-tunggu-soft text-tunggu"
      >
        <IkonPeringatan />
      </span>
      <h1 className="text-2xl font-bold">Peladen belum disetel</h1>
      <p className="text-slate-600">
        Aplikasi ini menyimpan catatan penjualan, jadi ia tidak dijalankan
        tanpa tempat mencadangkannya. Pasang dua kunci lingkungan berikut
        lalu muat ulang:
      </p>
      {/* Namanya dibaca dari modul yang sama dengan yang memakainya.
          Versi pertama layar ini menuliskan namanya sendiri dan salah
          satu keliru — pemasangnya menuruti layar, kuncinya tetap kosong,
          dan tidak ada petunjuk bahwa yang salah justru petunjuknya. */}
      <ul className="kartu flex flex-col gap-2 break-all font-mono text-sm">
        <li>{NAMA_ENV.url}</li>
        <li>{NAMA_ENV.kunci}</li>
      </ul>
      <p className="text-sm text-slate-500">
        Keduanya ada di dasbor Supabase → Project Settings → API. Di Vercel,
        pasang di Project Settings → Environment Variables, lalu{' '}
        <strong>deploy ulang tanpa memakai cache build</strong> — kunci
        berawalan <code>NEXT_PUBLIC_</code> disisipkan saat build, jadi
        deploy yang memakai build lama tetap membawa nilai lama.
      </p>
      <p className="text-sm text-slate-500">
        Proyek Supabase lama menamai kuncinya{' '}
        <code className="break-all">{NAMA_ENV.kunciLama}</code>; nama itu
        juga diterima.
      </p>
    </main>
  )
}

function IkonPeringatan() {
  return (
    <svg
      aria-hidden="true"
      width={26}
      height={26}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3.5 22 20H2z" />
      <path d="M12 10v4.5M12 17.2v.1" />
    </svg>
  )
}

function IkonKasir() {
  return (
    <svg
      aria-hidden="true"
      width={30}
      height={30}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 3.5h16v17l-2.7-1.6-2.6 1.6-2.7-1.6-2.7 1.6-2.6-1.6L4 20.5z" />
      <path d="M8 8h8M8 12h8M8 16h4" />
    </svg>
  )
}
