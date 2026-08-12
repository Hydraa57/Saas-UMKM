> **Ditulis ulang setelah arah produknya dikoreksi.** Versi sebelumnya
> merancang aplikasi pencatat pemasukan/pengeluaran dengan dua buku, usaha
> dan rumah tangga. Alurnya jalan dan tesnya lengkap — dan tetap salah
> jenis: pemiliknya sudah punya NayyiraAI untuk itu. Alasannya di
> [`08-posisi-produk.md`](08-posisi-produk.md) §1.

# 02 — PRD

## 1. Posisi produk

> **Aplikasi kasir untuk usaha yang menjual barang sekaligus menerima jasa.**
> Layani pembeli, cetak struk — pembukuan dan stok terisi sendiri.

Pencatatan bukan fiturnya, melainkan **akibat** dari melayani pembeli. Uraian lengkap beserta risetnya di [`08-posisi-produk.md`](08-posisi-produk.md).

Pembandingnya buku tulis, bukan Majoo. Ini strategi, bukan kerendahan hati: melawan buku tulis kita menang di struk, stok, dan rekap. Melawan POS bermodal kita kalah di setiap kolom fitur — kecuali satu, dan celah itulah yang dituju: **jasa sebagai warga kelas satu, bukan barang berstok tak terbatas.**

Dan pembanding yang paling dekat: **bot WhatsApp yang sudah pernah dicoba dan ditinggalkan.** Aplikasi ini harus menang melawan itu, bukan cuma melawan kertas.

---

## 2. Pengguna

**Sasarannya usaha mikro yang melayani pembeli langsung**, satu orang merangkap pemilik dan kasir, sering menjual barang dan jasa sekaligus.

**Pengguna nomor satu, yang membuktikan: Ibu.** Satu orang nyata, HP Android, yang menjual snack sekaligus menerima jahitan, dan sudah mencatat rapi di buku tulis selama bertahun-tahun. Kosakata aplikasinya umum; pembuktiannya lewat dia.

Yang penting dari profilnya, dan semuanya terbaca dari bukunya:

- **Sudah disiplin mencatat.** Delapan belas bulan rekap bulanan berturut-turut. Masalahnya media, bukan kebiasaan.
- **Sudah pernah mencoba aplikasi dan berhenti.** Itu bukti kesediaannya, sekaligus daftar hal yang tidak boleh diulang.
- **Menjual dua jenis sekaligus.** Snack (barang, punya stok) dan jahitan (jasa, tidak punya stok). Persis kasus yang paling buruk dilayani POS yang ada.

Satu koreksi penting terhadap bacaan sebelumnya: bukunya tidak memuat stok, harga modal, maupun daftar barang, dan itu sempat dibaca sebagai *"stok tidak dibutuhkan"*. Yang benar, **buku tulis memang tidak bisa melacak stok.** Ketiadaan di kertas adalah batas kertasnya.

---

## 3. Kerangka

```
   KATALOG                    KASIR                     AKIBATNYA
   ─────────────────          ──────────────────        ────────────────────
   Barang                     ketuk barang/jasa   ┌───▶ Struk
     nama, foto, harga   ───▶ → keranjang         │       lihat · WhatsApp
     modal, satuan            → Bayar        ─────┤       · printer termal
     stok, min. stok                              │
                                                  ├───▶ Uang masuk (kas)
   Jasa                                           │       kategori penjualan
     nama, harga                                  │
     (tanpa stok —                                ├───▶ Stok berkurang
      tidak pernah habis)                         │       hanya untuk barang
                                                  │
                                                  └───▶ Piutang
                                                          kalau bayarnya kurang
                                                          dan namanya diketahui
```

Tiga hal yang mengalir dari sini:

**Satu ketukan "Bayar" menimbulkan empat akibat sekaligus, atau tidak sama sekali.** Semuanya dalam satu transaksi — di IndexedDB di perangkat, dan di satu fungsi RPC di peladen. Kalau terpisah, aplikasi bisa menampilkan struk untuk penjualan yang stoknya gagal tersimpan, dan angka yang tidak cocok dengan laci menghabiskan kepercayaan untuk seterusnya.

