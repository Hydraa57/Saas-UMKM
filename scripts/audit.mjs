/**
 * Audit tata letak, diukur di peramban sungguhan.
 *
 * Dua puluh lima layar terlalu banyak untuk diperiksa dengan mata, dan
 * jenis cacat yang paling merugikan justru yang paling sulit dilihat
 * sekilas: tombol yang tertimpa tombol lain. Ia tidak terlihat rusak —
 * ia terlihat baik-baik saja dan **ketukannya jatuh ke yang salah.**
 *
 * Jadi yang dipakai di sini bukan penilaian rasa melainkan geometri:
 * persegi tiap elemen diambil dari peramban, lalu diperiksa aturan yang
 * bisa dijawab benar atau salah.
 *
 * Yang diperiksa, dan kenapa masing-masing:
 *
 * 1. **Tumpang tindih yang bisa disentuh.** Dua elemen yang sama-sama
 *    bisa ditekan dan saling menimpa berarti satu di antaranya tidak
 *    pernah bisa disentuh. Ini cacat paling mahal di aplikasi kasir:
 *    yang tertimpa biasanya tombol yang lebih jarang dipakai, jadi
 *    ketahuannya baru saat dibutuhkan — di depan pembeli.
 * 2. **Isi yang tertutup bilah tetap.** Baris terakhir daftar yang
 *    tersembunyi di balik bilah bawah membuat orang mengira datanya
 *    hilang.
 * 3. **Gulir mendatar.** Layar HP tidak boleh bisa digeser ke samping.
 *    Kalau bisa, ada sesuatu yang lebih lebar dari layar — dan biasanya
 *    itu angka rupiah panjang di dalam kotak yang tidak bisa menyusut.
 * 4. **Target sentuh terlalu kecil.** Ambangnya 44px, di bawah token
 *    `touch` sendiri (48px), supaya yang lolos memang benar-benar
 *    sengaja.
 * 5. **Teks terpotong tanpa tanda.** Nama barang yang terpotong dengan
 *    "…" itu pilihan; yang terpotong begitu saja adalah cacat.
 *
 * Pakai:
 *   npm run build && npx next start -p 3311 &
 *   node scripts/audit.mjs
 */
import { chromium } from '@playwright/test'

const BASE = 'http://localhost:3311'
// Lebar layar bisa diberikan lewat argumen: `node scripts/audit.mjs 1440`.
// Tata letak dua kolom punya cacat yang tidak mungkin muncul di lebar HP
// — kolom yang tumpang tindih, bilah samping yang menutupi isi — dan
// keduanya cuma ketahuan kalau diperiksa pada lebar yang sebenarnya.
const LEBAR = Number(process.argv[2]) || 390
const HP = { width: LEBAR, height: LEBAR >= 1024 ? 900 : 844 }

const temuan = []
const catat = (layar, jenis, pesan) => temuan.push({ layar, jenis, pesan })

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: HP, deviceScaleFactor: 2 })

const jeda = (ms = 600) => page.waitForTimeout(ms)
const ketik = async (n) => {
  for (const d of String(n)) {
    await page.getByRole('button', { name: d, exact: true }).click()
  }
}

// ── Aturan yang diperiksa, seluruhnya di dalam peramban ────────────────

