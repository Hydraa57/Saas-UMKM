/**
 * Ikon.
 *
 * SVG sebaris, bukan emoji. Emoji digambar oleh sistem operasi, jadi
 * bentuknya berbeda di tiap HP, tebalnya tidak bisa diatur, dan warnanya
 * tidak pernah mengikuti warna teks di sebelahnya — tiga hal yang
 * membuat aplikasi terlihat seperti prototipe.
 *
 * Juga bukan pustaka ikon: yang dipakai cuma belasan, dan menambah
 * paket 40 kB untuk itu berarti kasir terbuka lebih lambat di HP yang
 * paling lambat.
 *
 * Semua bergaya garis dengan tebal seragam, mewarisi `currentColor`.
 */

export type NamaIkon =
  | 'kasir'
  | 'katalog'
  | 'stok'
  | 'riwayat'
  | 'beranda'
  | 'keluar'
  | 'utang'
  | 'kulakan'
  | 'kembali'
  | 'lanjut'
  | 'tambah'
  | 'kurang'
  | 'hapus'
  | 'cek'
  | 'silang'
  | 'peringatan'
  | 'cetak'
  | 'wa'
  | 'cari'
  | 'jasa'
  | 'foto'
  | 'galeri'
  | 'laporan'
  | 'piala'
  | 'jam'
  | 'unduh'
  | 'qris'
  | 'setelan'
  | 'kamera'

const JALUR: Readonly<Record<NamaIkon, React.ReactNode>> = {
  kasir: (
    <>
      <path d="M4 3.5h16v17l-2.7-1.6-2.6 1.6-2.7-1.6-2.7 1.6-2.6-1.6L4 20.5z" />
      <path d="M8 8h8M8 12h8M8 16h4" />
    </>
  ),
  katalog: (
    <>
      <path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z" />
      <path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" />
    </>
  ),
  stok: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>
  ),
  riwayat: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <path d="M3 4v4.5h4.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  beranda: (
    <>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />
    </>
  ),
  keluar: (
    <>
      <path d="M12 20V4M12 4 6 10M12 4l6 6" />
    </>
  ),
  utang: (
    <>
      <path d="M6 3.5h11a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H6z" />
      <path d="M6 3.5a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2" />
      <path d="M9.5 9h6M9.5 13h4" />
    </>
  ),
  kulakan: (
    <>
      <path d="M3 5h2l2.2 10.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.5L20.5 9H6" />
      <circle cx="10" cy="20" r="1.2" />
      <circle cx="17" cy="20" r="1.2" />
    </>
  ),
  kembali: <path d="M15 5l-7 7 7 7" />,
  lanjut: <path d="M9 5l7 7-7 7" />,
  tambah: <path d="M12 5v14M5 12h14" />,
  kurang: <path d="M5 12h14" />,
  hapus: (
    <>
      <path d="M20 5H9L3 12l6 7h11a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z" />
      <path d="M12 9.5l5 5M17 9.5l-5 5" />
    </>
  ),
  cek: <path d="M4.5 12.5l5 5 10-11" />,
  silang: <path d="M6 6l12 12M18 6L6 18" />,
  peringatan: (
    <>
      <path d="M12 3.5 22 20H2z" />
      <path d="M12 10v4.5M12 17.2v.1" />
    </>
  ),
  cetak: (
    <>
      <path d="M7 9V3.5h10V9" />
      <path d="M7 18H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <path d="M7 14h10v6.5H7z" />
    </>
  ),
  wa: (
    <>
      <path d="M3.5 20.5l1.3-4.2A8.2 8.2 0 1 1 8 19.4z" />
      <path d="M9 9.5c0 3 2.5 5.5 5.5 5.5.6 0 1-.4 1-1v-.8l-1.8-.7-.8.9a5 5 0 0 1-2.3-2.3l.9-.8-.7-1.8h-.8c-.6 0-1 .4-1 1z" />
    </>
  ),
  cari: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  jasa: (
    <>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <path d="M8 7.5 20 18M8 16.5 20 6" />
    </>
  ),
  foto: (
    <>
      <path d="M3.5 8a2 2 0 0 1 2-2h2l1.4-2h6.2L16.5 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
      <circle cx="12" cy="12.5" r="3.2" />
    </>
  ),
  // Galeri sengaja **tidak** berbentuk kamera. Tombol "Galeri" dan
  // "Kamera" berdampingan, dan dua tombol bergambar kamera hanya bisa
  // dibedakan lewat tulisannya — persis pembedaan yang gagal saat dilihat
  // sekilas sambil melayani pembeli.
  galeri: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="8.8" cy="9.5" r="1.6" />
      <path d="M4 16.5l4.5-4.2 3.4 3.1 3.4-3.6L20 16" />
    </>
  ),
  laporan: (
    <>
      <path d="M3.5 20.5V4M3.5 20.5H21" />
      <path d="M7 15.5l4-4.5 3.2 3L20 6.5" />
      <path d="M15.6 6.5H20v4.3" />
    </>
  ),
  piala: (
    <>
      <path d="M7.5 3.5h9v5.2a4.5 4.5 0 0 1-9 0z" />
      <path d="M7.5 5H5a2.2 2.2 0 0 0 2.5 3.4M16.5 5H19a2.2 2.2 0 0 1-2.5 3.4" />
      <path d="M12 13.2v3.6M8.8 20.5h6.4l-.7-3.7H9.5z" />
    </>
  ),
  jam: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5.3l3.2 2" />
    </>
  ),
  unduh: (
    <>
      <path d="M12 3.5v11M7.8 10.5l4.2 4 4.2-4" />
      <path d="M4 16.5v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </>
  ),
  qris: (
    <>
      <path d="M3.5 3.5h6v6h-6zM14.5 3.5h6v6h-6zM3.5 14.5h6v6h-6z" />
      <path d="M14.5 14.5h2.5v2.5h-2.5zM18 18h2.5v2.5H18" />
    </>
  ),
  kamera: (
    <>
      <path d="M3 8.5a2 2 0 0 1 2-2h2.2l1.3-2h6.9l1.3 2H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <circle cx="12" cy="12.8" r="3.6" />
    </>
  ),
  setelan: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
    </>
  ),
}

interface IkonProps {
  readonly nama: NamaIkon
  /** Ukuran sisi dalam piksel. Bawaannya sepadan dengan teks di sebelahnya. */
  readonly ukuran?: number
  readonly tebal?: number
  readonly className?: string
}

export function Ikon({ nama, ukuran = 24, tebal = 1.75, className }: IkonProps) {
  return (
    <svg
      // Ikon selalu didampingi teks di aplikasi ini, jadi ia tidak pernah
      // jadi satu-satunya penjelas dan tidak perlu dibacakan dua kali.
      aria-hidden="true"
      focusable="false"
      width={ukuran}
      height={ukuran}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={tebal}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {JALUR[nama]}
    </svg>
  )
}
