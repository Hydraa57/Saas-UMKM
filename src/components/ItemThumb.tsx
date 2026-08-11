'use client'

import { useEffect, useState } from 'react'
import { db } from '@/lib/db/local'
import { isBarang, type Item } from '@/lib/domain/types'
import { Ikon } from './Ikon'

/**
 * Foto barang di grid kasir.
 *
 * Diambil dari blob di perangkat, bukan dari jaringan — grid kasir harus
 * terisi penuh tanpa sinyal, dan foto yang muncul belakangan membuat
 * tombol bergeser tepat saat jari sudah turun.
 *
 * Tanpa foto, yang tampil adalah huruf awal namanya di atas warna yang
 * tetap untuk barang itu. Lebih baik daripada kotak abu-abu seragam:
 * warnanya konsisten antar kunjungan, jadi tetap bisa dikenali sekilas
 * meski belum ada satu pun foto yang diambil.
 *
 * Jasa tidak memakai huruf melainkan ikon yang sama untuk semuanya.
 * Huruf awal berguna untuk membedakan barang yang berjejer di rak; jasa
 * jumlahnya sedikit dan yang perlu terbaca justru bahwa ia **bukan**
 * barang.
 */

const WARNA = [
  'from-rose-100 to-rose-200 text-rose-800',
  'from-amber-100 to-amber-200 text-amber-800',
  'from-emerald-100 to-emerald-200 text-emerald-800',
  'from-sky-100 to-sky-200 text-sky-800',
  'from-violet-100 to-violet-200 text-violet-800',
  'from-orange-100 to-orange-200 text-orange-800',
  'from-teal-100 to-teal-200 text-teal-800',
  'from-fuchsia-100 to-fuchsia-200 text-fuchsia-800',
] as const

function warnaDari(id: string): string {
  let jumlah = 0
  for (let i = 0; i < id.length; i++) jumlah = (jumlah + id.charCodeAt(i)) % 997
  return WARNA[jumlah % WARNA.length] ?? WARNA[0]
}

export function ItemThumb({ item }: { readonly item: Item }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let dibatalkan = false
    let dibuat: string | null = null

    db()
      .photos.get(item.id)
      .then((row) => {
        if (dibatalkan || !row) return
        dibuat = URL.createObjectURL(row.blob)
        setUrl(dibuat)
      })
      .catch(() => undefined)

    return () => {
      dibatalkan = true
      // Tanpa ini, tiap gulir daftar meninggalkan blob yang tidak pernah
      // dilepas, dan pemakaian memori naik terus selama kasir dibuka.
      if (dibuat) URL.revokeObjectURL(dibuat)
    }
  }, [item.id])

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- blob lokal,
      // bukan aset yang bisa dioptimalkan next/image.
      <img
        src={url}
        alt=""
        className="aspect-square w-full rounded-2xl object-cover"
      />
    )
  }

  return (
    <span
      aria-hidden
      className={`flex aspect-square w-full items-center justify-center rounded-2xl
                  bg-gradient-to-br text-3xl font-bold ${warnaDari(item.id)}`}
    >
      {isBarang(item) ? (
        item.name.charAt(0).toUpperCase()
      ) : (
        <Ikon nama="jasa" ukuran={28} tebal={2} />
      )}
    </span>
  )
}
