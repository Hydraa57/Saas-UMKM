# 02 — PRD

## 1. Posisi produk

> Aplikasi pencatatan usaha untuk usaha rumahan yang **menjual barang sekaligus menerima pesanan jasa** — dalam satu buku kas yang jujur.

Pembandingnya buku tulis, bukan Majoo. Ini bukan kerendahan hati, ini strategi: melawan buku tulis kita bisa menang di kecepatan, rekap, dan pengingat. Melawan POS bermodal kita kalah di setiap kolom fitur.

### Yang dimenangkan produk ini

| Dibanding | Menang di |
|---|---|
| Buku tulis | Rekap otomatis, ingat siapa belum bayar, ingat jahitan jatuh tempo, tidak bisa hilang |
| Aplikasi pembukuan (BukuWarung/BukuKas) | Order jasa berjangka dengan DP, deadline, dan ukuran pelanggan |
| POS retail (Majoo/Qasir/Kasir Pintar) | Jauh lebih sederhana, gratis, tidak menuntut setup, dan mengerti usaha yang campur barang + jasa |

---

## 2. Pengguna

**Pengguna tunggal MVP: Ibu.** Bukan "persona owner UMKM". Satu orang nyata, dengan HP Android, yang sekarang memakai buku tulis dan tidak punya kesabaran untuk aplikasi yang ribet.

Semua keputusan desain diuji terhadap satu pertanyaan: *apakah ini membuat ibu lebih cepat daripada buku tulis, atau lebih lambat?*

Persona lain (kasir, admin, multi-cabang) **tidak ada di MVP** dan tidak boleh memengaruhi desain UI. Mereka hanya boleh memengaruhi desain skema database.

---

## 3. Tiga aliran uang

Ini kerangka yang menggantikan model POS. Semua fitur MVP turun dari sini.

```
                     ┌──────────────────┐
   Jual snack ──────▶│                  │
                     │    BUKU KAS      │
   Order jahit ─────▶│  (cash_entries)  │──▶ Saldo, laporan, ringkasan
                     │                  │
   Kulakan & ───────▶│                  │
   pengeluaran       └──────────────────┘
```

Setiap kejadian yang menyentuh uang menghasilkan entri buku kas. Buku kas adalah satu-satunya sumber kebenaran untuk "berapa uang saya". Fitur lain adalah *cara memasukkan* entri itu dengan konteks yang lebih kaya.

Konsekuensi penting: **saldo aplikasi harus selalu bisa dicocokkan dengan uang fisik di laci.** Kalau tidak cocok, ibu berhenti percaya, dan aplikasi mati. Ini kriteria penerimaan yang lebih keras daripada fitur mana pun.

---

## 4. Scope MVP

### Masuk MVP

**Buku kas**
- Catat uang masuk dan uang keluar
- Kategori pengeluaran sederhana (kulakan, ongkos, lain-lain)
- Saldo berjalan
- Input mundur (backdate) — untuk memindahkan catatan buku yang belum masuk
- Catatan bebas di setiap entri

**Jualan snack**
- Katalog produk dengan foto, nama, harga jual, harga modal
- Layar jual: grid produk, tap untuk tambah
- Keranjang, total, bayar
- Tandai "belum bayar" → jadi piutang
- Stok berkurang otomatis

**Order jahit**
- Data pelanggan (nama, no. HP)
- Ukuran tersimpan per pelanggan, dipakai ulang di order berikutnya
- Order: jenis jahitan, harga, DP, tanggal janji jadi, catatan
- Status: antre → dikerjakan → selesai → diambil
- Pelunasan saat diambil
- Daftar "jatuh tempo minggu ini"

**Piutang**
- Daftar siapa berutang berapa, dari transaksi apa
- Cicilan (bayar sebagian)
- Total piutang di dashboard

**Dompet & uang pribadi**
- Dompet: Tunai, Bank/e-wallet
- "Ambil buat rumah" — mencatat uang usaha yang dipakai pribadi
- "Tambah modal" — uang pribadi masuk ke usaha
- Laporan memisahkan untung usaha dari uang yang sudah diambil

**Stok**
- Stok per produk
- Catat kulakan → stok bertambah + uang keluar, sekaligus
- Koreksi stok manual
- Peringatan stok menipis

**Laporan**
- Hari ini: uang masuk, uang keluar, untung kotor
- Bulan ini: omzet, modal, untung, uang diambil
- Produk terlaris
- Grafik sederhana

**Lain-lain**
- PWA, bisa dipasang di home screen
- Jalan offline penuh
- Web Push untuk pengingat
- Tombol share ringkasan / nota ke WhatsApp

### Tidak masuk MVP

Dikeluarkan dari blueprint awal, dengan alasan:

