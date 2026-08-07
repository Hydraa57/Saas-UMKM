# 07 — Temuan dari Catatan Ibu

Fase 0 dijalankan lewat foto catatan, bukan wawancara. Ternyata cukup — dan untuk beberapa hal, lebih jujur daripada wawancara, karena buku tidak bisa menyenangkan hati penanya.

Dokumen ini merekam apa yang ditemukan dan asumsi mana yang gugur. Ditulis terpisah dan tidak dirapikan ke belakang, supaya jelas mana yang tadinya tebakan dan mana yang bukti.

---

## 1. Yang ada di buku

Lima halaman, dua jenis catatan yang sama sekali berbeda:

| Halaman | Isi |
|---|---|
| 1 | Rekap bulanan Januari 2025 – Juni 2026, satu angka per bulan, total 2025 dijumlah tangan: **9.195.500** |
| 2, 3 | Buku borongan lipat kertas — per orang, per tanggal, jumlah lembar |
| 4, 5 | Buku belanja rumah tangga — dana dari bapak, belanja harian |

Tidak ada satu pun catatan penjualan snack. Tidak ada satu pun catatan jahit di kelima halaman ini.

---

## 2. Buku borongan lipat kertas — sudah tidak berlaku

Halaman 2 dan 3 awalnya saya baca sebagai buku jasa jahit. Ternyata bukan: itu **borongan melipat kertas**. Ibu menerima borongan, mengajak tetangga membantu, dan dibayar menurut jumlah lembar yang dilipat.

Strukturnya sempat saya bongkar penuh sebelum tahu itu pekerjaan lama:

- Kolom = orang (Bu Ema, Bu Dewi, Bu Susi, Fira, Bu Enah, Mm Sizy)
- Baris = tanggal + jumlah lembar
- Berkala: jumlah lembar dikalikan tarif, dikotaki jadi rupiah, ditandai **"Lunas"**

Aritmetikanya terverifikasi di enam kelompok terpisah, dengan dua tarif berbeda:

```
Bu Dewi   336+480+500+200+500 = Σ 2016  × 30 = Rp 60.480   ← "Σ 2016" ditulis literal
Bu Ema    165+310+650+525+450+500 = 2600 × 30 = Rp 78.000
Fira      200+350+250+600+350 = 1750    × 30 = Rp 52.500
Bu Enah   50+50+50 = 150               × 30 = Rp 4.500
Bu Enah   50+18 = 68                   × 30 = Rp 2.040

Bu Ema, dua tarif dalam satu tagihan:
  (c) 545+210+37 = 792  × 30 = Rp 23.760   ← ditulis "23.760 c"
  (S) 315+150    = 465  × 35 = Rp 16.275   ← ditulis "16.275 S"
                           total Rp 40.035  ← lalu "Lunas"
```

**Pekerjaan ini sudah berhenti.** Seluruh analisis di atas tidak dipakai, dan tidak ada modul yang dibangun untuknya.

Tapi satu pelajarannya tetap berlaku, dan penting: **ibu terbiasa mencatat besaran mentah, bukan rupiah.** Rupiah dihitung belakangan, saat mau ditagih. Perkalian dan penjumlahan itulah bagian yang melelahkan — dan itu yang paling pantas diambil alih aplikasi.

---

## 3. Buku belanja rumah tangga — masuk lingkup

Halaman 4 dan 5. Bentuknya:

```
uang blanja januari 2023
Rp 1.100.000 + 100.000 + 200.000 = 1.400.000 dari bpk

 9   iuran                        50.000
10   listrik, bensin              52.000
11   aqua, ikan asin, syr, tempe  47.000
13   ayam, tempe                  55.000
...
30   gas, hutang, air, syr
                               1.660.000
```

Halaman Juli serupa, dua kolom, 1.014.000 + 182.000 = 1.196.000.

Tiga hal yang terbaca dari sini:

1. **Sumber dananya orang lain** — "dari bpk". Ini bukan uang usaha.
2. **Satu entri memuat beberapa barang** — "syr, tahu, cabe, bensin — 42.000". Ibu tidak memecah per barang, dan tidak perlu. Aplikasi yang memaksa satu barang satu baris akan lebih lambat daripada bukunya.
3. **Nominalnya bulat**, hampir selalu kelipatan seribu.

Keputusan pemilik: buku ini masuk aplikasi, **sebagai buku terpisah**, tidak dicampur dengan uang usaha.

---

## 4. Rekap bulanan — ini angka utamanya

Halaman 1: delapan belas bulan, satu angka per bulan, dijumlah tangan.

```
2025  Jan 865.000   Feb 866.000   Mar 1.706.000   Apr 447.000
      Mei 771.000   Jun 719.000   Agu 517.000     Sep 890.000
      Okt 644.000   Nov 396.000   Des 824.500
                                  ────────────
                                    9.195.500

2026  Jan 761.000   Feb 1.138.000  Mar 1.923.000
      Apr 692.000   Mei 717.000    Jun 654.000
```

Menurut pemiliknya: ini **pemasukan ibu** — dari jahit, kertas, biskuit — dan **tidak termasuk uang dari bapak**.

Dua kesimpulan:

