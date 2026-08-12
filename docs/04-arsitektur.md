# 04 — Arsitektur

## 1. Stack

| Lapis | Pilihan | Alasan |
|---|---|---|
| Frontend | Next.js (App Router) + TypeScript | Satu framework untuk aplikasi dan landing page nanti |
| Styling | Tailwind CSS + shadcn/ui | Sudah dikuasai dari proyek portfolio |
| Database | Supabase (PostgreSQL) | Postgres asli + RLS untuk isolasi tenant |
| Auth | Supabase Auth | Tidak menulis auth sendiri |
| Storage | Supabase Storage | Foto produk; menggantikan S3 di blueprint awal |
| Lokal | IndexedDB via Dexie | Sumber kebenaran di perangkat |
| Terjadwal | pg_cron / Supabase Cron | Menggantikan Redis + BullMQ |
| AI | Claude API via Edge Function | Kunci API tidak pernah di klien |
| Hosting | Vercel (hobby) | Gratis, terintegrasi |

Total biaya berjalan pada tahap awal: **Rp0.**

### Yang dibuang dari blueprint awal, dan penggantinya

| Blueprint awal | Diganti | Alasan |
|---|---|---|
| NestJS server terpisah | Next.js route + Supabase RPC | Satu deploy, bukan dua |
| Prisma | Supabase client + SQL langsung | RLS ditulis di SQL; ORM di atasnya menambah lapisan tanpa manfaat di sini |
| Redis + BullMQ | pg_cron | Yang perlu dijadwalkan cuma pengingat harian |
| Worker terpisah | Edge Function | Tidak ada proses jangka panjang |
| WebSocket / realtime | — | Satu perangkat per usaha. Tidak ada yang perlu disiarkan |
| S3 | Supabase Storage | Sudah termasuk |
| WhatsApp API | Web Push + share ke WhatsApp | Lihat §4 |

Setiap baris di tabel ini adalah komponen yang tidak perlu di-deploy, dipantau, atau dibayar.

---

## 2. Offline-first

### Kenapa ini bukan opsional

Pesaing sebenarnya adalah buku tulis, dan buku tulis terbuka dalam nol detik tanpa sinyal. Aplikasi yang menampilkan spinner saat pemiliknya ingin mencatat penjualan Rp5.000 sudah kalah sebelum fiturnya sempat dinilai.

Karena itu offline-first adalah **arsitektur**, bukan fitur yang ditambahkan belakangan. Aplikasi yang online-first tidak bisa dijadikan offline-first tanpa ditulis ulang.

### Bentuknya

```
   Pemiliknya menekan tombol
          │
          ▼
   Tulis ke IndexedDB  ──▶ UI langsung berubah   (target < 50 ms)
          │
          ▼
   Masuk antrean sinkron
          │
          ▼
   Online? ──tidak──▶ tunggu, coba lagi nanti
          │
         ya
          ▼
   Panggil RPC Supabase (UUID dari perangkat = idempoten)
          │
          ▼
   Tandai tersinkron
```

Aturan yang tidak boleh dilanggar: **tidak ada satu pun jalur mencatat yang menunggu jaringan.** UI berubah karena penulisan lokal berhasil, bukan karena server menjawab.

### Bagian-bagiannya

- **Service worker** — cache-first untuk aset aplikasi, sehingga membuka aplikasi tidak pernah menunggu jaringan
- **Dexie (IndexedDB)** — seluruh data tenant ada di perangkat. Satu usaha setahun jauh di bawah batas penyimpanan browser
- **Antrean sinkron** — tabel Dexie berisi panggilan RPC tertunda, diputar ulang berurutan saat online
- **Tarik inkremental** — `where updated_at >= watermark`, per tabel, saat aplikasi dibuka, saat koneksi kembali, dan berkala. Pembandingnya `>=` dan bukan `>`: dengan `>`, baris yang ditulis pada detik yang sama persis dengan watermark akan terlewat **selamanya**, dan dua penjualan dalam satu detik itu biasa di jam ramai. Akibatnya sebagian baris terambil dua kali, dan itu tidak apa-apa — penyimpanannya `bulkPut` berdasarkan `id`
- **Watermark diambil dari jam peladen** yang menempel di barisnya, bukan dari jam perangkat. Jam HP murah sering meleset berjam-jam, dan watermark yang lebih maju daripada kenyataan berarti baris yang hilang tanpa gejala apa pun sampai ada yang mencari struk lama dan tidak menemukannya
- **Indikator status** — penanda kecil "belum tersinkron", bukan pesan error. Pemiliknya tidak perlu tahu istilah sinkronisasi; dia perlu tahu catatannya aman

