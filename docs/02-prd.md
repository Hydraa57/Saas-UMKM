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

**Kasir** — grid foto diurutkan menurut frekuensi terjual, bukan kotak pencarian. Ketuk = masuk keranjang. Bayar tunai/QRIS/transfer, uang pas sekali tap, kembalian dihitung.

**Struk** — teks lebar-tetap yang sama persis untuk yang dilihat di layar, yang dikirim ke WhatsApp, dan yang nanti dicetak ke printer termal.

**Stok otomatis** — berkurang saat terjual, bertambah saat kulakan, bisa dikoreksi lewat hitung fisik. Tiap perubahan meninggalkan satu baris mutasi, jadi angkanya selalu bisa dijelaskan.

**Peringatan stok menipis** — muncul sendiri di beranda dan katalog. Tidak pernah melarang penjualan.

**Kulakan** — menambah stok dan mengurangi kas dalam satu operasi.

**Uang keluar manual** — gas, listrik, ongkos angkut, upah harian. Kategori yang lahir dari kasir dan kulakan sengaja tidak bisa dipilih di sini.

**Rekap bulanan** — masuk, keluar, sisa; plus total tahunan, persis seperti di buku tulisnya.

**Piutang** — dibuat otomatis dari struk yang kurang bayar, dan hanya kalau nama pembelinya diketahui. Piutang tanpa nama tidak bisa ditagih.

**Jalan penuh tanpa internet**, PWA bisa dipasang.

### Tidak masuk

| Dibuang | Alasan |
|---|---|
| Buku rumah tangga | Aplikasi kasir dibuka saat ada pembeli; belanja dapur tidak terjadi di situ. Sudah ada NayyiraAI |
| Laporan untung per barang (HPP) | Harga modal disimpan, tapi laporannya belum — yang dicari dulu: apa yang laku dan apa yang mau habis |
| Order berjangka: DP, tenggat, status | Yang dicatat cuma tanggal + jenis + harga |
| Varian, satuan bertingkat, diskon per item | Beban input di depan pembeli, untuk kasus yang belum terbukti ada |
| Barcode scanner | Menyusul; grid foto lebih cepat untuk katalog puluhan item |
| Multi-cabang, RBAC | Satu orang yang melayani |
| WhatsApp Business API | Berbayar per pesan, perlu verifikasi Meta. Tautan `wa.me` sudah cukup untuk mengirim struk |
| Redis, BullMQ, WebSocket | Tidak dibutuhkan untuk skala ini |

---

## 5. Keputusan UX

### 5.1 Beranda

Satu angka besar (masuk hari ini + jumlah struk), lalu **tombol Kasir yang paling besar di layar**, lalu katalog dan uang keluar, lalu rekap bulan ini, lalu peringatan yang butuh tindakan.

Kasir di paling atas karena aplikasi ini dibuka saat ada pembeli berdiri di depan meja. Apa pun yang berdiri di antara membuka aplikasi dan menerima uang adalah beban.

Rekap bulanan tetap di layar pertama, tidak disembunyikan di balik menu laporan. Inilah kegagalan bot WhatsApp sebelumnya: penggunanya menyerahkan data dan tidak pernah menerima apa pun sebagai gantinya.

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
