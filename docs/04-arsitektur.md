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
| WebSocket / realtime | — | Satu pengguna. Tidak ada yang perlu disiarkan |
| S3 | Supabase Storage | Sudah termasuk |
| WhatsApp API | Web Push + share ke WhatsApp | Lihat §4 |

Setiap baris di tabel ini adalah komponen yang tidak perlu di-deploy, dipantau, atau dibayar.

---

## 2. Offline-first

### Kenapa ini bukan opsional

Pesaing sebenarnya adalah buku tulis, dan buku tulis terbuka dalam nol detik tanpa sinyal. Aplikasi yang menampilkan spinner saat ibu ingin mencatat penjualan Rp5.000 sudah kalah sebelum fiturnya sempat dinilai.

Karena itu offline-first adalah **arsitektur**, bukan fitur yang ditambahkan belakangan. Aplikasi yang online-first tidak bisa dijadikan offline-first tanpa ditulis ulang.

### Bentuknya

```
   Ibu menekan tombol
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
- **Dexie (IndexedDB)** — seluruh data tenant ada di perangkat. Satu warung setahun jauh di bawah batas penyimpanan browser
- **Antrean sinkron** — tabel Dexie berisi panggilan RPC tertunda, diputar ulang berurutan saat online
- **Tarik inkremental** — `where updated_at > last_sync_at` saat aplikasi dibuka dan saat koneksi kembali
- **Indikator status** — penanda kecil "belum tersinkron", bukan pesan error. Ibu tidak perlu tahu istilah sinkronisasi; dia perlu tahu catatannya aman

### Idempotensi

Kegagalan paling merusak dalam sinkronisasi bukan permintaan yang gagal — tapi permintaan yang **berhasil di server lalu putus sebelum balasannya sampai.** Klien mengira gagal, mengirim ulang, dan penjualan tercatat dua kali. Saldo aplikasi tidak lagi cocok dengan laci, dan kriteria penerimaan paling penting jatuh.

Pencegahannya sudah ada di desain data: primary key dibuat di perangkat, dan setiap fungsi RPC memakai `on conflict do nothing` pada key itu. Mengirim ulang panggilan yang sama menghasilkan keadaan yang sama.

### Konflik

Satu tenant, satu pengguna, satu perangkat → "tulisan terakhir menang" sudah memadai, dan mekanisme yang lebih rumit hanya menambah kode yang tidak pernah dieksekusi.

Ini ditinjau ulang saat ada dua orang mencatat bersamaan, bukan sebelumnya.

---

## 3. Multi-tenant tanpa membebani pengguna pertama

Tujuannya "mulai dari ibu, siapkan jadi produk". Cara menjalankan keduanya sekaligus:

**Di lapisan data — multi-tenant penuh sejak hari pertama.** `tenant_id` di setiap tabel, RLS aktif di setiap tabel, setiap query difilter. Ini tidak menambah satu layar pun bagi ibu, tapi menghilangkan migrasi besar yang menyakitkan nanti.

**Di lapisan UI — satu toko, tidak kelihatan.** Tidak ada pemilih toko, tidak ada undangan anggota, tidak ada pengaturan tenant. `tenant_id` diambil dari `memberships` saat login dan disimpan di konteks. Ibu tidak pernah melihat kata "tenant".

Membuka multi-tenant di UI belakangan adalah pekerjaan beberapa layar. Menambahkan `tenant_id` ke seluruh skema belakangan adalah pekerjaan berminggu-minggu dan berisiko kebocoran data. Jadi yang mahal dikerjakan sekarang, yang murah ditunda.

---

## 4. Notifikasi

### Keputusan: WhatsApp API tidak masuk MVP

Tiga alasan, sudah dibahas di [`01-riset-dan-temuan.md §2.4`](01-riset-dan-temuan.md):

1. Berbayar per pesan — [~Rp356/pesan utility + PPN 11%](https://cekat.ai/en/blog/harga-whatsapp-api-indonesia-2026) — dan anggarannya nol
2. Perlu verifikasi Meta Business dan umumnya penyedia pihak ketiga
3. Penerimanya ibu sendiri, yang HP-nya sedang memegang aplikasi itu

Jalur tidak resmi (Baileys, whatsapp-web.js) menghindari biaya tapi mempertaruhkan pemblokiran nomor WhatsApp ibu — nomor yang dipakai pelanggan jahitnya untuk memesan. Pertukaran yang buruk untuk notifikasi yang bisa digantikan gratis.

### Penggantinya

**Web Push** untuk pengingat ke ibu — gratis, jalan di Chrome Android, terpasang bersama PWA.

| Pengingat | Waktu |
|---|---|
| Jahitan jatuh tempo besok | 19.00 |
| Ringkasan hari ini | 21.00 |
| Stok menipis | saat terdeteksi |
| Belum mencatat hari ini | 20.00, hanya bila kosong |

Dijadwalkan dengan pg_cron di Supabase. Tanpa Redis, tanpa worker.

**Tombol share ke WhatsApp** untuk pesan ke pelanggan. Aplikasi menyusun teksnya, ibu menekan tombol, WhatsApp terbuka dengan pesan siap kirim, ibu yang mengirim.

```
https://wa.me/62812xxxx?text=<pesan terenkode>
```

Gratis, tidak melanggar apa pun, tanpa infrastruktur, dan pesannya datang dari nomor ibu sendiri — yang justru lebih dipercaya pelanggan daripada nomor bisnis otomatis.

Contoh yang berguna: konfirmasi order jahit, kabar jahitan sudah jadi, pengingat halus untuk yang belum bayar, dan nota penjualan.

Untuk struk, hal yang sama berlaku: hasilkan gambar atau PDF dan bagikan lewat share sheet. Printer termal Bluetooth bisa menyusul kalau ternyata dibutuhkan — tapi untuk jualan snack di rumah, hampir pasti tidak.

### Kapan WhatsApp API jadi masuk akal

Saat ada tenant berbayar yang mengirim ke *pelanggannya*, bukan ke dirinya sendiri. Di situ biayanya bisa dibebankan ke harga langganan. Sebelum itu, tidak.

---

## 5. AI

Blueprint awal mencantumkan lima fitur AI: produk dari foto, ringkasan penjualan, saran restock, ide promo, dan tanya-jawab data toko. Empat di antaranya menghasilkan tulisan yang enak dibaca tapi tidak mengubah apa pun yang ibu lakukan. Ringkasan penjualan tidak perlu AI — `SUM` sudah cukup, lebih cepat, lebih murah, dan tidak pernah salah.

**Satu fitur AI di MVP: katalog dari foto.**

```
Ibu memotret rak snacknya
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
Ibu memeriksa, membetulkan, menyimpan
```

Alasan ini yang dipilih: pekerjaan setup katalog adalah **penghalang adopsi terbesar** — mengetik 40 produk di HP adalah tempat orang berhenti, sebelum aplikasi sempat memberi manfaat apa pun. AI yang memangkas itu dari satu jam menjadi lima menit mengubah hasil akhirnya. AI yang menulis ide promo tidak.

Aturan yang menyertainya:

- AI **tidak pernah** menulis langsung ke tabel. Keluarannya masuk ke `ai_jobs`, ditampilkan sebagai usulan, dan ibu yang mengonfirmasi.
- Kunci API hanya di Edge Function.
- Gagal AI tidak boleh memblokir apa pun — input manual selalu tersedia berdampingan.
- Fitur AI lain baru ditambahkan kalau ada pertanyaan yang benar-benar ditanyakan ibu dan tidak terjawab oleh laporan biasa.

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
| **Auto-pause** | **7 hari tanpa aktivitas DB** | Tidak berlaku untuk ibu (harian). **Berlaku untuk tenant percobaan yang mendaftar lalu menghilang** — catat untuk fase komersial |

Sumber: [uibakery.io](https://uibakery.io/blog/supabase-pricing), [automationatlas.io](https://automationatlas.io/answers/supabase-free-tier-limits-2026/)

### Risiko lain

**Cadangan data.** Free tier tidak menjamin backup yang bisa dipulihkan sendiri. Ini data usaha ibu yang sebenarnya. Sejak hari pertama: ekspor terjadwal ke penyimpanan lain, plus tombol "ekspor semua ke Excel" yang bisa ibu tekan sendiri.

**Ketergantungan satu penyedia.** Supabase adalah PostgreSQL asli, jadi datanya bisa dipindahkan. Yang mengikat adalah Auth dan Storage. Dapat diterima untuk sekarang, dan diakses lewat lapisan tipis supaya bisa diganti.

**Batasan iOS.** Web Push di iOS baru bekerja setelah PWA dipasang ke home screen, dan IndexedDB bisa dibersihkan sistem setelah lama tidak dipakai. Tidak relevan untuk ibu (Android), tapi relevan saat produk dibuka untuk umum.

---

## 8. Struktur proyek

```
src/
  app/
    (app)/
      page.tsx                 # beranda: 3 tombol + ringkasan
      jual/                    # layar jual
      jahit/                   # order jahit
      keluar/                  # catat pengeluaran
      utang/                   # piutang
      stok/
      laporan/
      pengaturan/
    api/
      ai/catalog/route.ts
  lib/
    db/                        # skema Dexie + query lokal
    sync/                      # antrean, pemutaran ulang, tarik inkremental
    supabase/                  # klien + pembungkus RPC
    money.ts                   # bigint rupiah, format, parse
    domain/                    # aturan bisnis murni, tanpa I/O
  components/
supabase/
  migrations/
  functions/
```

`lib/domain/` sengaja dipisah dan bebas I/O: perhitungan untung, saldo, dan sisa bayar adalah tempat kesalahan paling mahal, dan fungsi murni bisa diuji tanpa database.

---

## 9. Pengujian

Tidak perlu cakupan penuh. Tapi tiga area ini wajib diuji, karena kegagalannya menghancurkan kepercayaan dan sulit disadari:

1. **Perhitungan uang** — untung, saldo, sisa bayar, cicilan. Uji unit terhadap `lib/domain/`, termasuk kasus tepi: bayar lebih, void setelah cicilan, diskon melebihi total.
2. **Idempotensi sinkronisasi** — putar ulang panggilan RPC yang sama sepuluh kali, pastikan hasilnya identik dengan sekali.
3. **Isolasi tenant** — buat dua tenant, pastikan yang satu tidak bisa membaca atau menulis data yang lain lewat setiap tabel. Ini uji keamanan, dan satu-satunya cara memastikan RLS benar-benar aktif di tabel yang baru ditambahkan.

Sisanya bisa menyusul.