const PEMERIKSA = () => {
  const hasil = []
  const R = (el) => el.getBoundingClientRect()
  const terlihat = (el) => {
    const g = getComputedStyle(el)
    if (g.display === 'none' || g.visibility === 'hidden' || g.opacity === '0') return false
    const r = R(el)
    return r.width > 0 && r.height > 0
  }
  const sebut = (el) => {
    const teks = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40)
    const label = el.getAttribute('aria-label')
    return teks || label || el.tagName.toLowerCase()
  }
  const tumpang = (a, b) =>
    a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1

  // Apakah elemennya duduk di dalam bilah yang melayang di atas halaman.
  // Ini yang membedakan dua cacat yang tampak sama: isi halaman yang
  // tergulir **di bawah** bilah lengket itu wajar dan memang dirancang
  // begitu; dua bilah yang saling menimpa tidak.
  const melayang = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const p = getComputedStyle(n).position
      if (p === 'fixed' || p === 'sticky') return n
    }
    return null
  }

  const bisaDisentuh = [...document.querySelectorAll('a[href], button, [role="tab"], [role="radio"]')]
    .filter(terlihat)
    .filter((el) => !el.hasAttribute('disabled'))

  // 1. Tumpang tindih antar elemen yang bisa disentuh.
  //    Yang bersarang dilewati — tombol di dalam tombol memang saling
  //    menimpa menurut definisinya, dan itu bukan cacat.
  for (let i = 0; i < bisaDisentuh.length; i++) {
    for (let j = i + 1; j < bisaDisentuh.length; j++) {
      const a = bisaDisentuh[i]
      const b = bisaDisentuh[j]
      if (a.contains(b) || b.contains(a)) continue

      const la = melayang(a)
      const lb = melayang(b)
      // Tepat satu yang melayang: itu isi halaman yang lewat di bawah
      // bilah lengket. Wajar, dan bukan yang dicari di sini.
      if ((la === null) !== (lb === null)) continue
      // Keduanya melayang di bilah yang sama: tata letak di dalam satu
      // bilah bukan urusan pemeriksaan ini.
      if (la !== null && la === lb) continue
      const ra = R(a)
      const rb = R(b)
      if (!tumpang(ra, rb)) continue

      // Luas irisannya dihitung: sentuhan tepi satu-dua piksel akibat
      // pembulatan bukan cacat, tombol yang tertutup separuh iya.
      const lebar = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left)
      const tinggi = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top)
      const irisan = lebar * tinggi
      const terkecil = Math.min(ra.width * ra.height, rb.width * rb.height)
      if (irisan / terkecil < 0.04) continue

      hasil.push({
        jenis: 'tumpang-tindih',
        pesan: `"${sebut(a)}" menimpa "${sebut(b)}" (${Math.round(
          (irisan / terkecil) * 100,
        )}% dari yang terkecil)`,
      })
    }
  }

  // 2. Gulir mendatar.
  const akar = document.documentElement
  if (akar.scrollWidth > akar.clientWidth + 1) {
    const biang = [...document.querySelectorAll('body *')]
      .filter(terlihat)
      .filter((el) => R(el).right > akar.clientWidth + 1)
      .slice(0, 3)
      .map(sebut)
    hasil.push({
      jenis: 'gulir-mendatar',
      pesan: `${akar.scrollWidth}px > ${akar.clientWidth}px — tersangka: ${
        biang.join(' | ') || 'tidak terlacak'
      }`,
    })
  }

  // 3. Target sentuh terlalu kecil.
  for (const el of bisaDisentuh) {
    const r = R(el)
    if (r.height < 44 && r.width < 44) {
      hasil.push({
        jenis: 'target-kecil',
        pesan: `"${sebut(el)}" cuma ${Math.round(r.width)}×${Math.round(r.height)}px`,
      })
    }
  }

  // 4. Teks meluber keluar kotaknya tanpa dipotong rapi.
  for (const el of document.querySelectorAll('p, span, h1, h2, h3, button, a')) {
    if (!terlihat(el)) continue
    if (el.children.length > 0) continue
    const g = getComputedStyle(el)
    if (g.overflow !== 'visible' || g.textOverflow === 'ellipsis') continue
    if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
      hasil.push({
        jenis: 'teks-meluber',
        pesan: `"${sebut(el)}" ${el.scrollWidth}px di kotak ${el.clientWidth}px`,
      })
    }
  }

  // 5. Kelas ruang bawah yang terpasang tapi **tidak berlaku**.
  //    Ini kegagalan yang paling berbahaya di berkas gaya: kelasnya
  //    terbaca di markup, jadi pembacaan kode meyakinkan — sementara
  //    `p-4` di elemen yang sama menimpanya diam-diam, karena utility
  //    Tailwind menang atas kelas komponen. Diperiksa lewat nilai
  //    terhitungnya, satu-satunya yang tidak bisa berbohong.
  // Cuma berlaku selama bilahnya memang tergambar di dasar layar. Di
  // layar lebar ia pindah ke samping, dan menuntut ruang bawah di sana
  // berarti menuntut kekosongan.
  const adaBilahBawah = [...document.querySelectorAll('.bilah-bawah')].some(
    (el) => terlihat(el) && getComputedStyle(el).position === 'fixed',
  )
  for (const el of adaBilahBawah
    ? document.querySelectorAll('.ruang-bilah, .ruang-bilah-aksi')
    : []) {
    const pb = parseFloat(getComputedStyle(el).paddingBottom)
    const perlu = el.classList.contains('ruang-bilah-aksi') ? 140 : 96
    if (pb < perlu) {
      hasil.push({
        jenis: 'kelas-tertimpa',
        pesan: `padding bawah cuma ${Math.round(pb)}px, seharusnya ≥ ${perlu}px — kelasnya ditimpa utility di elemen yang sama`,
      })
    }
  }

  // 6. Isi yang tertutup bilah tetap di bawah, padahal halamannya sudah
  //    tergulir sampai habis.
  // Yang dihitung sebagai bilah cuma yang benar-benar melayang di dasar
  // layar. Sebelumnya `nav` apa pun ikut terjaring — dan beranda punya
  // `<nav>` kedua di tengah halaman untuk petak pintasan, jadi seluruh
  // isi di bawahnya dilaporkan "tertutup bilah". Dua puluh empat temuan
  // palsu dari satu pemilih yang terlalu longgar.
  const bilah = [...document.querySelectorAll('.bilah-bawah, .mengambang')].filter(
    (el) => terlihat(el) && ['fixed', 'sticky'].includes(getComputedStyle(el).position),
  )
  const sudahMentok = akar.scrollHeight - akar.scrollTop - akar.clientHeight < 2
  if (sudahMentok && bilah.length > 0) {
    const atasBilah = Math.min(...bilah.map((b) => R(b).top))
    const isi = [...document.querySelectorAll('main p, main span, main h2, main a, main button')]
      .filter(terlihat)
      .filter((el) => {
        const r = R(el)
        // Yang ada di dalam bilah itu sendiri tentu saja tidak tertutup.
        if (bilah.some((b) => b.contains(el))) return false
        return r.bottom > atasBilah + 4 && r.top < window.innerHeight
      })
    if (isi.length > 0) {
      hasil.push({
        jenis: 'tertutup-bilah',
        pesan: `${isi.length} elemen tersembunyi di balik bilah bawah — mis. "${sebut(isi[0])}"`,
      })
    }
  }

  return hasil
}

