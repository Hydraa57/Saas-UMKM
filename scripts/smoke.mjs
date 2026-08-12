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
import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = 'http://localhost:3311'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
// `deviceScaleFactor: 3` menyamai HP Android kelas menengah, dan itu
// bukan hiasan: langkah yang memindai balik QR di layar membaca piksel
// sungguhan, dan pada DPR 1 hasilnya lebih kasar daripada yang akan
// dilihat kamera pembeli mana pun. Uji yang lebih buruk dari kenyataan
// menolak rancangan yang sebenarnya baik.
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
})
const BERKAS_EKSPOR = join(mkdtempSync(join(tmpdir(), 'ezura-')), 'ekspor.xlsx')
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))
// Satu alamat sengaja dikecualikan: uji "halaman yang tidak ada" memang
// harus meminta halaman yang tidak ada, dan 404-nya justru yang benar.
const PROBE_404 = '/halaman-yang-tidak-pernah-ada'
page.on('response', (r) => {
  if (r.status() === 404 && !r.url().includes(PROBE_404)) errs.push('404 ' + r.url())
})

const step = async (label, fn) => {
  try { await fn(); console.log('  ok  ' + label) }
  catch (e) { console.log('  GAGAL  ' + label + ' — ' + String(e).split('\n')[0]); throw e }
}

const ketik = async (angka) => {
  for (const d of String(angka)) {
    await page.getByRole('button', { name: d, exact: true }).click()
  }
}

await step('gerbang menahan aplikasi sebelum ada akun', async () => {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(900)

  const layar = (await page.locator('main').innerText()).replace(/\n+/g, ' | ')
  if (!layar.includes('Buat akun dulu')) {
    throw new Error('gerbang tidak menahan: ' + layar)
  }
  // Dan bilah navigasinya ikut tidak ada. Menu yang terlihat di balik
  // gerbang mengantar ke layar kosong, dan itu lebih buruk daripada menu
  // yang belum muncul.
  if ((await page.getByRole('navigation', { name: 'Navigasi utama' }).count()) !== 0) {
    throw new Error('bilah navigasi tergambar padahal gerbangnya tertutup')
  }
})

await step('sesudah ada akun, gerbangnya terbuka', async () => {
  // Login sungguhan tidak bisa dilakukan dari sini — peladen tidak
  // terjangkau. Yang ditulis adalah **keadaan lokal yang persis
  // dihasilkan login berhasil**, jadi yang diuji tetap perilaku
  // gerbangnya, bukan jalan pintas yang cuma ada di pengujian.
  await page.evaluate(
    () =>
      new Promise((selesai, gagal) => {
        const minta = indexedDB.open('ezura')
        minta.onsuccess = () => {
          const basis = minta.result
          const tx = basis.transaction('meta', 'readwrite')
          tx.objectStore('meta').put({ key: 'pernah_masuk', value: true })
          tx.oncomplete = () => selesai(undefined)
          tx.onerror = () => gagal(tx.error)
        }
        minta.onerror = () => gagal(minta.error)
      }),
  )
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(900)

  // Diperiksa lewat **hilangnya** ajakan mendaftar, bukan lewat munculnya
  // tombol "Mulai": layar gerbang punya tombol bernama sama, jadi
  // memeriksa "Mulai" akan lulus walau gerbangnya masih tertutup.
  const layar = (await page.locator('main').innerText()).replace(/\n+/g, ' | ')
  if (layar.includes('Buat akun dulu')) {
    throw new Error('gerbang masih tertutup: ' + layar)
  }
  if (!layar.includes('Mulai')) throw new Error('layar pembuka tidak muncul: ' + layar)
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
  await page.getByRole('link', { name: 'Tambah barang' }).click()
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
  await page.getByRole('link', { name: 'Tambah jasa' }).click()
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
  // Beranda memisahkan label dan angkanya sejak rancangannya diperbarui.
  if (!/Struk \| 1\b/.test(beranda)) {
    throw new Error('beranda tanpa hitungan struk: ' + beranda)
  }
})

await step('peringatan cadangan muncul selama belum masuk akun', async () => {
  // Kehilangan HP adalah satu-satunya cara seluruh isi aplikasi lenyap
  // sekaligus, dan pengguna tidak punya cara lain mengetahuinya.
  if (!beranda.includes('Belum dicadangkan')) {
    throw new Error('peringatan cadangan tidak muncul: ' + beranda)
  }
})

