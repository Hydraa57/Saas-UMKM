'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useApp, useCatalog } from '@/lib/useApp'
import { ItemThumb } from '@/components/ItemThumb'
import * as M from '@/lib/money'
import { ITEM_KIND_LABELS, isBarang, type Item } from '@/lib/domain/types'
import { perluDitindak, statusStok } from '@/lib/domain/stock'

/**
 * Katalog.
 *
 * Daftar apa saja yang dijual — barang maupun jasa — dalam satu layar.
 * Sengaja tidak dipisah jadi dua halaman: banyak usaha kecil menjual
 * keduanya sekaligus (jual kancing sambil terima vermak), dan memisahkan
 * daftarnya memaksa pemiliknya mengingat sesuatu yang bukan urusannya.
 *
 * Yang membedakan tetap terlihat di tiap baris: barang punya sisa stok,
 * jasa tertulis "Jasa" tanpa angka sisa sama sekali. Bukan angka nol,
 * bukan tanda hubung — tidak ada barisnya, supaya tidak pernah terbaca
 * seolah jasanya bisa habis.
 */

// Satu-satunya definisi "perlu ditindak" ada di `lib/domain/stock`.
// Sebelumnya layar ini punya versinya sendiri yang melewatkan barang
// habis tanpa ambang, dan beranda punya versi ketiga — tiga jawaban
// berbeda untuk pertanyaan yang sama, di aplikasi yang sama.
function stokKritis(item: Item): boolean {
  return isBarang(item) && perluDitindak(item)
}

function Isi() {
  const params = useSearchParams()
  const { ready, tenantId } = useApp()
  const katalog = useCatalog()

  const [cari, setCari] = useState('')
  const [saring, setSaring] = useState<'semua' | 'barang' | 'jasa'>('semua')

  const kunci = cari.trim().toLowerCase()
  const terlihat = katalog.filter(
    (item) =>
      (saring === 'semua' || item.kind === saring) &&
      (kunci === '' || item.name.toLowerCase().includes(kunci)),
  )
  const menipis = katalog.filter(stokKritis)

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
        <h1 className="text-xl font-bold">Katalog</h1>
      </header>

      {/* Datang dari layar pembuka: katalognya pasti kosong, jadi yang
          ditampilkan adalah ajakan mengisi, bukan daftar kosong. */}
      {params.get('awal') === '1' && katalog.length === 0 && (
        <p className="kartu text-slate-600">
          Masukkan dulu apa saja yang dijual. Cukup nama dan harga — foto
          dan stok bisa menyusul.
        </p>
      )}

      {katalog.length === 0 ? (
        <div className="kartu">
          <p className="font-semibold">Belum ada isinya</p>
          <p className="mt-1 text-slate-600">
            Tambahkan barang yang dijual, atau jasa yang diterima seperti
            &ldquo;Potong celana&rdquo;.
          </p>
        </div>
      ) : (
        <>
          {menipis.length > 0 && (
            <a
              href="/stok"
              className="kartu flex items-start gap-3 bg-tunggu-soft text-tunggu"
            >
              <span aria-hidden>⚠</span>
              <span className="font-semibold">
                {menipis.length} barang menipis:{' '}
                {menipis.map((i) => i.name).join(', ')}
              </span>
            </a>
          )}

          <input
            type="search"
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            placeholder="Cari nama"
            className="kartu w-full text-lg outline-none"
          />

          <div role="tablist" className="flex gap-2 rounded-2xl bg-slate-200 p-1">
            {(['semua', 'barang', 'jasa'] as const).map((pilihan) => (
              <button
                key={pilihan}
                role="tab"
                aria-selected={saring === pilihan}
                onClick={() => setSaring(pilihan)}
                className={`min-h-touch flex-1 rounded-xl font-semibold capitalize transition ${
                  saring === pilihan ? 'bg-white shadow-sm' : 'text-slate-600'
                }`}
              >
                {pilihan}
              </button>
            ))}
          </div>

          <ul className="flex flex-col gap-2">
            {terlihat.map((item) => (
              <li key={item.id}>
                <a
                  href={`/katalog/baru?id=${item.id}`}
                  className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm
                             active:bg-slate-100"
                >
                  <span className="w-14 shrink-0">
                    <ItemThumb item={item} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{item.name}</span>
                    <span className="block text-sm text-slate-600">
                      {M.format(item.price)}
                    </span>
                    {/* Jasa memang tidak punya baris sisa sama sekali. */}
                    {isBarang(item) ? (
                      <span
                        className={`block text-sm ${
                          statusStok(item) === 'habis'
                            ? 'text-keluar'
                            : statusStok(item) === 'menipis'
                              ? 'text-tunggu'
                              : 'text-slate-500'
                        }`}
                      >
                        {item.stockQty <= 0
                          ? 'Stok habis'
                          : `Sisa ${item.stockQty} ${item.unit}`}
                      </span>
                    ) : (
                      <span className="block text-sm text-slate-500">
                        {ITEM_KIND_LABELS.jasa}
                      </span>
                    )}
                  </span>
                  <span aria-hidden className="text-xl text-slate-400">
                    ›
                  </span>
                </a>
              </li>
            ))}
          </ul>

          {terlihat.length === 0 && (
            <p className="kartu text-slate-600">
              Tidak ada yang cocok dengan &ldquo;{cari}&rdquo;.
            </p>
          )}
        </>
      )}

      <div
        className="fixed inset-x-0 bottom-0 mx-auto flex max-w-md gap-3 border-t
                   border-slate-200 bg-slate-50/95 p-4
                   pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur"
      >
        <a
          href="/katalog/baru?jenis=barang"
          className="flex min-h-touch flex-1 items-center justify-center rounded-xl
                     bg-slate-900 font-semibold text-white"
        >
          + Barang
        </a>
        <a
          href="/katalog/baru?jenis=jasa"
          className="flex min-h-touch flex-1 items-center justify-center rounded-xl
                     bg-slate-200 font-semibold text-slate-800"
        >
          + Jasa
        </a>
      </div>
    </main>
  )
}

export default function Katalog() {
  return (
    <Suspense fallback={<main className="flex-1 p-4" aria-busy="true" />}>
      <Isi />
    </Suspense>
  )
}
