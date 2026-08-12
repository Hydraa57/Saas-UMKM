'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getMeta, setMeta, QRIS_KEY } from '@/lib/db/local'
import { AppBar } from '@/components/AppBar'
import { Ikon } from '@/components/Ikon'
import { Lipatan } from '@/components/Lipatan'
import { periksaQris, QrisError, type KeteranganQris } from '@/lib/qris/payload'

/**
 * Memasang QRIS usaha.
 *
 * Dikerjakan **sekali**, lalu tidak pernah lagi. Karena itu boleh agak
 * panjang, dan boleh memuat kode pemindai yang berat — bukan layar yang
 * dibuka di depan pembeli.
 *
 * Yang dipasang adalah QRIS statis yang **sudah dimiliki** usahanya: yang
 * tertempel di dinding, atau yang dikirim banknya lewat WhatsApp. Tidak
 * ada pendaftaran, tidak ada penyedia jasa pembayaran, tidak ada potongan
 * tambahan. Aplikasi ini cuma menyalin kodenya, lalu nanti menuliskan
 * nominalnya sendiri saat berjualan.
 *
 * Tiga jalan memasukkannya, dan ketiganya ada karena masing-masing gagal
 * di keadaan yang berbeda:
 *
 * - **Pindai** — kalau QRIS-nya tercetak. Jalan yang paling wajar.
 * - **Ambil dari galeri** — kalau QRIS-nya berupa gambar di HP dan tidak
 *   pernah dicetak. Ini kejadian yang sangat sering.
 * - **Tempel teks** — kalau keduanya gagal. Jelek, tapi selalu bisa.
 *
 * Setelah terbaca, **nama merchantnya ditampilkan sebelum disimpan.**
 * Itu satu-satunya cara pemiliknya bisa memastikan yang terbaca memang
 * kodenya sendiri, bukan QRIS tetangga sebelah yang kebetulan ikut masuk
 * bingkai.
 */

type Tahap =
  | { nama: 'diam' }
  | { nama: 'memindai' }
  | { nama: 'terbaca'; muatan: string; keterangan: KeteranganQris }