await step('peladen tak terjangkau tidak menghentikan apa pun', async () => {
  // Supabase sudah dikonfigurasi di .env.local tapi tidak bisa dihubungi
  // dari sini. Itu justru keadaan yang harus diuji: seluruh langkah di
  // atas berhasil, dan tidak ada satu pun galat halaman.
  await page.goto(BASE + '/masuk')
  await page.waitForTimeout(900)
  const layar = await page.locator('main').innerText()
  if (!layar.includes('Catatan ini baru ada di HP ini')) {
    throw new Error('layar cadangan tidak menampilkan keadaan yang benar: ' + layar)
  }
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
  await page.waitForURL('**/katalog?tab=stok', { timeout: 15000 })
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
  // Petak masuk/keluar di beranda memakai bentuk ringkas (`Rp 60rb`);
  // angka penuhnya ada di "Sisa bulan ini" dan "Uang di tangan".
  if (!berandaSetelahKulakan.includes('KELUAR | Rp 60rb')) {
    throw new Error('kulakan tidak muncul sebagai uang keluar: ' + berandaSetelahKulakan)
  }
  // Tandanya di depan "Rp", bukan di depan angkanya: `-Rp 20.000`.
  if (!berandaSetelahKulakan.includes('-Rp 20.000')) {
    throw new Error('sisa bulan ini tidak ikut turun: ' + berandaSetelahKulakan)
  }
})

// ── Koreksi hitung fisik ─────────────────────────────────────────────────

await step('koreksi stok 28 → 25 setelah hitung fisik', async () => {
  await page.goto(BASE + '/katalog?tab=stok')
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

// ── Piutang: struk kurang bayar → tagih → lunas ─────────────────────────

await step('jual berutang atas nama Bu Tetangga', async () => {
  await page.goto(BASE + '/kasir')
  await page.waitForTimeout(800)
  await page.locator('.grid button', { hasText: 'Biskuit Uji' }).click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: /^Bayar/ }).click()
  await page.waitForTimeout(400)
  // Nol dibayar: seluruhnya jadi piutang. Nominalnya sudah terisi penuh
  // (5.000), jadi perlu empat kali hapus untuk sampai ke nol.
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: 'Hapus satu angka' }).click()
  }
  await page.waitForTimeout(300)
  await page.getByPlaceholder('Bu Tetangga').fill('Bu Tetangga')
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: /Simpan sebagai utang/ }).click()
  await page.waitForURL('**/struk/**', { timeout: 15000 })
  await page.waitForTimeout(800)
})

// Dicatat di sini, bukan saat laporannya diperiksa: struk inilah
// satu-satunya yang selamat sampai akhir (yang pertama dibatalkan), jadi
// jam ramai di laporan harus persis jam ini. Membaca jamnya di akhir uji
// akan meleset kalau uji ini kebetulan melewati pergantian jam.
const jamJualWib = new Date().toLocaleString('en-GB', {
  timeZone: 'Asia/Jakarta',
  hour: '2-digit',
  hourCycle: 'h23',
})

await page.goto(BASE + '/utang')
await page.waitForTimeout(900)
const utang = (await page.locator('main').innerText()).replace(/\n+/g, ' | ')

await step('piutang lahir sendiri dari struk, tanpa dicatat terpisah', async () => {
  if (!utang.includes('Bu Tetangga')) throw new Error('piutang tidak muncul: ' + utang)
  if (!utang.includes('Rp 5.000')) throw new Error('sisa piutang salah: ' + utang)
})

await step('terima pelunasan', async () => {
  await page.getByRole('button', { name: /Bu Tetangga/ }).click()
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: 'Terima pembayaran' }).click()
  await page.waitForTimeout(900)
})

const utangSetelah = (await page.locator('main').innerText()).replace(/\n+/g, ' | ')

await step('yang lunas hilang dari daftar tagihan', async () => {
  if (!utangSetelah.includes('Tidak ada yang berutang')) {
    throw new Error('piutang tidak lunas: ' + utangSetelah)
  }
})

// ── Pembatalan struk: stok kembali, uang ditarik ────────────────────────

await page.goto(BASE + '/riwayat')
await page.waitForTimeout(900)
const riwayat = (await page.locator('main').innerText()).replace(/\n+/g, ' | ')

await step('riwayat memuat kedua struk', async () => {
  for (const potongan of ['2026-0001', '2026-0002', 'Bu Tetangga']) {
    if (!riwayat.includes(potongan)) {
      throw new Error('riwayat tanpa "' + potongan + '": ' + riwayat)
    }
  }
})

await step('batalkan struk pertama', async () => {
  await page.locator('a', { hasText: '2026-0001' }).first().click()
  await page.waitForURL('**/struk/**', { timeout: 15000 })
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: 'Batalkan struk' }).click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Ya, batalkan' }).click()
  await page.waitForTimeout(900)
})

const strukBatal = (await page.locator('main').innerText()).replace(/\n+/g, ' | ')

await step('struk ditandai batal, bukan hilang', async () => {
  if (!strukBatal.includes('Struk dibatalkan')) {
    throw new Error('struk tidak ditandai batal: ' + strukBatal)
  }
  // Barisnya harus tetap terbaca: riwayat yang hilang tidak bisa diperiksa.
  if (!strukBatal.includes('Biskuit Uji')) {
    throw new Error('isi struk hilang setelah dibatalkan: ' + strukBatal)
  }
})

