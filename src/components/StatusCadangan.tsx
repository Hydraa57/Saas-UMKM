'use client'

import { useSesi } from '@/lib/auth'
import { useSync } from '@/lib/sync/useSync'
import { Ikon } from './Ikon'

/**
 * Keadaan cadangan, di beranda.
 *
 * Aturannya satu: **kalau catatannya belum aman, itu harus terlihat
 * tanpa dicari.** Kehilangan HP adalah satu-satunya cara seluruh isi
 * aplikasi ini lenyap sekaligus, dan pengguna tidak punya cara lain
 * mengetahui bahwa itu mungkin terjadi.
 *
 * Tapi ia juga tidak boleh jadi gangguan permanen. Karena itu bentuknya
 * berubah menurut keadaan, dan yang paling sering — sudah masuk, antrean
 * kosong — sengaja **tidak menampilkan apa pun.** Penanda hijau yang
 * selalu ada akan berhenti dibaca dalam dua hari, dan bersamanya
 * peringatan yang sesungguhnya ikut tidak terbaca.
 */

export function StatusCadangan() {
  const { status } = useSesi()
  const { menunggu, gagal, sedangMengirim, bisaMengirim } = useSync()

  // Supabase belum disetel: tidak ada yang bisa ditawarkan, dan
  // memberitahu pengguna soal berkas `.env` cuma menakuti tanpa jalan
  // keluar. Yang perlu tahu adalah pengembangnya, dan dia melihatnya di
  // layar /masuk.
  if (status === 'tanpa-peladen' || status === 'memuat') return null

  if (status === 'keluar') {
    return (
      <a
        href="/masuk"
        className="kartu-tekan flex items-center gap-3 bg-tunggu-soft ring-tunggu/10"
      >
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl
                     bg-white/70 text-tunggu"
        >
          <Ikon nama="peringatan" ukuran={22} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-tunggu">
            Belum dicadangkan
          </span>
          <span className="block text-sm text-tunggu/80">
            Catatan baru ada di HP ini
          </span>
        </span>
        <Ikon nama="lanjut" ukuran={20} className="shrink-0 text-tunggu/50" />
      </a>
    )
  }

  if (gagal > 0) {
    return (
      <a href="/masuk" className="kartu-tekan flex items-center gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl
                     bg-keluar-soft text-keluar"
        >
          <Ikon nama="silang" ukuran={22} tebal={2.2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{gagal} catatan ditolak</span>
          <span className="block text-sm text-slate-500">
            Perlu diperiksa — sisanya tetap aman
          </span>
        </span>
        <Ikon nama="lanjut" ukuran={20} className="shrink-0 text-slate-300" />
      </a>
    )
  }

  // Sedang ada yang menunggu giliran kirim. Ditampilkan tenang, bukan
  // sebagai galat: luring adalah keadaan normal di warung, bukan
  // kegagalan.
  if (menunggu > 0 && bisaMengirim) {
    return (
      <p className="kartu flex items-center gap-3 text-slate-600">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl
                     bg-slate-100 text-slate-500"
        >
          <Ikon nama="riwayat" ukuran={22} />
        </span>
        <span>
          {sedangMengirim ? 'Mengirim' : 'Menunggu sinyal'} · {menunggu} catatan
          belum tersalin
        </span>
      </p>
    )
  }

  return null
}
