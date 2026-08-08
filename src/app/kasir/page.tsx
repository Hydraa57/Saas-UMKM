'use client'

import { useState } from 'react'
import { actionContext, useApp, useCatalog } from '@/lib/useApp'
import { recordSale } from '@/lib/actions/pos'
import {
  addLine,
  calculateCart,
  changeDue,
  lineFromItem,
  overStock,
  qtyInCart,
  setQty,
} from '@/lib/domain/cart'
import { isBarang, type CartLine, type Item, type PaymentMethod } from '@/lib/domain/types'
import * as M from '@/lib/money'
import type { Rupiah } from '@/lib/money'
import { PapanAngka } from '@/components/PapanAngka'
import { Uang } from '@/components/Uang'
import { ItemThumb } from '@/components/ItemThumb'

/**
 * Kasir.
 *
 * Layar yang dipakai di depan pembeli, jadi seluruh rancangannya tunduk
 * pada satu ukuran: **satu transaksi selesai sebelum pembeli sempat
 * merasa menunggu.**
 *
 * Tiga hal yang membuatnya mungkin:
 *
 * 1. **Grid foto, bukan kotak pencarian.** Ketuk barang = masuk
 *    keranjang. Urutannya menurut frekuensi, jadi yang paling laku selalu
 *    ada di layar pertama tanpa perlu diatur siapa pun.
 * 2. **Tidak pernah menunggu jaringan.** Simpan menulis ke perangkat,
 *    struk langsung muncul.
 * 3. **Stok memperingatkan, tidak melarang.** Angka stok sering
 *    tertinggal dari kenyataan; menolak penjualan karenanya akan membuat
 *    kasir ditinggalkan tepat saat pembeli menunggu.
 */

type Fase =
  | { tahap: 'pilih' }
  | { tahap: 'bayar' }
  | { tahap: 'selesai'; saleId: string }