await page.goto(BASE + '/katalog?tab=stok')
await page.waitForTimeout(900)
await page.locator('a', { hasText: 'Biskuit Uji' }).first().click()
await page.waitForURL('**/stok/**', { timeout: 15000 })
await page.waitForTimeout(800)
const stokSetelahBatal = (await page.locator('main').innerText()).replace(/\n+/g, ' | ')

await step('pembatalan mengembalikan stok lewat retur, dan riwayat tetap cocok', async () => {
  // 25 setelah koreksi, −1 struk berutang, +2 retur dari struk yang dibatalkan.
  if (!stokSetelahBatal.includes('26 pcs')) {
    throw new Error('stok tidak kembali setelah pembatalan: ' + stokSetelahBatal)
  }
  if (!stokSetelahBatal.includes('Retur')) {
    throw new Error('pembatalan tidak meninggalkan mutasi retur: ' + stokSetelahBatal)
  }
  if (stokSetelahBatal.includes('berbeda dari angka di atas')) {
    throw new Error('penjumlahan riwayat meleset setelah pembatalan: ' + stokSetelahBatal)
  }
})

await page.goto(BASE + '/')
await page.waitForTimeout(900)
const berandaAkhir = (await page.locator('main').innerText()).replace(/\n+/g, ' | ')

await step('uang dari struk yang dibatalkan ditarik dari buku kas', async () => {
  // 40.000 masuk + 5.000 pelunasan − 60.000 kulakan − 40.000 pembatalan
  // = −55.000. Kalau pembatalan cuma menandai struknya, angkanya tetap
  // −15.000 dan laci tidak akan pernah cocok lagi.
  if (!berandaAkhir.includes('-Rp 55.000')) {
    throw new Error('pembatalan tidak menarik uangnya: ' + berandaAkhir)
  }
})

// ── Laporan ─────────────────────────────────────────────────────────────

await step('beranda mengantar ke laporan lewat angka bulan ini', async () => {
  await page.getByRole('link', { name: /Lihat laporan lengkap/ }).click()
  await page.waitForURL('**/laporan', { timeout: 15000 })
  await page.waitForTimeout(900)
})

const laporan = (await page.locator('main').innerText()).replace(/\n+/g, ' | ')

await step('buku kas di laporan sama persis dengan yang di beranda', async () => {
  // Dua layar yang menampilkan angka berbeda untuk hal yang sama adalah
  // cara tercepat kehilangan kepercayaan pada aplikasi uang.
  if (!laporan.includes('-Rp 55.000')) {
    throw new Error('sisa buku kas di laporan meleset: ' + laporan)
  }
})

await step('untung dagangan dihitung terpisah dari isi laci', async () => {
  // Keadaan akhir uji ini kebetulan justru kasus yang membuat kedua
  // kartu itu harus dipisah: kasnya minus 55.000 karena kulakan 60.000,
  // padahal dagangan yang benar-benar laku untung 2.000.
  //
  // Struk pertama sudah dibatalkan, jadi yang tersisa satu biskuit
  // seharga 5.000 dengan modal 3.000 — modalnya dari kulakan tadi,
  // bukan dari harga katalog hari ini.
  // Label petaknya dikapitalkan lewat CSS, jadi `innerText` membacanya
  // sebagai OMZET — bukan seperti yang tertulis di berkas sumbernya.
  if (!/OMZET \| Rp 5\.000/.test(laporan)) {
    throw new Error('omzet penjualan salah: ' + laporan)
  }
  if (!/MODAL BARANG \| Rp 3\.000/.test(laporan)) {
    throw new Error('modal barang salah: ' + laporan)
  }
  if (!/Untung kotor \| 40% dari omzet \| Rp 2\.000/.test(laporan)) {
    throw new Error('untung kotor salah: ' + laporan)
  }
  // Kalau struk yang dibatalkan ikut dihitung, omzetnya jadi 45.000 —
  // dan pemeriksaan di atas sudah menangkap itu. Yang tidak tertangkap
  // oleh angka: jasa 30.000 dari struk itu tetap sah punya baris di
  // buku kas, jadi keberadaannya di daftar terlaris yang jadi buktinya.
})

await step('yang sudah dilunasi tidak ditagih lagi di laporan', async () => {
  // Satu-satunya struk yang tersisa dijual berutang penuh — `paid`-nya
  // nol dan akan tetap nol selamanya, karena pelunasannya tercatat di
  // daftar utang, bukan di struknya. Menghitung sisa tagihan dari
  // `total − paid` membuat baris ini muncul terus meski Bu Tetangga
  // sudah membayar; itu persis yang sempat terjadi dan baru ketahuan di
  // sini, bukan di tes unit.
  //
  // Bukan asersi kosong: kartu "Dari penjualan" jelas tampil (lihat
  // langkah di atas), jadi kalau perhitungannya kembali ke cara lama,
  // barisnya pasti ikut tampil.
  if (laporan.includes('belum dibayar')) {
    throw new Error('utang yang sudah lunas masih ditagih di laporan: ' + laporan)
  }
})

