# Ezura

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
| Aturan stok: status, urutan, saran kulakan, susun ulang | 19 |
| Struk lebar-tetap (layar = WhatsApp = printer) | 19 |
| Penyandi ESC/POS printer termal | 18 |
| Buku kas, saldo dompet, cocokkan | 21 |
| Rekap bulanan & total tahunan | 14 |
| Laporan penjualan: terlaris, untung kotor, jam ramai | 28 |
| Penyandi `.xlsx` (ZIP + OOXML, tanpa pustaka) | 26 |
| Isi berkas ekspor | 19 |
| Muatan QRIS: TLV, CRC-16, statis→dinamis | 24 |
| Utang & piutang | 17 |
| Foto: pengecilan sebelum disimpan | 5 |
| Unggah foto ke Storage (termasuk jalur gagalnya) | 10 |
| Antrean kirim luring + penggolongan kegagalan | 30 |
| Aksi tulis (tulis lokal + antre, tanpa menunggu jaringan) | 40 |
| Skema, RLS, jalur tulis (PostgreSQL sungguhan) | 92 penegasan |

Layar yang sudah ada: pengaturan awal, beranda, barang & jasa (tab Daftar + Stok), tambah/ubah/arsip, kasir, struk, riwayat struk, kulakan, koreksi hitung fisik, piutang, uang keluar, cadangan, laporan, pasang QRIS, pengaturan.

Struk bisa dicetak ke printer termal Bluetooth (Web Bluetooth + ESC/POS) — **teks yang sama persis** dengan yang tampil di layar dan yang dikirim ke WhatsApp. Penyandinya menerima string, bukan `Sale`, jadi tidak ada tempat kedua yang bisa melenceng. Kodenya sudah lengkap dan teruji; yang belum adalah pengujian dengan printer sungguhan.

Login sudah ada, dan **bukan sebagai gerbang**: seluruh aplikasi jalan penuh tanpa akun. Tenant dibuat di perangkat dengan UUID sendiri, dan baru diklaim oleh sebuah akun saat antrean pertama kali terkirim — `create_tenant` memang menerima `p_tenant_id` dari perangkat. Antrean kirim berjalan saat aplikasi dibuka, saat sinyal kembali, saat antrean bertambah, dan berkala.

Laporan bulanan sudah ada: rekap per bulan, total tahunan, barang terlaris, untung kotor dari harga modal yang disalin saat transaksi, dan jam paling ramai. Seluruh catatan bisa diunduh jadi satu berkas `.xlsx` — **penyandinya ditulis sendiri**, tanpa pustaka: `.xlsx` cuma ZIP berisi XML, dan `exceljs` membawa lebih dari satu megabita untuk tabel datar. Ekspor dipakai sebulan sekali; kasir dibuka puluhan kali sehari.

Penyandi buatan sendiri punya satu bahaya khas: tes yang ditulis di repo yang sama membaca hasilnya dengan anggapan yang sama, jadi keduanya bisa sama-sama salah dan tetap cocok. Karena itu ada satu berkas tes yang menyerahkan hasilnya ke **`openpyxl`** — pustaka Python yang menerapkan OOXML secara terpisah — dengan peringatan dinaikkan jadi galat. Uji asap melangkah lebih jauh lagi: ia menekan tombolnya di Chromium sungguhan, menangkap berkas yang benar-benar terunduh, lalu membacanya dengan `openpyxl`. Bagian `<cellStyles>` yang hilang tertangkap justru oleh pemeriksaan itu, dan tidak oleh satu pun tes di repo ini.

**QRIS dengan nominal sudah terisi**, tanpa penyedia jasa pembayaran dan tanpa biaya tambahan. Caranya memakai QRIS statis yang **sudah dimiliki** usahanya — yang tertempel di meja: muatannya mengikuti spesifikasi EMVCo, jadi nominalnya bisa disisipkan di HP (ubah tag `01` jadi `12`, sisipkan tag `54`, hitung ulang CRC-16). Murni komputasi lokal, jalan tanpa sinyal. QRIS dinamis dari PJP menuntut badan usaha terdaftar dan potongan tiap transaksi; ini tidak.

Batasnya ditulis di layarnya sendiri dan tidak dikaburkan: **aplikasi tidak pernah tahu uangnya sudah masuk.** Tidak ada jalur balik dari bank, jadi penjualannya baru tercatat setelah pemiliknya menekan tombol — bukan otomatis begitu QR-nya tampil.

Diuji dengan cara yang sama kerasnya seperti ekspor: CRC dan muatan pembandingnya dihitung `binascii.crc_hqx` milik Python, dan uji asap **memotret QR yang tergambar di layar lalu memindainya balik** dengan `jsqr`, memastikan yang akan dilihat kamera pembeli benar-benar berisi nominal yang tepat dengan data merchant yang tidak tergeser. Pemeriksaan itu langsung menangkap satu bug tata letak nyata: bilah tombol di dasar layar menutupi seperempat bagian bawah kodenya, dan QR yang terpotong gagal dipindai sama sekali.

Foto katalog ikut tersalin ke Supabase Storage. Sebelumnya foto hanya ada sebagai blob di IndexedDB satu HP — katalognya tersalin, fotonya tidak, jadi kalau HP-nya hilang yang kembali adalah daftar barang **tanpa satu pun fotonya**. Pada kasir yang seluruh cara pakainya "ketuk fotonya", itu praktis berarti mengisi ulang katalog dari nol.

