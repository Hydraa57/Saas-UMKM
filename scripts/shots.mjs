/**
 * Mengambil tangkapan layar tiap halaman, dengan data yang masuk akal.
 *
 * Dipakai untuk melihat rancangannya sebagai satu kesatuan, bukan
 * layar-per-layar. Kebanyakan kejanggalan tata letak baru terlihat saat
 * sepuluh layar dijejerkan.
 *
 * Pakai:
 *   npm run build && npx next start -p 3311 &
 *   node scripts/shots.mjs [nama-folder]
 */
import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const BASE = 'http://localhost:3311'
const DIR = `shots/${process.argv[2] ?? 'sekarang'}`
await mkdir(DIR, { recursive: true })

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
})

const jeda = (ms = 700) => page.waitForTimeout(ms)
const ketik = async (n) => {
  for (const d of String(n)) {
    await page.getByRole('button', { name: d, exact: true }).click()
  }
}

const potret = async (nama, full = false) => {
  await jeda(500)
  await page.screenshot({ path: `${DIR}/${nama}.png`, fullPage: full })
  console.log('  ' + nama)
}

// ── Siapkan data yang masuk akal ────────────────────────────────────────

await page.goto(BASE, { waitUntil: 'networkidle' })
await jeda()
await potret('00-pembuka')

await page.getByRole('link', { name: 'Mulai' }).click()
await page.waitForURL('**/mulai')
await jeda()
await potret('01-pengaturan-awal')

await page.getByPlaceholder('Warung Bu Ani').fill('Warung Bu Ani')
await jeda(300)
await page.getByRole('button', { name: 'Mulai', exact: true }).click()
await page.waitForURL('**/katalog**', { timeout: 15000 })
await jeda()
await potret('02-katalog-kosong')

// Harga modal ikut diisi, dan itu bukan kelengkapan yang mubazir: tanpa
// modal, laporan menampilkan untung 100% dari omzet — angka yang tidak
// pernah benar di warung mana pun, dan yang membuat seluruh layar
// laporan terlihat seperti data contoh alih-alih hasil hitungan.
const barang = [
  ['Biskuit Roma', 5000, 3500, 24, 10],
  ['Chitato', 12000, 9500, 6, 10],
  ['Teh Botol', 5000, 3800, 0, 6],
  ['Indomie Goreng', 3500, 2800, 40, 12],
  ['Kopi Kapal Api', 2000, 1400, 18, 10],
]
for (const [nama, harga, modal, stok, min] of barang) {
  await page.goto(BASE + '/katalog/baru?jenis=barang')
  await jeda(500)
  await page.getByPlaceholder('Biskuit Roma').fill(nama)
  await ketik(harga)
  await page.getByLabel('Stok sekarang').fill(String(stok))
  await page.getByLabel(/Ingatkan kalau tinggal/).fill(String(min))
  await page.getByText(/Harga modal & foto/).click()
  await jeda(200)
  await page.getByLabel('Harga modal').fill(String(modal))
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()
  await page.waitForURL('**/katalog', { timeout: 15000 })
}

const jasa = [
  ['Potong celana', 30000],
  ['Vermak Levis', 25000],
  ['Pasang resleting', 20000],
]
for (const [nama, harga] of jasa) {
  await page.goto(BASE + '/katalog/baru?jenis=jasa')
  await jeda(500)
  await page.getByPlaceholder('Potong celana').fill(nama)
  await ketik(harga)
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()
  await page.waitForURL('**/katalog', { timeout: 15000 })
}

await jeda()
await potret('03-katalog', true)

await page.goto(BASE + '/katalog/baru?jenis=barang')
await jeda()
await page.getByPlaceholder('Biskuit Roma').fill('Oreo')
await ketik(9000)
await potret('04-tambah-barang', true)

// ── Satu transaksi lengkap ──────────────────────────────────────────────

await page.goto(BASE + '/kasir')
await jeda(900)
await potret('05-kasir', true)