await step('barang paling laku muncul dengan jumlah potongnya', async () => {
  if (!/Paling laku bulan ini \| 1 \| Biskuit Uji/.test(laporan)) {
    throw new Error('daftar terlaris kosong atau salah urut: ' + laporan)
  }
  // Jasa dari struk yang dibatalkan tidak pernah benar-benar laku.
  if (laporan.includes('Potong celana')) {
    throw new Error('barang dari struk batal masuk daftar terlaris: ' + laporan)
  }
})

await step('bagian jam ramai menahan diri selama belum ada sebarannya', async () => {
  // Seluruh struk uji ini jatuh di satu jam yang sama, dan pada keadaan
  // itu "paling ramai jam sekian" cuma mengulang satu-satunya jam yang
  // ada — sambil menggambar satu balok penuh selebar layar yang tidak
  // membandingkan apa pun. Hari pertama pemakaian nyata bentuknya persis
  // begini.
  //
  // Ketepatan jamnya sendiri diuji di `laporan.test.ts`; yang diperiksa
  // di sini adalah keputusan untuk tidak menampilkannya.
  if (laporan.includes('Jam paling ramai')) {
    throw new Error(
      `bagian jam ramai muncul padahal semua struk di jam ${jamJualWib}: ${laporan}`,
    )
  }
})

// ── Ekspor ──────────────────────────────────────────────────────────────

await step('tombol ekspor benar-benar menurunkan berkas', async () => {
  const menunggu = page.waitForEvent('download', { timeout: 30000 })
  await page.getByRole('button', { name: 'Unduh semua ke Excel' }).click()
  const unduhan = await menunggu
  await unduhan.saveAs(BERKAS_EKSPOR)

  // Nama berkasnya membawa nama usaha dan tanggal, supaya dua unduhan
  // tidak saling menimpa di folder Unduhan.
  const nama = unduhan.suggestedFilename()
  if (!/^Ezura - Warung Uji - \d{4}-\d{2}-\d{2}\.xlsx$/.test(nama)) {
    throw new Error('nama berkas ekspor tidak sesuai: ' + nama)
  }
})

await step('berkasnya dibuka pembaca xlsx di luar aplikasi ini', async () => {
  // Ini pemeriksaan yang paling berarti dari seluruh berkas ini.
  // Penyandi `.xlsx` di repo ini ditulis sendiri, dan seluruh tes
  // unitnya membaca hasilnya dengan kode dari repo ini juga — yang
  // membuktikan ia konsisten dengan dirinya sendiri, bukan bahwa Excel
  // mau membukanya. Di sini berkasnya lahir dari peramban sungguhan dan
  // diserahkan ke `openpyxl`, yang tidak tahu apa pun tentang kode ini.
  //
  // Dilewati kalau `openpyxl` tidak terpasang: yang tidak bisa
  // dijalankan tidak boleh menyamar jadi keberhasilan, jadi pelewatannya
  // dicetak.
  const ada = spawnSync('python3', ['-c', 'import openpyxl'])
  if (ada.status !== 0) {
    console.log('       (dilewati: openpyxl tidak terpasang)')
    return
  }

  const skrip = `
import json, sys, warnings, openpyxl
warnings.simplefilter("error")
wb = openpyxl.load_workbook(sys.argv[1])
ws = wb["Rekap bulanan"]
print(json.dumps({
    "lembar": wb.sheetnames,
    "rekap": [list(r) for r in ws.iter_rows(values_only=True)],
    "katalog": [list(r) for r in wb["Barang & jasa"].iter_rows(values_only=True)],
}))
`
  const hasil = spawnSync('python3', ['-W', 'error', '-c', skrip, BERKAS_EKSPOR], {
    encoding: 'utf8',
  })
  if (hasil.status !== 0) {
    throw new Error('openpyxl menolak berkasnya: ' + (hasil.stderr || '').trim())
  }

  const isi = JSON.parse(hasil.stdout)
  const lembarWajib = [
    'Rekap bulanan',
    'Penjualan',
    'Buku kas',
    'Barang & jasa',
    'Utang & piutang',
    'Pergerakan stok',
  ]
  for (const l of lembarWajib) {
    if (!isi.lembar.includes(l)) {
      throw new Error(`lembar "${l}" hilang: ${JSON.stringify(isi.lembar)}`)
    }
  }

  // Angkanya harus sampai sebagai angka, bukan teks — itu satu-satunya
  // alasan mengekspor ke Excel alih-alih ke teks biasa.
  const agustus = isi.rekap.find((r) => r[0] === 'Agustus 2026')
  if (!agustus) throw new Error('baris Agustus tidak ada: ' + JSON.stringify(isi.rekap))
  if (agustus[3] !== -55000) {
    throw new Error('sisa bulan di berkas ekspor meleset: ' + JSON.stringify(agustus))
  }

  // Jasa tidak punya sisa stok, dan selnya harus **kosong** — bukan nol.
  // Ini pembeda utama produknya, dan berkas ekspor adalah perjalanan
  // terpanjang yang harus dilaluinya.
  const jasa = isi.katalog.find((r) => r[1] === 'Potong celana')
  const barang = isi.katalog.find((r) => r[1] === 'Biskuit Uji')
  if (!jasa || !barang) {
    throw new Error('katalog tidak lengkap di berkas ekspor: ' + JSON.stringify(isi.katalog))
  }
  if (jasa[5] !== null) {
    throw new Error('jasa punya angka sisa stok di berkas ekspor: ' + JSON.stringify(jasa))
  }
  if (barang[5] !== 26) {
    throw new Error('sisa stok barang meleset di berkas ekspor: ' + JSON.stringify(barang))
  }
})