| Dibuang | Alasan |
|---|---|
| Multi-cabang (UI) | Ibu punya satu tempat. Kolom `branch_id` tetap disiapkan di DB |
| Role kasir & RBAC penuh | Tidak ada kasir. Diganti tabel `memberships` sederhana |
| Varian produk | Snack biskuit tidak punya varian ukuran/warna |
| Barcode scanner | Snack curah/kemasan kecil sering tanpa barcode; kolom disiapkan, fiturnya nanti |
| Satuan (tabel `units`) | Cukup teks bebas. Tabel tersendiri menambah setup tanpa manfaat |
| Supplier | Cukup nama toko grosir di catatan kulakan |
| Stock opname (dokumen) | Cukup koreksi stok manual |
| Pajak | Ibu bukan PKP. Kolom disiapkan, tidak ditampilkan |
| WhatsApp Business API | Berbayar per pesan & perlu verifikasi Meta. Lihat `04-arsitektur.md` |
| Audit log | Berguna saat multi-user. Sekarang belum |
| AI promo, AI chat data toko | Nilainya rendah di awal. Satu-satunya AI di MVP: katalog dari foto |
| Redis, BullMQ, WebSocket, worker | Tidak dibutuhkan untuk skala ini |

---

## 5. Keputusan UX

Bagian ini yang paling menentukan sukses/gagal. Fitur bisa ditambah kapan saja; kepercayaan pengguna hanya sekali.

### 5.1 Beranda: tiga tombol dan satu angka

```
┌─────────────────────────────┐
│  Hari ini masuk             │
│      Rp 185.000             │   ← angka besar, langsung terlihat
│  keluar Rp 40.000           │
├─────────────────────────────┤
│  ┌───────────────────────┐  │
│  │   🍪  Jual Snack      │  │   ← tombol besar
│  └───────────────────────┘  │
│  ┌───────────────────────┐  │
│  │   ✂️  Order Jahit     │  │
│  └───────────────────────┘  │
│  ┌───────────────────────┐  │
│  │   💸  Catat Keluar    │  │
│  └───────────────────────┘  │
├─────────────────────────────┤
│  ⚠️ 3 jahitan jatuh tempo   │
│  ⚠️ Piutang Rp 120.000      │
└─────────────────────────────┘
```

Tidak ada menu sepuluh item. Tidak ada dashboard analitik di halaman depan. Laporan ada, tapi di lapis kedua — karena yang ibu lakukan tiap hari adalah *mencatat*, bukan *menganalisis*.

### 5.2 Layar jual: grid, bukan pencarian

Ini titik paling rawan. Katalog per item (yang sudah diputuskan) memberi data yang jauh lebih berguna — produk terlaris, untung per item, stok — tapi juga menambah beban input dibanding sekadar mencatat total. Di situlah kebanyakan pengguna berhenti.

Mitigasinya dirancang eksplisit:

1. **Grid foto, bukan kotak pencarian.** Tap foto = masuk keranjang qty 1. Tap lagi = 2. Tidak perlu mengetik apa pun.
2. **Urutan otomatis berdasarkan frekuensi.** Produk yang paling sering dijual naik sendiri ke atas. Setelah seminggu, 6 produk teratas menutup sebagian besar penjualan dan semuanya muat di satu layar tanpa scroll.
3. **Selalu ada jalan keluar.** Tombol "Lainnya" untuk mencatat nominal bebas tanpa memilih produk. Ibu tidak boleh pernah terjebak karena barangnya belum ada di katalog. Barang tak dikenal bisa dirapikan belakangan.
4. **Setup katalog tidak boleh jadi gerbang.** Aplikasi harus bisa dipakai mencatat sejak menit pertama, dengan katalog kosong.
5. **Target keras: satu penjualan tercatat dalam < 10 detik**, dari membuka aplikasi sampai selesai.

### 5.3 Bahasa

Bahasa Indonesia sehari-hari. Bukan istilah akuntansi, bukan istilah aplikasi.

| Jangan | Pakai |
|---|---|
| Revenue / Omzet | Uang masuk |
| Expense | Uang keluar |
| Receivable / Piutang | Belum bayar |
| Prive / Owner draw | Ambil buat rumah |
| Capital injection | Tambah modal |
| COGS / HPP | Modal barang |
| Gross profit | Untung |
| Inventory adjustment | Betulkan stok |
| Transaction | Catatan |

Istilah akuntansi boleh muncul di laporan lanjutan nanti, tidak di alur harian.

### 5.4 Fisik layar

- Target sentuh minimal 56px — jari, bukan kursor
- Ukuran font dasar minimal 18px; angka utama jauh lebih besar
- Kontras tinggi; aplikasi ini dipakai di ruang yang terangnya tidak menentu
- Angka rupiah selalu diformat penuh (`Rp 5.000`, bukan `5000`)
- Papan angka besar untuk input nominal, bukan keyboard biasa
- Satu layar = satu keputusan