### Idempotensi

Kegagalan paling merusak dalam sinkronisasi bukan permintaan yang gagal — tapi permintaan yang **berhasil di server lalu putus sebelum balasannya sampai.** Klien mengira gagal, mengirim ulang, dan penjualan tercatat dua kali. Saldo aplikasi tidak lagi cocok dengan laci, dan kriteria penerimaan paling penting jatuh.

Pencegahannya sudah ada di desain data: primary key dibuat di perangkat, dan setiap fungsi RPC memakai `on conflict do nothing` pada key itu. Mengirim ulang panggilan yang sama menghasilkan keadaan yang sama.

### Konflik

Sekarang tarikannya sudah ada, jadi dua perangkat memang bisa jalan bersamaan. Dan yang ternyata terjadi: **hampir tidak ada yang bentrok** — bukan karena beruntung, melainkan karena bentuk antreannya.

Yang membuat sinkronisasi dua arah berbahaya adalah dua perangkat mengubah **baris yang sama**. Di sini itu jarang, karena antreannya tidak mengangkut baris melainkan **maksud**: yang dikirim `record_sale`, bukan "tulis nilai stok jadi 8". Dua HP yang menjual barang yang sama menghasilkan dua penjualan dengan UUID berbeda, dan peladen yang menjumlahkan akibatnya. Nomor struknya pun tidak bisa kembar — `sale_sequences` ada di peladen, bukan di perangkat.

Sisanya cukup tiga aturan:

| Jenis kolom | Siapa yang benar | Contoh |
|---|---|---|
| Angka hasil hitungan (rollup) | **Peladen, selalu.** Yang ditarik menimpa yang lokal | `stock_qty`, `sold_count` |
| Yang diketik manusia | Yang terakhir menang, dan peladen sudah memastikannya | nama & harga barang |
| Penghapusan | Tidak ada yang dihapus keras, jadi tarikan tidak pernah perlu menghapus | `voided_at`, `archived_at`, `deleted_at` |

Baris ketiga itu yang paling menghemat: karena pembatalan struk, pengarsipan barang, dan penghapusan kas semuanya cuma menyetel kolom waktu, ketiganya ikut menaikkan `updated_at` dan sampai ke perangkat lain sebagai perubahan biasa. Tidak perlu tabel batu nisan, tidak perlu daftar "yang sudah dihapus" yang harus dijaga sepadan di dua tempat.

**Satu aturan yang menahan tarikan:** ia tidak berjalan selama antrean kirim masih berisi. Kalau dilanggar, baris yang perubahannya masih di antrean akan ditimpa keadaan lama dari peladen — suntingan terlihat kembali seperti semula, lalu berubah lagi beberapa detik kemudian. Berkedip seperti itu di layar kasir lebih merusak kepercayaan daripada data yang tertinggal sebentar. Yang menahan cuma antrean `pending`; yang sudah `failed` ditolak permanen dan tidak akan pernah terkirim, jadi membiarkannya menahan berarti satu baris rusak menyandera sinkronisasi HP itu selamanya.

---

## 3. Multi-tenant tanpa membebani pengguna pertama

Sasarannya usaha mikro pada umumnya, dan pembuktiannya dimulai dari satu usaha nyata. Cara menjalankan keduanya sekaligus:

**Di lapisan data — multi-tenant penuh sejak hari pertama.** `tenant_id` di setiap tabel, RLS aktif di setiap tabel, setiap query difilter. Ini tidak menambah satu layar pun bagi penggunanya, tapi menghilangkan migrasi besar yang menyakitkan nanti.

**Di lapisan UI — satu usaha, tidak kelihatan.** Tidak ada pemilih toko, tidak ada undangan anggota, tidak ada pengaturan tenant. `tenant_id` diambil dari `memberships` saat login dan disimpan di konteks. Kata "tenant" tidak pernah muncul di layar.