async function periksa(nama) {
  await jeda(500)
  // Digulir sampai dasar lebih dulu: cacat "tertutup bilah" cuma bisa
  // dinilai di posisi itu.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(300)
  const hasil = await page.evaluate(PEMERIKSA)
  for (const h of hasil) catat(nama, h.jenis, h.pesan)
  console.log(`  ${hasil.length === 0 ? 'bersih' : hasil.length + ' temuan'}  ${nama}`)
}

// ── Siapkan data yang masuk akal ───────────────────────────────────────

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
await page.getByPlaceholder('Warung Bu Ani').fill('Warung Bu Ani Sejahtera')
await page.getByRole('button', { name: 'Mulai', exact: true }).click()
await page.waitForURL('**/katalog**', { timeout: 15000 })

// Nama panjang sengaja dipakai: nama pendek menyembunyikan cacat
// pemotongan teks, dan katalog sungguhan penuh nama panjang.
const barang = [
  ['Biskuit Roma Kelapa Kemasan Besar', 5000, 3500, 24, 10],
  ['Chitato Sapi Panggang', 12000, 9500, 6, 10],
  ['Teh Botol Sosro', 5000, 3800, 0, 6],
  ['Indomie Goreng', 3500, 2800, 40, 12],
  ['Kopi Kapal Api', 1250000, 1000000, 18, 10],
]
for (const [nama, harga, modal, stok, min] of barang) {
  await page.goto(BASE + '/katalog/baru?jenis=barang')
  await jeda(400)
  await page.getByPlaceholder('Biskuit Roma').fill(nama)
  await ketik(harga)
  await page.getByLabel('Stok sekarang').fill(String(stok))
  await page.getByLabel(/Ingatkan kalau tinggal/).fill(String(min))
  await page.getByRole('button', { name: /Harga modal & foto/ }).click()
  await jeda(200)
  await page.getByLabel('Harga modal').fill(String(modal))
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()
  await page.waitForURL('**/katalog', { timeout: 15000 })
}

for (const [nama, harga] of [
  ['Potong celana panjang bahan katun', 30000],
  ['Vermak Levis', 25000],
]) {
  await page.goto(BASE + '/katalog/baru?jenis=jasa')
  await jeda(400)
  await page.getByPlaceholder('Potong celana').fill(nama)
  await ketik(harga)
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()
  await page.waitForURL('**/katalog', { timeout: 15000 })
}

// Satu transaksi, supaya riwayat dan laporan tidak kosong.
await page.goto(BASE + '/kasir')
await jeda(800)
await page.locator('.grid button', { hasText: 'Biskuit Roma' }).click()
await page.locator('.grid button', { hasText: 'Potong celana' }).click()
await page.getByRole('button', { name: /^Bayar/ }).click()
await jeda(400)
await page.getByRole('button', { name: 'Uang pas' }).click()
await page.getByRole('button', { name: /Selesai & cetak struk/ }).click()
await page.waitForURL('**/struk/**', { timeout: 15000 })

