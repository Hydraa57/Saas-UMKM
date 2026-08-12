'use client'

import { useEffect, useState } from 'react'

/**
 * Memasang aplikasi ke layar depan.
 *
 * Semua bahannya sudah ada sejak lama — manifest, ikon, service worker,
 * header — dan tidak satu pun berguna, karena **tidak ada yang
 * memberitahu bahwa aplikasinya bisa dipasang.** Orang yang tidak
 * terbiasa dengan peramban tidak akan pernah menemukan "Tambah ke layar
 * utama" di menu tiga titik, jadi aplikasinya dibuka dengan mengetik
 * alamat, tergambar dengan bilah alamat di atasnya, dan terasa seperti
 * situs web. Sesudah terpasang, ikonnya duduk di layar depan bersama
 * WhatsApp dan bukanya penuh layar.
 *
 * ## Kenapa peristiwanya ditangkap di `<head>`, bukan di React
 *
 * `beforeinstallprompt` dipicu peramban **sekali**, sangat awal, dan
 * kalau tidak ada yang mendengarkan saat itu ia hilang begitu saja —
 * tidak diulang sampai halamannya dimuat ulang. React belum hidup pada
 * detik itu. Jadi yang mendengarkan adalah skrip sebaris di `<head>`,
 * yang menyimpan peristiwanya di `window`; hook di sini tinggal
 * mengambilnya.
 *
 * ## Kenapa ada jalur iOS terpisah
 *
 * Safari tidak pernah memicu `beforeinstallprompt` dan tidak menyediakan
 * cara memasang dari dalam halaman sama sekali. Satu-satunya jalan di
 * sana adalah menu Bagikan, jadi yang bisa diberikan cuma petunjuknya.
 * Sasaran utamanya Android, tapi begitu pendaftaran dibuka untuk umum
 * sebagian penggunanya pasti memakai iPhone — dan tombol "Pasang" yang
 * tidak melakukan apa-apa lebih buruk daripada petunjuk yang jujur.
 */

/** Bentuk peristiwa yang tidak ada di pustaka tipe bawaan. */
interface PeristiwaPasang extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

declare global {
  interface Window {
    __ezuraPasang?: PeristiwaPasang | null
  }
}

export const KUNCI_TUTUP = 'ezura:ajakan-pasang-ditutup'

/**
 * Dijalankan sebelum React, langsung di dalam `<head>`.
 *
 * Sependek mungkin dan seluruhnya di dalam `try`: kegagalan menangkap
 * peristiwa pemasangan tidak pernah boleh menghalangi halaman tampil.
 * `preventDefault` menahan ajakan bawaan peramban supaya ajakannya
 * muncul di tempat yang kita pilih, pada saat yang masuk akal — bukan
 * sebagai bilah kecil di dasar layar yang tertutup bilah navigasi.
 */
export const SKRIP_PASANG = `try{window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__ezuraPasang=e;window.dispatchEvent(new Event('ezura:bisa-pasang'))})}catch(e){}`

export type Keadaan =
  | 'memuat'
  | 'terpasang'
  /** Bisa dipasang sekarang juga, satu ketukan. */
  | 'bisa'
  /** Perlu petunjuk manual — Safari di iPhone dan iPad. */
  | 'ios'
  /** Tidak bisa dipasang di sini, dan tidak ada yang bisa ditawarkan. */
  | 'tidak-bisa'

export interface StatusPasang {
  readonly keadaan: Keadaan
  readonly ditutup: boolean
  readonly pasang: () => Promise<void>
  readonly tutup: () => void
}

function sudahTerpasang(): boolean {
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true
    // Safari di iOS memakai penanda miliknya sendiri dan tidak mengenali
    // `display-mode`.
    return (navigator as Navigator & { standalone?: boolean }).standalone === true
  } catch {
    return false
  }
}

function iniIOS(): boolean {
  try {
    const ua = navigator.userAgent
    // iPad modern menyamar sebagai Mac; yang membedakannya layar sentuh.
    const iPadBaru = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
    return /iPhone|iPod|iPad/.test(ua) || iPadBaru
  } catch {
    return false
  }
}

export function usePasang(): StatusPasang {
  const [keadaan, setKeadaan] = useState<Keadaan>('memuat')
  const [ditutup, setDitutup] = useState(false)

  useEffect(() => {
    const nilai = () => {
      if (sudahTerpasang()) return setKeadaan('terpasang')
      if (window.__ezuraPasang) return setKeadaan('bisa')
      if (iniIOS()) return setKeadaan('ios')
      // Belum tentu tidak bisa — peristiwanya mungkin belum dipicu.
      // Yang menentukan pendengar di bawah.
      setKeadaan('tidak-bisa')
    }

    nilai()
    try {
      setDitutup(localStorage.getItem(KUNCI_TUTUP) === '1')
    } catch {
      // Mode penyamaran. Ajakannya tetap muncul, cuma tidak diingat.
    }

    const saatBisa = () => setKeadaan('bisa')
    window.addEventListener('ezura:bisa-pasang', saatBisa)

    // Sesudah terpasang, peramban memicu `appinstalled` dan ajakannya
    // harus hilang saat itu juga — bukan setelah aplikasinya dibuka
    // ulang. Ajakan memasang sesuatu yang barusan dipasang membuat orang
    // mengira pemasangannya gagal.
    const saatTerpasang = () => {
      window.__ezuraPasang = null
      setKeadaan('terpasang')
    }
    window.addEventListener('appinstalled', saatTerpasang)

    return () => {
      window.removeEventListener('ezura:bisa-pasang', saatBisa)
      window.removeEventListener('appinstalled', saatTerpasang)
    }
  }, [])

  return {
    keadaan,
    ditutup,
    async pasang() {
      const peristiwa = window.__ezuraPasang
      if (!peristiwa) return
      await peristiwa.prompt()
      const { outcome } = await peristiwa.userChoice
      // Peristiwanya sekali pakai. Peramban tidak akan memberikannya lagi
      // sampai halamannya dimuat ulang, jadi menyimpannya berarti tombol
      // yang tidak melakukan apa-apa saat ditekan kedua kali.
      window.__ezuraPasang = null
      if (outcome === 'accepted') setKeadaan('terpasang')
      else setKeadaan('tidak-bisa')
    },
    tutup() {
      setDitutup(true)
      try {
        localStorage.setItem(KUNCI_TUTUP, '1')
      } catch {
        // Tertutup untuk sesi ini saja.
      }
    },
  }
}
