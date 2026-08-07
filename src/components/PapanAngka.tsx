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
      {pintasan.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {pintasan.map((jumlah) => (
            <button
              key={jumlah}
              type="button"
              onClick={() => onChange(M.rupiah(jumlah))}
              className="min-h-touch rounded-xl bg-slate-200 px-5 font-semibold
                         text-slate-800 active:bg-slate-300"
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
