/**
 * Memeriksa penjagaan stok di peramban sungguhan.
 *
 * Aturannya dibalik atas permintaan pemiliknya: sebelumnya keranjang
 * boleh melewati stok dengan alasan bahwa hitungan di aplikasi sering
 * tertinggal dari isi rak. Yang terlihat pemiliknya bukan kelonggaran
 * melainkan kesalahan hitung — stok 2, terjual 3.
 *
 * Yang diuji bukan cuma penolakannya, melainkan **jalan keluarnya**:
 * yang paling sering terjadi bukan pembeli meminta lebih banyak dari
 * yang ada, melainkan angka stok yang tertinggal. Penolakan tanpa jalan
 * keluar akan membuat kasirnya ditinggalkan tepat saat ada pembeli.
 *
 * Pakai:
 *   npm run build && npx next start -p 3311 &
 *   node scripts/stok.mjs
 */
import { chromium } from '@playwright/test'
const B = 'http://localhost:3311'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const p = await b.newPage({ viewport: { width: 390, height: 844 } })
const cek = (n, ok) => console.log(`  ${ok ? 'ok  ' : 'GAGAL'} ${n}`)

await p.goto(B + '/masuk', { waitUntil: 'networkidle' })
await p.evaluate(() => new Promise((ok, no) => {
  const m = indexedDB.open('ezura')
  m.onsuccess = () => { const t = m.result.transaction('meta','readwrite')
    t.objectStore('meta').put({ key: 'pernah_masuk', value: true })
    t.oncomplete = () => ok(1); t.onerror = () => no(t.error) }
  m.onerror = () => no(m.error)
}))
await p.goto(B + '/mulai', { waitUntil: 'networkidle' })
await p.getByPlaceholder('Warung Bu Ani').fill('Warung Uji')
await p.getByRole('button', { name: 'Mulai', exact: true }).click()
await p.waitForURL('**/katalog**', { timeout: 15000 })

// Satu barang, stok 2.
await p.goto(B + '/katalog/baru?jenis=barang')
await p.waitForTimeout(500)
await p.getByPlaceholder('Biskuit Roma').fill('Biskuit Uji')
for (const d of '5000') await p.getByRole('button', { name: d, exact: true }).click()
await p.getByLabel('Stok sekarang').fill('2')
await p.getByRole('button', { name: 'Simpan', exact: true }).click()
await p.waitForURL('**/katalog', { timeout: 15000 })

// Satu jasa, untuk memastikan jasa tidak ikut dibatasi.
await p.goto(B + '/katalog/baru?jenis=jasa')
await p.waitForTimeout(500)
await p.getByPlaceholder('Potong celana').fill('Vermak')
for (const d of '25000') await p.getByRole('button', { name: d, exact: true }).click()
await p.getByRole('button', { name: 'Simpan', exact: true }).click()
await p.waitForURL('**/katalog', { timeout: 15000 })

await p.goto(B + '/kasir', { waitUntil: 'networkidle' })
await p.waitForTimeout(900)
const petak = p.locator('.grid button', { hasText: 'Biskuit Uji' })
await petak.click(); await p.waitForTimeout(200)
await petak.click(); await p.waitForTimeout(400)

let layar = await p.locator('main').innerText()
cek('dua ketukan pertama diterima', layar.includes('Biskuit Uji'))
cek('belum ada penolakan pada ketukan kedua', !layar.includes('tidak mencukupi'))

// Ketukan ketiga: harus ditolak.
await petak.click(); await p.waitForTimeout(500)
layar = await p.locator('main').innerText()
cek('ketukan ketiga ditolak', layar.includes('Stok Biskuit Uji tidak mencukupi'))
cek('penolakannya menyebut sisanya', layar.includes('tinggal 2'))
cek('ada jalan keluar ke koreksi stok', await p.getByRole('link', { name: 'Perbarui stok' }).isVisible())

// Dan keranjangnya benar-benar tidak bertambah.
// Dibaca dari totalnya, bukan dari angka jumlah yang bentuknya bisa
// berubah: 2 x Rp 5.000 = Rp 10.000, dan kalau ketukan ketiga lolos
// angkanya akan jadi Rp 15.000.
const total = (await p.locator('main').innerText()).includes('Rp 10.000')
cek('keranjangnya tetap Rp 10.000, bukan Rp 15.000', total)

// Tombol + di baris keranjang ikut mati.
const plus = p.getByRole('button', { name: 'Tambah Biskuit Uji' })
cek('tombol + di keranjang mati', await plus.isDisabled())

// Jasa tidak dibatasi.
await p.getByRole('button', { name: 'Tutup' }).click()
await p.waitForTimeout(300)
const jasa = p.locator('.grid button', { hasText: 'Vermak' })
for (let i = 0; i < 5; i++) { await jasa.click(); await p.waitForTimeout(120) }
layar = await p.locator('main').innerText()
cek('jasa boleh ditambah berkali-kali', !layar.includes('Vermak tidak mencukupi'))

// Jalan keluarnya benar-benar mengantar ke layar koreksi.
await petak.click(); await p.waitForTimeout(400)
await p.getByRole('link', { name: 'Perbarui stok' }).click()
await p.waitForURL('**/stok/**', { timeout: 15000 })
// Halamannya membaca Dexie sesudah berpindah, jadi isinya menyusul
// beberapa saat setelah URL-nya berubah.
await p.getByText('Sisa menurut aplikasi').waitFor({ timeout: 15000 })
cek('tautannya mengantar ke layar stok barang itu',
    (await p.locator('main').innerText()).includes('Biskuit Uji'))

await b.close()
