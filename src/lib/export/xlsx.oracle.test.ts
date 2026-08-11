import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buatXlsx } from './xlsx'
import { susunLembar } from './laporan'
import {
  KAS,
  expense,
  income,
  makeBarang,
  makeDebt,
  makeJasa,
  makeLine,
  makeSale,
  makeWallet,
} from '@/lib/domain/fixtures'
import { rupiah } from '@/lib/money'

/**
 * Pembacaan oleh pembaca `.xlsx` sungguhan.
 *
 * Seluruh berkas uji lain di sebelah membaca hasil penyandi ini dengan
 * kode dari repositori ini juga. Itu membuktikan penyandinya konsisten
 * dengan dirinya sendiri — dan **tidak membuktikan apa pun** tentang
 * apakah Excel atau WPS mau membukanya. Kegagalan seperti itu baru
 * ketahuan saat pemiliknya benar-benar membutuhkan datanya, yaitu saat
 * paling buruk untuk mengetahuinya.
 *
 * Jadi berkasnya diserahkan ke `openpyxl`, pustaka Python yang menerapkan
 * OOXML secara terpisah dan tidak tahu apa pun tentang kode ini. Kalau ia
 * bisa menyebut nama tabnya, membaca angkanya sebagai angka, dan
 * mengembalikan aksara non-ASCII apa adanya, penyandinya benar.
 *
 * Dilewati — bukan digagalkan — kalau Python atau `openpyxl` tidak ada.
 * Yang tidak bisa dijalankan tidak boleh menyamar jadi kegagalan, tapi
 * juga tidak boleh menyamar jadi keberhasilan: pelewatannya terlihat di
 * keluaran uji.
 */