// ── QRIS ────────────────────────────────────────────────────────────────

// Muatan QRIS statis untuk uji. Susunan dan CRC-nya dihitung di luar kode
// aplikasi (lihat `payload.test.ts`), jadi kalau penyisipan nominalnya
// keliru, hasilnya tidak akan cocok dengan apa pun.
const QRIS_STATIS =
  '00020101021126430014ID.CO.QRIS.WWW0215ID1024300000000303UMI5204549953033605802ID5913WARUNG BU ANI6007BANDUNG61054012363041459'

await step('pasang QRIS usaha dengan menempel kodenya', async () => {
  // Kamera tidak ada di peramban tanpa kepala, dan itu bukan alasan
  // melewatkan alurnya: jalan tempel memang ada justru untuk keadaan
  // ketika pindai tidak bisa dipakai.
  await page.goto(BASE + '/qris')
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: 'Tempel kodenya sebagai teks' }).click()
  await page.waitForTimeout(300)
  await page.getByLabel('Kode QRIS').fill(QRIS_STATIS)
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: 'Baca kode ini' }).click()
  await page.waitForTimeout(600)
})

await step('nama merchant ditampilkan sebelum disimpan', async () => {
  // Satu-satunya kesempatan menangkap kode yang salah. Sesudah disimpan,
  // yang salah akan ditunjukkan ke pembeli tanpa ada yang curiga.
  const layar = (await page.locator('main').innerText()).replace(/\n+/g, ' | ')
  if (!layar.includes('WARUNG BU ANI')) {
    throw new Error('nama merchant tidak ditampilkan: ' + layar)
  }
  await page.getByRole('button', { name: 'Ya, simpan' }).click()
  await page.waitForTimeout(700)
})

await step('kode QRIS muncul sendiri begitu cara bayar dipilih', async () => {
  await page.goto(BASE + '/kasir')
  await page.waitForTimeout(800)
  await page.locator('.grid button', { hasText: 'Biskuit Uji' }).click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: /^Bayar/ }).click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'QRIS', exact: true }).click()
  // Penggambar QR dimuat saat dibutuhkan, jadi perlu jeda sedikit.
  await page.waitForSelector('#qris-qr svg', { timeout: 15000 })
  await page.waitForTimeout(600)

  const layar = (await page.locator('main').innerText()).replace(/\n+/g, ' | ')
  // Memilih QRIS berarti membayar pas: nominalnya terisi sendiri.
  if (!layar.includes('Pembeli memindai ini') || !layar.includes('Rp 5.000')) {
    throw new Error('kartu QRIS tidak muncul dengan nominalnya: ' + layar)
  }
  if (!layar.includes('Nominalnya sudah terisi')) {
    throw new Error('nominal gagal disisipkan ke kodenya: ' + layar)
  }
})

