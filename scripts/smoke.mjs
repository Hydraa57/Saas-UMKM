/**
 * Uji asap: menjalankan alur nyata di peramban sungguhan.
 *
 * Tes unit membuktikan perhitungannya benar; berkas ini membuktikan
 * aplikasinya benar-benar jalan. Keduanya menangkap hal yang berbeda —
 * dua bug UX pertama (pilihan buku hilang saat kembali dari mencatat,
 * dan ikon PWA yang tidak ada) lolos dari seluruh tes unit dan baru
 * ketahuan di sini.
 *
 * Yang diperiksa terakhir adalah yang paling penting bagi produk:
 * belanja rumah yang dibayar dari dompet yang sama **tidak** boleh
 * mengurangi untung usaha.
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

await step('buka beranda', async () => {
  await page.goto(BASE, { waitUntil: 'networkidle' }); await page.waitForTimeout(700)
})
await step('menuju pengaturan awal', async () => {
  await page.getByRole('link', { name: 'Mulai' }).click()
  await page.waitForURL('**/mulai')
})
await step('isi nama usaha', async () => {
  await page.getByPlaceholder('Warung Bu Ani').fill('Warung Uji')
  await page.waitForTimeout(300)
})
await step('tombol Mulai aktif', async () => {
  const b = page.getByRole('button', { name: 'Mulai', exact: true })
  if (await b.isDisabled()) throw new Error('tombol Mulai masih nonaktif')
  await b.click()
  await page.waitForURL(BASE + '/', { timeout: 15000 })
  await page.waitForTimeout(900)
})
await step('catat masuk 50.000', async () => {
  await page.goto(BASE + '/catat/masuk?buku=usaha'); await page.waitForTimeout(700)
  for (const d of ['5','0','0','0','0']) await page.getByRole('button', { name: d, exact: true }).click()
  const b = page.getByRole('button', { name: 'Simpan' })
  if (await b.isDisabled()) throw new Error('tombol Simpan nonaktif — nominal atau tenant belum siap')
  await b.click(); await page.waitForTimeout(800)
})
await step('catat belanja rumah 42.000', async () => {
  await page.goto(BASE + '/catat/keluar?buku=rumah'); await page.waitForTimeout(700)
  for (const d of ['4','2','0','0','0']) await page.getByRole('button', { name: d, exact: true }).click()
  await page.getByRole('button', { name: 'Belanja', exact: true }).click()
  await page.getByRole('button', { name: 'Simpan' }).click(); await page.waitForTimeout(800)
})

await page.goto(BASE + '/'); await page.waitForTimeout(900)
const kartu = async () => (await page.locator('section.kartu').first().innerText()).replace(/\n+/g, ' | ')
console.log('\nTAB awal :', await page.getByRole('tab', { selected: true }).textContent())
console.log('USAHA    :', await kartu())
await page.getByRole('tab', { name: 'Rumah Tangga' }).click(); await page.waitForTimeout(600)
console.log('RUMAH    :', await kartu())

await page.getByRole('link', { name: /Uang Keluar/ }).click(); await page.waitForTimeout(600)
const url = page.url()
await page.goto(BASE + '/'); await page.waitForTimeout(900)
console.log('\nURL catat dari tab rumah:', url.replace(BASE, ''))
console.log('TAB setelah kembali    :', await page.getByRole('tab', { selected: true }).textContent())
console.log('\ngalat/404:', errs.length ? JSON.stringify([...new Set(errs)], null, 2) : 'tidak ada')
await browser.close()
