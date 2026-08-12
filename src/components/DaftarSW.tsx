'use client'

import { useEffect } from 'react'

/**
 * Mendaftarkan service worker.
 *
 * Sebelum ini pendaftarannya menumpang di komponen beranda — dan itu
 * berarti **aplikasinya cuma jadi bisa dibuka tanpa sinyal kalau
 * pemiliknya kebetulan pernah membuka beranda.** Padahal alur pertama di
 * HP baru sekarang tidak lewat sana sama sekali: gerbang mengantar ke
 * layar masuk, lalu pengaturan awal, lalu langsung ke katalog. Orang bisa
 * memakai kasirnya seharian penuh tanpa service worker pernah terpasang,
 * lalu sinyalnya hilang dan aplikasinya tidak terbuka.
 *
 * Di tata letak akar, ia terdaftar pada layar apa pun yang dibuka lebih
 * dulu.
 */

export function DaftarSW() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    // Ditunda sampai halamannya selesai dimuat: pendaftaran service
    // worker bersaing memperebutkan jaringan dengan aset yang sedang
    // dibutuhkan layar pertama, dan yang paling terasa di HP lambat
    // justru layar pertama itu.
    const daftar = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined)
    }
    if (document.readyState === 'complete') daftar()
    else {
      window.addEventListener('load', daftar, { once: true })
      return () => window.removeEventListener('load', daftar)
    }
    return undefined
  }, [])

  return null
}
