'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useApp, useCatalog } from '@/lib/useApp'
import { ItemThumb } from '@/components/ItemThumb'
import { AppBar } from '@/components/AppBar'
import { Ikon } from '@/components/Ikon'
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
        <a href="/mulai" className="btn-primer btn-besar">
          Buka pengaturan
        </a>
      </main>
    )
  }

  return (
    <main className="flex flex-1 flex-col gap-3 px-4 pb-[calc(theme(spacing.bilah)+5rem)]">
      <AppBar judul="Katalog" kembali="/" />

      {/* Datang dari layar pembuka: katalognya pasti kosong, jadi yang
          ditampilkan adalah ajakan mengisi, bukan daftar kosong. */}
      {params.get('awal') === '1' && katalog.length === 0 && (
        <p className="kartu animate-naik text-slate-600">
          Masukkan dulu apa saja yang dijual. Cukup nama dan harga — foto dan
          stok bisa menyusul.
        </p>
      )}

      {katalog.length === 0 ? (
        <div className="kartu text-center">
          <span
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl
                       bg-merek-50 text-merek-600"
          >
            <Ikon nama="katalog" ukuran={26} />
          </span>
          <p className="mt-3 font-semibold">Belum ada isinya</p>
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
              className="kartu-tekan flex items-center gap-3 bg-tunggu-soft ring-tunggu/10"
            >
              <Ikon nama="peringatan" ukuran={20} className="shrink-0 text-tunggu" />
              <span className="min-w-0 flex-1 truncate font-semibold text-tunggu">
                {menipis.length} barang menipis: {menipis.map((i) => i.name).join(', ')}
              </span>
              <Ikon nama="lanjut" ukuran={18} className="shrink-0 text-tunggu/50" />
            </a>
          )}

          <label className="kartu flex items-center gap-3 py-3">
            <Ikon nama="cari" ukuran={20} className="shrink-0 text-slate-400" />
            <input
              type="search"
              value={cari}
              onChange={(e) => setCari(e.target.value)}
              placeholder="Cari nama"
              className="kolom"
            />
          </label>

          <div role="tablist" className="tab-grup">
            {(['semua', 'barang', 'jasa'] as const).map((pilihan) => (
              <button
                key={pilihan}
                role="tab"
                aria-selected={saring === pilihan}
                onClick={() => setSaring(pilihan)}
                className={`tab capitalize ${saring === pilihan ? 'tab-aktif' : ''}`}
              >
                {pilihan}
              </button>
            ))}
          </div>

          <ul className="flex flex-col gap-2">
            {terlihat.map((item) => (
              <li key={item.id}>
                <a href={`/katalog/baru?id=${item.id}`} className="baris">
                  <span className="w-14 shrink-0">
                    <ItemThumb item={item} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{item.name}</span>
                    <span className="block font-semibold text-merek-700">
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
                  <Ikon nama="lanjut" ukuran={20} className="shrink-0 text-slate-300" />
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

      <div className="mengambang">
        <a href="/katalog/baru?jenis=jasa" className="btn-sekunder px-4 text-base">
          <Ikon nama="tambah" ukuran={18} tebal={2.4} />
          Jasa
        </a>
        <a href="/katalog/baru?jenis=barang" className="btn-primer px-4 text-base">
          <Ikon nama="tambah" ukuran={18} tebal={2.4} />
          Barang
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
