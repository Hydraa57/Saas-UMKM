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

/**
 * Petak pengganti foto: satu warna datar, bukan gradasi.
 *
 * Gradasi pada petak sekecil ini tidak terbaca sebagai gradasi melainkan
 * sebagai warna yang kotor, dan dua puluh petak bergradasi berjejer di
 * grid kasir membuat layarnya terlihat berisik justru pada layar yang
 * harus paling cepat dipindai mata.
 */
const WARNA = [
  'bg-rose-100 text-rose-700',
  'bg-amber-100 text-amber-700',
  'bg-emerald-100 text-emerald-700',
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-orange-100 text-orange-700',
  'bg-teal-100 text-teal-700',
  'bg-fuchsia-100 text-fuchsia-700',
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
        className="aspect-square w-full rounded-kartu object-cover"
      />
    )
  }

  return (
    <span
      aria-hidden
      className={`flex aspect-square w-full items-center justify-center rounded-kartu
                  text-3xl font-bold ${warnaDari(item.id)}`}
    >
      {isBarang(item) ? (
        item.name.charAt(0).toUpperCase()
      ) : (
        <Ikon nama="jasa" ukuran={28} tebal={2} />
      )}
    </span>
  )
}
