import * as M from '@/lib/money'
import type { Rupiah } from '@/lib/money'

/**
 * Menampilkan nominal rupiah.
 *
 * Selalu lewat komponen ini, tidak pernah dengan merangkai string
 * sendiri. Nominal yang diformat berbeda-beda di layar yang berbeda
 * membuat pengguna ragu apakah angkanya memang berbeda — dan pada
 * aplikasi keuangan, keraguan itu mahal.
 */

interface UangProps {
  nilai: Rupiah
  /** Ringkas angka besar: `Rp 85rb`. Untuk beranda dan ringkasan. */
  ringkas?: boolean
  /** Tampilkan `+` di depan nilai positif. Untuk daftar mutasi. */
  bertanda?: boolean
  className?: string
}

export function Uang({ nilai, ringkas, bertanda, className }: UangProps) {
  const teks = ringkas
    ? M.formatCompact(nilai)
    : M.format(nilai, { withSign: bertanda })

  return (
    // Nominal penuh selalu tersedia lewat `title`, supaya bentuk ringkas
    // tidak pernah menyembunyikan angka yang sebenarnya.
    <span className={className} title={M.format(nilai)}>
      {teks}
    </span>
  )
}

interface UangBerwarnaProps extends UangProps {
  arah: 'in' | 'out'
}

/** Nominal dengan warna arah. Uang masuk dan keluar tidak boleh sekilas sama. */
export function UangBerwarna({ arah, className = '', ...props }: UangBerwarnaProps) {
  const warna = arah === 'in' ? 'text-masuk' : 'text-keluar'
  return <Uang {...props} className={`${warna} ${className}`} />
}
