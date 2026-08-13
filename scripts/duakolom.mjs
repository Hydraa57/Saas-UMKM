/**
 * Memeriksa daftar-plus-rincian di layar lebar.
 *
 * Yang paling mudah rusak di sini bukan tampilannya melainkan
 * **perilakunya di dua lebar sekaligus**: baris daftar tetap `<Link>` ke
 * halaman rinciannya — supaya menyalin tautan, membuka di tab baru, dan
 * tombol kembali peramban tetap bekerja — dan di layar lebar ketukannya
 * ditahan lalu digambar di sebelah.
 *
 * Kalau penahanannya bocor ke HP, orang kehilangan halaman struknya.
 * Kalau ia tidak jalan di laptop, dua kolomnya cuma hiasan. Karena itu
 * keduanya diperiksa dalam satu jalan.
 *
 * Pakai:
 *   npm run build && npx next start -p 3311 &
 *   node scripts/duakolom.mjs
 */
import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
const B = 'http://localhost:3311'
await mkdir('shots/lebar', { recursive: true })
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const cek = (n, ok) => { console.log(`  ${ok ? 'ok  ' : 'GAGAL'} ${n}`); if (!ok) process.exitCode = 1 }

async function siapkan(p) {
  await p.goto(B + '/masuk', { waitUntil: 'networkidle' })
  await p.evaluate(() => new Promise((ok, no) => {
    const m = indexedDB.open('ezura')
    m.onsuccess = () => { const t = m.result.transaction('meta','readwrite')
      t.objectStore('meta').put({ key: 'pernah_masuk', value: true })
      t.oncomplete = () => ok(1); t.onerror = () => no(t.error) }
    m.onerror = () => no(m.error)
  }))
  await p.goto(B + '/mulai', { waitUntil: 'networkidle' })
  await p.getByPlaceholder('Warung Bu Ani').fill('Warung Bu Ani')
  await p.getByRole('button', { name: 'Mulai', exact: true }).click()
  await p.waitForURL('**/katalog**', { timeout: 15000 })
  for (const [n, h, st] of [['Biskuit Roma','5000','24'],['Chitato','12000','6'],['Indomie Goreng','3500','40']]) {
    await p.goto(B + '/katalog/baru?jenis=barang'); await p.waitForTimeout(350)
    await p.getByPlaceholder('Biskuit Roma').fill(n)
    for (const d of h) await p.getByRole('button', { name: d, exact: true }).click()
    await p.getByLabel('Stok sekarang').fill(st)
    await p.getByRole('button', { name: 'Simpan', exact: true }).click()
    await p.waitForURL('**/katalog', { timeout: 15000 })
  }
  for (let i = 0; i < 2; i++) {
    await p.goto(B + '/kasir'); await p.waitForTimeout(700)
    await p.locator('.grid button', { hasText: 'Biskuit Roma' }).click()
    await p.getByRole('button', { name: /^Bayar/ }).click(); await p.waitForTimeout(400)
    await p.getByRole('button', { name: 'Uang pas' }).click()
    await p.getByRole('button', { name: /Selesai & cetak struk/ }).click()
    await p.waitForURL('**/struk/**', { timeout: 15000 })
  }
}

// ── Layar lebar: rinciannya muncul di sebelah, tanpa pindah halaman ──
const lebar = await b.newPage({ viewport: { width: 1440, height: 900 } })
await siapkan(lebar)

await lebar.goto(B + '/riwayat', { waitUntil: 'networkidle' }); await lebar.waitForTimeout(900)
let t = await lebar.locator('main').innerText()
cek('panel kanan mengajak memilih dulu', t.includes('Pilih satu struk'))
await lebar.locator('a[href^="/struk/"]').first().click()
await lebar.waitForTimeout(800)
cek('tidak pindah halaman', new URL(lebar.url()).pathname === '/riwayat')
t = await lebar.locator('main').innerText()
cek('struknya tergambar di panel kanan', t.includes('TOTAL') || t.includes('Subtotal'))
cek('daftarnya tetap ada di kiri', (await lebar.locator('a[href^="/struk/"]').count()) > 0)
await lebar.screenshot({ path: 'shots/lebar/riwayat.png' })

await lebar.goto(B + '/katalog?tab=stok', { waitUntil: 'networkidle' }); await lebar.waitForTimeout(900)
t = await lebar.locator('main').innerText()
cek('tab stok mengajak memilih', t.includes('Pilih satu barang'))
await lebar.locator('a[href^="/stok/"]').first().click(); await lebar.waitForTimeout(800)
cek('stok: tidak pindah halaman', new URL(lebar.url()).pathname === '/katalog')
t = await lebar.locator('main').innerText()
cek('rincian stok tergambar', t.includes('Koreksi dari hitung fisik'))
await lebar.screenshot({ path: 'shots/lebar/katalog-stok.png' })

// Tab "Daftar" sengaja tidak dua kolom — ia mengantar ke formulir ubah.
await lebar.goto(B + '/katalog', { waitUntil: 'networkidle' }); await lebar.waitForTimeout(800)
await lebar.locator('a[href^="/katalog/baru?id="]').first().click()
await lebar.waitForURL('**/katalog/baru**', { timeout: 15000 })
cek('tab Daftar tetap pindah ke formulir ubah', lebar.url().includes('/katalog/baru?id='))

// ── HP: harus tetap pindah halaman seperti biasa ──────────────────────
const hp = await b.newPage({ viewport: { width: 390, height: 844 } })
await siapkan(hp)
await hp.goto(B + '/riwayat', { waitUntil: 'networkidle' }); await hp.waitForTimeout(900)
await hp.locator('a[href^="/struk/"]').first().click()
await hp.waitForURL('**/struk/**', { timeout: 15000 })
cek('di HP tetap pindah ke halaman struk', new URL(hp.url()).pathname.startsWith('/struk/'))

await b.close()
