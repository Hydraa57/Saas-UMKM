'use client'

import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getMeta, QRIS_KEY } from '@/lib/db/local'
import { actionContext, useApp } from '@/lib/useApp'
import { updateIdentity } from '@/lib/actions/pos'
import { AppBar } from '@/components/AppBar'
import { Ikon, type NamaIkon } from '@/components/Ikon'
import { useSesi } from '@/lib/auth'
import { periksaQris } from '@/lib/qris/payload'

/**
 * Pengaturan.
 *
 * Ada karena satu lubang yang nyata: nama usaha hanya bisa ditulis sekali,
 * di layar pengaturan awal — sebelum pemiliknya tahu nama itu akan muncul
 * di setiap struk. Nama yang diketik terburu-buru di situ justru yang
 * paling mungkin ingin diperbaiki, dan sampai layar ini ada, tidak ada
 * caranya sama sekali.
 *
 * Lubang kedua: QRIS cuma bisa dipasang lewat layar bayar, jadi ia hanya
 * ditemukan oleh orang yang kebetulan sudah memilih QRIS di depan
 * pembeli. Tempat mencarinya seharusnya di sini.
 *
 * Yang **tidak** dimasukkan ke sini: apa pun yang punya rumah sendiri
 * yang lebih dekat ke titik pakainya. Ekspor Excel tinggal di layar
 * laporan, karena yang mencarinya sedang melihat angkanya. Menu
 * pengaturan yang menampung semua hal yang tidak jelas tempatnya akan
 * berhenti bisa dibaca dalam sebulan.
 */

function Baris({
  href,
  ikon,
  judul,
  ket,
  siap,
}: {
  href: string
  ikon: NamaIkon
  judul: string
  ket: string
  siap: boolean
}) {
  return (
    <a href={href} className="baris">
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
          siap ? 'bg-masuk-soft text-masuk' : 'bg-slate-100 text-slate-500'
        }`}
      >
        <Ikon nama={ikon} ukuran={21} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{judul}</span>
        <span className="block truncate text-sm text-slate-500">{ket}</span>
      </span>
      <Ikon nama="lanjut" ukuran={18} className="shrink-0 text-slate-300" />
    </a>
  )
}

export default function Pengaturan() {
  const { tenantId, businessName, businessPhone, ready } = useApp()
  const { status, email } = useSesi()

  const qris = useLiveQuery(() => getMeta<string>(db(), QRIS_KEY), [], undefined)

  const [nama, setNama] = useState('')
  const [telepon, setTelepon] = useState('')
  const [menyimpan, setMenyimpan] = useState(false)
  const [tersimpan, setTersimpan] = useState(false)
  const [galat, setGalat] = useState<string | null>(null)

  // Kolomnya diisi dari yang tersimpan begitu pembacaan pertama selesai.
  // Sebelum itu `businessName` masih bawaan "Usaha", dan menuliskannya ke
  // kolom akan menimpa nama sungguhan kalau pemiliknya langsung menekan
  // simpan.
  useEffect(() => {
    if (!ready) return
    setNama(businessName)
    setTelepon(businessPhone ?? '')
  }, [ready, businessName, businessPhone])

  const berubah =
    nama.trim() !== businessName || telepon.trim() !== (businessPhone ?? '')
  const bisaSimpan = nama.trim().length > 0 && berubah && !menyimpan

  async function simpan() {
    if (!tenantId || !bisaSimpan) return
    setMenyimpan(true)
    setGalat(null)
    try {
      await updateIdentity(actionContext(tenantId), { name: nama, phone: telepon })
      setTersimpan(true)
      setTimeout(() => setTersimpan(false), 2500)
    } catch (e) {
      setGalat(e instanceof Error ? e.message : 'Gagal menyimpan.')
    } finally {
      setMenyimpan(false)
    }
  }

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

  const namaQris = (() => {
    if (!qris) return null
    try {
      return periksaQris(qris).namaMerchant ?? 'Terpasang'
    } catch {
      return null
    }
  })()

  return (
    <main className="flex flex-1 flex-col gap-4 px-4 pb-8">
      <AppBar judul="Pengaturan" kembali="/" />

      <section className="flex flex-col gap-3">
        <h2 className="label px-1">Identitas usaha</h2>

        <label className="kartu block">
          <span className="label">Nama usaha</span>
          <input
            type="text"
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            placeholder="Warung Bu Ani"
            className="kolom mt-1"
          />
          <span className="mt-1 block text-sm text-slate-500">
            Muncul di kepala setiap struk.
          </span>
        </label>

        <label className="kartu block">
          <span className="label">Nomor WhatsApp (boleh dikosongkan)</span>
          <input
            type="tel"
            inputMode="tel"
            value={telepon}
            onChange={(e) => setTelepon(e.target.value)}
            placeholder="08123456789"
            className="kolom mt-1"
          />
          <span className="mt-1 block text-sm text-slate-500">
            Ikut tercetak di struk supaya pembeli bisa menghubungi. Nomornya
            tersimpan di HP ini saja, tidak dikirim ke mana-mana.
          </span>
        </label>

        {galat && (
          <p role="alert" className="kartu bg-keluar-soft font-semibold text-keluar">
            {galat}
          </p>
        )}
        {tersimpan && (
          <p role="status" className="kartu bg-masuk-soft font-semibold text-masuk">
            Tersimpan.
          </p>
        )}

        <button
          type="button"
          disabled={!bisaSimpan}
          onClick={() => void simpan()}
          className="btn-primer btn-besar"
        >
          {menyimpan ? 'Menyimpan…' : 'Simpan perubahan'}
        </button>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="label px-1">Pembayaran & cadangan</h2>

        <Baris
          href="/qris"
          ikon="qris"
          judul="QRIS usaha"
          siap={Boolean(namaQris)}
          ket={
            namaQris
              ? `Terpasang · ${namaQris}`
              : 'Belum dipasang — pembeli belum bisa bayar QRIS'
          }
        />

        <Baris
          href="/masuk"
          ikon="unduh"
          judul="Cadangan catatan"
          siap={status === 'masuk'}
          ket={
            status === 'masuk'
              ? `Aktif · ${email ?? ''}`
              : status === 'tanpa-peladen'
                ? 'Peladen belum disetel'
                : 'Belum aktif — baru ada di HP ini'
          }
        />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="label px-1">Lainnya</h2>
        <Baris
          href="/laporan"
          ikon="laporan"
          judul="Laporan & unduh Excel"
          siap
          ket="Rekap bulanan, terlaris, unduh salinan"
        />
      </section>
    </main>
  )
}