**Jasa tidak punya stok, dan itu ditegakkan di lapisan data.** Bukan stok nol, bukan stok tak terbatas — kolomnya memang kosong, dan constraint tabel menolak isian apa pun. Tiga lapis: tipe TypeScript, fungsi RPC, constraint tabel.

**Kulakan mengurangi kas, bukan cuma menambah stok.** Kalau tidak, "sisa bulan ini" akan selalu terlihat lebih besar daripada isi laci — dan angka yang selalu terlalu bagus lebih cepat ditinggalkan daripada tidak ada angka sama sekali.

---

## 4. Scope MVP

### Masuk

**Katalog barang & jasa** — nama dan harga wajib; foto, stok, satuan, dan harga modal boleh menyusul. Kolom stok **hilang** dari formulir jasa, bukan dinonaktifkan.

**Kasir** — grid foto diurutkan menurut frekuensi terjual, bukan kotak pencarian. Ketuk = masuk keranjang. Bayar tunai/QRIS/transfer, uang pas sekali tap, kembalian dihitung. Memilih QRIS memunculkan kodenya di layar **dengan nominal sudah terisi** (§5.1e).

**Struk** — teks lebar-tetap yang sama persis untuk yang dilihat di layar, yang dikirim ke WhatsApp, dan yang dicetak ke printer termal Bluetooth. Bisa dibuka ulang dari riwayat, dicetak ulang, dan dibatalkan.

**Pembatalan struk** — stok kembali lewat mutasi `retur`, uang ditarik lewat entri kas keluar, piutangnya ikut batal. Struknya ditandai, bukan dihapus: pembatalan justru yang paling perlu bisa diperiksa.

**Stok otomatis** — berkurang saat terjual, bertambah saat kulakan, bisa dikoreksi lewat hitung fisik. Tiap perubahan meninggalkan satu baris mutasi, jadi angkanya selalu bisa dijelaskan.

**Peringatan stok menipis** — muncul sendiri di beranda dan katalog. Tidak pernah melarang penjualan.

**Kulakan** — menambah stok dan mengurangi kas dalam satu operasi.

**Uang keluar manual** — gas, listrik, ongkos angkut, upah harian. Kategori yang lahir dari kasir dan kulakan sengaja tidak bisa dipilih di sini.

**Rekap bulanan** — masuk, keluar, sisa; plus total tahunan, persis seperti di buku tulisnya.

**Piutang** — dibuat otomatis dari struk yang kurang bayar, dan hanya kalau nama pembelinya diketahui. Piutang tanpa nama tidak bisa ditagih. Daftarnya diurutkan dari yang paling lama, bukan yang paling besar: yang lama itu yang paling mungkin terlupakan. Menerima cicilan maupun pelunasan.

**Jalan penuh tanpa internet**, PWA bisa dipasang.

### Tidak masuk

| Dibuang | Alasan |
|---|---|
| Buku rumah tangga | Aplikasi kasir dibuka saat ada pembeli; belanja dapur tidak terjadi di situ. Sudah ada NayyiraAI |
| ~~Laporan untung per barang (HPP)~~ | **Sudah masuk.** Harga modal disalin ke tiap baris struk sejak awal, jadi untung kotor per barang dan per bulan tinggal dihitung — dan itu angka yang buku tulis tidak akan pernah bisa beri |
| Order berjangka: DP, tenggat, status | Yang dicatat cuma tanggal + jenis + harga |
| Varian, satuan bertingkat, diskon per item | Beban input di depan pembeli, untuk kasus yang belum terbukti ada |
| Barcode scanner | Menyusul; grid foto lebih cepat untuk katalog puluhan item |
| Logo usaha di struk | Printer termal mencetaknya sebagai bitmap, dan bitmap adalah satu-satunya bagian struk yang tidak bisa dibagikan sebagai teks — ia akan membuat yang dicetak berbeda dari yang dikirim |
| Multi-cabang, RBAC | Satu orang yang melayani |
| WhatsApp Business API | Berbayar per pesan, perlu verifikasi Meta. Tautan `wa.me` sudah cukup untuk mengirim struk |
| Redis, BullMQ, WebSocket | Tidak dibutuhkan untuk skala ini |

