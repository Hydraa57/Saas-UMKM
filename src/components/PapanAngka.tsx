'use client'

import { useCallback } from 'react'
import * as M from '@/lib/money'
import type { Rupiah } from '@/lib/money'

/**
 * Papan angka untuk memasukkan nominal.
 *
 * Menggantikan `<input type="number">` dengan keyboard bawaan, karena
 * keyboard bawaan Android memakan separuh layar, tombolnya kecil, dan
 * memunculkan huruf serta tanda baca yang tidak pernah dibutuhkan di
 * sini.
 *
 * Bekerja dalam rupiah utuh: menekan "5" pada "12" menghasilkan "125".
 * Tidak ada pergeseran desimal seperti pada mata uang bersen, karena
 * rupiah tidak dipakai sampai sen.
 *
 * Pintasan ribuan ada karena hampir setiap nominal di warung berakhir
 * tiga angka nol, dan menekan "000" sekali jauh lebih cepat — juga lebih
 * kecil kemungkinan salah hitung — daripada menekan nol tiga kali.
 */

interface PapanAngkaProps {
  nilai: Rupiah
  onChange: (nilai: Rupiah) => void
  /** Nominal cepat yang sering dipakai. Diisi dari kebiasaan, bukan tebakan. */
  pintasan?: readonly number[]
}

const TOMBOL = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', '⌫'] as const

export function PapanAngka({ nilai, onChange, pintasan = [] }: PapanAngkaProps) {
  const tekan = useCallback(
    (tombol: string) => {
      if (tombol === '⌫') {
        onChange(M.removeDigit(nilai))
        return
      }
      if (tombol === '000') {
        // Dilakukan per digit supaya batas atas tetap dihormati:
        // menambahkan tiga nol sekaligus bisa melewati batas tanpa
        // terdeteksi.
        let hasil = nilai
        for (let i = 0; i < 3; i++) hasil = M.appendDigit(hasil, 0)
        onChange(hasil)
        return
      }
      onChange(M.appendDigit(nilai, Number(tombol)))
    },
    [nilai, onChange],
  )

  return (
    <div className="space-y-3">
      {/* Petak, bukan baris yang membungkus sendiri.
          Sebelumnya `flex flex-wrap`, jadi lebar tiap pintasan mengikuti
          panjang angkanya: "Rp 10.000" lebih sempit daripada
          "Rp 100.000", dan barisnya berhenti di tempat yang berbeda-beda
          — tepat di atas papan angka yang justru petak sempurna tiga
          kolom. Dua susunan berbeda yang bertumpuk itulah yang terbaca
          sebagai "ukurannya tidak simetris".

          Dua kolom, bukan tiga: nominalnya panjang, dan tiga kolom
          membuat "Rp 100.000" pecah jadi dua baris di layar tersempit. */}
      {pintasan.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {pintasan.map((jumlah) => (
            <button
              key={jumlah}
              type="button"
              onClick={() => onChange(M.rupiah(jumlah))}
              className="flex min-h-touch items-center justify-center rounded-kartu-kecil
                         bg-slate-200 px-2 font-semibold text-slate-800
                         transition active:scale-95 active:bg-slate-300"
            >
              {M.format(M.rupiah(jumlah))}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {TOMBOL.map((tombol) => (
          <button
            key={tombol}
            type="button"
            onClick={() => tekan(tombol)}
            aria-label={tombol === '⌫' ? 'Hapus satu angka' : tombol}
            className="btn-angka"
          >
            {tombol}
          </button>
        ))}
      </div>
    </div>
  )
}