await step('QR yang tergambar benar-benar berisi QRIS dengan nominalnya', async () => {
  // Pemeriksaan yang paling berarti dari seluruh fitur ini: bukan
  // memeriksa string di memori, melainkan **piksel yang akan dilihat
  // kamera pembeli.** Gambarnya difoto dari halaman, disandi balik jadi
  // teks, lalu isinya dibongkar. Kalau ada satu langkah antara muatan dan
  // layar yang keliru — penyandi QR, ukuran, warna, apa pun — tempat
  // inilah yang menangkapnya.
  // Digeser ke tengah dulu, seperti yang dilakukan kartunya sendiri saat
  // dipakai. Tanpa itu Playwright menggulir seperlunya saja dan bagian
  // bawah kodenya berhenti tepat di balik bilah tombol.
  await page.locator('#qris-qr').scrollIntoViewIfNeeded()
  await page.evaluate(() =>
    document.querySelector('#qris-qr')?.scrollIntoView({ block: 'center' }),
  )
  await page.waitForTimeout(400)
  const gambar = await page.locator('#qris-qr').screenshot()

  const { PNG } = await import('pngjs')
  const jsQRmod = await import('jsqr')
  const jsQR = jsQRmod.default ?? jsQRmod

  const png = PNG.sync.read(gambar)
  const kode = jsQR(new Uint8ClampedArray(png.data), png.width, png.height)
  if (!kode) throw new Error('QR di layar tidak bisa dipindai balik')

  const muatan = kode.data
  if (muatan === QRIS_STATIS) {
    throw new Error('yang tergambar masih kode statis, nominalnya tidak disisipkan')
  }

  // Bongkar TLV-nya di sini juga, tanpa memakai kode aplikasi.
  const ruas = {}
  for (let i = 0; i < muatan.length; ) {
    const tag = muatan.slice(i, i + 2)
    const panjang = Number(muatan.slice(i + 2, i + 4))
    ruas[tag] = muatan.slice(i + 4, i + 4 + panjang)
    i += 4 + panjang
  }

  if (ruas['54'] !== '5000') {
    throw new Error('nominal di dalam QR salah: ' + JSON.stringify(ruas['54']))
  }
  if (ruas['01'] !== '12') {
    throw new Error('kode tidak ditandai sekali pakai: ' + JSON.stringify(ruas['01']))
  }
  // Data merchant tidak boleh tergeser sedikit pun — uangnya bisa
  // mendarat di tempat lain.
  if (ruas['26'] !== '0014ID.CO.QRIS.WWW0215ID1024300000000303UMI') {
    throw new Error('data merchant berubah: ' + JSON.stringify(ruas['26']))
  }
  if (ruas['59'] !== 'WARUNG BU ANI') {
    throw new Error('nama merchant berubah: ' + JSON.stringify(ruas['59']))
  }
})

await step('penjualan lewat QRIS tercatat sebagai lunas', async () => {
  await page.getByRole('button', { name: /Selesai & cetak struk/ }).click()
  await page.waitForURL('**/struk/**', { timeout: 15000 })
  await page.waitForTimeout(800)

  const isi = await page.locator('pre').innerText()
  if (!isi.includes('QRIS')) {
    throw new Error('struk tidak menyebut cara bayarnya: ' + isi)
  }
})

// ── Pengaturan ──────────────────────────────────────────────────────────

await step('pengaturan bisa dicapai dari beranda', async () => {
  // Sebelum layar ini ada, nama usaha tidak bisa diubah sama sekali
  // setelah pengaturan awal, dan QRIS cuma bisa dipasang lewat layar
  // bayar — jadi cuma ditemukan orang yang kebetulan sudah memilih QRIS
  // di depan pembeli.
  await page.goto(BASE + '/')
  await page.waitForTimeout(900)
  await page.getByRole('link', { name: 'Pengaturan' }).click()
  await page.waitForURL('**/pengaturan', { timeout: 15000 })
  await page.waitForTimeout(700)
})

await step('pengaturan menunjukkan keadaan QRIS dan cadangan', async () => {
  const layar = (await page.locator('main').innerText()).replace(/\n+/g, ' | ')
  // QRIS sudah dipasang di langkah sebelumnya, jadi barisnya harus
  // menyebut nama merchantnya — bukan sekadar "terpasang".
  if (!layar.includes('WARUNG BU ANI')) {
    throw new Error('keadaan QRIS tidak muncul di pengaturan: ' + layar)
  }
  // Belum masuk akun, dan itu harus terbaca sebagai peringatan.
  if (!layar.includes('Belum aktif')) {
    throw new Error('keadaan cadangan tidak muncul di pengaturan: ' + layar)
  }
})

await step('nama usaha bisa diperbaiki', async () => {
  const simpan = page.getByRole('button', { name: 'Simpan perubahan' })
  // Tanpa perubahan, tombolnya harus mati: menyimpan yang sama persis
  // cuma menambah satu panggilan ke antrean tanpa mengubah apa pun.
  if (!(await simpan.isDisabled())) {
    throw new Error('tombol simpan aktif padahal belum ada yang berubah')
  }

  await page.getByLabel('Nama usaha').fill('Warung Uji Baru')
  await page.waitForTimeout(300)
  await simpan.click()
  await page.waitForTimeout(900)

  const layar = await page.locator('main').innerText()
  if (!layar.includes('Tersimpan')) {
    throw new Error('tidak ada tanda tersimpan: ' + layar)
  }
})