await page.locator('.grid button', { hasText: 'Biskuit Roma' }).click()
await page.locator('.grid button', { hasText: 'Biskuit Roma' }).click()
await page.locator('.grid button', { hasText: 'Indomie Goreng' }).click()
await page.locator('.grid button', { hasText: 'Potong celana' }).click()
await jeda(500)
await potret('06-keranjang', true)

await page.getByRole('button', { name: /^Bayar/ }).click()
await jeda(500)
await page.getByRole('button', { name: 'Rp 50.000' }).click()
await jeda(300)
await potret('07-bayar', true)

await page.getByRole('button', { name: /Selesai & cetak struk/ }).click()
await page.waitForURL('**/struk/**', { timeout: 15000 })
await jeda(900)
await potret('08-struk', true)

// Beberapa transaksi lagi supaya riwayat dan laporan tidak kosong.
// Jumlah ketukannya sengaja berbeda-beda: daftar "paling laku" yang
// semua barisnya sama panjang tidak menunjukkan apa pun, dan justru
// urutan itulah yang jadi jawaban di layar laporan.
const belanjaan = [
  ['Kopi Kapal Api', 4],
  ['Indomie Goreng', 3],
  ['Kopi Kapal Api', 3],
  ['Chitato', 1],
  ['Biskuit Roma', 2],
  ['Indomie Goreng', 2],
  ['Kopi Kapal Api', 2],
]
for (const [nama, banyak] of belanjaan) {
  await page.goto(BASE + '/kasir')
  await jeda(700)
  const petak = page.locator('.grid button', { hasText: nama })
  for (let i = 0; i < banyak; i++) await petak.click()
  await jeda(300)
  await page.getByRole('button', { name: /^Bayar/ }).click()
  await jeda(400)
  await page.getByRole('button', { name: 'Uang pas' }).click()
  await jeda(200)
  await page.getByRole('button', { name: /Selesai & cetak struk/ }).click()
  await page.waitForURL('**/struk/**', { timeout: 15000 })
}

// Satu transaksi berutang.
await page.goto(BASE + '/kasir')
await jeda(700)
await page.locator('.grid button', { hasText: 'Vermak Levis' }).click()
await jeda(300)
await page.getByRole('button', { name: /^Bayar/ }).click()
await jeda(400)
for (let i = 0; i < 5; i++) {
  await page.getByRole('button', { name: 'Hapus satu angka' }).click()
}
await jeda(300)
await page.getByPlaceholder('Bu Tetangga').fill('Bu Sri')
await jeda(200)
await page.getByRole('button', { name: /Simpan sebagai utang/ }).click()
await page.waitForURL('**/struk/**', { timeout: 15000 })

// Satu biaya operasional.
await page.goto(BASE + '/keluar')
await jeda(700)
await ketik(25000)
await page.getByPlaceholder('Gas 3 kg').fill('Gas 3 kg')
await jeda(300)
await potret('09-uang-keluar', true)
await page.getByRole('button', { name: 'Simpan' }).click()
await jeda(900)

// ── Layar-layar sisanya ─────────────────────────────────────────────────

await page.goto(BASE + '/')
await jeda(1000)
await potret('10-beranda', true)

await page.goto(BASE + '/riwayat')
await jeda(900)
await potret('11-riwayat', true)

await page.goto(BASE + '/katalog?tab=stok')
await jeda(900)
await potret('12-stok', true)

await page.locator('a', { hasText: 'Teh Botol' }).first().click()
await page.waitForURL('**/stok/**', { timeout: 15000 })
await jeda(800)
await potret('13-detail-stok', true)

await page.goto(BASE + '/kulakan')
await jeda(900)
await page.locator('button', { hasText: 'Teh Botol' }).first().click()
await jeda(400)
await potret('14-kulakan', true)

await page.goto(BASE + '/utang')
await jeda(900)
await potret('15-utang', true)

await page.getByRole('button', { name: /Bu Sri/ }).click()
await jeda(700)
await potret('16-terima-bayar', true)

await page.goto(BASE + '/masuk')
await jeda(900)
await potret('17-cadangan', true)

await page.goto(BASE + '/laporan')
await jeda(1000)
await potret('18-laporan', true)

console.log('\nselesai → ' + DIR)
await browser.close()