---

## 5. Keputusan UX

### 5.1 Beranda

Satu angka besar (masuk hari ini + jumlah struk), lalu dua pintasan, lalu rekap bulan ini, lalu peringatan yang butuh tindakan.

Kasir tidak ada di beranda melainkan di **tengah bilah navigasi bawah**, menonjol, dan karena itu ia ada di tempat yang sama di setiap layar. Aplikasi ini dibuka saat ada pembeli berdiri di depan meja; apa pun yang berdiri di antara membuka aplikasi dan menerima uang adalah beban.

### 5.1b Navigasi: empat tujuan, bukan tujuh

Bilah bawah: **Beranda · Barang · [Kasir] · Riwayat · Utang.** Dua kiri untuk melihat keadaan sekarang, dua kanan untuk melihat yang sudah terjadi.

"Katalog", "Stok", dan "Kulakan" dulu berdiri sendiri-sendiri di sini, dan itu **tiga kata yang gampang tertukar** — semuanya soal barang, dan tidak jelas dari namanya mana untuk apa. Sekarang ketiganya satu tujuan bernama **Barang**, dengan dua tab di dalamnya:

| Tab | Pertanyaan yang dijawab | Urutan | Ketukan menuju |
|---|---|---|---|
| Daftar | "apa saja yang saya jual, harganya berapa" | abjad, bisa dicari | penyuntingan |
| Stok | "apa yang mau habis, apa yang perlu dibeli" | yang perlu ditindak dulu | riwayat pergerakan |

Kulakan jadi tombol di tab Stok — tepat setelah pemiliknya melihat apa yang menipis. Uang keluar dan tab-nya sendiri tidak dibutuhkan tiap hari, jadi keduanya jadi pintasan di beranda.

Tab disimpan di URL, bukan di state komponen: peringatan "barang menipis" perlu bisa menunjuk langsung ke tab Stok, dan tombol kembali peramban harus mengembalikan ke tab yang tadi dibuka.

Rekap bulanan tetap di layar pertama, tidak disembunyikan di balik menu laporan. Inilah kegagalan bot WhatsApp sebelumnya: penggunanya menyerahkan data dan tidak pernah menerima apa pun sebagai gantinya.

### 5.1c Laporan: dua angka "untung", dan keduanya benar

Tidak ada tab "Laporan" di bilah bawah. Jalan ke sana lewat kartu rekap di beranda — lewat **angka yang memunculkan pertanyaannya.** Menu bernama "Laporan" mengharuskan orang tahu lebih dulu bahwa dia ingin laporan; kartu bertuliskan "Sisa bulan ini −Rp 55.000" tidak.

Layarnya memisahkan dua ringkasan yang sering dikira satu:

| Kartu | Pertanyaan | Sumber |
|---|---|---|
| **Buku kas** | "uangnya ke mana" | seluruh entri kas, termasuk kulakan dan biaya |
| **Dari penjualan** | "dagangannya untung berapa" | omzet − harga modal barang yang keluar |

Keduanya hampir selalu berbeda, dan itu benar: kulakan bulan ini membeli barang yang lakunya bulan depan. Satu angka "untung" gabungan akan menyembunyikan justru bulan yang perlu dilihat — kasnya minus karena kulakan besar padahal dagangannya sehat, atau sebaliknya.

Tiga aturan yang menjaga angkanya jujur:

1. **Harga modal diambil dari salinan saat transaksi**, bukan dari katalog hari ini. Harga kulakan naik-turun; laba bulan lalu harus tetap sama walau harganya sudah diubah minggu ini.
2. **Sisa tagihan dihitung dari daftar utang**, bukan dari `total − paid` di struk. `paid` adalah uang yang berpindah di meja kasir dan tidak pernah berubah lagi — pelunasan seminggu kemudian tercatat di tempat lain. Menghitung dari struk berarti menagih orang yang sudah membayar.
3. **Potongan tingkat struk dibagi ke tiap barisnya** secara proporsional dengan sisa pembagian dibereskan, supaya jumlah omzet per barang persis sama dengan omzet ringkasannya. Dua angka yang seharusnya sama tapi meleset dua rupiah adalah cara tercepat kehilangan kepercayaan.

