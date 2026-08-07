# 08 — Posisi Produk

Dokumen ini menjawab pertanyaan yang lebih besar dari "apa yang ibu butuhkan": untuk siapa produk ini, dan kenapa orang akan memilihnya.

Ditulis setelah rancangannya sempat terlalu menyempit ke satu pengguna. Koreksinya bukan membuang yang spesifik, tapi memisahkan **kosakata** dari **pembuktian**.

---

## 1. Ketegangan yang harus diselesaikan

Ada dua cara gagal, dan keduanya nyata:

**Terlalu umum.** Blueprint pertama proyek ini merancang "POS universal untuk semua jenis UMKM" tanpa satu pun pengguna nyata. Hasilnya daftar fitur yang cocok untuk semua orang dan tidak dipakai siapa pun.

**Terlalu sempit.** Rancangan berikutnya berangkat dari catatan satu orang dan menyerap kekhususannya sampai ke nama kategori — `jahit`, `snack`, `dari_bapak`. Berguna untuk satu orang, tidak bisa dipakai orang kedua.

Jalan keluarnya bukan di tengah-tengah, melainkan pemisahan yang tegas:

> **Kosakata umum, pembuktian spesifik.**
>
> Kategori, dompet, dan istilah dirancang untuk usaha apa pun. Pembuktian bahwa aplikasinya benar-benar dipakai dilakukan pada satu pengguna nyata, tiap hari, selama sebulan.

Satu pengguna yang bertahan sebulan lebih membuktikan daripada seratus pendaftar yang berhenti di minggu pertama.

---

## 2. Masalah yang dikejar