// Satu utang, supaya layar utang berisi.
await page.goto(BASE + '/kasir')
await jeda(800)
await page.locator('.grid button', { hasText: 'Vermak Levis' }).click()
await page.getByRole('button', { name: /^Bayar/ }).click()
await jeda(400)
for (let i = 0; i < 5; i++) {
  await page.getByRole('button', { name: 'Hapus satu angka' }).click()
}
await page.getByPlaceholder('Bu Tetangga').fill('Bu Sri Wahyuningsih')
await page.getByRole('button', { name: /Simpan sebagai utang/ }).click()
await page.waitForURL('**/struk/**', { timeout: 15000 })

// ── Telusuri tiap layar ────────────────────────────────────────────────

console.log(`\nmemeriksa pada lebar ${LEBAR}px:`)

const LAYAR = [
  ['beranda', '/'],
  ['katalog', '/katalog'],
  ['katalog · stok', '/katalog?tab=stok'],
  ['tambah barang', '/katalog/baru?jenis=barang'],
  ['tambah jasa', '/katalog/baru?jenis=jasa'],
  ['kasir', '/kasir'],
  ['riwayat', '/riwayat'],
  ['utang', '/utang'],
  ['kulakan', '/kulakan'],
  ['uang keluar', '/keluar'],
  ['laporan', '/laporan'],
  ['cadangan', '/masuk'],
  ['pengaturan', '/pengaturan'],
  ['pasang QRIS', '/qris'],
  ['tertolak (kosong)', '/tertolak'],
  ['halaman tak ada', '/tidak-pernah-ada'],
]

for (const [nama, jalur] of LAYAR) {
  await page.goto(BASE + jalur, { waitUntil: 'networkidle' })
  await periksa(nama)
}

// Keadaan yang cuma muncul sesudah berinteraksi — dan justru di sinilah
// bilah aksi bertambah, yaitu saat tumpang tindih paling mungkin terjadi.
await page.goto(BASE + '/kasir', { waitUntil: 'networkidle' })
await jeda(700)
await page.locator('.grid button', { hasText: 'Biskuit Roma' }).click()
await page.locator('.grid button', { hasText: 'Indomie Goreng' }).click()
await periksa('kasir · keranjang terisi')

await page.getByRole('button', { name: /^Bayar/ }).click()
await jeda(500)
await periksa('kasir · layar bayar')

await page.getByRole('button', { name: 'QRIS', exact: true }).click()
await jeda(900)
await periksa('kasir · bayar QRIS')

await page.goto(BASE + '/utang', { waitUntil: 'networkidle' })
await jeda(700)
await page.getByRole('button', { name: /Bu Sri/ }).click()
await periksa('utang · terima bayar')

await page.goto(BASE + '/riwayat', { waitUntil: 'networkidle' })
await jeda(700)
await page.locator('a[href^="/struk/"]').first().click()
// Di layar lebar ketukannya sengaja **tidak** pindah halaman: struknya
// digambar di panel kanan. Menunggu perpindahan di sana berarti
// menunggu sesuatu yang memang dirancang tidak terjadi.
if (LEBAR < 1024) await page.waitForURL('**/struk/**', { timeout: 15000 })
await periksa(LEBAR < 1024 ? 'struk' : 'riwayat · struk di panel kanan')

// ── Laporan ────────────────────────────────────────────────────────────

console.log('\n' + '─'.repeat(70))
if (temuan.length === 0) {
  console.log('BERSIH — tidak ada temuan tata letak.')
} else {
  const perJenis = {}
  for (const t of temuan) (perJenis[t.jenis] ??= []).push(t)

  console.log(`${temuan.length} TEMUAN\n`)
  for (const [jenis, daftar] of Object.entries(perJenis)) {
    console.log(`▸ ${jenis} (${daftar.length})`)
    // Diringkas: pesan yang sama di banyak layar dicetak sekali dengan
    // daftar layarnya, supaya cacat sistemik terlihat sebagai satu hal.
    const perPesan = {}
    for (const t of daftar) (perPesan[t.pesan] ??= []).push(t.layar)
    for (const [pesan, layar] of Object.entries(perPesan)) {
      console.log(`    ${pesan}`)
      console.log(`      → ${[...new Set(layar)].join(', ')}`)
    }
    console.log()
  }
  process.exitCode = 1
}

await browser.close()
