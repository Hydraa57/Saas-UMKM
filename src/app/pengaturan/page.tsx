'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getMeta, QRIS_KEY } from '@/lib/db/local'
import { actionContext, useApp } from '@/lib/useApp'
import { updateIdentity } from '@/lib/actions/pos'
import { AppBar } from '@/components/AppBar'
import { Ikon, type NamaIkon } from '@/components/Ikon'
import { useSesi } from '@/lib/auth'
import { periksaQris } from '@/lib/qris/payload'
import { gantiAkun, periksaSebelumGanti } from '@/lib/akun'
import { bacaUkuran, pakaiUkuran, LABEL_UKURAN, UKURAN, type Ukuran } from '@/lib/tampilan'

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
  href: Route
  ikon: NamaIkon
  judul: string
  ket: string
  siap: boolean
}) {
  return (
    <Link href={href} className="baris">
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-kartu ${
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
    </Link>
  )
}

export default function Pengaturan() {
  const { tenantId, businessName, businessPhone, ready } = useApp()
  const { status, email } = useSesi()

  const qris = useLiveQuery(() => getMeta<string>(db(), QRIS_KEY), [], undefined)

  const [nama, setNama] = useState('')
  const [telepon, setTelepon] = useState('')
  const [menyimpan, setMenyimpan] = useState(false)
  const [konfirmasiGanti, setKonfirmasiGanti] = useState<number | null>(null)
  const [tersimpan, setTersimpan] = useState(false)
  const [galat, setGalat] = useState<string | null>(null)

  // Dibaca sesudah komponennya terpasang, bukan saat keadaan awal
  // disusun: `localStorage` tidak ada saat halaman disusun di peladen,
  // dan menebaknya di sana berarti tanda terpilihnya berkedip pindah
  // sesaat setelah halaman hidup. Ukuran hurufnya sendiri sudah dipasang
  // jauh sebelum ini oleh skrip sebaris di `<head>`.
  const [ukuran, setUkuran] = useState<Ukuran | null>(null)
  useEffect(() => setUkuran(bacaUkuran()), [])

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
        <Link href="/mulai" className="btn-primer btn-besar">
          Buka pengaturan
        </Link>
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

      {/* Ukuran huruf, dan sengaja bukan angka melainkan dua pilihan
          yang bisa langsung dilihat akibatnya. Penggeser dengan sembilan
          tingkat menuntut orang membandingkan sesuatu yang belum
          dilihatnya; dua contoh yang sudah tertulis dalam ukurannya
          masing-masing tidak menuntut apa-apa.

          Ini juga jawaban atas ketegangan yang selama ini diselesaikan
          dengan cara yang salah: aplikasinya dulu memakai huruf besar
          untuk semua orang demi sebagian orang. Akibatnya tiap layar
          cuma memuat separuh isinya bagi semua yang lain. */}
      <section className="flex flex-col gap-2">
        <h2 className="label px-1">Tampilan</h2>

        <div className="kartu">
          <span className="label">Ukuran huruf</span>
          <div role="radiogroup" aria-label="Ukuran huruf" className="mt-2 flex gap-2">
            {UKURAN.map((u) => (
              <button
                key={u}
                type="button"
                role="radio"
                aria-checked={ukuran === u}
                onClick={() => {
                  pakaiUkuran(u)
                  setUkuran(u)
                }}
                className={`flex min-h-touch flex-1 items-center justify-center rounded-kartu
                            border font-semibold transition active:scale-95 ${
                              u === 'besar' ? 'text-lg' : 'text-base'
                            } ${
                              ukuran === u
                                ? 'border-merek-600 bg-merek-600 text-white'
                                : 'border-garis bg-white text-slate-700'
                            }`}
              >
                {LABEL_UKURAN[u]}
              </button>
            ))}
          </div>
          <span className="mt-2 block text-sm text-slate-500">
            Berlaku di HP ini saja. Tombol dan jaraknya ikut membesar, bukan
            cuma hurufnya.
          </span>
        </div>
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

      {/* Ganti akun, dan sengaja di paling bawah dengan peringatan penuh.
          Keluar dari akun saja tidak cukup: sesinya hilang tapi seluruh
          isi HP masih milik akun lama, jadi orang berikutnya melihat
          dagangan orang lain lalu penjualannya menempel ke tenant yang
          bukan miliknya — tanpa gejala apa pun sampai angkanya tidak
          masuk akal. Jadi berganti akun berarti mengosongkan HP ini. */}
      <section className="flex flex-col gap-2">
        <h2 className="label px-1">Akun</h2>

        {konfirmasiGanti === null ? (
          <button
            type="button"
            onClick={async () => {
              const { belumTerkirim } = await periksaSebelumGanti()
              setKonfirmasiGanti(belumTerkirim)
            }}
            className="btn-sekunder"
          >
            Ganti akun
          </button>
        ) : (
          <div className="kartu animate-naik">
            <p className="font-semibold">Kosongkan HP ini dan masuk akun lain?</p>
            <p className="mt-1 text-slate-600">
              Seluruh katalog, penjualan, dan utang di HP ini dihapus. Yang
              sudah terkirim tetap aman di peladen dan bisa ditarik lagi
              nanti.
            </p>

            {konfirmasiGanti > 0 && (
              <p className="mt-3 font-semibold text-keluar">
                {konfirmasiGanti} catatan belum sempat terkirim. Kalau
                diteruskan sekarang, yang itu hilang.
              </p>
            )}

            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void gantiAkun()}
                className="btn-bahaya"
              >
                Ya, kosongkan dan ganti akun
              </button>
              <button
                type="button"
                onClick={() => setKonfirmasiGanti(null)}
                className="btn-sekunder"
              >
                Batal
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