[Penelitian menemukan 73% UMKM Indonesia tidak memisahkan keuangan usaha dan pribadi](https://journal.unespadang.ac.id/jaaip/article/view/596), dan mayoritas usaha mikro hanya punya satu rekening untuk keduanya.

Akibatnya berantai:

- Tidak tahu usahanya untung atau tidak, karena uang belanja rumah ikut terhitung sebagai biaya usaha
- Modal terpakai tanpa disadari, karena uang di dompet terlihat banyak
- Tidak bisa mengajukan pembiayaan, karena tidak ada laporan yang bisa dipercaya

Semua aplikasi pembukuan UMKM yang ada **mengasumsikan pemisahan itu sudah terjadi.** Mereka menyediakan buku usaha, lalu menyerahkan urusan "jangan campur dengan uang pribadi" kepada disiplin penggunanya.

Untuk tiga perempat pasarnya, asumsi itu salah.

---

## 3. Posisi

> Aplikasi pencatatan yang **melakukan** pemisahan uang usaha dan uang rumah tangga — bukan yang menuntut penggunanya memisahkan lebih dulu.

Perbedaannya terlihat di satu keputusan teknis: **buku melekat pada tiap catatan, bukan pada dompet.**

| | Menjawab | Untuk |
|---|---|---|
| **Dompet** | Uangnya ada di mana | Saldo |
| **Buku** | Kegiatan mana yang menghasilkan/menghabiskannya | Laporan |

Keduanya tegak lurus. Satu dompet bisa menampung uang usaha dan uang rumah sekaligus; label buku di tiap entri yang membedakannya.

Praktisnya: belanja dapur yang dibayar pakai uang dagangan cukup dicatat sebagai pengeluaran berbuku rumah, dari dompet yang sama. **Pemisahannya terjadi tepat saat uangnya keluar, dengan satu ketukan** — bukan menuntut rekening kedua yang tidak akan pernah dibuka.

Kalau buku diikat ke dompet — seperti rancangan sebelumnya — 73% pasarnya harus mengarang dompet palsu sebelum bisa memakai fitur intinya. Itu bukan detail teknis; itu perbedaan antara produk yang terpakai dan yang tidak.

---

## 4. Untuk siapa

**Usaha mikro yang keuangannya masih menyatu dengan rumah tangga.** Warung, toko kelontong, katering, gerobak, laundry, jahit, salon, servis, toko online.

Yang menyatukan mereka bukan jenis dagangannya, tapi tiga keadaan:

1. Pemiliknya juga yang mencatat, di HP, di sela melayani
2. Uang usaha dan uang rumah keluar dari tempat yang sama
3. Catatannya di buku tulis, aplikasi catatan HP, atau tidak ada sama sekali

**Bukan untuk:** usaha yang sudah punya kasir, karyawan, dan rekening perusahaan terpisah. Mereka sudah dilayani Majoo, Qasir, dan Kasir Pintar — dan bersaing di sana berarti bersaing di kelengkapan fitur melawan tim yang jauh lebih besar.

---

## 5. Kenapa bukan pemain yang sudah ada

| Pembanding | Kalah di mana |
|---|---|
| **Buku tulis** | Penjumlahan otomatis, rekap bulanan, ingat siapa belum bayar, tidak bisa hilang |
| **Aplikasi catatan HP** | Tidak bisa menjumlah, tidak bisa memisahkan buku |
| **BukuWarung / BukuKas** | Mengasumsikan usaha sudah terpisah dari rumah tangga |
| **POS (Majoo, Qasir, Kasir Pintar)** | Butuh setup katalog dan stok sebelum manfaat pertama terasa; berbayar; dirancang untuk toko berkasir |

Yang paling penting dari tabel itu baris pertama. **Pesaing sebenarnya adalah buku tulis**, dan buku tulis terbuka dalam nol detik tanpa sinyal, tidak pernah minta login, tidak pernah error. Itu yang menentukan seluruh keputusan teknis di [`04-arsitektur.md`](04-arsitektur.md).

---

## 6. Yang membuat orang bertahan

Aturan yang lahir dari kegagalan nyata — bot WhatsApp yang pernah dibangun untuk pengguna pertama, dipakai sebentar, lalu ditinggalkan karena hanya menjawab "sudah disimpan":

> **Setiap kali pengguna memasukkan sesuatu, dia harus langsung menerima sesuatu.**

Total hari ini dan rekap bulan ini terlihat tanpa berpindah layar. Bukan di balik menu laporan.

Tiga hal lain yang menahan orang bertahan, semuanya sudah tertanam di rancangan:

- **Tidak ada gerbang di awal.** Tidak ada katalog produk, tidak ada daftar kategori yang harus diisi. Pintasan tumbuh sendiri dari pemakaian.
- **Tidak pernah menunggu jaringan.** Catat dulu, kirim belakangan.
- **Angkanya cocok dengan isi dompet.** Sekali tidak cocok tanpa penjelasan, kepercayaan hilang dan tidak kembali.

---

## 7. Urutan pembuktian

1. **Satu pengguna, 30 hari.** Kalau buku tulisnya berhenti dipakai, produknya benar. Kalau tidak, tidak ada jumlah fitur yang menyelamatkan.
2. **Lima usaha berbeda jenis.** Warung, kuliner, dan jasa — untuk menguji apakah kosakatanya benar-benar umum, atau cuma terasa umum.
3. **Baru bicara harga.**

Gerbang di antara tahap satu dan dua tidak boleh dilewati. Membuka pendaftaran sebelum satu pengguna yang paling termotivasi pun belum bertahan adalah cara memperbanyak kegagalan.

---

## 8. Kosakata

Kategori memakai kata baku dan cukup umum untuk usaha apa pun. Yang dulu spesifik sudah diganti:

| Dulu | Sekarang | Alasan |
|---|---|---|
| `jahit` | `jasa` | Berlaku untuk laundry, salon, servis, jahit |
| `snack` | `penjualan` | Berlaku untuk dagangan apa pun |
| `dari_bapak` | `gaji`, `pemberian` | Uang masuk rumah tangga bisa dari mana saja |
| `transport` | `transportasi` | Kata baku, bukan singkatan |
| `sekolah` | `pendidikan` | Mencakup lebih dari sekolah anak |
| `gas`, `listrik_air` | `utilitas` | Satu kategori untuk listrik, air, dan gas |
| `arisan` | `sosial` | Mencakup arisan, sumbangan, hajatan |

Daftar lengkapnya di [`03-data-model.md`](03-data-model.md). Semua sebutan dikumpulkan di `CATEGORY_LABELS` supaya bisa diganti tanpa menyentuh sisa aplikasi.

**Sumber:** [Pemisahan keuangan pribadi–usaha UMKM](https://journal.unespadang.ac.id/jaaip/article/view/596) · [SAK EMKM](https://accounting.binus.ac.id/2023/08/01/sak-emkm-standar-akuntansi-keuangan-entitas-mikro-kecil-menengah/) · [Harga aplikasi kasir 2026](https://founderplus.id/blog/aplikasi-kasir-pos-ukm-terbaik/)