Sebaran jam **tidak** ditampilkan selama penjualannya masih jatuh di satu jam saja: "paling ramai jam 08.00" yang cuma mengulang satu-satunya jam yang ada tidak menjawab apa pun. Grafik garis omzet harian juga tidak ada — terlihat profesional, tidak menjawab satu pun pertanyaan yang benar-benar dibawa orang ke sini.

### 5.1d Ekspor: semuanya, bukan yang sedang dilihat

Tombolnya ada di dasar layar Laporan, tapi yang diunduh **seluruh catatan sejak awal** — enam lembar: rekap bulanan, penjualan per baris, buku kas, katalog, utang, dan pergerakan stok. Judulnya menyebutkan itu, karena tombol di bawah laporan satu bulan wajar disangka mengekspor bulan itu saja.

Alasannya ada di [`04-arsitektur.md`](04-arsitektur.md): free tier tidak menjamin cadangan yang bisa dipulihkan sendiri, dan janjinya sejak awal adalah tombol "ekspor semua ke Excel" yang bisa ditekan sendiri. Karena itu **yang dibatalkan dan yang diarsipkan ikut**, ditandai di kolomnya sendiri — cadangan yang diam-diam membuang sebagian isi bukan cadangan. Datanya dibaca dari HP, bukan dari peladen, jadi ekspornya tetap bekerja tanpa sinyal dan tanpa akun: yang paling butuh menyalin datanya keluar justru orang yang belum mencadangkan apa pun.

Dua keputusan bentuk di dalam berkasnya:

- **Rupiah ditulis sebagai bilangan**, supaya bisa dijumlah. Itu satu-satunya alasan mengekspor ke Excel alih-alih ke teks biasa.
- **Tanggal ditulis sebagai teks `YYYY-MM-DD`.** Penanggalan asli Excel disimpan sebagai bilangan hari dan ditampilkan menurut setelan wilayah pembacanya, jadi berkas yang sama bisa terbaca 8 November di satu HP dan 11 Agustus di HP lain. Untuk catatan keuangan, ambiguitas itu tidak sepadan dengan kemudahan mengurutkannya.

Dan satu hal yang harus selamat sampai ke sini: **kolom stok kosong untuk jasa, bukan nol.** Itu pembeda utama produknya, dan berkas ekspor adalah perjalanan terpanjang yang harus dilaluinya.

### 5.1e QRIS: pakai yang sudah ada, isikan nominalnya sendiri

Memilih "QRIS" di layar bayar langsung memunculkan kodenya, **dengan nominal sudah terisi** — tanpa ketukan tambahan, karena di depan pembeli setiap ketukan berarti menunggu. Memilih QRIS juga mengisi "uang diterima" dengan totalnya: kode yang dipindai dan angka yang tercatat tidak boleh bisa berbeda.

Yang dipakai adalah **QRIS statis milik usahanya sendiri**, dipasang sekali lewat pindai kamera, ambil dari galeri, atau tempel teks. Tiga jalan karena masing-masing gagal di keadaan berbeda; yang paling sering terlupakan adalah bahwa banyak QRIS tidak pernah dicetak — dikirim banknya sebagai gambar lewat WhatsApp.

Nominalnya disisipkan di perangkat: muatan QRIS mengikuti EMVCo, jadi tinggal ubah tag `01` jadi `12`, sisipkan tag `54`, hitung ulang CRC-16. Tidak ada penyedia jasa pembayaran, tidak ada pendaftaran, tidak ada potongan tambahan, dan tidak ada jaringan yang perlu dihubungi.

Dua hal yang dijaga ketat:

