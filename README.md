# NexaUsaha

Aplikasi pencatatan yang **melakukan** pemisahan uang usaha dan uang rumah tangga — bukan yang menuntut penggunanya memisahkan lebih dulu.

Untuk usaha mikro apa pun: warung, katering, laundry, jahit, servis, toko online. Dibuktikan pada satu pengguna nyata lebih dulu — ibu saya, yang sampai hari ini mencatat semuanya di buku tulis.

## Masalah yang dikejar

[73% UMKM Indonesia tidak memisahkan keuangan usaha dan pribadi](https://journal.unespadang.ac.id/jaaip/article/view/596), dan mayoritas usaha mikro cuma punya satu rekening untuk keduanya. Akibatnya mereka tidak tahu usahanya untung atau tidak — uang belanja rumah ikut terhitung sebagai biaya usaha.

Semua aplikasi pembukuan UMKM yang ada **mengasumsikan pemisahan itu sudah terjadi.** Untuk tiga perempat pasarnya, asumsi itu salah.

Kuncinya satu keputusan: **buku melekat pada tiap catatan, bukan pada dompet.** Belanja dapur yang dibayar pakai uang dagangan cukup dicatat berbuku rumah, dari dompet yang sama. Pemisahannya terjadi tepat saat uangnya keluar, dengan satu ketukan — bukan menuntut rekening kedua yang tidak akan pernah dibuka.

Uraian lengkapnya di [`docs/08-posisi-produk.md`](docs/08-posisi-produk.md).

## Kenapa repo ini ada

Bukan lahir dari riset pasar, tapi dari melihat ibu saya menjumlah rekap bulanan dengan pulpen — delapan belas bulan berturut-turut, lengkap dengan total tahunan.

Kosakata aplikasinya umum; pembuktiannya spesifik. Target keberhasilan tahap pertama satu kalimat:

> **Setelah 30 hari, buku tulis itu tidak dipakai lagi.**

Satu pengguna yang bertahan sebulan lebih membuktikan daripada seratus pendaftar yang berhenti di minggu pertama.

## Apa yang dipelajari dari catatan nyata

Lima halaman buku tulis membentuk ulang seluruh rancangan produk ini:

- **Dua buku terpisah, memang sudah ada di kepala penggunanya.** Rekap bulanannya tegas *di luar* uang pemberian suami.
- **Rekap bulanan dijumlah tangan.** Januari 2025 – Juni 2026, total 2025 `9.195.500`. Ini yang paling diinginkan.
- **Sebagian pemasukan tidak pernah dicatat** — uangnya dipisahkan ke dompet lain tapi tidak masuk hitungan mana pun, jadi rekapnya di bawah yang sebenarnya.
- **Jasa dicatat sangat sederhana.** Tanggal + jenis + harga. Tidak ada ukuran, DP, atau tenggat.
- **Tidak ada katalog, stok, atau harga modal.** Tidak satu pun dilacak.

Bukti lengkapnya, termasuk aritmetika yang membuktikan tiap kesimpulan: [`docs/07-temuan-catatan-ibu.md`](docs/07-temuan-catatan-ibu.md).

Satu catatan penting: pengguna pertama ini justru ada di **27% yang sudah memisahkan** uangnya, pakai dompet fisik. Kebiasaannya sempat diambil sebagai kebiasaan umum — dan itu membuat rancangan mengikat buku ke dompet, yang membuat mayoritas pasar tidak terlayani. Sudah diperbaiki.

## Pelajaran dari percobaan sebelumnya

Pernah dibangun pencatat keuangan lewat WhatsApp dengan AI dan spreadsheet. Ibu memakainya sebentar lalu berhenti — AI-nya sering error, dan balasannya cuma *"sudah disimpan"*. Untuk tahu pemasukan sebulan, tetap harus membuka spreadsheet.

Diagnosisnya bukan soal AI. Yang dibangun cuma separuh: pencatatannya jalan, pembacaan-kembalinya tidak ada. Aturan yang lahir dari situ, dan berlaku di seluruh aplikasi:

> **Setiap kali pengguna memasukkan sesuatu, dia harus langsung menerima sesuatu.**

Percobaan itu juga meninggalkan bukti berharga: ibu bersedia mencatat lewat aplikasi. Yang gagal bukan kesediaannya.

## Status

Alur pokoknya sudah jalan: pengaturan awal → catat → lihat rekap. Diuji di peramban sungguhan, bukan cuma di tes unit.

| Selesai | Tes |
|---|---|
| Perhitungan uang (rupiah `bigint`, pembulatan eksplisit) | 43 |
| Tanggal & zona waktu (WIB, bukan UTC) | 18 |
| Buku kas, dua buku, saldo dompet, cocokkan | 23 |
| Rekap bulanan & total tahunan | 14 |
| Utang & piutang | 17 |
| Antrean kirim luring + penggolongan kegagalan | 30 |
| Aksi tulis (tulis lokal + antre, tanpa menunggu jaringan) | 27 |
| Skema, RLS, jalur tulis (PostgreSQL sungguhan) | 53 |

Layar yang sudah ada: pengaturan awal, beranda (pemilih buku + rekap bulan berjalan), catat pemasukan, catat pengeluaran.

Belum ada: autentikasi, penarikan data dari peladen, layar rekap bulanan penuh, dompet & pemindahan, utang.

## Dokumen

| Dokumen | Isi |
|---|---|
| [`docs/08-posisi-produk.md`](docs/08-posisi-produk.md) | **Mulai di sini.** Untuk siapa, kenapa dipilih, dan riset yang mendasarinya |
| [`docs/07-temuan-catatan-ibu.md`](docs/07-temuan-catatan-ibu.md) | Bukti dari catatan asli, dan asumsi mana yang gugur |
| [`docs/02-prd.md`](docs/02-prd.md) | Scope, alur, keputusan UX |
| [`docs/03-data-model.md`](docs/03-data-model.md) | Skema, RLS, jalur tulis |
| [`docs/04-arsitektur.md`](docs/04-arsitektur.md) | Stack, luring, notifikasi, biaya |
| [`docs/05-roadmap.md`](docs/05-roadmap.md) | Rencana bertahap |
| [`docs/01-riset-dan-temuan.md`](docs/01-riset-dan-temuan.md) | Riset pasar & teknis (sebagian sudah tidak berlaku) |
| [`docs/06-wawancara-lapangan.md`](docs/06-wawancara-lapangan.md) | Panduan wawancara (sebagian besar sudah terjawab) |

## Menjalankan

```bash
npm install
cp .env.example .env.local     # isi dari dasbor Supabase
npm run dev
```

### Pengujian

```bash
npm test          # 172 tes unit
npm run typecheck
npm run db:test   # 53 penegasan: migrasi, RLS, jalur tulis

npm run build && npx next start -p 3311 &
npm run smoke     # alur nyata di peramban sungguhan
```

`npm run smoke` menangkap hal yang tidak bisa ditangkap tes unit. Dua bug UX pertama — pilihan buku yang hilang saat kembali dari mencatat, dan ikon PWA yang tidak ada — lolos dari seluruh tes unit dan baru ketahuan di sana.

`db:test` butuh cluster PostgreSQL lokal, sekali siapkan:

```bash
export PATH=/usr/lib/postgresql/16/bin:$PATH
initdb -D ~/pgdata -U postgres --auth=trust
pg_ctl -D ~/pgdata -l ~/pg.log -o '-p 55432 -k /tmp' start
```

Supabase CLI butuh Docker; harness di `supabase/tests/` meniru bagian Supabase yang dipakai (skema `auth`, `auth.uid()`, peran `authenticated`) supaya migrasi bisa diuji tanpa itu. Menunda pengujian skema sampai Docker tersedia berarti migrasi pertama yang benar-benar dijalankan adalah yang berjalan di produksi.

Pengujian isolasi tenant dijalankan sebagai peran `authenticated`, bukan superuser — superuser melewati RLS tanpa peduli policy apa pun, jadi pengujian yang dijalankan sebagai superuser selalu lulus dan tidak membuktikan apa-apa.

## Catatan nama

`NexaUsaha` masih nama sementara. Nama kerja awal "NexaPOS" diganti karena "POS" salah menggambarkan produknya — dan salah menarik pembanding. Kalau namanya POS, orang membandingkannya dengan Majoo dan Kasir Pintar, dan kita kalah di semua kolom fitur. Kalau namanya aplikasi pencatatan, pembandingnya buku tulis.
