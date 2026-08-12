'use client'

import { useRouter } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { actionContext, useApp } from '@/lib/useApp'
import { archiveItem, saveItem } from '@/lib/actions/pos'
import { db } from '@/lib/db/local'
import { compressPhoto } from '@/lib/photo'
import * as M from '@/lib/money'
import type { Rupiah } from '@/lib/money'
import { PapanAngka } from '@/components/PapanAngka'
import { PilihFoto } from '@/components/PilihFoto'
import { Lipatan } from '@/components/Lipatan'
import { Uang } from '@/components/Uang'
import { ITEM_KIND_LABELS, type ItemKind } from '@/lib/domain/types'
import { AppBar } from '@/components/AppBar'
import { Ikon } from '@/components/Ikon'

/**
 * Tambah atau ubah barang dan jasa.
 *
 * Satu layar, dan **hanya nama dan harga yang wajib.** Setiap kolom
 * tambahan yang wajib adalah alasan untuk berhenti sebelum katalognya
 * cukup untuk dipakai berjualan.
 *
 * Jenisnya dipilih paling atas karena itu yang menentukan sisanya:
 * barang punya stok, jasa tidak — dan kolom stok memang hilang sama
 * sekali kalau jasa dipilih, bukan sekadar dinonaktifkan.
 *
 * Menambah dan mengubah memakai layar yang sama. Formulir kedua yang
 * hampir sama isinya adalah tempat dua aturan perlahan berbeda; di sini
 * yang membedakan cuma satu: saat mengubah, jumlah stoknya tidak bisa
 * disetel dari sini. Stok berubah lewat penjualan, kulakan, dan koreksi
 * hitung fisik — kalau bisa diketik ulang di formulir katalog, riwayat
 * pergerakannya tidak lagi menjelaskan angkanya.
 */