Yang menahan keputusan ini bukan "penggunanya cuma satu" melainkan bentuk usaha mikro itu sendiri: **pemiliknya adalah kasirnya.** Warung, tukang jahit, laundry rumahan, dan konter pulsa dijalankan satu-dua orang yang sama-sama tahu seluruh isinya, jadi pemilih toko dan peran anggota adalah layar yang tidak menjawab pertanyaan siapa pun.

Membuka multi-tenant di UI belakangan adalah pekerjaan beberapa layar. Menambahkan `tenant_id` ke seluruh skema belakangan adalah pekerjaan berminggu-minggu dan berisiko kebocoran data. Jadi yang mahal dikerjakan sekarang, yang murah ditunda.

**Yang berubah karena sasarannya umum.** Selama sasarannya satu orang, dua hal boleh diabaikan. Sekarang keduanya jadi pertanyaan terbuka yang jujur dicatat di sini, bukan diselesaikan diam-diam:

- **Karyawan.** Sebagian usaha mikro punya satu pegawai yang menjaga kasir saat pemiliknya keluar. Sekarang jalan satu-satunya adalah berbagi akun, dan itu berarti tidak ada jejak siapa yang menerima uangnya. Skemanya sudah siap (`memberships` sudah ada); yang belum ada layarnya.
- **Auto-pause Supabase.** Selama penggunanya harian, basis datanya tidak pernah menganggur tujuh hari. Begitu ada pendaftar yang mencoba lalu menghilang — dan pada produk umum itu pasti terjadi — proyeknya bisa tertidur dan pengguna yang kembali disambut galat. Lihat [`01-riset-dan-temuan.md §3.1`](01-riset-dan-temuan.md).

---

## 4. Notifikasi

### Keputusan: WhatsApp API tidak masuk MVP

Tiga alasan, sudah dibahas di [`01-riset-dan-temuan.md §2.4`](01-riset-dan-temuan.md):

