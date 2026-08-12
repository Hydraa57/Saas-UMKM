'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
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
  sisaBisaDijual,
} from '@/lib/domain/cart'
import { isBarang, PAYMENT_LABELS, type CartLine, type Item, type PaymentMethod } from '@/lib/domain/types'
import { statusStok } from '@/lib/domain/stock'
import * as M from '@/lib/money'
import type { Rupiah } from '@/lib/money'
import { PapanAngka } from '@/components/PapanAngka'
import { Uang } from '@/components/Uang'
import { ItemThumb } from '@/components/ItemThumb'
import { AppBar } from '@/components/AppBar'
import { Ikon } from '@/components/Ikon'
import { KartuQris } from '@/components/KartuQris'

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
 *
 * Bilah navigasi bawah sengaja disembunyikan di sini — keranjang dan
 * tombol bayar yang menempatinya, dan berpindah halaman di tengah
 * transaksi bukan hal yang perlu dipermudah.
 */

type Fase =
  | { tahap: 'pilih' }
  | { tahap: 'bayar' }
  | { tahap: 'selesai'; saleId: string }

export default function Kasir() {
  const router = useRouter()
  const { tenantId, defaultWallet, ready } = useApp()
  const katalog = useCatalog()

  const [keranjang, setKeranjang] = useState<readonly CartLine[]>([])
  const [fase, setFase] = useState<Fase>({ tahap: 'pilih' })
  const [saring, setSaring] = useState<'semua' | 'barang' | 'jasa'>('semua')
  const [dibayar, setDibayar] = useState<Rupiah>(M.ZERO)
  const [metode, setMetode] = useState<PaymentMethod>('tunai')
  const [pembeli, setPembeli] = useState('')
  const [menyimpan, setMenyimpan] = useState(false)
  const [stokKurang, setStokKurang] = useState<Item | null>(null)

  const totals = calculateCart(keranjang)
  const peringatan = overStock(keranjang, katalog)
  const kembalian = changeDue(totals.total, dibayar)
  const kurang = M.clampToZero(M.subtract(totals.total, dibayar))

  const terlihat = katalog.filter(
    (item) => saring === 'semua' || item.kind === saring,
  )

  /**
   * Menambah ke keranjang, dan **menolak** kalau stoknya tidak cukup.
   *
   * Penolakannya menyebut nama barangnya dan mengantar ke koreksi stok,
   * bukan sekadar berkata tidak. Yang paling sering terjadi bukan
   * pembeli meminta lebih banyak dari yang ada, melainkan **angka stok
   * di aplikasi yang tertinggal** — ada yang terjual tanpa dicatat, atau
   * kulakan yang belum sempat dimasukkan. Jalan keluarnya harus ada di
   * layar yang sama, karena yang menemuinya sedang berdiri di depan
   * pembeli.
   */
  function tambah(item: Item) {
    const sisa = sisaBisaDijual(keranjang, item)
    if (sisa <= 0) {
      setStokKurang(item)
      return
    }
    setStokKurang(null)
    setKeranjang((isi) => addLine(isi, lineFromItem(item)))
  }

  /**
   * Memilih QRIS berarti membayar pas.
   *
   * Kodenya harus memuat nominal, dan nominal yang dimuatnya adalah yang
   * nanti tercatat sebagai dibayar — kalau keduanya boleh berbeda, akan
   * ada hari di mana pembeli memindai satu angka dan buku mencatat angka
   * lain. Jadi nominalnya diisikan begitu QRIS dipilih. Masih bisa
   * diubah sesudahnya lewat papan angka, dan kodenya ikut berubah.
   */
  function pilihMetode(pilihan: PaymentMethod) {
    setMetode(pilihan)
    if (pilihan === 'qris' && M.isZero(dibayar)) setDibayar(totals.total)
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
        <Link href="/mulai" className="btn-primer btn-besar">
          Buka pengaturan
        </Link>
      </main>
    )
  }

  if (fase.tahap === 'selesai') {
    // Struk dibuka sebagai halaman sendiri supaya bisa dibuka ulang dari
    // riwayat, bukan hanya sekali lewat.
    if (typeof window !== 'undefined') {
      router.replace(`/struk/${fase.saleId}`)
    }
    return <main className="flex-1 p-4" aria-busy="true" />
  }

  // ── Layar bayar ────────────────────────────────────────────────────
  if (fase.tahap === 'bayar') {
    return (
      <main className="flex flex-1 flex-col gap-3 px-4 pb-32">
        <AppBar judul="Bayar" onKembali={() => setFase({ tahap: 'pilih' })} />

        <div className="kartu-gelap animate-naik">
          <p className="text-sm font-medium text-slate-400">Total tagihan</p>
          <p className="text-money mt-1">
            <Uang nilai={totals.total} />
          </p>

          <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
            <span className="text-sm font-medium text-slate-400">Uang diterima</span>
            <span className="text-2xl font-bold">
              <Uang nilai={dibayar} />
            </span>
          </div>

          {M.isPositive(kembalian) && (
            <div className="mt-3 flex items-center justify-between rounded-kartu bg-white/10 px-4 py-3">
              <span className="font-semibold">Kembali</span>
              <span className="text-xl font-bold">
                <Uang nilai={kembalian} />
              </span>
            </div>
          )}
          {M.isPositive(kurang) && (
            <div className="mt-3 flex items-center justify-between rounded-kartu bg-keluar/25 px-4 py-3">
              <span className="font-semibold">Kurang</span>
              <span className="text-xl font-bold">
                <Uang nilai={kurang} />
              </span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setDibayar(totals.total)}
          className="btn-sekunder"
        >
          Uang pas
        </button>

        <PapanAngka
          nilai={dibayar}
          onChange={setDibayar}
          pintasan={[10_000, 20_000, 50_000, 100_000]}
        />

        <section>
          <h2 className="label mb-2">Cara bayar</h2>
          <div className="flex flex-wrap gap-2">
            {(['tunai', 'qris', 'transfer'] as const).map((pilihan) => (
              <button
                key={pilihan}
                type="button"
                aria-pressed={metode === pilihan}
                onClick={() => pilihMetode(pilihan)}
                className={`chip flex-1 ${metode === pilihan ? 'chip-aktif' : ''}`}
              >
                {PAYMENT_LABELS[pilihan]}
              </button>
            ))}
          </div>
        </section>

        {/* Kodenya muncul begitu QRIS dipilih, tanpa ketukan tambahan:
            di depan pembeli, setiap ketukan berarti menunggu. */}
        {metode === 'qris' && <KartuQris nominal={dibayar} />}

        {/* Nama pembeli hanya perlu kalau uangnya kurang — piutang tanpa
            nama tidak bisa ditagih. */}
        {M.isPositive(kurang) && (
          <label className="kartu block animate-naik">
            <span className="label">Nama pembeli, supaya utangnya bisa ditagih</span>
            <input
              type="text"
              value={pembeli}
              onChange={(e) => setPembeli(e.target.value)}
              placeholder="Bu Tetangga"
              className="kolom mt-1"
            />
          </label>
        )}

        <div className="bilah-bawah">
          <button
            type="button"
            disabled={menyimpan}
            onClick={bayar}
            className="btn-primer btn-besar"
          >
            <Ikon nama="cek" ukuran={22} tebal={2.2} />
            {M.isZero(dibayar) ? 'Simpan sebagai utang' : 'Selesai & cetak struk'}
          </button>
        </div>
      </main>
    )
  }

  // ── Layar pilih barang ─────────────────────────────────────────────
  return (
    <main className="flex flex-1 flex-col gap-3 px-4 pb-40">
      <AppBar judul="Kasir" kembali="/" />

      {/* Penolakan yang membawa jalan keluarnya sendiri. Yang paling
          sering bukan pembeli meminta lebih banyak dari yang ada,
          melainkan angka stok yang tertinggal — jadi tautan koreksinya
          ada di dalam pesan yang sama, bukan di menu lain. */}
      {stokKurang && (
        <div
          role="alert"
          className="kartu animate-naik border border-keluar/20 bg-keluar-soft"
        >
          <p className="flex items-start gap-2 font-semibold text-keluar">
            <Ikon nama="peringatan" ukuran={20} className="mt-0.5 shrink-0" />
            <span>
              Stok {stokKurang.name} tidak mencukupi
              {stokKurang.kind === 'barang' && ` — tinggal ${stokKurang.stockQty}`}
            </span>
          </p>
          <p className="mt-1 text-sm text-keluar-kuat">
            Kalau di rak sebenarnya masih ada, perbarui stoknya dulu lewat
            hitung fisik.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setStokKurang(null)}
              className="btn-sekunder flex-1"
            >
              Tutup
            </button>
            <Link
              href={`/stok/${stokKurang.id}`}
              className="btn-primer flex-1"
            >
              Perbarui stok
            </Link>
          </div>
        </div>
      )}

      {katalog.length === 0 ? (
        <div className="kartu text-center">
          <span
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-kartu
                       bg-merek-50 text-merek-600"
          >
            <Ikon nama="katalog" ukuran={26} />
          </span>
          <p className="mt-3 font-semibold">Katalog masih kosong</p>
          <p className="mt-1 text-slate-600">
            Tambahkan barang atau jasa dulu supaya bisa diketuk dari sini.
          </p>
          <Link href="/katalog/baru" className="btn-primer btn-besar mt-5">
            Tambah barang / jasa
          </Link>
        </div>
      ) : (
        <>
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

          <div className="grid grid-cols-2 gap-3">
            {terlihat.map((item) => {
              const diKeranjang = qtyInCart(keranjang, item.id)
              const status = isBarang(item) ? statusStok(item) : null
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => tambah(item)}
                  className={`relative flex flex-col rounded-kartu bg-white p-2.5
                              text-left transition active:scale-[0.97] ${
                                diKeranjang > 0 ? 'ring-2 ring-merek-500' : ''
                              }`}
                >
                  <ItemThumb item={item} />
                  <span className="mt-2 line-clamp-2 font-semibold leading-snug">
                    {item.name}
                  </span>
                  {/* Harga pakai warna tinta, bukan warna merek. Aturannya
                      ada di tailwind.config.ts: nila menandai yang bisa
                      ditekan, dan harga yang berwarna sama akan terbaca
                      sebagai tautan — sekaligus menghapus beda antara
                      "ini tindakan" dan "ini keterangan". */}
                  <span className="mt-0.5 font-semibold text-slate-900">
                    {M.format(item.price)}
                  </span>
                  {status && (
                    <span
                      className={`text-xs font-medium ${
                        status === 'habis'
                          ? 'text-keluar'
                          : status === 'menipis'
                            ? 'text-tunggu'
                            : 'text-slate-400'
                      }`}
                    >
                      {status === 'habis'
                        ? 'Stok habis'
                        : `Sisa ${(item as { stockQty: number }).stockQty} ${item.unit}`}
                    </span>
                  )}
                  {diKeranjang > 0 && (
                    <span
                      className="absolute right-2 top-2 flex h-8 min-w-8 items-center
                                 justify-center rounded-full bg-merek-600 px-2
                                 font-bold text-white "
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
        <section className="kartu animate-naik">
          <h2 className="label mb-3">Keranjang</h2>
          <ul className="flex flex-col gap-3">
            {keranjang.map((line, index) => (
              <li
                key={`${line.itemId ?? 'bebas'}-${index}`}
                className="flex items-center gap-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 font-semibold leading-tight">
                    {line.itemName}
                  </span>
                  <span className="block text-sm text-slate-500">
                    {M.format(line.unitPrice)}
                  </span>
                </span>

                <span className="flex shrink-0 items-center gap-0.5 rounded-kartu bg-slate-100 p-1">
                  <button
                    type="button"
                    aria-label={`Kurangi ${line.itemName}`}
                    onClick={() => setKeranjang((isi) => setQty(isi, index, line.qty - 1))}
                    className="flex h-11 w-11 items-center justify-center rounded-kartu-kecil
                               border border-garis bg-white text-slate-700 transition
                               active:scale-90 active:bg-slate-100"
                  >
                    <Ikon nama="kurang" ukuran={18} tebal={2.4} />
                  </button>
                  <span className="w-6 text-center font-bold">{line.qty}</span>
                  <button
                    type="button"
                    aria-label={`Tambah ${line.itemName}`}
                    disabled={
                      line.itemId !== null &&
                      sisaBisaDijual(
                        keranjang,
                        katalog.find((i) => i.id === line.itemId) ?? {
                          kind: 'jasa',
                        } as Item,
                      ) <= 0
                    }
                    onClick={() => setKeranjang((isi) => setQty(isi, index, line.qty + 1))}
                    className="flex h-11 w-11 items-center justify-center rounded-kartu-kecil
                               border border-garis bg-white text-slate-700 transition
                               active:scale-90 active:bg-slate-100
                               disabled:bg-slate-100 disabled:text-slate-300"
                  >
                    <Ikon nama="tambah" ukuran={18} tebal={2.4} />
                  </button>
                </span>

                {/* `whitespace-nowrap` + `shrink-0`: nominal yang terpotong
                    jadi dua baris membuat baris keranjang tinggi sendiri,
                    dan nominal adalah hal terakhir yang boleh sulit dibaca. */}
                <span className="shrink-0 whitespace-nowrap text-right font-bold">
                  {M.format(M.multiplyByQty(line.unitPrice, line.qty))}
                </span>
              </li>
            ))}
          </ul>

          {/* Peringatan, bukan larangan. */}
          {peringatan.length > 0 && (
            <p className="mt-4 flex gap-2 rounded-kartu bg-tunggu-soft p-3 text-sm text-tunggu">
              <Ikon nama="peringatan" ukuran={18} className="mt-0.5 shrink-0" />
              <span>
                {peringatan.map((p) => `${p.item.name} tinggal ${p.available}`).join(', ')}
                . Tetap bisa dijual.
              </span>
            </p>
          )}
        </section>
      )}

      {keranjang.length > 0 && (
        <div className="bilah-bawah">
          <button
            type="button"
            onClick={() => {
              setDibayar(totals.total)
              setFase({ tahap: 'bayar' })
            }}
            className="btn-primer btn-besar justify-between"
          >
            <span className="flex items-center gap-2">
              {/* Jumlahnya `aria-hidden`: pembaca layar cukup mendengar
                  "Bayar Rp 57.000", dan angka yang dibacakan lebih dulu
                  justru membuat tombolnya sulit dikenali. */}
              <span
                aria-hidden
                className="flex h-7 min-w-7 items-center justify-center rounded-kartu-kecil
                           bg-white/20 px-1.5 text-base"
              >
                {totals.itemCount}
              </span>
              Bayar
            </span>
            <span>{M.format(totals.total)}</span>
          </button>
        </div>
      )}
    </main>
  )
}
