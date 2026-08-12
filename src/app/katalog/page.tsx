'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useApp, useCatalog } from '@/lib/useApp'
import { ItemThumb } from '@/components/ItemThumb'
import { AppBar } from '@/components/AppBar'
import { Ikon } from '@/components/Ikon'
import * as M from '@/lib/money'
import { ITEM_KIND_LABELS, isBarang, type Barang, type Item } from '@/lib/domain/types'
import {
  perluDitindak,
  statusStok,
  urutkanUntukDitindak,
  STATUS_STOK_LABEL,
} from '@/lib/domain/stock'

/**
 * Barang & Jasa.
 *
 * Satu layar, dua tab: **Daftar** dan **Stok.** Sebelumnya ini dua
 * halaman terpisah bernama "Katalog" dan "Stok", dan bersama "Kulakan"
 * di bilah navigasi mereka jadi tiga kata yang gampang tertukar — semua
 * soal barang, dan tidak jelas dari namanya mana untuk apa.
 *
 * Yang membedakan keduanya bukan datanya, melainkan **pertanyaan yang
 * dibawa pengguna:**
 *
 *   Daftar → "apa saja yang saya jual, dan harganya berapa"
 *   Stok   → "apa yang mau habis, apa yang perlu dibeli"
 *
 * Karena pertanyaannya berbeda, urutan dan tujuan ketukannya juga
 * berbeda: Daftar diurutkan abjad dan menuju penyuntingan; Stok
 * diurutkan menurut yang perlu ditindak dan menuju riwayat
 * pergerakannya. Menggabungkan keduanya jadi satu daftar justru akan
 * membuat salah satu pertanyaan tidak terjawab.
 *
 * Jasa tidak muncul di tab Stok sama sekali — bukan disaring belakangan,
 * tapi karena `stockQty` memang tidak ada padanya dan tipe `Barang` yang
 * menolaknya.
 */

type Tab = 'daftar' | 'stok'

const GAYA_PIL: Readonly<Record<string, string>> = {
  habis: 'bg-keluar-soft text-keluar',
  menipis: 'bg-tunggu-soft text-tunggu',
  aman: 'bg-slate-100 text-slate-500',
}

function stokKritis(item: Item): boolean {
  // Satu-satunya definisi "perlu ditindak" ada di `lib/domain/stock`.
  // Sebelumnya tiap layar punya versinya sendiri, dan salah satunya
  // melewatkan barang habis yang tidak punya ambang.
  return isBarang(item) && perluDitindak(item)
}

function Isi() {
  const params = useSearchParams()
  const { ready, tenantId } = useApp()
  const katalog = useCatalog()

  // Tab disimpan di URL, bukan di state: peringatan "barang menipis" di
  // beranda perlu bisa menunjuk langsung ke tab Stok, dan tombol kembali
  // peramban harus mengembalikan ke tab yang tadi dibuka.
  const tab: Tab = params.get('tab') === 'stok' ? 'stok' : 'daftar'

  const [cari, setCari] = useState('')
  const [saring, setSaring] = useState<'semua' | 'barang' | 'jasa'>('semua')

  const kunci = cari.trim().toLowerCase()
  const terlihat = katalog.filter(
    (item) =>
      (saring === 'semua' || item.kind === saring) &&
      (kunci === '' || item.name.toLowerCase().includes(kunci)),
  )

  const barang: readonly Barang[] = urutkanUntukDitindak(katalog.filter(isBarang))
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
      <AppBar judul="Barang & Jasa" kembali="/" />

      <div role="tablist" className="tab-grup">
        <a
          role="tab"
          href="/katalog"
          aria-selected={tab === 'daftar'}
          className={`tab ${tab === 'daftar' ? 'tab-aktif' : ''}`}
        >
          Daftar
        </a>
        <a
          role="tab"
          href="/katalog?tab=stok"
          aria-selected={tab === 'stok'}
          className={`tab ${tab === 'stok' ? 'tab-aktif' : ''}`}
        >
          Stok
        </a>
      </div>

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
      ) : tab === 'daftar' ? (
        <>
          {menipis.length > 0 && (
            <a
              href="/katalog?tab=stok"
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
                    <span className="block font-semibold text-slate-900">
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
      ) : barang.length === 0 ? (
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
          {menipis.length === 0 ? (
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
                {menipis.length} barang perlu ditindak
              </span>
            </div>
          )}

          <ul className="flex flex-col gap-2">
            {barang.map((item) => {
              const status = statusStok(item)
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
                      className={`shrink-0 rounded-xl px-3 py-1.5 text-sm font-bold ${
                        GAYA_PIL[status] ?? GAYA_PIL.aman
                      }`}
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

      {/* Aksinya mengikuti tab, bukan berdiri sendiri di bilah navigasi.
          Kulakan ada di sini karena inilah tempat pemiliknya baru saja
          melihat apa yang mau habis. */}
      <div className="mengambang">
        {tab === 'daftar' ? (
          <>
            {/* Teksnya pendek supaya muat berdampingan, tapi nama
                aksesibilitasnya lengkap: "Barang" saja sama persis dengan
                label tab di bilah bawah, dan pembaca layar tidak punya
                cara membedakan keduanya. */}
            <a
              href="/katalog/baru?jenis=jasa"
              aria-label="Tambah jasa"
              className="btn-sekunder px-4 text-base"
            >
              <Ikon nama="tambah" ukuran={18} tebal={2.4} />
              Jasa
            </a>
            <a
              href="/katalog/baru?jenis=barang"
              aria-label="Tambah barang"
              className="btn-primer px-4 text-base"
            >
              <Ikon nama="tambah" ukuran={18} tebal={2.4} />
              Barang
            </a>
          </>
        ) : (
          <a href="/kulakan" className="btn-primer px-5">
            <Ikon nama="kulakan" ukuran={20} />
            Catat kulakan
          </a>
        )}
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