1. Berbayar per pesan — [~Rp356/pesan utility + PPN 11%](https://cekat.ai/en/blog/harga-whatsapp-api-indonesia-2026) — dan anggarannya nol
2. Perlu verifikasi Meta Business dan umumnya penyedia pihak ketiga
3. Di usaha mikro, **penerimanya adalah orang yang sedang memegang HP itu.** Pemiliknya sendiri yang jaga kasir; mengirim "omzet hari ini" lewat jalur berbayar dan berizin ke orang yang aplikasinya sedang terbuka adalah biaya tanpa manfaat

Alasan ketiga adalah yang paling mudah runtuh kalau nanti ada usaha yang kasirnya dijaga pegawai — dan justru karena itu dicatat: keputusannya **tidak bergantung padanya.** Dua alasan pertama sudah cukup, dan keduanya berlaku untuk usaha mikro mana pun.

Jalur tidak resmi (Baileys, whatsapp-web.js) menghindari biaya tapi mempertaruhkan pemblokiran nomor WhatsApp penggunanya — nomor yang sama yang dipakai pelanggan untuk memesan. Pada usaha mikro, nomor WhatsApp pemilik biasanya **satu-satunya saluran pelanggan**, jadi mempertaruhkannya demi notifikasi yang bisa digantikan gratis adalah pertukaran yang buruk.

### Penggantinya

**Web Push** untuk pengingat ke pemiliknya — gratis, jalan di Chrome Android, terpasang bersama PWA.

| Pengingat | Waktu |
|---|---|
| Jahitan jatuh tempo besok | 19.00 |
| Ringkasan hari ini | 21.00 |
| Stok menipis | saat terdeteksi |
| Belum mencatat hari ini | 20.00, hanya bila kosong |

Dijadwalkan dengan pg_cron di Supabase. Tanpa Redis, tanpa worker.

**Tombol share ke WhatsApp** untuk pesan ke pelanggan. Aplikasi menyusun teksnya, pemiliknya menekan tombol, WhatsApp terbuka dengan pesan siap kirim, dan dia sendiri yang mengirim.

```
https://wa.me/62812xxxx?text=<pesan terenkode>
```

Gratis, tidak melanggar apa pun, tanpa infrastruktur, dan pesannya datang dari nomor pemiliknya sendiri — yang justru lebih dipercaya pelanggan daripada nomor bisnis otomatis.

Contoh yang berguna: konfirmasi order jahit, kabar jahitan sudah jadi, pengingat halus untuk yang belum bayar, dan nota penjualan.

Untuk struk, hal yang sama berlaku: hasilkan gambar atau PDF dan bagikan lewat share sheet. Printer termal Bluetooth bisa menyusul kalau ternyata dibutuhkan — tapi untuk jualan snack di rumah, hampir pasti tidak.

### Kapan WhatsApp API jadi masuk akal

Saat ada tenant berbayar yang mengirim ke *pelanggannya*, bukan ke dirinya sendiri. Di situ biayanya bisa dibebankan ke harga langganan. Sebelum itu, tidak.

---

## 5. AI

Blueprint awal mencantumkan lima fitur AI: produk dari foto, ringkasan penjualan, saran restock, ide promo, dan tanya-jawab data toko. Empat di antaranya menghasilkan tulisan yang enak dibaca tapi tidak mengubah apa pun yang pemiliknya lakukan. Ringkasan penjualan tidak perlu AI — `SUM` sudah cukup, lebih cepat, lebih murah, dan tidak pernah salah.

**Satu fitur AI di MVP: katalog dari foto.**

```
Pemiliknya memotret raknya
        │
        ▼
Foto dikompres di perangkat, diunggah ke Supabase Storage
        │
        ▼
Edge Function → Claude API (vision)
        │
        ▼
Daftar produk terdeteksi: nama + tebakan harga
        │
        ▼
Pemiliknya memeriksa, membetulkan, menyimpan
```

Alasan ini yang dipilih: pekerjaan setup katalog adalah **penghalang adopsi terbesar** — mengetik 40 produk di HP adalah tempat orang berhenti, sebelum aplikasi sempat memberi manfaat apa pun. AI yang memangkas itu dari satu jam menjadi lima menit mengubah hasil akhirnya. AI yang menulis ide promo tidak.

> Bagian ini sempat dicoret saat produknya berbelok jadi aplikasi pencatat keuangan — tanpa katalog, tidak ada yang bisa dikenali dari foto. Sekarang katalog kembali jadi inti produk, dan bersamanya penghalang adopsi terbesarnya. Tetap **bukan** untuk MVP: gerbang katalog diuji dulu apa adanya di Fase 6, karena kalau ternyata pengguna berhenti bukan karena mengetiknya lama, memangkas waktu mengetik tidak menyelamatkan apa-apa.

Aturan yang menyertainya:

- AI **tidak pernah** menulis langsung ke tabel. Keluarannya masuk ke `ai_jobs`, ditampilkan sebagai usulan, dan pemiliknya yang mengonfirmasi.
- Kunci API hanya di Edge Function.
- Gagal AI tidak boleh memblokir apa pun — input manual selalu tersedia berdampingan.
- Fitur AI lain baru ditambahkan kalau ada pertanyaan yang benar-benar ditanyakan penggunanya dan tidak terjawab oleh laporan biasa.

---

## 6. Foto

Foto adalah satu-satunya hal di aplikasi ini yang bisa menghabiskan kuota gratis: batasnya [1 GB storage](https://uibakery.io/blog/supabase-pricing), sementara data teks satu warung setahun tidak sampai puluhan MB.

Aturannya:

- Kompres di perangkat sebelum unggah — sisi terpanjang maks 800px, WebP kualitas 75, target < 60 KB
- Foto katalog tidak perlu resolusi tinggi; ukurannya di layar sekitar 100×100
- Simpan `photo_path`, bukan URL penuh, supaya bisa pindah penyedia
- Cache foto di perangkat lewat service worker

Dengan batas ini, seribu produk masih di bawah 60 MB.

---

## 7. Batas dan risiko

| Batas free tier | Nilai | Kapan jadi masalah |
|---|---|---|
| Database | 500 MB | Sangat jauh. Ribuan tenant |
| Storage | 1 GB | Ini yang lebih dulu penuh — karena itu ada §6 |
| MAU | 50.000 | Tidak relevan di tahap ini |
| Proyek aktif | 2 | Satu produksi, satu staging. Pas |
| **Auto-pause** | **7 hari tanpa aktivitas DB** | Tidak menyentuh pengguna harian. **Menyentuh pendaftar yang mencoba lalu menghilang** — dan pada produk umum itu pasti ada. Harus ditangani sebelum pendaftaran dibuka |

Sumber: [uibakery.io](https://uibakery.io/blog/supabase-pricing), [automationatlas.io](https://automationatlas.io/answers/supabase-free-tier-limits-2026/)

### Risiko lain

**Cadangan data.** Free tier tidak menjamin backup yang bisa dipulihkan sendiri, dan yang disimpan di sini adalah catatan penghasilan orang yang sebenarnya — bukan data contoh. Sejak hari pertama: ekspor terjadwal ke penyimpanan lain, plus tombol "ekspor semua ke Excel" yang bisa ditekan pemiliknya sendiri tanpa meminta siapa pun.

**Ketergantungan satu penyedia.** Supabase adalah PostgreSQL asli, jadi datanya bisa dipindahkan. Yang mengikat adalah Auth dan Storage. Dapat diterima untuk sekarang, dan diakses lewat lapisan tipis supaya bisa diganti.

**Batasan iOS.** Web Push di iOS baru bekerja setelah PWA dipasang ke home screen, dan IndexedDB bisa dibersihkan sistem setelah lama tidak dipakai. Pengguna pilotnya memakai Android, jadi ini tidak menghambat sekarang — tapi begitu pendaftaran dibuka, sebagian penggunanya pasti memakai iPhone, dan yang paling berbahaya di antara keduanya adalah IndexedDB yang dibersihkan: di aplikasi yang sumber kebenarannya di perangkat, itu berarti catatan hilang.

---

## 8. Struktur proyek

```
src/
  app/
    page.tsx                   # beranda: masuk hari ini, Kasir, rekap, peringatan
    mulai/                     # pengaturan awal
    katalog/                   # daftar barang & jasa
      baru/                    # tambah / ubah / arsip
    kasir/                     # grid → keranjang → bayar
    struk/[id]/                # struk: lihat, kirim WhatsApp, (cetak)
    keluar/                    # uang keluar manual
  lib/
    db/local.ts                # skema Dexie + query lokal
    sync/                      # antrean, pemutaran ulang, tarik inkremental
    supabase/                  # klien + pembungkus RPC
    actions/pos.ts             # jalur tulis klien: tulis lokal + antre
    money.ts                   # bigint rupiah, format, parse
    photo.ts                   # pengecilan foto di perangkat
    domain/                    # aturan bisnis murni, tanpa I/O
      types.ts                 #   Item = Barang | Jasa
      cart.ts                  #   keranjang, diskon, peringatan stok
      receipt.ts               #   struk lebar-tetap
      cash.ts recap.ts debt.ts dates.ts
  components/
supabase/
  migrations/
  tests/                       # harness + pengujian SQL tanpa Docker
```

`lib/domain/` sengaja dipisah dan bebas I/O: perhitungan untung, saldo, dan sisa bayar adalah tempat kesalahan paling mahal, dan fungsi murni bisa diuji tanpa database.

---

## 9. Pengujian

Tidak perlu cakupan penuh. Tapi tiga area ini wajib diuji, karena kegagalannya menghancurkan kepercayaan dan sulit disadari:

1. **Perhitungan uang** — untung, saldo, sisa bayar, cicilan. Uji unit terhadap `lib/domain/`, termasuk kasus tepi: bayar lebih, void setelah cicilan, diskon melebihi total.
2. **Idempotensi sinkronisasi** — putar ulang panggilan RPC yang sama sepuluh kali, pastikan hasilnya identik dengan sekali.
3. **Isolasi tenant** — buat dua tenant, pastikan yang satu tidak bisa membaca atau menulis data yang lain lewat setiap tabel. Ini uji keamanan, dan satu-satunya cara memastikan RLS benar-benar aktif di tabel yang baru ditambahkan.

Sisanya bisa menyusul.