1. **Nama merchant ditampilkan sebelum kodenya disimpan.** Satu-satunya kesempatan menangkap kode yang salah — sesudah tersimpan, yang salah akan ditunjukkan ke pembeli tanpa ada yang curiga.
2. **Aplikasi tidak pernah menandai lunas sendiri.** Tidak ada jalur balik dari bank, jadi ia tidak tahu uangnya sudah masuk; yang tahu cuma pemiliknya, dari notifikasi banknya. Menebak-nebak soal ini berarti menandai lunas transaksi yang gagal — dan kekeliruan itu baru ketahuan saat menghitung laci malam hari, ketika pembelinya sudah lama pulang.

Kalau penyisipan nominalnya gagal karena apa pun, kodenya **tetap tampil apa adanya** dengan keterangan bahwa pembeli harus mengetik sendiri. Layar galat saat ada orang menunggu jauh lebih buruk daripada satu langkah tambahan.

### 5.1f Pengaturan: satu ikon di pojok, bukan tab

Bilah bawah tetap lima tujuan. Pengaturan masuk lewat **ikon roda gigi di pojok beranda**, dan itu bukan kompromi melainkan penilaian: yang dikerjakan di sana — ganti nama usaha, pasang QRIS — dilakukan sekali lalu tidak pernah lagi, jadi ia tidak pantas menempati tempat yang bersaing dengan angka hari ini.

Tapi ia **harus** ada, dan sebelumnya tidak. Dua lubang nyata yang ditutupnya:

1. **Nama usaha hanya bisa ditulis sekali**, di layar pengaturan awal — sebelum pemiliknya tahu nama itu akan muncul di kepala setiap struk. Nama yang diketik terburu-buru di situ justru yang paling mungkin ingin diperbaiki.
2. **QRIS cuma bisa dipasang lewat layar bayar**, jadi ia hanya ditemukan orang yang kebetulan sudah memilih QRIS di depan pembeli. Tempat mencarinya seharusnya di pengaturan.

Nomor WhatsApp tersimpan di perangkat saja dan **tidak dikirim ke peladen**: ia cuma dipakai mencetak kepala struk, jadi tidak ada gunanya di sana — dan nomor pribadi yang tidak perlu disimpan sebaiknya memang tidak disimpan. Nama usaha ikut terkirim karena ia identitas tenant, yang nanti dilihat dari perangkat kedua.

Yang **tidak** dipindahkan ke sini: apa pun yang punya rumah yang lebih dekat ke titik pakainya. Ekspor Excel tetap di layar laporan, karena yang mencarinya sedang melihat angkanya. Menu pengaturan yang menampung semua hal yang tidak jelas tempatnya akan berhenti bisa dibaca dalam sebulan.

### 5.2 Aturan timbal balik

> **Setiap kali pengguna memasukkan sesuatu, dia harus langsung menerima sesuatu.**

Di kasir, yang diterima berwujud: **struk.** Bukan pesan "tersimpan".

### 5.3 Satu transaksi selesai sebelum pembeli merasa menunggu

Target: **dari membuka aplikasi sampai struk keluar, di bawah 20 detik untuk tiga item.**

- Grid foto, bukan kotak pencarian; urutannya menurut frekuensi terjual
- Papan angka sendiri, bukan keyboard bawaan yang memakan separuh layar
- "Uang pas" sekali tap
- Nama pembeli hanya diminta kalau uangnya kurang
- **Tidak pernah ada layar tunggu di jalur kasir.** Struk keluar karena penulisan lokal berhasil, bukan karena peladen menjawab

### 5.4 Stok memperingatkan, tidak melarang

Angka stok sering tertinggal dari kenyataan — ada yang diambil sendiri, ada yang belum sempat dicatat. Menolak penjualan karena angkanya nol akan membuat kasir ditinggalkan tepat saat pembeli menunggu. Yang muncul adalah peringatan; penjualannya tetap jalan dan stoknya boleh minus.

### 5.5 Bahasa

| Jangan | Pakai |
|---|---|
| Product / SKU | Barang |
| Service | Jasa |
| Inventory | Stok |
| Revenue / Omzet | Masuk |
| Expense | Keluar |
| Receipt / Invoice | Struk |
| Receivable | Belum bayar |
| Restock / Purchase | Kulakan |
| Balance | Uang di tangan |