await step('nama baru langsung dipakai di kepala struk', async () => {
  // Ini alasan sesungguhnya nama itu harus bisa diubah: ia tercetak di
  // setiap struk. Struk lama pun ikut memakai nama baru, karena namanya
  // dibaca dari pengaturan, bukan disalin ke tiap penjualan.
  await page.goto(BASE + '/riwayat')
  await page.waitForTimeout(900)
  await page.locator('a[href^="/struk/"]').first().click()
  await page.waitForURL('**/struk/**', { timeout: 15000 })
  await page.waitForTimeout(800)

  // Kepala struk dikapitalkan — kebiasaan struk termal, dan memang
  // disengaja. Jadi dicocokkan tanpa peduli besar-kecil hurufnya.
  const isi = await page.locator('pre').innerText()
  if (!isi.toUpperCase().includes('WARUNG UJI BARU')) {
    throw new Error('struk masih memakai nama lama: ' + isi.split('\n')[0])
  }
})

await step('ganti akun memperingatkan sebelum mengosongkan HP', async () => {
  // Keluar dari akun saja tidak cukup: sesinya hilang tapi seluruh isi HP
  // masih milik akun lama. Yang diuji di sini bukan penghapusannya —
  // melainkan bahwa peringatannya menyebut **berapa catatan yang hilang**
  // kalau diteruskan. Angka itu yang membedakan konfirmasi sungguhan dari
  // tombol "yakin?" yang selalu ditekan tanpa dibaca.
  await page.goto(BASE + '/pengaturan')
  await page.waitForTimeout(900)
  await page.getByRole('button', { name: 'Ganti akun' }).click()
  await page.waitForTimeout(600)

  const layar = (await page.locator('main').innerText()).replace(/\n+/g, ' | ')
  if (!layar.includes('Kosongkan HP ini')) {
    throw new Error('konfirmasi ganti akun tidak muncul: ' + layar)
  }
  // Seluruh uji ini berjalan tanpa peladen terjangkau, jadi antreannya
  // pasti berisi. Peringatan yang tidak menyebutkannya berarti bohong.
  if (!/\d+ catatan belum sempat terkirim/.test(layar)) {
    throw new Error('peringatan tidak menyebut catatan yang belum terkirim: ' + layar)
  }

  await page.getByRole('button', { name: 'Batal' }).click()
  await page.waitForTimeout(400)
})

await step('ukuran huruf besar membesarkan tombolnya juga, bukan cuma hurufnya', async () => {
  // Yang diperiksa bukan angka hurufnya melainkan **tinggi bilah
  // navigasi**. Huruf yang membesar sendiri di dalam bilah yang tidak
  // ikut membesar akan tertabrak tepinya, dan justru jadi lebih sulit
  // dibaca daripada sebelum diperbesar. Seluruh skala ditulis dalam
  // `rem` supaya keduanya bergerak bersama; kalau ada satu yang
  // terlanjur ditulis dalam piksel, langkah inilah yang menangkapnya.
  // Bilahnya cuma tergambar di kelima layar utama, jadi diukur di
  // beranda — bukan di layar pengaturan tempat tombolnya ditekan.
  const tinggiBilah = async () => {
    await page.goto(BASE + '/')
    await page.waitForTimeout(700)
    const t = await page.evaluate(() => {
      const nav = document.querySelector('nav')
      return nav ? Math.round(nav.getBoundingClientRect().height) : 0
    })
    if (t === 0) throw new Error('bilah navigasi tidak ditemukan di beranda')
    return t
  }

  const pilih = async (nama) => {
    await page.goto(BASE + '/pengaturan')
    await page.waitForTimeout(800)
    await page.getByRole('radio', { name: nama }).click()
    await page.waitForTimeout(300)
  }

  const sebelum = await tinggiBilah()

  await pilih('Besar')
  const sesudah = await tinggiBilah()
  if (!(sesudah > sebelum)) {
    throw new Error(`bilah tidak ikut membesar: ${sebelum} → ${sesudah}`)
  }

  // Dan pilihannya harus sudah terpasang **sebelum React hidup**.
  // Kalau ia baru dipasang sesudahnya, tiap kali aplikasi dibuka
  // halamannya tergambar sekejap dengan ukuran bawaan lalu melompat —
  // gangguan yang paling terasa justru bagi yang memilihnya.
  await page.goto(BASE + '/', { waitUntil: 'commit' })
  const dini = await page.evaluate(
    () => document.documentElement.dataset.huruf ?? null,
  )
  if (dini !== 'besar') {
    throw new Error('ukuran huruf belum terpasang saat halaman digambar: ' + dini)
  }

  await pilih('Normal')
  if ((await tinggiBilah()) !== sebelum) {
    throw new Error('kembali ke Normal tidak mengembalikan ukurannya')
  }
})

