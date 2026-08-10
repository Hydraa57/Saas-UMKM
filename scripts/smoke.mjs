/**
 * Uji asap: menjalankan alur nyata di peramban sungguhan.
 *
 * Tes unit membuktikan perhitungannya benar; berkas ini membuktikan
 * aplikasinya benar-benar jalan. Keduanya menangkap hal yang berbeda —
 * dua bug UX pertama (pilihan yang hilang saat kembali dari layar lain,
 * dan ikon PWA yang tidak ada) lolos dari seluruh tes unit dan baru
 * ketahuan di sini.
 *
 * Yang dijalankan adalah satu hari kerja yang lengkap: buka usaha, isi
 * katalog dengan satu barang dan satu jasa, jual keduanya dalam satu
 * struk, lalu periksa tiga hal yang menentukan produk ini dipercaya atau
 * tidak:
 *
 *   1. struknya keluar,
 *   2. stok barang berkurang,
 *   3. **stok jasa tidak pernah berkurang.**
 *
 * Pakai:
 *   npm run build && npx next start -p 3311 &
 *   node scripts/smoke.mjs
 */
import { chromium } from '@playwright/test'

const BASE = 'http://localhost:3311'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))
page.on('response', (r) => { if (r.status() === 404) errs.push('404 ' + r.url()) })

const step = async (label, fn) => {
  try { await fn(); console.log('  ok  ' + label) }
  catch (e) { console.log('  GAGAL  ' + label + ' — ' + String(e).split('\n')[0]); throw e }
}

const ketik = async (angka) => {
  for (const d of String(angka)) {
    await page.getByRole('button', { name: d, exact: true }).click()
  }
}

await step('buka beranda', async () => {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
})

await step('menuju pengaturan awal', async () => {
  await page.getByRole('link', { name: 'Mulai' }).click()
  await page.waitForURL('**/mulai')
})

await step('isi nama usaha dan mulai', async () => {
  await page.getByPlaceholder('Warung Bu Ani').fill('Warung Uji')
  await page.waitForTimeout(300)
  const b = page.getByRole('button', { name: 'Mulai', exact: true })
  if (await b.isDisabled()) throw new Error('tombol Mulai masih nonaktif')
  await b.click()
  // Langsung ke katalog: tanpa isi katalog, kasirnya kosong.
  await page.waitForURL('**/katalog**', { timeout: 15000 })
  await page.waitForTimeout(700)
})

await step('tambah barang: Biskuit 5.000, stok 10', async () => {
  await page.getByRole('link', { name: '+ Barang' }).click()
  await page.waitForURL('**/katalog/baru**')
  await page.waitForTimeout(600)
  await page.getByPlaceholder('Biskuit Roma').fill('Biskuit Uji')
  await ketik(5000)
  await page.getByLabel('Stok sekarang').fill('10')
  const b = page.getByRole('button', { name: 'Simpan', exact: true })
  if (await b.isDisabled()) throw new Error('tombol Simpan nonaktif')
  await b.click()
  await page.waitForURL('**/katalog', { timeout: 15000 })
  await page.waitForTimeout(700)
})

await step('tambah jasa: Potong celana 30.000', async () => {
  await page.getByRole('link', { name: '+ Jasa' }).click()
  await page.waitForURL('**/katalog/baru**')
  await page.waitForTimeout(600)
  await page.getByPlaceholder('Potong celana').fill('Potong celana')
  await ketik(30000)
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()
  await page.waitForURL('**/katalog', { timeout: 15000 })
  await page.waitForTimeout(700)
})

await step('kolom stok memang tidak ada untuk jasa', async () => {
  await page.goto(BASE + '/katalog/baru?jenis=jasa')
  await page.waitForTimeout(600)
  if (await page.getByLabel('Stok sekarang').count() !== 0) {
    throw new Error('kolom stok muncul di formulir jasa')
  }
})

await step('kasir: jual 2 biskuit + 1 potong celana', async () => {
  await page.goto(BASE + '/kasir')
  await page.waitForTimeout(800)
  // Petak grid, bukan tombol +/− di keranjang: yang diuji di sini adalah
  // ketukan pertama pada barangnya.
  const petak = page.locator('.grid button', { hasText: 'Biskuit Uji' })
  await petak.click()
  await petak.click()
  await page.locator('.grid button', { hasText: 'Potong celana' }).click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: /^Bayar/ }).click()
  await page.waitForTimeout(500)
})

await step('bayar uang pas lalu cetak struk', async () => {
  await page.getByRole('button', { name: 'Uang pas' }).click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: /Selesai & cetak struk/ }).click()
  await page.waitForURL('**/struk/**', { timeout: 15000 })
  await page.waitForTimeout(800)
})

const struk = await page.locator('pre').innerText()
const punyaWa = await page.getByRole('link', { name: 'Kirim ke WhatsApp' }).count()

await step('struk memuat kedua baris dan totalnya', async () => {
  for (const potongan of ['Biskuit Uji', 'Potong celana', '40.000']) {
    if (!struk.includes(potongan)) throw new Error('struk tanpa "' + potongan + '"')
  }
  if (punyaWa !== 1) throw new Error('tautan WhatsApp tidak ada')
  // Urutannya sama dengan urutan diketuk di kasir. Sebelum `line_no` ada,
  // struk yang sama bisa tampil dengan urutan berbeda tiap kali dibuka.
  if (struk.indexOf('Biskuit Uji') > struk.indexOf('Potong celana')) {
    throw new Error('urutan baris struk tidak mengikuti urutan keranjang')
  }
})

