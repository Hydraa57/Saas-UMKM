# NexaUsaha

**Aplikasi kasir untuk usaha yang menjual barang sekaligus menerima jasa.**
Layani pembeli, cetak struk — pembukuan dan stok terisi sendiri.

Untuk usaha mikro apa pun: warung, katering, laundry, jahit, servis, bengkel, salon. Dibuktikan pada satu pengguna nyata lebih dulu — ibu saya, yang menjual snack sekaligus menerima jahitan, dan sampai hari ini mencatat semuanya di buku tulis.

## Celah yang dituju

Semua aplikasi kasir dibangun untuk barang. Jasa ditempelkan belakangan — biasanya sebagai "produk dengan stok tak terbatas", yang berarti pengguna harus mengarang angka stok untuk sesuatu yang tidak punya stok, lalu menunggu sampai suatu hari "Potong celana" dilaporkan habis.

Padahal usaha mikro Indonesia jarang murni satu jenis: tukang jahit menjual kancing, bengkel menjual oli, salon menjual sampo, warung snack menerima jahitan.

Di sini bedanya ditegakkan di lapisan data, bukan diserahkan ke kedisiplinan kode:

```sql
constraint stock_only_for_goods check (
  (kind = 'barang') = (stock_qty is not null)
)
```

Jasa **tidak punya kolom stok yang terisi** — bukan nol, bukan tak terbatas. Tiga lapis menjaganya: tipe TypeScript (`stockQty` hanya ada pada `Barang`), fungsi RPC, dan constraint tabel. Di layar, kolom stok **hilang** dari formulir jasa, bukan dinonaktifkan.

Uraian lengkapnya di [`docs/08-posisi-produk.md`](docs/08-posisi-produk.md).

## Kenapa repo ini ada

Bukan lahir dari riset pasar, tapi dari melihat ibu saya menjumlah rekap bulanan dengan pulpen — delapan belas bulan berturut-turut, lengkap dengan total tahunan.

Kosakata aplikasinya umum; pembuktiannya spesifik. Target keberhasilan tahap pertama satu kalimat:

> **Setelah 30 hari, buku tulis itu tidak dipakai lagi.**

Satu pengguna yang bertahan sebulan lebih membuktikan daripada seratus pendaftar yang berhenti di minggu pertama.

## Tiga arah yang sudah dicoba dan dibuang

Arah produknya berbelok dua kali, dan keduanya tercatat karena alasannya masih berlaku:

