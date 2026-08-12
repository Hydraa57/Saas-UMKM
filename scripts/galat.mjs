/**
 * Membuktikan layar galat benar-benar muncul saat ada yang rusak.
 *
 * Ini tidak bisa jadi bagian `npm run smoke`, karena satu-satunya cara
 * memastikannya adalah **benar-benar merusak satu halaman** lalu
 * membangun ulang. Jadi ia berdiri sendiri, dan dijalankan saat
 * penanganan galat disentuh.
 *
 * Kenapa repot: layar galat adalah satu-satunya bagian aplikasi yang
 * tidak pernah terlihat selama semuanya berjalan benar. Ia bisa rusak
 * berbulan-bulan tanpa satu pun gejala — dan yang menemukannya pertama
 * kali adalah pemilik warung yang aplikasinya baru saja mati di depan
 * pembeli. Tidak ada bagian lain yang sepenting ini untuk diperiksa
 * dengan sengaja.
 *
 * Yang diperiksa:
 *   1. Layarnya muncul, bukan layar bawaan Next.js.
 *   2. Jaminan "catatannya aman" terbaca.
 *   3. Bilah navigasi tetap ada — satu layar rusak tidak menghentikan
 *      jualan hari itu.
 *   4. Pesan galat aslinya tidak bocor ke layar.
 *   5. **Sekocinya benar-benar mengapung**: tombol unduh menghasilkan
 *      berkas `.xlsx` yang bisa dibuka pustaka di luar repo ini.
 *
 * Pakai:
 *   node scripts/galat.mjs
 *
 * Halaman yang dirusak dikembalikan di blok `finally`, termasuk kalau
 * pengujiannya gagal di tengah.
 */
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { copyFileSync, readFileSync, statSync, writeFileSync, unlinkSync } from 'node:fs'

const BASE = 'http://localhost:3311'
const KORBAN = 'src/app/utang/page.tsx'
const CADANGAN = '/tmp/galat-uji-cadangan.tsx'
const BERKAS_UNDUH = '/tmp/galat-uji-unduhan.xlsx'

const periksa = (nama, benar) => {
  console.log(`  ${benar ? 'ok  ' : 'GAGAL'} ${nama}`)
  if (!benar) process.exitCode = 1
}

copyFileSync(KORBAN, CADANGAN)

try {
  const asal = readFileSync(KORBAN, 'utf8')
  const i = asal.indexOf('export default function')
  writeFileSync(
    KORBAN,
    asal.slice(0, i) + "throw new Error('kerusakan yang disengaja')\n\n" + asal.slice(i),
  )

  console.log('membangun ulang dengan satu halaman yang sengaja dirusak…')
  execFileSync('npx', ['next', 'build'], { stdio: 'ignore' })

  console.log('jalankan `npx next start -p 3311` di jendela lain, lalu tekan Enter…')
  await new Promise((lanjut) => process.stdin.once('data', lanjut))

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    acceptDownloads: true,
  })

  // Gerbangnya dibuka dengan menulis keadaan lokal yang persis
  // dihasilkan login berhasil — peladennya tidak terjangkau dari sini.
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.evaluate(
    () =>
      new Promise((selesai, gagal) => {
        const minta = indexedDB.open('ezura')
        minta.onsuccess = () => {
          const tx = minta.result.transaction('meta', 'readwrite')
          tx.objectStore('meta').put({ key: 'pernah_masuk', value: true })
          tx.oncomplete = () => selesai(undefined)
          tx.onerror = () => gagal(tx.error)
        }
        minta.onerror = () => gagal(minta.error)
      }),
  )
  await page.goto(BASE + '/mulai', { waitUntil: 'networkidle' })
  await page.getByPlaceholder('Warung Bu Ani').fill('Warung Uji')
  await page.getByRole('button', { name: 'Mulai', exact: true }).click()
  await page.waitForURL('**/katalog**', { timeout: 15000 })

  // Satu barang, supaya berkas ekspornya berisi.
  await page.goto(BASE + '/katalog/baru?jenis=barang')
  await page.waitForTimeout(600)
  await page.getByPlaceholder('Biskuit Roma').fill('Biskuit Uji')
  for (const d of '5000') await page.getByRole('button', { name: d, exact: true }).click()
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()
  await page.waitForURL('**/katalog', { timeout: 15000 })

  await page.goto(BASE + '/utang')
  await page.waitForTimeout(1500)

  const layar = (await page.locator('body').innerText()).replace(/\n+/g, ' | ')

  periksa('layar galatnya muncul, bukan layar bawaan', layar.includes('Catatannya aman'))
  periksa('ada tombol buka lagi', layar.includes('Buka lagi'))
  periksa('ada sekoci unduh Excel', layar.includes('Unduh semua ke Excel'))
  periksa(
    'tidak ada bahasa Inggris bawaan Next.js',
    !/Application error|client-side exception/i.test(layar),
  )
  periksa('pesan galat aslinya tidak bocor', !layar.includes('kerusakan yang disengaja'))
  periksa(
    'bilah navigasi tetap ada, jadi kasir tetap bisa dibuka',
    (await page.getByRole('navigation', { name: 'Navigasi utama' }).count()) > 0,
  )

  // Sekocinya diperiksa sampai berkasnya benar-benar bisa dibuka.
  // "Terunduh" saja tidak cukup — berkas rusak yang terunduh justru
  // paling berbahaya, karena ia terlihat seperti penyelamatan.
  const tunggu = page.waitForEvent('download', { timeout: 30000 })
  await page.getByRole('button', { name: /Unduh semua ke Excel/ }).click()
  const unduhan = await tunggu
  // Disimpan dengan akhiran `.xlsx`: pembacanya memeriksa nama berkas,
  // dan path sementara Playwright tidak punya akhiran apa pun.
  await unduhan.saveAs(BERKAS_UNDUH)

  periksa('berkasnya tidak kosong', statSync(BERKAS_UNDUH).size > 1000)

  const lembar = execFileSync(
    'python3',
    [
      '-c',
      `
import warnings, openpyxl, sys
warnings.simplefilter('error')
print(','.join(openpyxl.load_workbook(sys.argv[1]).sheetnames))
`,
      BERKAS_UNDUH,
    ],
    { encoding: 'utf8' },
  ).trim()

  periksa(`berkasnya terbaca pembaca di luar repo ini (${lembar})`, lembar.includes('Penjualan'))

  await page.screenshot({ path: 'shots/sekarang/25-layar-galat.png', fullPage: true })
  await browser.close()
} finally {
  copyFileSync(CADANGAN, KORBAN)
  try {
    unlinkSync(BERKAS_UNDUH)
  } catch {
    // Tidak apa-apa kalau memang tidak pernah terunduh.
  }
  console.log('\nhalaman yang dirusak sudah dikembalikan. Bangun ulang sebelum dipakai lagi.')
}
