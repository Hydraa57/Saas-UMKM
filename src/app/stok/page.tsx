'use client'

import { useApp, useCatalog } from '@/lib/useApp'
import { ItemThumb } from '@/components/ItemThumb'
import { AppBar } from '@/components/AppBar'
import { Ikon } from '@/components/Ikon'
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

const GAYA: Record<string, { teks: string; pil: string }> = {
  habis: { teks: 'text-keluar', pil: 'bg-keluar-soft text-keluar' },
  menipis: { teks: 'text-tunggu', pil: 'bg-tunggu-soft text-tunggu' },
  aman: { teks: 'text-slate-500', pil: 'bg-slate-100 text-slate-500' },
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
        <a href="/mulai" className="btn-primer btn-besar">
          Buka pengaturan
        </a>
      </main>
    )
  }

  return (
    <main className="flex flex-1 flex-col gap-3 px-4 pb-[calc(theme(spacing.bilah)+5rem)]">
      <AppBar judul="Stok" kembali="/" />

      {barang.length === 0 ? (
        <div className="kartu text-center">
          <span
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl
                       bg-merek-50 text-merek-600"
          >
            <Ikon nama="stok" ukuran={26} />
          </span>
          <p className="mt-3 font-semibold">Belum ada barang</p>
          <p className="mt-1 text-slate-600">
            Stok hanya berlaku untuk barang. Jasa tidak pernah habis, jadi
            tidak ada yang perlu dihitung di sini.
          </p>
          <a href="/katalog/baru?jenis=barang" className="btn-primer btn-besar mt-5">
            Tambah barang
          </a>
        </div>
      ) : (
        <>
          {perluDitindak.length === 0 ? (
            <div className="kartu flex items-center gap-3">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl
                           bg-masuk-soft text-masuk"
              >
                <Ikon nama="cek" ukuran={22} tebal={2.2} />
              </span>
              <span className="font-semibold">Semua stok masih aman</span>
            </div>
          ) : (
            <div className="kartu flex items-center gap-3 bg-tunggu-soft ring-tunggu/10">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl
                           bg-white/70 text-tunggu"
              >
                <Ikon nama="peringatan" ukuran={22} />
              </span>
              <span className="font-semibold text-tunggu">
                {perluDitindak.length} barang perlu ditindak
              </span>
            </div>
          )}

          <ul className="flex flex-col gap-2">
            {barang.map((item) => {
              const status = statusStok(item)
              const gaya = GAYA[status] ?? GAYA.aman!
              return (
                <li key={item.id}>
                  <a href={`/stok/${item.id}`} className="baris">
                    <span className="w-12 shrink-0">
                      <ItemThumb item={item} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{item.name}</span>
                      {status === 'menipis' && (
                        <span className="block text-sm text-tunggu">
                          {STATUS_STOK_LABEL.menipis}
                        </span>
                      )}
                    </span>
                    <span
                      className={`shrink-0 rounded-xl px-3 py-1.5 text-sm font-bold ${gaya.pil}`}
                    >
                      {status === 'habis'
                        ? STATUS_STOK_LABEL.habis
                        : `${item.stockQty} ${item.unit}`}
                    </span>
                    <Ikon nama="lanjut" ukuran={18} className="shrink-0 text-slate-300" />
                  </a>
                </li>
              )
            })}
          </ul>
        </>
      )}

      <div className="mengambang">
        <a href="/kulakan" className="btn-primer px-5">
          <Ikon nama="kulakan" ukuran={20} />
          Catat kulakan
        </a>
      </div>
    </main>
  )
}