1. **"POS universal untuk semua UMKM"** — cabang, RBAC, stock opname, WhatsApp API, add-on AI. Dirancang tanpa satu pun pengguna nyata. Daftar fitur yang cocok untuk semua orang dan tidak dipakai siapa pun.
2. **Aplikasi pencatat pemasukan/pengeluaran dua buku** (usaha & rumah tangga). Alurnya jalan, tesnya lengkap, dan tetap salah jenis: saya **sudah punya** [NayyiraAI](https://nayyiraai.online) untuk itu. Membangunnya berarti bersaing dengan produk sendiri.
3. **Sekarang: aplikasi kasir.** Pencatatan bukan fiturnya — pencatatan adalah akibat dari melayani pembeli.

Kesalahan kedua punya akar yang bisa ditunjuk. Buku tulis ibu tidak memuat stok, harga modal, maupun daftar barang, dan itu dibaca sebagai *"stok tidak dibutuhkan"*. Yang benar: **buku tulis memang tidak bisa melacak stok.** Ketiadaan di kertas adalah batas kertasnya, bukan batas kebutuhannya.

## Pelajaran dari percobaan sebelumnya

Pernah dibangun pencatat keuangan lewat WhatsApp dengan AI dan spreadsheet. Ibu memakainya sebentar lalu berhenti — AI-nya sering error, dan balasannya cuma *"sudah disimpan"*. Untuk tahu pemasukan sebulan, tetap harus membuka spreadsheet.

Diagnosisnya bukan soal AI. Yang dibangun cuma separuh: pencatatannya jalan, pembacaan-kembalinya tidak ada. Aturan yang lahir dari situ, dan berlaku di seluruh aplikasi:

> **Setiap kali pengguna memasukkan sesuatu, dia harus langsung menerima sesuatu.**

Di kasir, yang diterima berwujud: **struk.** Bisa dilihat, dikirim ke WhatsApp pembeli, dan nanti dicetak ke printer termal — teks lebar-tetap yang sama persis untuk ketiganya, supaya struk yang dilihat, dibagikan, dan dicetak tidak pernah berbeda.

Percobaan itu juga meninggalkan bukti berharga: ibu bersedia memakai aplikasi. Yang gagal bukan kesediaannya.

## Status

Alur pokoknya sudah jalan dari ujung ke ujung: pengaturan awal → isi katalog → kasir → struk → stok berkurang → pembukuan terisi. Diuji di peramban sungguhan, bukan cuma di tes unit.

| Selesai | Tes |
|---|---|
| Perhitungan uang (rupiah `bigint`, pembulatan eksplisit) | 43 |
| Tanggal & zona waktu (WIB, bukan UTC) | 18 |
| Keranjang, diskon, peringatan stok | 29 |
| Struk lebar-tetap (layar = WhatsApp = printer) | 19 |
| Buku kas, saldo dompet, cocokkan | 21 |
| Rekap bulanan & total tahunan | 14 |
| Utang & piutang | 17 |
| Foto: pengecilan sebelum disimpan | 5 |
| Antrean kirim luring + penggolongan kegagalan | 30 |
| Aksi tulis (tulis lokal + antre, tanpa menunggu jaringan) | 24 |
| Skema, RLS, jalur tulis (PostgreSQL sungguhan) | 62 penegasan |

Layar yang sudah ada: pengaturan awal, beranda, katalog (daftar, tambah, ubah, arsip), kasir, struk, uang keluar.

Belum ada: printer termal, kulakan, koreksi stok, riwayat struk, autentikasi, penarikan data dari peladen, laporan bulanan penuh.

## Dokumen

| Dokumen | Isi |
|---|---|
| [`docs/08-posisi-produk.md`](docs/08-posisi-produk.md) | **Mulai di sini.** Untuk siapa, kenapa dipilih, dan tiga arah yang dibuang |
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
npm test          # 220 tes unit
npm run typecheck
npm run db:test   # 62 penegasan: migrasi, RLS, jalur tulis

npm run build && npx next start -p 3311 &
npm run smoke     # alur nyata di peramban sungguhan
```

`npm run smoke` menjalankan satu hari kerja lengkap di Chromium: buka usaha, isi katalog dengan satu barang dan satu jasa, jual keduanya dalam satu struk, lalu periksa tiga hal — strukya keluar, stok barang berkurang, dan **stok jasa tidak pernah berkurang.**

Ia menangkap hal yang tidak bisa ditangkap tes unit. Dua bug UX pertama — pilihan yang hilang saat kembali dari layar lain, dan ikon PWA yang tidak ada — lolos dari seluruh tes unit dan baru ketahuan di sana.

`db:test` butuh cluster PostgreSQL lokal, sekali siapkan:

```bash
export PATH=/usr/lib/postgresql/16/bin:$PATH
initdb -D ~/pgdata -U postgres --auth=trust
pg_ctl -D ~/pgdata -l ~/pg.log -o '-p 55432 -k /tmp' start
```

Supabase CLI butuh Docker; harness di `supabase/tests/` meniru bagian Supabase yang dipakai (skema `auth`, `auth.uid()`, peran `authenticated`) supaya migrasi bisa diuji tanpa itu. Menunda pengujian skema sampai Docker tersedia berarti migrasi pertama yang benar-benar dijalankan adalah yang berjalan di produksi.

Pengujian isolasi tenant dijalankan sebagai peran `authenticated`, bukan superuser — superuser melewati RLS tanpa peduli policy apa pun, jadi pengujian yang dijalankan sebagai superuser selalu lulus dan tidak membuktikan apa-apa.

## Catatan nama

`NexaUsaha` masih nama sementara. Nama kerja awal "NexaPOS" diganti, dan sekarang produknya memang aplikasi kasir — tapi "POS" tetap salah menarik pembanding. Kalau namanya POS, orang membandingkannya dengan Majoo dan Kasir Pintar, dan kita kalah di setiap kolom fitur kecuali satu. Yang ingin dibandingkan adalah buku tulis, dan celahnya: jasa yang tidak pernah bisa habis.