export default function PasangQris() {
  const tersimpan = useLiveQuery(() => getMeta<string>(db(), QRIS_KEY), [], undefined)

  const [tahap, setTahap] = useState<Tahap>({ nama: 'diam' })
  const [galat, setGalat] = useState<string | null>(null)
  const [tempel, setTempel] = useState('')

  const video = useRef<HTMLVideoElement>(null)
  const kanvas = useRef<HTMLCanvasElement>(null)
  const aliran = useRef<MediaStream | null>(null)
  const berhenti = useRef(false)

  const terima = useCallback((muatan: string) => {
    try {
      setTahap({ nama: 'terbaca', muatan, keterangan: periksaQris(muatan) })
      setGalat(null)
      return true
    } catch (e) {
      setGalat(e instanceof QrisError ? e.message : 'Kodenya tidak terbaca.')
      return false
    }
  }, [])

  const tutupKamera = useCallback(async () => {
    berhenti.current = true
    const { matikanKamera } = await import('@/lib/qris/pindai')
    matikanKamera(aliran.current)
    aliran.current = null
  }, [])

  // Kamera yang tetap menyala setelah layarnya ditinggalkan adalah hal
  // yang membuat orang mencopot aplikasi. Dimatikan juga saat komponennya
  // dilepas, bukan cuma saat tombol batal ditekan.
  useEffect(() => {
    return () => {
      void tutupKamera()
    }
  }, [tutupKamera])

  async function mulaiPindai() {
    setGalat(null)
    const { kameraTersedia, nyalakanKamera, salinBingkai, bacaBingkai } =
      await import('@/lib/qris/pindai')

    if (!kameraTersedia()) {
      setGalat('Kamera tidak bisa dipakai di sini. Coba ambil dari galeri.')
      return
    }

    try {
      aliran.current = await nyalakanKamera()
    } catch {
      // Izin ditolak, atau tidak ada kamera. Bukan jalan buntu: dua jalan
      // lain masih terbuka, dan pesannya menunjuk ke sana.
      setGalat('Kamera tidak diizinkan. Coba ambil dari galeri atau tempel kodenya.')
      return
    }

    berhenti.current = false
    setTahap({ nama: 'memindai' })

    // Menunggu satu putaran render supaya elemen videonya sudah ada.
    await new Promise((lanjut) => setTimeout(lanjut, 0))
    const el = video.current
    if (el) {
      el.srcObject = aliran.current
      await el.play().catch(() => undefined)
    }

    const putaran = async () => {
      if (berhenti.current) return
      const el2 = video.current
      const kv = kanvas.current
      if (el2 && kv && salinBingkai(el2, kv)) {
        const teks = await bacaBingkai(kv)
        if (teks) {
          await tutupKamera()
          if (!terima(teks)) setTahap({ nama: 'diam' })
          return
        }
      }
      // ~8 kali sedetik. Lebih rapat cuma memanaskan HP tanpa membuat
      // pemindaiannya terasa lebih cepat.
      setTimeout(() => void putaran(), 120)
    }
    void putaran()
  }

  async function dariGaleri(berkas: File | undefined) {
    if (!berkas) return
    setGalat(null)
    const { bacaDariBerkas } = await import('@/lib/qris/pindai')
    try {
      const teks = await bacaDariBerkas(berkas)
      if (!teks) {
        setGalat('Tidak ada kode QR di gambar itu.')
        return
      }
      terima(teks)
    } catch {
      setGalat('Gambarnya tidak bisa dibaca.')
    }
  }

  async function simpan(muatan: string) {
    await setMeta(db(), QRIS_KEY, muatan)
    setTahap({ nama: 'diam' })
    setTempel('')
  }

  async function hapus() {
    await setMeta(db(), QRIS_KEY, null)
    setTahap({ nama: 'diam' })
  }

  // ── Sedang memindai ────────────────────────────────────────────────
  if (tahap.nama === 'memindai') {
    return (
      <main className="layar flex flex-1 flex-col gap-3 px-4 pb-8">
        <AppBar
          judul="Arahkan ke QRIS"
          onKembali={() => {
            void tutupKamera()
            setTahap({ nama: 'diam' })
          }}
        />
        <div className="overflow-hidden rounded-kartu-lg bg-slate-900">
          <video
            ref={video}
            playsInline
            muted
            className="aspect-square w-full object-cover"
          />
        </div>
        <canvas ref={kanvas} className="hidden" />
        <p className="text-center text-slate-600">
          Arahkan kamera ke stiker QRIS usaha. Kodenya terbaca sendiri.
        </p>
      </main>
    )
  }

  // ── Sudah terbaca, minta pengesahan ────────────────────────────────
  if (tahap.nama === 'terbaca') {
    return (
      <main className="layar flex flex-1 flex-col gap-3 px-4 pb-8">
        <AppBar judul="Benar ini QRIS-nya?" onKembali={() => setTahap({ nama: 'diam' })} />

        {/* Nama merchant lebih besar dari apa pun di layar ini. Ini
            satu-satunya kesempatan menangkap kode yang salah — sesudah
            disimpan, yang salah akan ditunjukkan ke pembeli tanpa ada
            yang curiga. */}
        <div className="kartu animate-naik text-center">
          <span
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-kartu
                       bg-masuk-soft text-masuk"
          >
            <Ikon nama="cek" ukuran={28} tebal={2.4} />
          </span>
          <p className="mt-3 text-sm text-slate-500">Terbaca atas nama</p>
          <p className="text-xl font-bold">
            {tahap.keterangan.namaMerchant ?? 'Tanpa nama'}
          </p>
          {tahap.keterangan.kota && (
            <p className="text-slate-500">{tahap.keterangan.kota}</p>
          )}
        </div>

        {!tahap.keterangan.statis && (
          <p className="kartu bg-tunggu-soft text-tunggu">
            Kode ini sudah berisi nominal tetap. Yang dibutuhkan QRIS biasa
            yang dipakai berulang — biasanya yang tertempel di meja.
          </p>
        )}

        <button
          type="button"
          onClick={() => void simpan(tahap.muatan)}
          className="btn-primer btn-besar"
        >
          Ya, simpan
        </button>
        <button
          type="button"
          onClick={() => setTahap({ nama: 'diam' })}
          className="btn-sekunder"
        >
          Bukan, ulangi
        </button>
      </main>
    )
  }

  // ── Diam ───────────────────────────────────────────────────────────
  const keteranganTersimpan = (() => {
    if (!tersimpan) return null
    try {
      return periksaQris(tersimpan)
    } catch {
      return null
    }
  })()

  return (
    <main className="layar flex flex-1 flex-col gap-3 px-4 pb-8">
      <AppBar judul="QRIS usaha" kembali="/kasir" />

      {tersimpan && keteranganTersimpan ? (
        <div className="kartu-gelap animate-naik">
          <p className="text-sm font-medium text-slate-400">QRIS terpasang</p>
          <p className="mt-1 text-xl font-bold">
            {keteranganTersimpan.namaMerchant ?? 'Tanpa nama'}
          </p>
          {keteranganTersimpan.kota && (
            <p className="text-sm text-slate-400">{keteranganTersimpan.kota}</p>
          )}
          <p className="mt-4 border-t border-white/10 pt-4 text-sm text-slate-400">
            Saat memilih bayar QRIS di kasir, kodenya muncul dengan nominal
            sudah terisi.
          </p>
        </div>
      ) : (
        <div className="kartu">
          <span
            className="flex h-12 w-12 items-center justify-center rounded-kartu
                       bg-merek-50 text-merek-700"
          >
            <Ikon nama="qris" ukuran={24} />
          </span>
          <p className="mt-3 font-semibold">Pakai QRIS yang sudah ada</p>
          <p className="mt-1 text-slate-600">
            Yang tertempel di meja, atau yang dikirim bank lewat WhatsApp.
            Tidak perlu daftar apa pun dan tidak ada biaya tambahan — nanti
            aplikasinya cuma menuliskan nominalnya sendiri, supaya pembeli
            tidak perlu mengetik.
          </p>
        </div>
      )}

      {galat && (
        <p role="alert" className="kartu bg-keluar-soft font-semibold text-keluar">
          {galat}
        </p>
      )}

      <button type="button" onClick={() => void mulaiPindai()} className="btn-primer btn-besar">
        <Ikon nama="kamera" ukuran={22} />
        {tersimpan ? 'Pindai QRIS lain' : 'Pindai QRIS'}
      </button>

      <label className="btn-sekunder cursor-pointer">
        <Ikon nama="galeri" ukuran={20} />
        Ambil dari galeri
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void dariGaleri(e.target.files?.[0])
            // Dikosongkan supaya gambar yang sama bisa dicoba lagi.
            // Pindai gagal lalu memilih berkas yang sama sekali lagi
            // tidak memicu apa pun tanpa ini.
            e.target.value = ''
          }}
        />
      </label>

      {/* Jalan terakhir, sengaja dilipat. Yang membutuhkannya tahu apa
          yang dicarinya; yang tidak, tidak perlu melihat kolom berisi dua
          ratus aksara acak. */}
      <Lipatan judul="Tempel kodenya sebagai teks">
        <p className="text-sm text-slate-600">
          Untuk kalau pindai dan galeri sama-sama gagal. Kodenya diawali
          angka <code>0002</code>.
        </p>
        <textarea
          value={tempel}
          onChange={(e) => setTempel(e.target.value)}
          rows={4}
          placeholder="00020101021126…"
          aria-label="Kode QRIS"
          className="kolom mt-2 font-mono text-sm"
        />
        <button
          type="button"
          disabled={tempel.trim().length < 20}
          onClick={() => terima(tempel.trim())}
          className="btn-sekunder mt-2 w-full"
        >
          Baca kode ini
        </button>
      </Lipatan>

      {tersimpan && (
        <button
          type="button"
          onClick={() => void hapus()}
          className="min-h-touch rounded-kartu font-semibold text-keluar active:bg-keluar-soft"
        >
          Lepas QRIS ini
        </button>
      )}
    </main>
  )
}