Embernya **tidak publik**, dan nama berkasnya `<tenant>/<item>` — seluruh keamanannya bertumpu pada policy yang memeriksa segmen folder pertama. Harness lokal sekarang punya tiruan skema `storage` supaya keempat policy itu benar-benar diuji: kontrol negatif membuktikannya sensitif — pemeriksaan foldernya dilepas, dan satu tenant langsung bisa menulis foto ke folder tenant lain.

Belum ada: penarikan data dari peladen (untuk HP kedua).

### Supabase

Proyeknya sudah berdiri dan keenam migrasi sudah terpasang — 12 tabel, RLS aktif di semuanya, 14 fungsi jalur tulis. Advisor Supabase dijalankan setelahnya dan menemukan satu hal yang benar-benar berbahaya:

> **`anon` bisa memanggil setiap fungsi dan membaca setiap tabel di skema `public`.**

Bukan karena migrasinya salah, tapi karena Supabase memberi `anon` hak itu lewat *default privileges* untuk tiap objek baru — dan `revoke ... from public` tidak mencabutnya, karena ia grant eksplisit, bukan warisan `public`. Hari itu tidak ada yang bocor (RLS aktif dan tidak satu pun policy menyebut `anon`), tapi sifatnya buruk: satu tabel baru yang lupa RLS langsung terbuka tanpa login.

Ditutup di `20260810120000_harden.sql` dan `20260810120100_harden_anon_tables.sql`, lalu diuji: harness lokal sekarang **meniru pemberian hak itu** supaya penegasannya benar-benar menguji pencabutannya. Kontrol negatif membuktikan tesnya sensitif — dengan `revoke`-nya dimatikan, tes menyebutkan ke-18 fungsi dan ke-12 tabel yang terbuka.

Lubang yang sama sempat terbuka lagi: bentuk `alter default privileges **in schema public** revoke execute on functions from public` diterima tanpa galat, tersimpan rapi di `pg_default_acl`, dan tidak mengubah apa pun — bawaan PostgreSQL hanya bisa ditekan lewat default privileges tingkat peran, tanpa `in schema`. Fungsi berikutnya yang dibuat kembali bisa dipanggil tanpa login, dan lagi-lagi yang menangkapnya adalah tesnya.

Dua peringatan yang tersisa dibiarkan sadar: `create_tenant` dan `current_tenant_ids` memang harus bisa dipanggil pengguna yang login. Alasannya ditulis di migrasinya.

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
npm test          # 380 tes unit
npm run typecheck
npm run db:test   # 92 penegasan: migrasi, RLS, jalur tulis

npm run build && npx next start -p 3311 &
npm run smoke     # alur nyata di peramban sungguhan
npm run shots     # tangkapan layar tiap halaman, dengan data yang masuk akal
```

`npm run shots` mengisi katalog, menjual, kulakan, dan menagih lebih dulu, lalu memotret seluruh halaman ke `shots/`. Dipakai untuk melihat rancangannya sebagai satu kesatuan: kebanyakan kejanggalan tata letak baru terlihat saat sepuluh layar dijejerkan, bukan saat dilihat satu per satu.

`npm run smoke` menjalankan satu hari kerja lengkap di Chromium — 44 langkah: buka usaha, isi katalog dengan satu barang dan satu jasa, jual keduanya dalam satu struk, kulakan, koreksi hitung fisik, jual berutang, terima pelunasan, batalkan satu struk, baca laporannya, unduh seluruh catatan ke Excel, pasang QRIS dan bayar dengannya, lalu ganti nama usaha dan pastikan namanya ikut berubah di kepala struk. Yang diperiksa bukan "layarnya muncul" melainkan angkanya: kulakan **ikut mengurangi kas**, pembatalan **menarik uangnya kembali** dan mengembalikan stok lewat retur, penjumlahan riwayat stok tetap cocok setelah semuanya, dan **stok jasa tidak pernah berkurang.**

Ia menangkap hal yang tidak bisa ditangkap tes unit. Empat bug lolos dari seluruh tes unit dan baru ketahuan di sana: pilihan yang hilang saat kembali dari layar lain, ikon PWA yang tidak ada, **stok awal yang tidak pernah tercatat sebagai mutasi** (sehingga penjumlahan riwayat selamanya meleset sebesar stok awal tiap barang), dan laporan yang **terus menagih pembeli yang sudah melunasi** — karena sisa tagihannya dihitung dari `total − paid` di struk, padahal pelunasan tercatat di daftar utang dan tidak pernah mengubah `paid`. Yang terakhir cuma muncul kalau ada penjualan berutang **dan** pelunasan **dan** laporan dibuka sesudahnya; tidak ada tes unit yang kebetulan menyusun ketiganya.

Tes penyandi `.xlsx` punya satu berkas yang memanggil `openpyxl` lewat `python3`. Kalau pustaka itu tidak terpasang, berkas tesnya **dilewati dengan tanda yang terlihat di keluaran**, bukan lulus diam-diam:

```bash
pip install openpyxl   # opsional; tanpa ini tes oracle dilewati
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

Namanya **Ezura**. Dua nama kerja sebelumnya dibuang: "NexaPOS" karena "POS" salah menarik pembanding — kalau namanya POS, orang membandingkannya dengan Majoo dan Kasir Pintar, dan kita kalah di setiap kolom fitur kecuali satu; lalu "NexaUsaha" karena terdengar seperti aplikasi pembukuan, padahal yang dibangun adalah kasir.

Nama basis data lokalnya juga `ezura`, dan itu **tidak boleh diganti lagi** setelah ada pengguna sungguhan: mengganti nama IndexedDB tidak memindahkan datanya, ia membuat basis data baru yang kosong.