### 5.5 Kepercayaan

- Tidak pernah ada layar loading di jalur mencatat. Tulis lokal dulu, sinkron belakangan.
- Setiap penyimpanan memberi konfirmasi yang terlihat dan bisa dibatalkan (undo) beberapa detik
- Menghapus catatan minta konfirmasi dan menyimpan jejak
- Saldo aplikasi harus bisa dicocokkan dengan uang di laci kapan saja; sediakan fitur "cocokkan kas"

---

## 6. Alur utama

### Jual snack

```
Beranda → Jual Snack → tap produk (1..n) → Bayar
                                            ├─ Tunai → selesai
                                            ├─ QRIS/transfer → pilih dompet → selesai
                                            └─ Belum bayar → pilih/ketik nama → jadi piutang
```

### Terima order jahit

```
Beranda → Order Jahit → Order Baru
  → pilih pelanggan (atau tambah baru)
  → jenis jahitan + harga
  → ukuran (terisi otomatis kalau pelanggan pernah order)
  → tanggal janji jadi
  → DP (boleh 0)
  → simpan
        → DP masuk buku kas
        → order masuk antrean
        → opsional: share detail order ke WhatsApp pelanggan
```

### Selesaikan order jahit

```
Daftar Order → pilih order → Tandai Selesai
  → opsional: kabari pelanggan via WhatsApp
  → saat diambil → Terima Pelunasan → masuk buku kas → order ditutup
```

### Kulakan

```
Beranda → Catat Keluar → Kulakan
  → pilih produk + jumlah + total bayar
  → simpan
        → stok bertambah
        → uang keluar tercatat
        → harga modal produk diperbarui
```

Satu aksi, tiga akibat. Ini yang tidak bisa dilakukan buku tulis.

### Ambil uang buat rumah

```
Beranda → Catat Keluar → Ambil buat rumah
  → nominal → simpan
        → kas usaha berkurang
        → TIDAK dihitung sebagai biaya usaha
        → muncul terpisah di laporan bulanan
```

Ini yang menjawab masalah "uang usaha dan pribadi campur". Bukan dengan menyuruh ibu disiplin memisahkan dompet, tapi dengan membuat aplikasi mencatat percampurannya secara jujur.

---

## 7. Kriteria penerimaan

Diuji terhadap pengguna nyata, bukan checklist:

| # | Kriteria | Cara ukur |
|---|---|---|
| 1 | Mencatat satu penjualan < 10 detik | Stopwatch, 10 percobaan, ambil median |
| 2 | Ibu bisa mencatat penjualan pertama tanpa dibantu | Amati, jangan dibantu, catat di mana dia macet |
| 3 | Saldo aplikasi cocok dengan uang laci | Hitung uang fisik akhir hari, 7 hari berturut-turut |
| 4 | Jalan penuh tanpa internet | Mode pesawat, catat 5 transaksi, nyalakan lagi, pastikan tersinkron |
| 5 | Ibu bisa jawab "siapa yang belum bayar" tanpa buka buku | Tanya langsung |
| 6 | Ibu tahu jahitan mana jatuh tempo besok | Tanya langsung |
| 7 | **Hari ke-30, buku tulis tidak dipakai lagi** | Lihat bukunya |

Nomor 7 adalah satu-satunya metrik yang benar-benar penting. Enam lainnya adalah prasyaratnya.

---

## 8. Yang membuat ini gagal

Ditulis di depan supaya bisa diperiksa selama pengerjaan:

1. **Setup katalog jadi gerbang.** Kalau ibu harus memasukkan 40 produk sebelum bisa mencatat apa pun, dia berhenti di produk ke-8. → Mitigasi: aplikasi berguna dengan katalog kosong; ada impor katalog dari foto.
2. **Terlalu banyak menu.** Tiap menu tambahan menurunkan peluang menemukan yang benar. → Mitigasi: batas keras tiga aksi di beranda.
3. **Terasa lebih lambat dari buku.** → Mitigasi: offline-first, tidak ada loading di jalur mencatat.
4. **Angkanya tidak cocok dengan laci.** Sekali saja tidak cocok tanpa penjelasan, kepercayaan hilang. → Mitigasi: piutang & pengambilan pribadi masuk MVP, ada fitur cocokkan kas.
5. **Saya membangun untuk pasar imajiner, bukan untuk ibu.** Godaan terbesar, karena membangun multi-tenant lebih menarik daripada membuat tombol lebih besar. → Mitigasi: multi-tenant hanya boleh menyentuh lapisan data, tidak boleh menambah satu pun layar di MVP.
