'use client'

import { useEffect, useState } from 'react'

/**
 * Apakah layarnya cukup lebar untuk dua kolom.
 *
 * Ambangnya sama dengan `lg` di Tailwind — 1024px — dan itu disengaja:
 * kalau angkanya berbeda, akan ada lebar layar di mana daftar sudah
 * menyempit jadi kolom kiri sementara rinciannya masih membuka halaman
 * baru. Cacat seperti itu cuma muncul di rentang sempit dan hampir tidak
 * pernah tertangkap.
 *
 * Jawabannya `false` sampai komponennya terpasang. Halaman disusun di
 * peladen, yang tidak punya lebar layar sama sekali, dan menebak "lebar"
 * di sana membuat tata letak dua kolom tergambar sekejap di HP sebelum
 * runtuh jadi satu kolom.
 */
const AMBANG = '(min-width: 1024px)'

export function useLayarLebar(): boolean {
  const [lebar, setLebar] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia(AMBANG)
    setLebar(mq.matches)

    const saatBerubah = (e: MediaQueryListEvent) => setLebar(e.matches)
    mq.addEventListener('change', saatBerubah)
    return () => mq.removeEventListener('change', saatBerubah)
  }, [])

  return lebar
}
