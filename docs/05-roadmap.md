> **Ditulis ulang setelah arah produknya dikoreksi** dari aplikasi
> pencatat keuangan menjadi aplikasi kasir. Alasannya di
> [`08-posisi-produk.md`](08-posisi-produk.md) §1.

# 05 — Roadmap

## Prinsip

**Setiap fase berakhir dengan sesuatu yang ibu bisa pakai.** Kalau pengerjaan berhenti di tengah jalan karena apa pun, yang sudah jadi tetap berguna.

Dan satu urutan yang tidak boleh dibalik: **struk sebelum laporan.** Laporan adalah imbalan yang menahan orang bertahan, tapi struk adalah alasan orang membuka aplikasinya sama sekali.

---

## Sudah selesai

| | Tes |
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

Layar: pengaturan awal, beranda, barang & jasa (tab Daftar + Stok, termasuk tambah/ubah/arsip), kasir, struk, riwayat struk, kulakan, koreksi hitung fisik, piutang, uang keluar, cadangan, laporan, pengaturan. Alur lengkapnya diuji di peramban sungguhan lewat `npm run smoke` — 44 langkah, termasuk mengunduh berkas ekspor dan membacanya kembali dengan pembaca `.xlsx` di luar repo ini.

---

## Fase 1 — Kasir yang bisa dipakai berjualan ✅

- [x] Skema POS: `items`, `sales`, `sale_items`, `stock_movements`, `purchases`, `sale_sequences`
- [x] Constraint `stock_only_for_goods` — jasa tidak pernah punya stok
- [x] `record_sale` atomik: penjualan + stok + kas + piutang
- [x] Katalog: tambah, ubah, arsip; foto dikecilkan di perangkat
- [x] Kasir: grid foto berurut frekuensi, keranjang, bayar, kembalian
- [x] Struk: teks lebar-tetap + kirim ke WhatsApp
- [x] Beranda: masuk hari ini, jumlah struk, rekap bulan ini, peringatan stok menipis

---

## Fase 2 — Menutup lingkaran stok ✅

Stok yang hanya berkurang akan habis, lalu angkanya berhenti berarti.

- [x] Layar kulakan: pilih barang, jumlah, harga modal → stok naik, kas turun
- [x] Koreksi stok lewat hitung fisik, dengan riwayat mutasinya
- [x] Layar stok, diurutkan menurut yang perlu ditindak — bukan abjad, bukan terlaris
- [x] Riwayat mutasi per barang — supaya selisih stok bisa dijelaskan, bukan cuma diperbaiki
- [x] **Stok awal ikut jadi mutasi.** Tanpa ini penjumlahan riwayat meleset selamanya sebesar stok awal tiap barang, dan seluruh gunanya riwayat hilang

Yang terakhir itu bug nyata, ditemukan uji asap dan bukan oleh pembacaan ulang. Layar detail stok sekarang membandingkan rollup dengan penjumlahan riwayatnya dan memperingatkan kalau berbeda — jadi kebocoran yang sama tidak bisa diam lagi.

---

## Fase 3 — Printer termal & piutang ✅

- [x] Cetak ke printer termal Bluetooth (Web Bluetooth + ESC/POS), memakai `renderReceipt` yang sama
- [x] Riwayat struk: buka ulang, cetak ulang, batalkan
- [x] Daftar siapa belum bayar, diurutkan dari yang paling lama
- [x] Terima cicilan pembayaran utang

Penyandi ESC/POS menerima **string**, bukan `Sale`. Kalau ia menyusun sendiri barisnya, akan ada dua tempat yang harus dijaga tetap sepadan — dan struk yang berbeda antara yang dibagikan dan yang dicetak adalah persis jenis selisih yang membuat pembeli curiga. Salah satu tesnya membandingkan tiap baris keluaran `renderReceipt` dengan bita yang dikirim.

**Tersisa satu hal yang tidak bisa diselesaikan tanpa alat:** mencoba dengan printer termal sungguhan. Semua yang bisa diuji tanpa printer sudah diuji; yang belum adalah apakah UUID layanan yang dipilih cocok dengan printer yang nanti dibeli.

---

## Fase 4 — Laporan & sinkronisasi (perkiraan 4 hari)