await step('catatan yang ditolak bisa dilihat dan diurus, bukan cuma dihitung', async () => {
  // Antreannya diisi langsung dengan satu baris `failed`, karena tidak
  // ada cara membuat peladen menolak sesuatu dari sini — peladennya
  // memang tidak terjangkau. Yang diuji bukan bagaimana ia jadi tertolak,
  // melainkan **apa yang bisa dilakukan pemiliknya sesudah itu.**
  await page.evaluate(
    () =>
      new Promise((selesai, gagal) => {
        const minta = indexedDB.open('ezura')
        minta.onsuccess = () => {
          const tx = minta.result.transaction('outbox', 'readwrite')
          tx.objectStore('outbox').put({
            id: 'uji-tertolak',
            tenant_id: 'x',
            rpc: 'record_sale',
            args: { p_paid: 45000, p_customer_name: 'Bu Sri', p_items: [{}, {}] },
            created_at: new Date().toISOString(),
            attempts: 9,
            next_attempt_at: new Date().toISOString(),
            status: 'failed',
            last_error: 'duplicate key value violates unique constraint',
          })
          tx.oncomplete = () => selesai(undefined)
          tx.onerror = () => gagal(tx.error)
        }
        minta.onerror = () => gagal(minta.error)
      }),
  )

  // Dimasuki lewat Pengaturan, bukan lewat peringatan di beranda.
  // Peringatan beranda cuma muncul kalau sudah pernah masuk akun, dan
  // dari sini peladennya tidak terjangkau — jadi yang bisa diuji di
  // peramban adalah pintu kedua. Pintu itu justru yang lebih penting
  // diperiksa: ia ada karena peringatan beranda kalah urutan dengan
  // peringatan "belum dicadangkan", dan tanpanya catatan tertolak tidak
  // bisa diurus sama sekali dalam keadaan itu.
  await page.goto(BASE + '/pengaturan')
  await page.waitForTimeout(900)

  const pengaturan = (await page.locator('main').innerText()).replace(/\n+/g, ' | ')
  if (!pengaturan.includes('Catatan yang ditolak')) {
    throw new Error('pengaturan tidak menyebut catatan tertolak: ' + pengaturan)
  }

  await page.getByRole('link', { name: /Catatan yang ditolak/ }).click()
  await page.waitForURL('**/tertolak', { timeout: 15000 })
  await page.waitForTimeout(700)

  const layar = (await page.locator('main').innerText()).replace(/\n+/g, ' | ')

  // Catatannya harus bisa dikenali: nominal dan nama pembelinya, bukan
  // tulisan `record_sale`.
  if (!layar.includes('Rp 45.000') || !layar.includes('Bu Sri')) {
    throw new Error('catatannya tidak bisa dikenali: ' + layar)
  }
  if (layar.includes('record_sale')) {
    throw new Error('nama RPC bocor ke layar: ' + layar)
  }
  // Sebab penolakannya diterjemahkan, bukan ditampilkan mentah.
  if (/duplicate key|constraint/i.test(layar)) {
    throw new Error('pesan Postgres bocor mentah ke layar: ' + layar)
  }
  // Dan yang paling menentukan: pemiliknya harus tahu catatannya tidak hilang.
  if (!layar.includes('tetap ada di HP ini')) {
    throw new Error('layar tidak menjamin catatannya aman: ' + layar)
  }

  await page.getByRole('button', { name: 'Buang', exact: true }).click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: /Ya, berhenti mengirim/ }).click()
  await page.waitForTimeout(700)

  const sesudah = (await page.locator('main').innerText()).replace(/\n+/g, ' | ')
  if (!sesudah.includes('Tidak ada yang tertolak')) {
    throw new Error('yang dibuang tidak hilang dari daftar: ' + sesudah)
  }

  // Barisnya juga harus hilang dari pengaturan. Peringatan yang menetap
  // sesudah dituntaskan adalah peringatan yang berhenti dipercaya.
  await page.goto(BASE + '/pengaturan')
  await page.waitForTimeout(900)
  const pengaturanAkhir = (await page.locator('main').innerText()).replace(/\n+/g, ' | ')
  if (pengaturanAkhir.includes('Catatan yang ditolak')) {
    throw new Error('peringatan masih ada padahal sudah diurus: ' + pengaturanAkhir)
  }
})

await step('halaman yang tidak ada tidak menampilkan 404 mentah', async () => {
  await page.goto(BASE + '/halaman-yang-tidak-pernah-ada')
  await page.waitForTimeout(700)

  const layar = (await page.locator('body').innerText()).replace(/\n+/g, ' | ')
  if (/404|not found/i.test(layar)) {
    throw new Error('layar 404 bawaan masih tergambar: ' + layar)
  }
  if (!layar.includes('Buka kasir')) {
    throw new Error('tidak ada jalan keluar dari halaman yang tidak ada: ' + layar)
  }
})

console.log('\nSTRUK:\n' + struk.split('\n').map((l) => '  ' + l).join('\n'))
console.log('\nKATALOG :', daftar)
console.log('BERANDA :', beranda)
console.log('UTANG   :', utang)
console.log('AKHIR   :', berandaAkhir)
console.log('LAPORAN :', laporan)
console.log('\ngalat/404:', errs.length ? JSON.stringify([...new Set(errs)], null, 2) : 'tidak ada')

await browser.close()
