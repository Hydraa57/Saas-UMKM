'use client'

import { useApp, useCatalog } from '@/lib/useApp'
import { ItemThumb } from '@/components/ItemThumb'
import { isBarang, type Barang } from '@/lib/domain/types'
import { statusStok, urutkanUntukDitindak, STATUS_STOK_LABEL } from '@/lib/domain/stock'

/**
 * Stok.
 *
 * Layar ini dibuka tepat sebelum berangkat kulakan, jadi urutannya bukan
 * abjad dan bukan yang terlaris: **yang perlu ditindak lebih dulu.**
 * Habis di atas, menipis di bawahnya, sisanya menyusul. Daftar berabjad
 * memaksa pemiliknya membaca seluruh katalog untuk menemukan tiga barang
 * yang sebenarnya jadi alasan dia membuka layar ini.
 *
 * Jasa tidak muncul sama sekali di sini — bukan disaring belakangan,
 * tapi karena `stockQty` memang tidak ada padanya dan tipe `Barang` yang
 * menolaknya.
 */

const WARNA: Record<string, string> = {
  habis: 'text-keluar',
  menipis: 'text-tunggu',
  aman: 'text-slate-500',
}

export default function Stok() {
  const { ready, tenantId } = useApp()
  const katalog = useCatalog()

  const barang: readonly Barang[] = urutkanUntukDitindak(katalog.filter(isBarang))
  const perluDitindak = barang.filter((item) => statusStok(item) !== 'aman')

  if (!ready) return <main className="flex-1 p-4" aria-busy="true" />

  if (!tenantId) {
    return (
      <main className="flex flex-1 flex-col gap-4 p-4">
        <p className="kartu">Pengaturan awal belum selesai.</p>
        <a href="/mulai" className="btn-aksi justify-center bg-slate-900 text-white">
          Buka pengaturan
        </a>
      </main>
    )
  }

  return (
    <main className="flex flex-1 flex-col gap-3 p-4 pb-28">
      <header className="flex items-center gap-3">
        <a
          href="/"
          aria-label="Kembali"
          className="flex h-touch w-touch items-center justify-center rounded-xl
                     bg-slate-200 text-2xl text-slate-700"
        >
          ←
        </a>
        <h1 className="text-xl font-bold">Stok</h1>
      </header>

      {barang.length === 0 ? (
        <div className="kartu">
          <p className="font-semibold">Belum ada barang</p>
          <p className="mt-1 text-slate-600">
            Stok hanya berlaku untuk barang. Jasa tidak pernah habis, jadi
            tidak ada yang perlu dihitung di sini.
          </p>
          <a
            href="/katalog/baru?jenis=barang"
            className="btn-aksi mt-4 justify-center bg-slate-900 text-white"
          >
            Tambah barang
          </a>
        </div>
      ) : (
        <>
          <p className="kartu text-slate-600">
            {perluDitindak.length === 0
              ? 'Semua stok masih aman.'
              : `${perluDitindak.length} barang perlu ditindak.`}
          </p>

          <ul className="flex flex-col gap-2">
            {barang.map((item) => {
              const status = statusStok(item)
              return (
                <li key={item.id}>
                  <a
                    href={`/stok/${item.id}`}
                    className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm
                               active:bg-slate-100"
                  >
                    <span className="w-12 shrink-0">
                      <ItemThumb item={item} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{item.name}</span>
                      <span className={`block text-sm ${WARNA[status]}`}>
                        {status === 'habis'
                          ? STATUS_STOK_LABEL.habis
                          : `${item.stockQty} ${item.unit}`}
                        {status === 'menipis' && ` · ${STATUS_STOK_LABEL.menipis}`}
                      </span>
                    </span>
                    <span aria-hidden className="text-xl text-slate-400">
                      ›
                    </span>
                  </a>
                </li>
              )
            })}
          </ul>
        </>
      )}

      <div
        className="fixed inset-x-0 bottom-0 mx-auto max-w-md border-t border-slate-200
                   bg-slate-50/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur"
      >
        <a href="/kulakan" className="btn-aksi justify-center bg-slate-900 text-white">
          Catat kulakan
        </a>
      </div>
    </main>
  )
}
