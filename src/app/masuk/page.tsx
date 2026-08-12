'use client'

import { useState } from 'react'
import { AppBar } from '@/components/AppBar'
import { Ikon } from '@/components/Ikon'
import { daftar, keluar, masuk, useSesi } from '@/lib/auth'
import { isConfigured } from '@/lib/supabase/client'
import { useSync } from '@/lib/sync/useSync'

/**
 * Masuk atau daftar.
 *
 * Bukan gerbang. Aplikasinya sudah jalan penuh tanpa akun; layar ini
 * ada untuk satu hal saja: **memindahkan catatan dari satu HP ke tempat
 * yang tidak ikut hilang bersama HP itu.**
 *
 * Karena itu bahasanya bukan "Masuk untuk melanjutkan" melainkan
 * "Cadangkan catatan". Yang dijanjikan bukan aksesnya, melainkan
 * keamanannya — itu yang benar-benar dibeli pengguna dengan mengisi
 * formulir ini.
 *
 * Satu layar untuk masuk **dan** daftar, dengan satu tombol pengalih.
 * Dua halaman terpisah berarti pengguna harus tahu lebih dulu apakah dia
 * sudah punya akun atau belum, dan itu justru yang sering dia tidak
 * yakin.
 */

export default function Masuk() {
  const { status, email: emailSesi } = useSesi()
  const { menunggu, fotoMenyusul, sedangMengirim, kirimSekarang } = useSync()

  const [mode, setMode] = useState<'masuk' | 'daftar'>('masuk')
  const [email, setEmail] = useState('')
  const [sandi, setSandi] = useState('')
  const [galat, setGalat] = useState<string | null>(null)
  const [pesan, setPesan] = useState<string | null>(null)
  const [sibuk, setSibuk] = useState(false)

  const bisaKirim = email.trim().length > 3 && sandi.length >= 6 && !sibuk

  async function kirim() {
    if (!bisaKirim) return
    setSibuk(true)
    setGalat(null)
    setPesan(null)
    try {
      if (mode === 'masuk') {
        await masuk(email, sandi)
      } else {
        await daftar(email, sandi)
        setPesan(
          'Akun dibuat. Kalau diminta memverifikasi email, buka email itu dulu ' +
            'lalu masuk di sini.',
        )
      }
      setSandi('')
    } catch (e) {
      setGalat(e instanceof Error ? e.message : 'Gagal. Coba lagi.')
    } finally {
      setSibuk(false)
    }
  }

  if (!isConfigured()) {
    return (
      <main className="flex flex-1 flex-col gap-4 px-4 pb-8">
        <AppBar judul="Cadangkan catatan" kembali="/" />
        <div className="kartu">
          <p className="font-semibold">Peladen belum disetel</p>
          <p className="mt-1 text-slate-600">
            Aplikasinya tetap jalan penuh, tapi catatannya baru ada di HP ini.
            Isi <code className="text-sm">.env.local</code> dari dasbor Supabase
            untuk mengaktifkan pencadangan.
          </p>
        </div>
      </main>
    )
  }

  // ── Sudah masuk ────────────────────────────────────────────────────
  if (status === 'masuk') {
    return (
      <main className="flex flex-1 flex-col gap-3 px-4 pb-8">
        <AppBar judul="Cadangan" kembali="/" />

        <div className="kartu-gelap animate-naik">
          <span
            className="flex h-14 w-14 items-center justify-center rounded-kartu
                       bg-masuk/30 text-emerald-300"
          >
            <Ikon nama="cek" ukuran={28} tebal={2.4} />
          </span>
          <p className="mt-4 text-xl font-bold">Catatan sudah dicadangkan</p>
          <p className="mt-1 text-sm text-slate-400">{emailSesi}</p>

          <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
            <span className="text-sm font-medium text-slate-400">
              Menunggu terkirim
            </span>
            <span className="text-xl font-bold">{menunggu}</span>
          </div>

          {/* Hanya muncul kalau memang ada yang menyusul. Baris tetap
              yang selalu menunjukkan nol adalah baris yang berhenti
              dibaca, dan sesudah itu ia tidak berguna saat angkanya
              benar-benar berubah. */}
          {fotoMenyusul > 0 && (
            <div className="mt-3 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-400">
                Foto sedang diturunkan
              </span>
              <span className="text-xl font-bold">{fotoMenyusul}</span>
            </div>
          )}
        </div>

        {menunggu > 0 && (
          <button
            type="button"
            disabled={sedangMengirim}
            onClick={kirimSekarang}
            className="btn-sekunder"
          >
            {sedangMengirim ? 'Mengirim…' : 'Kirim sekarang'}
          </button>
        )}

        <p className="kartu text-slate-600">
          Catatan tetap tersimpan di HP ini dan tetap bisa dipakai tanpa
          sinyal. Yang dikirim ke peladen adalah salinannya, supaya tidak ikut
          hilang kalau HP-nya kenapa-kenapa.
        </p>

        <p className="kartu text-slate-600">
          Jalannya dua arah. Masuk akun yang sama di HP lain, dan katalog,
          penjualan, stok, serta utangnya turun ke sana sendiri — foto
          menyusul di belakang supaya kasirnya bisa langsung dipakai.
        </p>

        <button
          type="button"
          onClick={() => void keluar()}
          className="min-h-touch rounded-kartu font-semibold text-keluar
                     active:bg-keluar-soft"
        >
          Keluar dari akun
        </button>
      </main>
    )
  }

  // ── Belum masuk ────────────────────────────────────────────────────
  return (
    <main className="flex flex-1 flex-col gap-3 px-4 pb-8">
      <AppBar judul="Cadangkan catatan" kembali="/" />

      <div className="kartu animate-naik">
        <span
          className="flex h-12 w-12 items-center justify-center rounded-kartu
                     bg-tunggu-soft text-tunggu"
        >
          <Ikon nama="peringatan" ukuran={24} />
        </span>
        <p className="mt-3 font-semibold">Catatan ini baru ada di HP ini</p>
        <p className="mt-1 text-slate-600">
          Kalau HP-nya hilang, rusak, atau datanya terhapus, seluruh katalog dan
          riwayat penjualan ikut hilang. Buat akun sekali, dan salinannya
          tersimpan otomatis.
        </p>
      </div>

      <div role="tablist" className="tab-grup">
        {(['masuk', 'daftar'] as const).map((pilihan) => (
          <button
            key={pilihan}
            role="tab"
            aria-selected={mode === pilihan}
            onClick={() => {
              setMode(pilihan)
              setGalat(null)
              setPesan(null)
            }}
            className={`tab ${mode === pilihan ? 'tab-aktif' : ''}`}
          >
            {pilihan === 'masuk' ? 'Sudah punya akun' : 'Buat akun baru'}
          </button>
        ))}
      </div>

      <label className="kartu block">
        <span className="label">Email</span>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nama@email.com"
          className="kolom mt-1"
        />
      </label>

      <label className="kartu block">
        <span className="label">Kata sandi (minimal 6 huruf)</span>
        <input
          type="password"
          autoComplete={mode === 'masuk' ? 'current-password' : 'new-password'}
          value={sandi}
          onChange={(e) => setSandi(e.target.value)}
          placeholder="••••••"
          className="kolom mt-1"
        />
      </label>

      {galat && (
        <p role="alert" className="kartu bg-keluar-soft font-semibold text-keluar">
          {galat}
        </p>
      )}
      {pesan && (
        <p role="status" className="kartu text-slate-700">
          {pesan}
        </p>
      )}

      <button
        type="button"
        disabled={!bisaKirim}
        onClick={kirim}
        className="btn-primer btn-besar"
      >
        {sibuk
          ? 'Sebentar…'
          : mode === 'masuk'
            ? 'Masuk & cadangkan'
            : 'Buat akun & cadangkan'}
      </button>

      <p className="px-2 text-center text-sm text-slate-500">
        Tanpa akun pun aplikasinya tetap bisa dipakai seperti biasa.
      </p>
    </main>
  )
}