- Pemisahan "uang hasil kerja ibu" dari "uang dari bapak" **sudah ada di kepala ibu**, dan sudah dia jalankan bertahun-tahun. Aplikasi tinggal mengikuti, bukan mengajari.
- Ibu rela menjumlah delapan belas bulan pakai pulpen. **Rekap bulanan bukan fitur pelengkap — itu yang paling dia inginkan.**

---

## 5. Snack: uangnya dipisah, tapi tidak pernah dicatat

Kata pemiliknya: uang jualan snack langsung dipisahkan ke dompet lain, tapi tidak ditulis di mana pun.

Ini temuan paling berharga, karena artinya:

- **Rekap bulanan ibu selama ini belum lengkap.** Ada pemasukan yang tidak pernah masuk hitungan. Angka 9.195.500 itu di bawah yang sebenarnya.
- **Kebiasaan "pisah dompet" sudah jadi sistem akuntansi ibu sendiri** — dompet fisik adalah caranya memisahkan uang. Dan kebetulan itu persis konsep `wallets` yang sudah dibangun. Fondasinya tidak perlu diubah, cuma diarahkan.

Dompet yang dipisahkan ibu: **snack, jahit, belanja (dari bapak), dan rekening/e-wallet.**

---

## 6. Jasa jahit: jauh lebih sederhana dari dugaan

Yang ibu tulis: **tanggal + jenis + harga.** Contohnya "potong 30rb".

Tidak ada ukuran badan. Tidak ada DP. Tidak ada tanggal janji jadi. Tidak ada status pengerjaan. Tidak ada nama pelanggan.

---

## 7. Asumsi yang gugur

Ditulis eksplisit, karena semuanya sempat dibangun:

| Asumsi | Kenyataan |
|---|---|
| Jasa jahit = order berjangka dengan DP, deadline, ukuran pelanggan | Cuma tanggal + jenis + harga |
| Snack dijual per item, perlu katalog produk | Tidak pernah dicatat sama sekali; akan dicatat nominal saja |
| Perlu stok, kulakan, harga modal, produk terlaris | Tidak ada satu pun yang ibu lacak |
| Untung dihitung dengan modal barang terjual (COGS) | Tanpa katalog dan stok, tidak ada dasarnya |
| Uang usaha dan pribadi tercampur, perlu fitur "ambil buat rumah" | Ibu **sudah** memisahkannya, pakai dompet fisik. Yang perlu bukan pemisahan, tapi pemindahan antar dompet |
| Satu buku kas untuk semua | Dua buku: usaha dan rumah, sengaja tidak dicampur |

Yang **tetap berlaku** dari rancangan awal:

- Buku kas sebagai pusat, bukan transaksi kasir
- Dompet sebagai wadah uang — malah terbukti lebih tepat dari dugaan
- Rupiah `bigint`, PK UUID dari perangkat, luring lebih dulu
- Isolasi tenant, jalur tulis idempoten
- Rekap bulanan sebagai keluaran utama — sekarang malah lebih kuat buktinya

---

## 8. Kenapa bot WhatsApp sebelumnya ditinggalkan

Pemilik pernah membangun pencatat keuangan lewat WhatsApp dengan AI dan spreadsheet. Ibu memakainya sebentar lalu berhenti. Alasannya, menurut pemiliknya: AI-nya sering error, dan balasannya cuma *"oke pemasukan jait tanggal sekian sudah disimpan"* — untuk tahu pemasukan dan pengeluaran sebulan, tetap harus membuka spreadsheet.

Diagnosisnya bukan soal AI. Yang dibangun cuma separuh: **pencatatannya jalan, pembacaan-kembalinya tidak ada.** Ibu menyerahkan datanya dan tidak pernah menerima apa pun sebagai gantinya.

Dan setelah melihat rekap bulanan tulisan tangan sepanjang delapan belas bulan itu, jelas apa yang hilang: hal yang paling ibu inginkan justru satu-satunya hal yang tidak diberikan bot itu.

Aturan yang lahir dari sini, dan berlaku untuk seluruh aplikasi:

> **Setiap kali ibu memasukkan sesuatu, dia harus langsung menerima sesuatu.**
> Minimal: total hari ini dan total bulan ini, terlihat tanpa perlu berpindah layar.

Percobaan itu juga meninggalkan satu bukti yang berharga: **ibu bersedia mencatat lewat aplikasi.** Yang gagal bukan kesediaannya.

---

## 9. Yang masih belum diketahui

Jujur dicatat, supaya tidak diam-diam jadi asumsi lagi:

- Berapa transaksi snack dalam sehari
- Apakah ada yang membeli snack dengan berutang, dan seberapa sering
- Jenis jahitan apa saja, dan kisaran harganya
- Apakah ibu membeli snack (kulakan) dengan uang dompet snack, dan bagaimana dia tahu untungnya
- Apakah rekening/e-wallet dipakai untuk usaha, untuk rumah, atau keduanya

Empat pertama akan terjawab sendiri dari pemakaian, kalau aplikasinya cukup ringan untuk dipakai. Yang terakhir perlu ditanyakan sebelum pengaturan dompet dibuat.