export default function Kasir() {
  const { tenantId, defaultWallet, ready } = useApp()
  const katalog = useCatalog()

  const [keranjang, setKeranjang] = useState<readonly CartLine[]>([])
  const [fase, setFase] = useState<Fase>({ tahap: 'pilih' })
  const [saring, setSaring] = useState<'semua' | 'barang' | 'jasa'>('semua')
  const [dibayar, setDibayar] = useState<Rupiah>(M.ZERO)
  const [metode, setMetode] = useState<PaymentMethod>('tunai')
  const [pembeli, setPembeli] = useState('')
  const [menyimpan, setMenyimpan] = useState(false)

  const totals = calculateCart(keranjang)
  const peringatan = overStock(keranjang, katalog)
  const kembalian = changeDue(totals.total, dibayar)
  const kurang = M.clampToZero(M.subtract(totals.total, dibayar))

  const terlihat = katalog.filter(
    (item) => saring === 'semua' || item.kind === saring,
  )

  function tambah(item: Item) {
    setKeranjang((isi) => addLine(isi, lineFromItem(item)))
  }

  async function bayar() {
    if (!tenantId || !defaultWallet || keranjang.length === 0 || menyimpan) return
    setMenyimpan(true)
    try {
      const hasil = await recordSale(actionContext(tenantId), {
        lines: keranjang,
        walletId: defaultWallet.id,
        paid: dibayar,
        method: M.isZero(dibayar) ? 'utang' : metode,
        customerName: pembeli,
      })
      setFase({ tahap: 'selesai', saleId: hasil.id })
      setKeranjang([])
      setDibayar(M.ZERO)
      setPembeli('')
    } finally {
      setMenyimpan(false)
    }
  }

  if (!ready) return <main className="flex-1 p-4" aria-busy="true" />

  if (!tenantId || !defaultWallet) {
    return (
      <main className="flex flex-1 flex-col gap-4 p-4">
        <p className="kartu">Pengaturan awal belum selesai.</p>
        <a href="/mulai" className="btn-aksi justify-center bg-slate-900 text-white">
          Buka pengaturan
        </a>
      </main>
    )
  }

  if (fase.tahap === 'selesai') {
    // Struk dibuka sebagai halaman sendiri supaya bisa dibuka ulang dari
    // riwayat, bukan hanya sekali lewat.
    if (typeof window !== 'undefined') {
      window.location.replace(`/struk/${fase.saleId}`)
    }
    return <main className="flex-1 p-4" aria-busy="true" />
  }

  // ── Layar bayar ────────────────────────────────────────────────────
  if (fase.tahap === 'bayar') {
    return (
      <main className="flex flex-1 flex-col gap-4 p-4 pb-28">
        <header className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setFase({ tahap: 'pilih' })}
            aria-label="Kembali ke keranjang"
            className="flex h-touch w-touch items-center justify-center rounded-xl
                       bg-slate-200 text-2xl text-slate-700"
          >
            ←
          </button>
          <h1 className="text-xl font-bold">Bayar</h1>
        </header>

        <div className="kartu">
          <p className="text-sm text-slate-500">Total tagihan</p>
          <p className="text-money">
            <Uang nilai={totals.total} />
          </p>
        </div>

        <div className="kartu">
          <p className="text-sm text-slate-500">Uang diterima</p>
          <p className="text-money-lg text-masuk">
            <Uang nilai={dibayar} />
          </p>
          {M.isPositive(kembalian) && (
            <p className="mt-1 text-lg">
              Kembali <Uang nilai={kembalian} className="font-bold" />
            </p>
          )}
          {M.isPositive(kurang) && (
            <p className="mt-1 text-lg text-keluar">
              Kurang <Uang nilai={kurang} className="font-bold" />
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => setDibayar(totals.total)}
          className="min-h-touch rounded-xl bg-slate-200 font-semibold text-slate-800"
        >
          Uang pas
        </button>

        <PapanAngka
          nilai={dibayar}
          onChange={setDibayar}
          pintasan={[10_000, 20_000, 50_000, 100_000]}
        />

        <section>
          <h2 className="mb-2 text-sm text-slate-500">Cara bayar</h2>
          <div className="flex flex-wrap gap-2">
            {(['tunai', 'qris', 'transfer'] as const).map((pilihan) => (
              <button
                key={pilihan}
                type="button"
                aria-pressed={metode === pilihan}
                onClick={() => setMetode(pilihan)}
                className={`min-h-touch rounded-xl px-5 font-semibold capitalize ${
                  metode === pilihan
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-700 shadow-sm'
                }`}
              >
                {pilihan}
              </button>
            ))}
          </div>
        </section>

        {/* Nama pembeli hanya perlu kalau uangnya kurang — piutang tanpa
            nama tidak bisa ditagih. */}
        {M.isPositive(kurang) && (
          <label className="kartu block">
            <span className="text-sm text-slate-500">
              Nama pembeli (supaya utangnya bisa ditagih)
            </span>
            <input
              type="text"
              value={pembeli}
              onChange={(e) => setPembeli(e.target.value)}
              placeholder="Bu Tetangga"
              className="mt-1 w-full bg-transparent text-lg outline-none"
            />
          </label>
        )}

        <div
          className="fixed inset-x-0 bottom-0 mx-auto max-w-md border-t border-slate-200
                     bg-slate-50/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur"
        >
          <button
            type="button"
            disabled={menyimpan}
            onClick={bayar}
            className="btn-aksi justify-center bg-slate-900 text-white
                       disabled:bg-slate-300 disabled:text-slate-500"
          >
            {M.isZero(dibayar) ? 'Simpan sebagai utang' : 'Selesai & cetak struk'}
          </button>
        </div>
      </main>
    )
  }

  // ── Layar pilih barang ─────────────────────────────────────────────
  return (
    <main className="flex flex-1 flex-col gap-3 p-4 pb-32">
      <header className="flex items-center gap-3">
        <a
          href="/"
          aria-label="Kembali"
          className="flex h-touch w-touch items-center justify-center rounded-xl
                     bg-slate-200 text-2xl text-slate-700"
        >
          ←
        </a>
        <h1 className="text-xl font-bold">Kasir</h1>
      </header>

      {katalog.length === 0 ? (
        <div className="kartu">
          <p className="font-semibold">Katalog masih kosong</p>
          <p className="mt-1 text-slate-600">
            Tambahkan barang atau jasa dulu supaya bisa diketuk dari sini.
          </p>
          <a
            href="/katalog/baru"
            className="btn-aksi mt-4 justify-center bg-slate-900 text-white"
          >
            Tambah barang / jasa
          </a>
        </div>
      ) : (
        <>
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

          <div className="grid grid-cols-2 gap-2">
            {terlihat.map((item) => {
              const diKeranjang = qtyInCart(keranjang, item.id)
              const habis = isBarang(item) && item.stockQty <= 0
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => tambah(item)}
                  className="relative flex min-h-touch-lg flex-col rounded-xl bg-white
                             p-2 text-left shadow-sm active:bg-slate-100"
                >
                  <ItemThumb item={item} />
                  <span className="mt-2 line-clamp-2 font-semibold leading-snug">
                    {item.name}
                  </span>
                  <span className="text-sm text-slate-600">
                    {M.format(item.price)}
                  </span>
                  {isBarang(item) && (
                    <span
                      className={`text-xs ${habis ? 'text-keluar' : 'text-slate-500'}`}
                    >
                      {habis ? 'Stok habis' : `Sisa ${item.stockQty} ${item.unit}`}
                    </span>
                  )}
                  {diKeranjang > 0 && (
                    <span
                      className="absolute right-2 top-2 flex h-8 min-w-8 items-center
                                 justify-center rounded-full bg-slate-900 px-2
                                 font-bold text-white"
                    >
                      {diKeranjang}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </>
      )}

      {keranjang.length > 0 && (
        <section className="kartu">
          <h2 className="mb-2 text-sm text-slate-500">Keranjang</h2>
          <ul className="flex flex-col gap-2">
            {keranjang.map((line, index) => (
              <li key={`${line.itemId ?? 'bebas'}-${index}`} className="flex items-center gap-2">
                <span className="flex-1 leading-snug">{line.itemName}</span>
                <button
                  type="button"
                  aria-label={`Kurangi ${line.itemName}`}
                  onClick={() => setKeranjang((isi) => setQty(isi, index, line.qty - 1))}
                  className="h-10 w-10 rounded-lg bg-slate-200 text-xl font-bold"
                >
                  −
                </button>
                <span className="w-8 text-center font-semibold">{line.qty}</span>
                <button
                  type="button"
                  aria-label={`Tambah ${line.itemName}`}
                  onClick={() => setKeranjang((isi) => setQty(isi, index, line.qty + 1))}
                  className="h-10 w-10 rounded-lg bg-slate-200 text-xl font-bold"
                >
                  +
                </button>
                <span className="w-24 text-right font-semibold">
                  {M.format(M.multiplyByQty(line.unitPrice, line.qty))}
                </span>
              </li>
            ))}
          </ul>

          {/* Peringatan, bukan larangan. */}
          {peringatan.length > 0 && (
            <p className="mt-3 rounded-xl bg-tunggu-soft p-3 text-sm text-tunggu">
              {peringatan
                .map((p) => `${p.item.name} tinggal ${p.available}`)
                .join(', ')}
              . Tetap bisa dijual.
            </p>
          )}
        </section>
      )}

      {keranjang.length > 0 && (
        <div
          className="fixed inset-x-0 bottom-0 mx-auto max-w-md border-t border-slate-200
                     bg-slate-50/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur"
        >
          <button
            type="button"
            onClick={() => {
              setDibayar(totals.total)
              setFase({ tahap: 'bayar' })
            }}
            className="btn-aksi justify-between bg-slate-900 text-white"
          >
            <span>Bayar</span>
            <span>{M.format(totals.total)}</span>
          </button>
        </div>
      )}
    </main>
  )
}
