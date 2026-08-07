# NexaUsaha

Aplikasi pencatatan untuk usaha rumahan yang punya **dua buku**: uang hasil kerja sendiri, dan uang belanja rumah tangga.

Dimulai dari satu pengguna nyata: ibu saya, yang sampai hari ini mencatat semuanya di buku tulis.

## Kenapa repo ini ada

Ini bukan proyek yang lahir dari riset pasar. Ini lahir dari melihat ibu saya membuka buku tulis dan menjumlah rekap bulanan dengan pulpen — delapan belas bulan berturut-turut, lengkap dengan total tahunan.

Target keberhasilannya satu kalimat:

> **Setelah 30 hari, buku tulis itu tidak dipakai lagi.**

## Apa yang ada di buku ibu

Lima halaman catatan aslinya membentuk ulang seluruh rancangan produk ini. Ringkasnya:

- **Dua buku terpisah.** Penghasilan ibu (jahit, snack) dan belanja rumah tangga (dananya dari bapak). Ibu sendiri menegaskan rekap bulanannya *di luar* uang dari bapak.
- **Rekap bulanan dijumlah tangan.** Januari 2025 – Juni 2026, total 2025 `9.195.500`. Ini yang paling dia inginkan.
- **Snack tidak pernah dicatat** — uangnya dipisahkan ke dompet lain, tapi tidak masuk hitungan mana pun. Artinya rekap ibu selama ini di bawah yang sebenarnya.
- **Jasa jahit sangat sederhana.** Tanggal + jenis + harga. Tidak ada ukuran, DP, atau deadline.
- **Dompet fisik adalah sistem akuntansinya.** Snack, jahit, belanja, rekening — sudah dipisah sendiri, jauh sebelum ada aplikasi.

Bukti lengkapnya, termasuk aritmetika yang membuktikan tiap kesimpulan: [`docs/07-temuan-catatan-ibu.md`](docs/07-temuan-catatan-ibu.md).

## Pelajaran dari percobaan sebelumnya

Pernah dibangun pencatat keuangan lewat WhatsApp dengan AI dan spreadsheet. Ibu memakainya sebentar lalu berhenti — AI-nya sering error, dan balasannya cuma *"sudah disimpan"*. Untuk tahu pemasukan sebulan, tetap harus membuka spreadsheet.

Diagnosisnya bukan soal AI. Yang dibangun cuma separuh: pencatatannya jalan, pembacaan-kembalinya tidak ada. Aturan yang lahir dari situ, dan berlaku di seluruh aplikasi:

> **Setiap kali ibu memasukkan sesuatu, dia harus langsung menerima sesuatu.**

Percobaan itu juga meninggalkan bukti berharga: ibu bersedia mencatat lewat aplikasi. Yang gagal bukan kesediaannya.

## Status

Fondasi selesai dan teruji. Yang tersisa: layar-layar catat.

| Selesai | Tes |
|---|---|
| Perhitungan uang (rupiah `bigint`, pembulatan eksplisit) | 43 |
| Tanggal & zona waktu (WIB, bukan UTC) | 18 |
| Buku kas, dua buku, saldo dompet, cocokkan | 20 |
| Rekap bulanan & total tahunan | 14 |
| Utang & piutang | 17 |
| Antrean kirim luring + penggolongan kegagalan | 30 |
| Skema, RLS, jalur tulis (PostgreSQL sungguhan) | 48 |

Belum ada: layar catat pemasukan/pengeluaran, layar rekap, autentikasi.

## Dokumen

| Dokumen | Isi |
|---|---|
| [`docs/07-temuan-catatan-ibu.md`](docs/07-temuan-catatan-ibu.md) | **Mulai di sini.** Bukti dari catatan asli, dan asumsi mana yang gugur |
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
npm test          # 142 tes unit
npm run typecheck
npm run db:test   # 48 penegasan: migrasi, RLS, jalur tulis
```

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