await page.goto(BASE + '/katalog')
await page.waitForTimeout(900)
const daftar = (await page.locator('ul').first().innerText()).replace(/\n+/g, ' | ')

await step('stok barang berkurang, jasa tidak punya sisa sama sekali', async () => {
  // Dua biskuit terjual dari sepuluh.
  if (!daftar.includes('Sisa 8')) throw new Error('stok biskuit tidak berkurang: ' + daftar)
  // Pembeda utama produk: jasa tidak pernah habis, jadi barisnya memang
  // tidak ada — bukan nol, bukan tanda hubung.
  if (/Potong celana[^|]*\|\s*Rp 30\.000\s*\|\s*Sisa/.test(daftar)) {
    throw new Error('jasa punya baris sisa stok: ' + daftar)
  }
})

await page.goto(BASE + '/')
await page.waitForTimeout(900)
const beranda = (await page.locator('main').innerText()).replace(/\n+/g, ' | ')

await step('penjualan langsung masuk pembukuan tanpa dicatat ulang', async () => {
  if (!beranda.includes('40.000')) throw new Error('beranda tanpa total hari ini: ' + beranda)
  if (!beranda.includes('1 struk')) throw new Error('beranda tanpa hitungan struk: ' + beranda)
})

// ── Lingkaran stok: kulakan menaikkan stok **dan** menurunkan kas ────────

await step('kulakan 20 biskuit @ 3.000', async () => {
  await page.goto(BASE + '/kulakan')
  await page.waitForTimeout(800)
  await page.locator('button', { hasText: 'Biskuit Uji' }).first().click()
  await page.waitForTimeout(300)
  await page.getByLabel('Jumlah').fill('20')
  await page.getByLabel(/Harga modal/).fill('3000')
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: /Simpan kulakan/ }).click()
  await page.waitForURL('**/stok', { timeout: 15000 })
  await page.waitForTimeout(900)
})

const stok = (await page.locator('main').innerText()).replace(/\n+/g, ' | ')

await step('stok naik 8 → 28', async () => {
  if (!stok.includes('28')) throw new Error('stok tidak naik setelah kulakan: ' + stok)
})

await page.goto(BASE + '/')
await page.waitForTimeout(900)
const berandaSetelahKulakan = (await page.locator('main').innerText()).replace(/\n+/g, ' | ')

await step('kulakan juga mengurangi uang di tangan, bukan cuma menambah stok', async () => {
  // 40.000 masuk − 60.000 kulakan = −20.000. Kalau kulakan hanya
  // menambah stok, "sisa" akan tetap 40.000 dan selamanya terlihat lebih
  // bagus daripada isi laci.
  if (!berandaSetelahKulakan.includes('60.000')) {
    throw new Error('kulakan tidak muncul sebagai uang keluar: ' + berandaSetelahKulakan)
  }
  // Tandanya di depan "Rp", bukan di depan angkanya: `-Rp 20.000`.
  if (!berandaSetelahKulakan.includes('-Rp 20.000')) {
    throw new Error('sisa bulan ini tidak ikut turun: ' + berandaSetelahKulakan)
  }
})

// ── Koreksi hitung fisik ─────────────────────────────────────────────────

await step('koreksi stok 28 → 25 setelah hitung fisik', async () => {
  await page.goto(BASE + '/stok')
  await page.waitForTimeout(800)
  await page.locator('a', { hasText: 'Biskuit Uji' }).first().click()
  await page.waitForURL('**/stok/**', { timeout: 15000 })
  await page.waitForTimeout(700)
  await page.getByLabel(/Jumlah sebenarnya/).fill('25')
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Simpan koreksi' }).click()
  await page.waitForTimeout(900)
})

const detail = (await page.locator('main').innerText()).replace(/\n+/g, ' | ')

await step('riwayat menjelaskan selisihnya, bukan cuma memperbaiki angkanya', async () => {
  if (!detail.includes('25 pcs')) throw new Error('stok tidak terkoreksi: ' + detail)
  // Tiga baris riwayat: terjual −2, kulakan +20, koreksi −3.
  for (const potongan of ['Terjual', 'Kulakan', 'Koreksi', '-3']) {
    if (!detail.includes(potongan)) {
      throw new Error('riwayat tanpa "' + potongan + '": ' + detail)
    }
  }
  // Yang disimpan adalah selisihnya, jadi penjumlahan riwayat harus tetap
  // sama dengan angka yang tampil — kalau tidak, layar memperingatkan.
  if (detail.includes('berbeda dari angka di atas')) {
    throw new Error('penjumlahan riwayat tidak cocok dengan stok tersimpan: ' + detail)
  }
})

console.log('\nSTRUK:\n' + struk.split('\n').map((l) => '  ' + l).join('\n'))
console.log('\nKATALOG :', daftar)
console.log('BERANDA :', beranda)
console.log('\ngalat/404:', errs.length ? JSON.stringify([...new Set(errs)], null, 2) : 'tidak ada')

await browser.close()