function Isi() {
  const router = useRouter()
  const params = useSearchParams()
  const { tenantId, ready } = useApp()
  const idLama = params.get('id')

  const [kind, setKind] = useState<ItemKind>(
    params.get('jenis') === 'jasa' ? 'jasa' : 'barang',
  )
  const [nama, setNama] = useState('')
  const [harga, setHarga] = useState<Rupiah>(M.ZERO)
  const [modal, setModal] = useState<Rupiah>(M.ZERO)
  const [stok, setStok] = useState('')
  const [minStok, setMinStok] = useState('')
  const [satuan, setSatuan] = useState('pcs')
  const [foto, setFoto] = useState<Blob | null>(null)
  const [pratinjau, setPratinjau] = useState<string | null>(null)
  const [menyimpan, setMenyimpan] = useState(false)
  const [memuat, setMemuat] = useState(idLama !== null)

  useEffect(() => {
    if (!idLama) return
    let dibatalkan = false

    void (async () => {
      const row = await db().items.get(idLama)
      if (dibatalkan || !row) {
        if (!dibatalkan) setMemuat(false)
        return
      }
      setKind(row.kind)
      setNama(row.name)
      setHarga(M.fromDb(row.price))
      setModal(M.fromDb(row.cost_price))
      setSatuan(row.unit)
      setStok(row.stock_qty === null ? '' : String(row.stock_qty))
      setMinStok(row.min_stock === null ? '' : String(row.min_stock))
      setMemuat(false)
    })()

    return () => {
      dibatalkan = true
    }
  }, [idLama])

  const bisaSimpan =
    nama.trim().length > 0 && M.isPositive(harga) && !menyimpan && !memuat

  async function pilihFoto(file: File) {
    const kecil = await compressPhoto(file)
    setFoto(kecil)
    setPratinjau((lama) => {
      if (lama) URL.revokeObjectURL(lama)
      return URL.createObjectURL(kecil)
    })
  }

  function hapusFoto() {
    setFoto(null)
    setPratinjau((lama) => {
      if (lama) URL.revokeObjectURL(lama)
      return null
    })
  }

  async function simpan(lanjut: boolean) {
    if (!bisaSimpan || !tenantId) return
    setMenyimpan(true)
    try {
      await saveItem(actionContext(tenantId), {
        ...(idLama ? { id: idLama } : {}),
        kind,
        name: nama,
        price: harga,
        costPrice: modal,
        unit: satuan,
        stockQty: stok === '' ? 0 : Number(stok),
        minStock: minStok === '' ? 0 : Number(minStok),
        photo: foto,
      })

      if (lanjut) {
        // Menambah katalog itu pekerjaan berulang; mengembalikan ke
        // formulir kosong jauh lebih cepat daripada memaksa kembali ke
        // daftar lalu menekan "tambah" lagi.
        setNama('')
        setHarga(M.ZERO)
        setModal(M.ZERO)
        setStok('')
        setFoto(null)
        setPratinjau((lama) => {
          if (lama) URL.revokeObjectURL(lama)
          return null
        })
      } else {
        router.replace('/katalog')
      }
    } finally {
      setMenyimpan(false)
    }
  }

  async function arsipkan() {
    if (!idLama || !tenantId) return
    setMenyimpan(true)
    // Diarsipkan, bukan dihapus: barangnya sudah muncul di struk dan di
    // riwayat penjualan, dan menghapusnya membuat struk lama kehilangan
    // asal-usulnya. Yang diarsipkan hilang dari kasir dan katalog saja.
    await archiveItem(actionContext(tenantId), idLama)
    router.replace('/katalog')
  }

  if (!ready || memuat) return <main className="layar flex-1 p-4" aria-busy="true" />

  return (
    <main className="layar flex flex-1 flex-col gap-3 px-4 pb-32">
      <AppBar judul={idLama ? 'Ubah' : 'Tambah ke katalog'} kembali="/katalog" />

      {/* Jenisnya dikunci saat mengubah. Mengubah barang menjadi jasa
          berarti membuang stok yang sudah punya riwayat pergerakan, dan
          sebaliknya berarti mengarang stok awal untuk sesuatu yang sudah
          pernah terjual tanpa stok. Yang salah jenis lebih baik
          diarsipkan lalu dibuat ulang. */}
      {idLama ? (
        <p className="kartu flex items-center gap-2 py-3 text-slate-600">
          <Ikon nama={kind === 'jasa' ? 'jasa' : 'katalog'} ukuran={20} />
          {ITEM_KIND_LABELS[kind]}
        </p>
      ) : (
        <div role="tablist" className="tab-grup">
          {(['barang', 'jasa'] as const).map((pilihan) => (
            <button
              key={pilihan}
              role="tab"
              aria-selected={kind === pilihan}
              onClick={() => setKind(pilihan)}
              className={`tab min-h-touch ${kind === pilihan ? 'tab-aktif' : ''}`}
            >
              {ITEM_KIND_LABELS[pilihan]}
            </button>
          ))}
        </div>
      )}

      <label className="kartu block">
        <span className="label">Nama</span>
        <input
          type="text"
          value={nama}
          onChange={(e) => setNama(e.target.value)}
          placeholder={kind === 'barang' ? 'Biskuit Roma' : 'Potong celana'}
          autoFocus
          className="kolom mt-1 text-xl font-semibold"
        />
      </label>

      <div className="kartu-gelap">
        <p className="text-sm font-medium text-slate-400">Harga jual</p>
        <p className="text-money mt-1">
          <Uang nilai={harga} />
        </p>
      </div>

      <PapanAngka
        nilai={harga}
        onChange={setHarga}
        pintasan={[5_000, 10_000, 25_000, 50_000]}
      />

      {/* Kolom stok memang hilang untuk jasa, bukan dinonaktifkan.
          "Potong celana" tidak punya stok, dan menampilkan kolomnya
          dalam keadaan mati justru mengesankan sebaliknya. */}
      {kind === 'barang' && (
        <section className="kartu flex flex-col gap-3 animate-naik">
          {idLama ? (
            <p className="text-slate-600">
              Stok sekarang <span className="font-semibold">{stok || 0}</span>{' '}
              {satuan}. Berubah lewat penjualan, kulakan, dan koreksi.
            </p>
          ) : (
            <label className="kolom-kotak">
              <span className="label">Stok sekarang</span>
              <input
                type="number"
                inputMode="decimal"
                value={stok}
                onChange={(e) => setStok(e.target.value)}
                placeholder="0"
                className="kolom mt-1 font-semibold"
              />
            </label>
          )}
          <label className="kolom-kotak">
            <span className="label">Ingatkan kalau tinggal (boleh kosong)</span>
            <input
              type="number"
              inputMode="decimal"
              value={minStok}
              onChange={(e) => setMinStok(e.target.value)}
              placeholder="0"
              className="kolom mt-1 font-semibold"
            />
          </label>
          <label className="kolom-kotak">
            <span className="label">Satuan</span>
            <input
              type="text"
              value={satuan}
              onChange={(e) => setSatuan(e.target.value)}
              placeholder="pcs"
              className="kolom mt-1"
            />
          </label>
        </section>
      )}

      <Lipatan judul="Harga modal & foto (boleh dilewati)" ikon="foto">
        <div className="flex flex-col gap-3">
          <label className="kolom-kotak">
            <span className="label">Harga modal</span>
            <input
              type="text"
              inputMode="numeric"
              value={M.isZero(modal) ? '' : M.format(modal, { withPrefix: false })}
              onChange={(e) => setModal(M.parse(e.target.value) ?? M.ZERO)}
              placeholder="0"
              className="kolom mt-1 font-semibold"
            />
          </label>

          <div className="kolom-kotak">
            <span className="label mb-2 block">Foto</span>
            <PilihFoto
              pratinjau={pratinjau}
              onPilih={(berkas) => void pilihFoto(berkas)}
              onHapus={hapusFoto}
            />
          </div>
        </div>
      </Lipatan>

      <div className="bilah-bawah flex gap-3">
        <button
          type="button"
          disabled={menyimpan}
          onClick={() => (idLama ? void arsipkan() : void simpan(true))}
          className="btn-sekunder flex-1 text-base"
        >
          {idLama ? 'Arsipkan' : 'Simpan & lagi'}
        </button>
        <button
          type="button"
          disabled={!bisaSimpan}
          onClick={() => simpan(false)}
          className="btn-primer flex-1"
        >
          Simpan
        </button>
      </div>
    </main>
  )
}

export default function KatalogBaru() {
  return (
    <Suspense fallback={<main className="layar flex-1 p-4" aria-busy="true" />}>
      <Isi />
    </Suspense>
  )
}
