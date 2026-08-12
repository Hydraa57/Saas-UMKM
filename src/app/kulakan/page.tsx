'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { actionContext, useApp, useCatalog } from '@/lib/useApp'
import { recordPurchase, type PurchaseLine } from '@/lib/actions/pos'
import { ItemThumb } from '@/components/ItemThumb'
import { Uang } from '@/components/Uang'
import { AppBar } from '@/components/AppBar'
import { Ikon } from '@/components/Ikon'
import * as M from '@/lib/money'
import { isBarang, type Barang } from '@/lib/domain/types'
import { saranKulakan, statusStok, urutkanUntukDitindak } from '@/lib/domain/stock'

/**
 * Kulakan.
 *
 * Satu aksi, tiga akibat: **stok naik, uang keluar tercatat, harga modal
 * diperbarui.** Kalau kulakan hanya menambah stok, "sisa bulan ini" di
 * beranda akan selalu terlihat lebih besar daripada isi laci — dan angka
 * yang selalu terlalu bagus lebih cepat ditinggalkan daripada tidak ada
 * angka sama sekali.
 *
 * Dua keputusan yang membedakannya dari kasir:
 *
 * **Yang perlu ditindak muncul di atas, dengan usulan jumlah.** Layar ini
 * dibuka justru karena ada yang habis. Usulannya hanya sampai ambang
 * aman, dan hanya kalau ambangnya memang disetel — angka yang dikarang
 * di sini akan ikut terbeli.
 *
 * **Keyboard bawaan boleh dipakai.** Di kasir tidak, karena ada pembeli
 * menunggu dan keyboard Android memakan separuh layar. Kulakan dicatat
 * sambil membongkar kardus, tidak ada yang menunggu, dan mengetik harga
 * modal yang berbeda-beda per barang jauh lebih cepat lewat keyboard
 * daripada lewat papan angka yang harus dibuka satu per satu.
 */

interface Baris {
  readonly item: Barang
  readonly qty: string
  readonly modal: string
}