- [x] Proyek Supabase berdiri, keenam migrasi terpasang, advisor bersih dari temuan yang tidak disengaja
- [x] Login — **opsional, bukan gerbang.** Aplikasi jalan penuh tanpa akun; login hanya untuk mencadangkan
- [x] Antrean kirim benar-benar dijalankan: saat dibuka, saat sinyal kembali, saat antrean bertambah, dan berkala
- [x] Indikator keadaan cadangan yang menghilang sendiri kalau semuanya sudah aman
- [ ] Penarikan data dari peladen (untuk HP kedua; risiko kehilangan sudah ditutup oleh pengiriman)
- [x] Unggah foto katalog ke Storage — ember privat, jalur `<tenant>/<item>`, antrean terpisah dari antrean penjualan
- [x] Daftar rekap bulanan + total tahunan, meniru halaman buku tulisnya
- [x] Barang terlaris & jam paling ramai — jawaban yang buku tulis tidak akan pernah bisa beri
- [x] Untung kotor per bulan, dari harga modal yang disalin saat transaksi
- [x] Ekspor ke Excel — semua catatan jadi satu berkas `.xlsx`, penyandinya ditulis sendiri tanpa pustaka
- [x] **QRIS dengan nominal terisi**, dari QRIS statis yang sudah dimiliki usahanya. Tanpa penyedia jasa pembayaran, tanpa biaya tambahan, jalan tanpa sinyal
- [x] **Layar pengaturan**: ganti nama usaha & nomor WhatsApp, pasang/ganti QRIS, lihat keadaan cadangan. Sebelumnya nama usaha tidak bisa diubah sama sekali setelah pengaturan awal

---

## Fase 5 — Pengerasan (perkiraan 4 hari)

Tidak ada fitur baru.

- [ ] Ekspor cadangan otomatis ke luar Supabase
- [ ] Penanganan error yang tidak menakutkan
- [ ] Uji di HP ibu yang sebenarnya, bukan emulator
- [ ] **Isi katalog bersama-sama** — ini bagian dari uji, bukan persiapan sebelum uji. Pengisian katalog adalah gerbang terbesar produk ini, dan kalau ia terlalu berat, itu temuan
- [ ] **Pendampingan hari pertama** — duduk bersama ibu, jangan bantu, catat di mana dia macet

---

## Fase 6 — Pemakaian nyata, 30 hari

**Jangan menambah fitur.** Amati.

- [ ] Buku tulis masih dipakai? Untuk apa? — jawabannya adalah spesifikasi fitur berikutnya
- [ ] Berapa transaksi per hari yang benar-benar lewat kasir, dan berapa yang terlewat?
- [ ] Kalau ada yang terlewat: kenapa? Terlalu lambat, atau lupa?
- [ ] Apakah katalognya bertambah sendiri setelah pengisian pertama?
- [ ] Apakah angka stoknya masih cocok dengan rak setelah sebulan?
- [ ] Fitur mana yang tidak pernah disentuh? Hapus atau sembunyikan

**Gerbang:** kalau setelah 30 hari ibu masih memakai buku tulis untuk hal yang seharusnya sudah tercakup, jangan lanjut ke fase produk. Perbaiki dulu.

---

## Fase 7 — Baru bicara produk

Hanya kalau Fase 6 lulus.

- [ ] Pendaftaran publik + onboarding
- [ ] Pemilih tenant di UI (lapisan datanya sudah siap)
- [ ] Cari 5 usaha **berbeda jenis** — warung, kuliner, jasa, dan yang mencampur keduanya. Ini yang menguji apakah kosakatanya benar-benar umum, atau cuma terasa umum

Posisi lengkapnya di [`08-posisi-produk.md`](08-posisi-produk.md). Ringkasnya: aplikasi kasir untuk usaha yang menjual barang **sekaligus** menerima jasa — celah yang tidak dilayani POS mana pun, karena semuanya dibangun untuk barang lalu menempelkan jasa sebagai barang berstok tak terbatas.

---

## Ringkasan

| Fase | Perkiraan | Hasil |
|---|---|---|
| 0 | selesai | Paham cara ibu mencatat, dari bukunya sendiri |
| — | selesai | Fondasi, skema, logika, 380 tes + 92 penegasan DB |
| 1 | selesai | **Kasir, katalog, dan struk jalan** |
| 2 | selesai | **Stok yang lingkarannya tertutup** |
| 3 | selesai | **Printer termal, riwayat struk, piutang** |
| 4 | 4 hari | Laporan & sinkronisasi peladen |
| 5 | 4 hari | Layak dipercaya jangka panjang |
| 6 | 30 hari | Bukti, bukan asumsi |

Sekitar 8 hari kerja sampai lengkap, plus satu percobaan dengan printer sungguhan.
