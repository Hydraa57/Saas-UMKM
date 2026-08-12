/**
 * Memeriksa pemasangan ke layar depan, di peramban sungguhan.
 *
 * Dua hal yang tidak bisa diuji dengan tes unit, dan keduanya diam
 * kalau rusak:
 *
 * 1. **Service worker terdaftar pada layar apa pun yang dibuka lebih
 *    dulu.** Sebelumnya pendaftarannya menumpang di komponen beranda,
 *    padahal alur pertama di HP baru tidak lewat sana: gerbang → masuk →
 *    pengaturan awal → katalog. Gejalanya baru muncul saat sinyal hilang
 *    dan aplikasinya tidak mau terbuka — jauh sesudah penyebabnya.
 *    Karena itu penyemaian di berkas ini sengaja **tidak** lewat
 *    beranda: kalau beranda dibuka lebih dulu, kode versi lama pun lulus,
 *    dan pemeriksaannya tidak membuktikan apa-apa.
 *
 * 2. **Rantai penangkap ajakan pasang.** `beforeinstallprompt` dipicu
 *    peramban sekali, sangat awal, dan hilang kalau tidak ada yang
 *    mendengarkan. Peramban tanpa kepala tidak memicunya sendiri, jadi
 *    peristiwanya dibuat di sini — yang diuji penangkapnya, penyimpanan
 *    penutupannya, dan jalan keduanya di Pengaturan.
 *
 * Pakai:
 *   npm run build && npx next start -p 3311 &
 *   node scripts/pasang.mjs
 */
import { chromium } from '@playwright/test'
const B = 'http://localhost:3311'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
const p = await ctx.newPage()

const cek = (n, ok) => console.log(`  ${ok ? 'ok  ' : 'GAGAL'} ${n}`)

await p.goto(B + '/masuk', { waitUntil: 'networkidle' })
await p.evaluate(() => new Promise((ok, no) => {
  const m = indexedDB.open('ezura')
  m.onsuccess = () => { const t = m.result.transaction('meta','readwrite')
    t.objectStore('meta').put({ key: 'pernah_masuk', value: true })
    t.oncomplete = () => ok(1); t.onerror = () => no(t.error) }
  m.onerror = () => no(m.error)
}))

// ── Service worker harus terdaftar walau beranda tidak pernah dibuka ──
// Ini alur pertama yang sebenarnya di HP baru: gerbang → masuk →
// pengaturan awal → katalog. Beranda tidak dilewati sama sekali.
await p.goto(B + '/mulai', { waitUntil: 'networkidle' })
await p.getByPlaceholder('Warung Bu Ani').fill('Warung Uji')
await p.getByRole('button', { name: 'Mulai', exact: true }).click()
await p.waitForURL('**/katalog**', { timeout: 15000 })
await p.waitForTimeout(2500)
const sw = await p.evaluate(async () => {
  const r = await navigator.serviceWorker.getRegistrations()
  return r.map((x) => x.active?.scriptURL ?? x.installing?.scriptURL ?? '?')
})
cek('service worker terdaftar tanpa pernah membuka beranda: ' + JSON.stringify(sw), sw.length > 0)

// ── Ajakan pasang ──
// Peramban tanpa kepala tidak memicu `beforeinstallprompt` sendiri, jadi
// peristiwanya dibuat. Yang diuji rantai penangkapnya: skrip di <head>
// menahan ajakan bawaan, menyimpannya, dan memberitahu React.
await p.goto(B + '/', { waitUntil: 'networkidle' })
await p.waitForTimeout(900)
const sebelum = await p.locator('main').innerText()
cek('ajakan belum muncul selama peramban belum menawarkan', !sebelum.includes('Pasang di layar depan'))

await p.evaluate(() => {
  const e = new Event('beforeinstallprompt')
  e.prompt = async () => { window.__dipanggil = true }
  e.userChoice = Promise.resolve({ outcome: 'accepted' })
  window.dispatchEvent(e)
})
await p.waitForTimeout(600)
const sesudah = await p.locator('main').innerText()
cek('ajakan muncul begitu peramban menawarkan', sesudah.includes('Pasang di layar depan'))

// Menekannya harus benar-benar memanggil ajakan peramban, bukan cuma
// mengubah tampilan.
await p.getByRole('button', { name: 'Pasang sekarang' }).click()
await p.waitForTimeout(600)
cek('tombolnya memanggil ajakan peramban', await p.evaluate(() => window.__dipanggil === true))
cek('ajakan hilang sesudah dipasang', !(await p.locator('main').innerText()).includes('Pasang di layar depan'))

// ── Penutupan diingat ──
const p2 = await ctx.newPage()
await p2.goto(B + '/', { waitUntil: 'networkidle' })
await p2.waitForTimeout(700)
await p2.evaluate(() => {
  const e = new Event('beforeinstallprompt')
  e.prompt = async () => {}
  e.userChoice = Promise.resolve({ outcome: 'dismissed' })
  window.dispatchEvent(e)
})
await p2.waitForTimeout(500)
await p2.getByRole('button', { name: 'Tutup ajakan pasang' }).click()
await p2.waitForTimeout(400)
cek('ajakan hilang saat ditutup', !(await p2.locator('main').innerText()).includes('Pasang di layar depan'))

await p2.reload({ waitUntil: 'networkidle' })
await p2.waitForTimeout(700)
await p2.evaluate(() => {
  const e = new Event('beforeinstallprompt')
  e.prompt = async () => {}
  e.userChoice = Promise.resolve({ outcome: 'dismissed' })
  window.dispatchEvent(e)
})
await p2.waitForTimeout(500)
cek('penutupannya diingat sesudah dimuat ulang',
    !(await p2.locator('main').innerText()).includes('Pasang di layar depan'))

// ── Jalan kedua di Pengaturan tetap ada walau kartunya ditutup ──
await p2.goto(B + '/pengaturan', { waitUntil: 'networkidle' })
await p2.waitForTimeout(800)
await p2.evaluate(() => {
  const e = new Event('beforeinstallprompt')
  e.prompt = async () => { window.__dipanggil2 = true }
  e.userChoice = Promise.resolve({ outcome: 'accepted' })
  window.dispatchEvent(e)
})
await p2.waitForTimeout(500)
const set = await p2.locator('main').innerText()
cek('Pengaturan tetap menawarkan pemasangan walau kartunya ditutup',
    set.includes('Aplikasi di layar depan') && set.includes('Pasang sekarang'))

await b.close()