export default function Kulakan() {
  const router = useRouter()
  const { tenantId, defaultWallet, ready } = useApp()
  const katalog = useCatalog()

  const [baris, setBaris] = useState<readonly Baris[]>([])
  const [pemasok, setPemasok] = useState('')
  const [menyimpan, setMenyimpan] = useState(false)
  const [cari, setCari] = useState('')

  const barang = urutkanUntukDitindak(katalog.filter(isBarang))
  const dipilih = new Set(baris.map((b) => b.item.id))
  const kunci = cari.trim().toLowerCase()
  const tersedia = barang.filter(
    (item) =>
      !dipilih.has(item.id) &&
      (kunci === '' || item.name.toLowerCase().includes(kunci)),
  )

  const total = M.sum(
    baris.map((b) => M.multiplyByQty(M.rupiah(Number(b.modal) || 0), Number(b.qty) || 0)),
  )
  const bisaSimpan =
    baris.length > 0 &&
    baris.every((b) => Number(b.qty) > 0) &&
    !menyimpan &&
    Boolean(tenantId && defaultWallet)

  function tambah(item: Barang) {
    const saran = saranKulakan(item)
    setBaris((isi) => [
      ...isi,
      {
        item,
        // Usulan hanya kalau ada dasarnya. Kalau ambangnya belum disetel,
        // kolomnya dibiarkan kosong supaya pemiliknya yang memutuskan.
        qty: saran > 0 ? String(saran) : '',
        modal: item.costPrice > 0 ? String(item.costPrice) : '',
      },
    ])
    setCari('')
  }

  const ubah = (index: number, patch: Partial<Baris>) =>
    setBaris((isi) => isi.map((b, i) => (i === index ? { ...b, ...patch } : b)))

  const hapus = (index: number) =>
    setBaris((isi) => isi.filter((_, i) => i !== index))

  async function simpan() {
    if (!bisaSimpan || !tenantId || !defaultWallet) return
    setMenyimpan(true)
    try {
      const lines: PurchaseLine[] = baris.map((b) => ({
        itemId: b.item.id,
        itemName: b.item.name,
        qty: Number(b.qty),
        unitCost: M.rupiah(Number(b.modal) || 0),
      }))
      await recordPurchase(actionContext(tenantId), {
        lines,
        walletId: defaultWallet.id,
        supplierName: pemasok.trim() || null,
      })
      router.replace('/katalog?tab=stok')
    } catch {
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

  return (
    <main className="flex flex-1 flex-col gap-3 px-4 pb-36">
      <AppBar judul="Kulakan" kembali="/katalog?tab=stok" />

      {baris.length > 0 && (
        <ul className="flex flex-col gap-2">
          {baris.map((b, index) => (
            <li key={b.item.id} className="kartu flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className="w-10 shrink-0">
                  <ItemThumb item={b.item} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{b.item.name}</span>
                  <span className="block text-sm text-slate-500">
                    Sisa {b.item.stockQty} {b.item.unit}
                  </span>
                </span>
                <button
                  type="button"
                  aria-label={`Hapus ${b.item.name}`}
                  onClick={() => hapus(index)}
                  className="flex h-10 w-10 items-center justify-center rounded-xl
                             bg-slate-100 text-slate-500 active:scale-95"
                >
                  <Ikon nama="silang" ukuran={18} tebal={2.2} />
                </button>
              </div>

              <div className="flex gap-3">
                <label className="flex-1 rounded-2xl bg-slate-50 px-3 py-2">
                  <span className="label">Jumlah</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={b.qty}
                    onChange={(e) => ubah(index, { qty: e.target.value })}
                    placeholder="0"
                    className="kolom font-semibold"
                  />
                </label>
                <label className="flex-1 rounded-2xl bg-slate-50 px-3 py-2">
                  <span className="label">Harga modal / {b.item.unit}</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={b.modal}
                    onChange={(e) => ubah(index, { modal: e.target.value })}
                    placeholder="0"
                    className="kolom font-semibold"
                  />
                </label>
              </div>

              <p className="text-right text-slate-600">
                <Uang
                  nilai={M.multiplyByQty(
                    M.rupiah(Number(b.modal) || 0),
                    Number(b.qty) || 0,
                  )}
                  className="font-semibold"
                />
              </p>
            </li>
          ))}
        </ul>
      )}

      {barang.length === 0 ? (
        <div className="kartu">
          <p className="font-semibold">Belum ada barang di katalog</p>
          <p className="mt-1 text-slate-600">
            Kulakan hanya berlaku untuk barang. Jasa tidak punya stok, jadi
            tidak ada yang bisa dibeli untuknya.
          </p>
        </div>
      ) : (
        <section className="flex flex-col gap-2">
          <h2 className="label">
            {baris.length > 0 ? 'Tambah lagi' : 'Pilih barang yang dibeli'}
          </h2>

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

          <ul className="flex flex-col gap-2">
            {tersedia.map((item) => {
              const status = statusStok(item)
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => tambah(item)}
                    className="baris w-full text-left"
                  >
                    <span className="w-10 shrink-0">
                      <ItemThumb item={item} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{item.name}</span>
                      <span
                        className={`block text-sm ${
                          status === 'habis'
                            ? 'text-keluar'
                            : status === 'menipis'
                              ? 'text-tunggu'
                              : 'text-slate-500'
                        }`}
                      >
                        Sisa {item.stockQty} {item.unit}
                      </span>
                    </span>
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center
                                 rounded-xl bg-merek-50 text-merek-600"
                    >
                      <Ikon nama="tambah" ukuran={18} tebal={2.4} />
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {baris.length > 0 && (
        <label className="kartu block">
          <span className="label">Beli di mana (boleh kosong)</span>
          <input
            type="text"
            value={pemasok}
            onChange={(e) => setPemasok(e.target.value)}
            placeholder="Toko grosir Pak Har"
            className="kolom mt-1"
          />
        </label>
      )}

      {baris.length > 0 && (
        <div className="bilah-bawah">
          <button
            type="button"
            disabled={!bisaSimpan}
            onClick={simpan}
            className="btn-primer btn-besar justify-between"
          >
            <span>Simpan kulakan</span>
            <span>{M.format(total)}</span>
          </button>
        </div>
      )}
    </main>
  )
}
