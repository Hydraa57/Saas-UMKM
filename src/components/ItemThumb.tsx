'use client'

import { useEffect, useState } from 'react'
import { db } from '@/lib/db/local'
import { isBarang, type Item } from '@/lib/domain/types'

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
 */

const WARNA = [
  'bg-rose-100 text-rose-900',
  'bg-amber-100 text-amber-900',
  'bg-emerald-100 text-emerald-900',
  'bg-sky-100 text-sky-900',
  'bg-violet-100 text-violet-900',
  'bg-orange-100 text-orange-900',
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
        className="aspect-square w-full rounded-lg object-cover"
      />
    )
  }

  return (
    <span
      aria-hidden
      className={`flex aspect-square w-full items-center justify-center rounded-lg
                  text-3xl font-bold ${warnaDari(item.id)}`}
    >
      {isBarang(item) ? item.name.charAt(0).toUpperCase() : '✂'}
    </span>
  )
}