function adaOpenpyxl(): boolean {
  try {
    execFileSync('python3', ['-c', 'import openpyxl'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const jalankan = adaOpenpyxl() ? describe : describe.skip

jalankan('dibaca oleh openpyxl (pembaca xlsx di luar repo ini)', () => {
  function bacaUlang(data: Uint8Array): unknown {
    const dir = mkdtempSync(join(tmpdir(), 'xlsx-'))
    const berkas = join(dir, 'uji.xlsx')
    writeFileSync(berkas, data)

    // `-W error` menaikkan peringatan jadi galat: `openpyxl` memperingati
    // berkas yang kekurangan bagian tapi tetap membukanya, dan peringatan
    // yang diabaikan persis jenis cacat yang lolos ke Excel.
    const skrip = `
import json, sys, warnings, openpyxl
warnings.simplefilter("error")
wb = openpyxl.load_workbook(sys.argv[1])
keluar = {"lembar": wb.sheetnames, "isi": {}, "tebal": {}, "lebar": {}}
for nama in wb.sheetnames:
    ws = wb[nama]
    keluar["isi"][nama] = [list(r) for r in ws.iter_rows(values_only=True)]
    keluar["tebal"][nama] = bool(ws.cell(1, 1).font.bold)
    keluar["lebar"][nama] = ws.column_dimensions["A"].width
print(json.dumps(keluar))
`
    const keluaran = execFileSync('python3', ['-W', 'error', '-c', skrip, berkas], {
      encoding: 'utf8',
    })
    return JSON.parse(keluaran)
  }

  it('membuka berkasnya tanpa peringatan satu pun', () => {
    // Kalau ada bagian OOXML yang kurang, `-W error` di atas membuat
    // langkah ini melempar — jadi ini juga uji kelengkapan, bukan cuma
    // uji "bisa dibuka".
    const hasil = bacaUlang(
      buatXlsx([{ nama: 'Rekap', baris: [['Bulan'], ['Agustus 2026']] }]),
    ) as { lembar: string[] }

    expect(hasil.lembar).toEqual(['Rekap'])
  })

  it('mengembalikan angka sebagai angka, termasuk yang negatif', () => {
    // Seluruh gunanya mengekspor ke Excel, bukan ke teks: angka yang
    // tersimpan sebagai teks tidak bisa dijumlah, dan yang membukanya
    // tidak akan tahu kenapa SUM-nya nol.
    const hasil = bacaUlang(
      buatXlsx([
        {
          nama: 'Rekap',
          baris: [
            ['Bulan', 'Sisa'],
            ['Agustus 2026', 76_000],
            ['Juli 2026', -75_000],
          ],
        },
      ]),
    ) as { isi: Record<string, unknown[][]> }

    expect(hasil.isi['Rekap']).toEqual([
      ['Bulan', 'Sisa'],
      ['Agustus 2026', 76_000],
      ['Juli 2026', -75_000],
    ])
  })

  it('mengembalikan nama barang berbahasa Indonesia apa adanya', () => {
    const nama = 'Roti Manis — "spesial" & <baru> ½ kg'
    const hasil = bacaUlang(
      buatXlsx([{ nama: 'Katalog', baris: [['Nama'], [nama]] }]),
    ) as { isi: Record<string, unknown[][]> }

    expect(hasil.isi['Katalog']?.[1]?.[0]).toBe(nama)
  })

  it('membedakan sel kosong dari angka nol', () => {
    // Jasa tidak punya sisa stok, dan itu bukan nol. Pembeda ini inti
    // produknya, jadi ia harus selamat sampai ke berkas ekspornya.
    const hasil = bacaUlang(
      buatXlsx([
        {
          nama: 'Katalog',
          baris: [
            ['Nama', 'Sisa'],
            ['Jahit celana', null],
            ['Biskuit', 0],
          ],
        },
      ]),
    ) as { isi: Record<string, unknown[][]> }

    expect(hasil.isi['Katalog']?.[1]?.[1]).toBeNull()
    expect(hasil.isi['Katalog']?.[2]?.[1]).toBe(0)
  })

  it('menyampaikan judul tebal dan lebar kolom', () => {
    const hasil = bacaUlang(
      buatXlsx([
        { nama: 'Rekap', baris: [['Bulan'], ['Agustus']], lebar: [18] },
      ]),
    ) as { tebal: Record<string, boolean>; lebar: Record<string, number> }

    expect(hasil.tebal['Rekap']).toBe(true)
    expect(hasil.lebar['Rekap']).toBe(18)
  })

  it('memisahkan beberapa lembar dengan benar', () => {
    const hasil = bacaUlang(
      buatXlsx([
        { nama: 'Satu', baris: [['a'], [1]] },
        { nama: 'Dua', baris: [['b'], [2]] },
        { nama: 'Tiga', baris: [['c'], [3]] },
      ]),
    ) as { lembar: string[]; isi: Record<string, unknown[][]> }

    expect(hasil.lembar).toEqual(['Satu', 'Dua', 'Tiga'])
    expect(hasil.isi['Dua']).toEqual([['b'], [2]])
  })

  /**
   * Uji-uji di atas memeriksa penyandinya dengan data buatan. Yang ini
   * memeriksa **berkas yang benar-benar diterima pengguna**: hasil
   * `susunLembar` dari satu hari kerja yang lengkap, keenam lembarnya
   * sekaligus, dibaca oleh pustaka yang tidak tahu apa pun tentang kode
   * ini. Kalau ada satu langkah di antara data dan berkas yang keliru,
   * tempat inilah yang menangkapnya.
   */
  it('menyerahkan seluruh isi satu hari kerja tanpa ada yang berubah', () => {
    const biskuit = makeBarang({ name: 'Biskuit Roma', stockQty: 8, minStock: 5 })
    const jahit = makeJasa({ name: 'Potong celana' })

    const hasil = bacaUlang(
      buatXlsx(
        susunLembar({
          namaUsaha: 'Warung Uji',
          items: [biskuit, jahit],
          sales: [
            makeSale({
              invoiceNo: 'INV-1',
              occurredAt: '2026-08-11T12:30:00.000Z',
              lines: [
                makeLine({
                  itemId: biskuit.id,
                  itemName: biskuit.name,
                  qty: 2,
                  unitPrice: rupiah(5_000),
                  unitCost: rupiah(3_000),
                }),
                makeLine({
                  itemId: jahit.id,
                  itemKind: 'jasa',
                  itemName: jahit.name,
                  qty: 1,
                  unitPrice: rupiah(30_000),
                  unitCost: rupiah(0),
                }),
              ],
            }),
          ],
          entries: [
            income(40_000, 'penjualan', { occurredAt: '2026-08-11T12:30:00Z' }),
            expense(60_000, 'modal', { occurredAt: '2026-08-11T13:00:00Z' }),
          ],
          wallets: [makeWallet({ id: KAS, name: 'Laci' })],
          debts: [
            makeDebt({
              person: 'Bu Tetangga',
              amount: rupiah(5_000),
              occurredAt: '2026-08-11T13:30:00Z',
            }),
          ],
          movements: [
            {
              itemId: biskuit.id,
              occurredAt: '2026-08-11T13:00:00Z',
              qtyChange: 20,
              reason: 'kulakan',
              note: null,
            },
          ],
        }),
      ),
    ) as { lembar: string[]; isi: Record<string, unknown[][]> }

    expect(hasil.lembar).toEqual([
      'Rekap bulanan',
      'Penjualan',
      'Buku kas',
      'Barang & jasa',
      'Utang & piutang',
      'Pergerakan stok',
    ])

    // Rupiah tetap bilangan setelah melewati ZIP, XML, dan pembaca lain.
    expect(hasil.isi['Rekap bulanan']?.[1]).toEqual([
      'Agustus 2026',
      40_000,
      60_000,
      -20_000,
      2,
    ])

    // Jasa tidak punya sisa stok — selnya kosong, bukan nol. Ini
    // pembeda utama produknya, dan perjalanan terpanjang yang harus
    // dilaluinya adalah sampai ke berkas ini.
    const katalog = hasil.isi['Barang & jasa']
    expect(katalog?.[1]?.[5]).toBe(8)
    expect(katalog?.[2]?.[0]).toBe('Jasa')
    expect(katalog?.[2]?.[5]).toBeNull()

    // Jam ditulis dalam waktu setempat: 12.30 UTC adalah 19.30 WIB.
    expect(hasil.isi['Penjualan']?.[1]?.[1]).toBe('19.30')
    expect(hasil.isi['Pergerakan stok']?.[1]?.[2]).toBe('Biskuit Roma')
    expect(hasil.isi['Utang & piutang']?.[1]?.[4]).toBe(5_000)
  })
})
