'use client'

import { Ikon } from './Ikon'

/**
 * Daftar di kiri, rinciannya di kanan — hanya di layar lebar.
 *
 * Di HP, membuka satu struk berarti meninggalkan daftarnya, lalu menekan
 * "kembali" untuk melihat yang berikutnya. Itu benar di layar selebar
 * telapak tangan: tidak ada tempat untuk keduanya. Di laptop, tempat itu
 * ada, dan memaksa orang bolak-balik untuk membandingkan dua struk
 * adalah membuang ruang yang sudah tersedia.
 *
 * Yang **tidak** berubah: alamatnya. Baris daftar tetap `<Link>` ke
 * halaman rinciannya, jadi menyalin tautan, membuka di tab baru, dan
 * tombol kembali peramban tetap bekerja seperti biasa. Di layar lebar
 * ketukannya ditahan dan rinciannya digambar di sebelah — sebuah
 * percepatan, bukan penggantian.
 */

interface Props {
  /**
   * Kalau `false`, daftarnya digambar selebar penuh tanpa panel kanan.
   *
   * Dipakai layar yang punya beberapa tab: di katalog, tab "Daftar"
   * mengantar ke formulir ubah — itu memang halaman sendiri, bukan
   * rincian yang enak berdampingan — sementara tab "Stok" justru tempat
   * orang membandingkan barang satu per satu.
   */
  readonly aktif?: boolean
  readonly daftar: React.ReactNode
  /** `null` berarti belum ada yang dipilih. */
  readonly rincian: React.ReactNode | null
  /** Kalimat di panel kanan selama belum ada yang dipilih. */
  readonly ajakan: string
}

export function DuaKolom({ aktif = true, daftar, rincian, ajakan }: Props) {
  if (!aktif) return <>{daftar}</>

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-5">
      {/* Kolom kiri diberi lebar tetap, bukan proporsi. Daftar yang
          melar mengikuti lebar layar membuat panjang barisnya berbeda di
          tiap laptop, dan nama barang yang terpotong di satu tempat
          tidak terpotong di tempat lain. */}
      <div className="flex min-w-0 flex-col gap-3 lg:w-[24rem] lg:shrink-0">
        {daftar}
      </div>

      {/* Panel kanan cuma ada di layar lebar. Di HP rinciannya memang
          halaman tersendiri, dan menggambarnya dua kali berarti dua
          tempat yang harus dijaga tetap sepadan. */}
      <div className="hidden min-w-0 flex-1 lg:sticky lg:top-4 lg:block">
        {rincian ?? (
          <div className="kartu flex flex-col items-center justify-center gap-3 py-16 text-center">
            <span
              className="flex h-12 w-12 items-center justify-center rounded-kartu
                         bg-slate-100 text-slate-400"
            >
              <Ikon nama="lanjut" ukuran={24} />
            </span>
            <p className="text-slate-500">{ajakan}</p>
          </div>
        )}
      </div>
    </div>
  )
}