Semua sebutan dikumpulkan di `CATEGORY_LABELS`, `ITEM_KIND_LABELS`, dan `PAYMENT_LABELS` supaya bisa diganti tanpa menyentuh sisa aplikasi.

### 5.6 Fisik layar

- Target sentuh minimal 56px
- Ukuran dasar 18px; angka utama jauh lebih besar
- Kontras tinggi
- Rupiah selalu diformat penuh (`Rp 5.000`)
- Perbesar-cubit **tidak** dimatikan

---

## 6. Alur utama

```
Pertama kali
  Beranda → Mulai → nama usaha → Katalog
        (langsung ke katalog, bukan beranda: tanpa isi katalog
         kasirnya kosong dan beranda cuma menampilkan nol)

Isi katalog
  Katalog → [+ Barang] → nama, harga, stok        → Simpan & tambah lagi
          → [+ Jasa]   → nama, harga              → Simpan
        (kolom stok tidak muncul sama sekali untuk jasa)

Melayani pembeli
  Beranda → Kasir → ketuk barang/jasa → Bayar → Uang pas → struk
        (struk bisa dikirim ke WhatsApp pembeli; stok dan
         pembukuan sudah terisi tanpa satu ketukan tambahan)

Pembeli belum bayar penuh
  ... → Bayar → nominal kurang → nama pembeli → simpan
        (piutang dibuat otomatis; tanpa nama, tidak dibuat)

Uang keluar yang bukan kulakan
  Beranda → Uang Keluar → nominal → kategori → selesai

Lihat rekap
  Beranda → sudah terlihat
```

---

## 7. Kriteria penerimaan

| # | Kriteria | Cara ukur |
|---|---|---|
| 1 | Dari buka aplikasi sampai struk keluar < 20 detik (3 item) | Stopwatch, 10 percobaan, ambil median |
| 2 | Ibu menyelesaikan satu transaksi tanpa dibantu | Amati, jangan dibantu, catat di mana macet |
| 3 | Stok aplikasi cocok dengan hitung fisik | Hitung fisik akhir minggu, 4 minggu berturut |
| 4 | Uang di tangan cocok dengan isi laci | Hitung fisik akhir hari, 7 hari berturut |
| 5 | Jalan penuh tanpa internet | Mode pesawat, 5 transaksi, nyalakan, pastikan tersinkron sekali |
| 6 | **Jasa tidak pernah dilaporkan habis** | Jual satu jasa 100 kali; periksa mutasi stok tetap nol |
| 7 | Pengguna tahu penghasilannya bulan ini tanpa bertanya | Tanya langsung |
| 8 | **Hari ke-30, buku tulis tidak dipakai lagi** | Lihat bukunya |

---

## 8. Yang membuat ini gagal

1. **Mengulang kesalahan bot WhatsApp** — menerima catatan tanpa memberi apa pun kembali. → Struk sebagai imbalan langsung, rekap di layar pertama.
2. **Katalog jadi gerbang yang tidak pernah dilewati.** Ini risiko terbesar produk ini: kasir tanpa katalog tidak berguna, dan mengisi katalog adalah pekerjaan di depan. → Hanya nama dan harga yang wajib, "Simpan & tambah lagi", dan pengisian pertama dikerjakan bersama-sama.
3. **Kasir terasa lebih lambat daripada melayani biasa.** → Grid foto berurut frekuensi, papan angka sendiri, luring lebih dulu, tanpa layar tunggu.
4. **Angkanya tidak cocok dengan laci atau rak.** Sekali tidak cocok tanpa penjelasan, kepercayaan hilang. → Satu transaksi atomik, tiap perubahan stok meninggalkan mutasi, pembatalan lunak yang mengembalikan stok.
5. **Jasa diperlakukan sebagai barang.** Satu kebocoran saja membuat "Potong celana" bisa habis. → Ditegakkan tiga lapis dan diuji di ketiganya.
6. **Membangun untuk pasar imajiner.** → Multi-tenant hanya boleh menyentuh lapisan data, tidak menambah satu pun layar di MVP.
