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
| Struk lebar-tetap (layar = WhatsApp = printer) | 19 |
| Buku kas, saldo dompet, cocokkan | 21 |
| Rekap bulanan & total tahunan | 14 |
| Utang & piutang | 17 |
| Foto: pengecilan sebelum disimpan | 5 |
| Antrean kirim luring + penggolongan kegagalan | 30 |
| Aksi tulis (tulis lokal + antre, tanpa menunggu jaringan) | 24 |
| Skema, RLS, jalur tulis (PostgreSQL sungguhan) | 68 penegasan |

Layar: pengaturan awal, beranda, katalog (daftar + tambah/ubah/arsip), kasir, struk, uang keluar. Alur lengkapnya diuji di peramban sungguhan lewat `npm run smoke`.

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

## Fase 2 — Menutup lingkaran stok (perkiraan 3 hari)

Stok yang hanya berkurang akan habis, lalu angkanya berhenti berarti.

- [ ] Layar kulakan: pilih barang, jumlah, harga modal → stok naik, kas turun
- [ ] Koreksi stok lewat hitung fisik, dengan riwayat mutasinya
- [ ] Layar barang menipis, langsung dari peringatan di beranda
- [ ] Riwayat mutasi per barang — supaya selisih stok bisa dijelaskan, bukan cuma diperbaiki

**Selesai kalau:** setelah kulakan, stok dan uang di tangan dua-duanya benar tanpa dicatat ulang.

---

## Fase 3 — Printer termal & piutang (perkiraan 4 hari)

- [ ] Cetak ke printer termal Bluetooth (Web Bluetooth + ESC/POS), memakai `renderReceipt` yang sama
- [ ] Riwayat struk: buka ulang, cetak ulang, batalkan
- [ ] Daftar siapa belum bayar, diurutkan dari yang paling lama
- [ ] Terima cicilan pembayaran utang

**Selesai kalau:** struk yang dicetak sama persis dengan yang dilihat dan yang dikirim ke WhatsApp.

---

## Fase 4 — Laporan & sinkronisasi (perkiraan 4 hari)

- [x] Proyek Supabase berdiri, keempat migrasi terpasang, advisor bersih dari temuan yang tidak disengaja
- [ ] Login satu akun, tanpa alur pendaftaran publik
- [ ] Sambungkan antrean kirim ke Supabase sungguhan + penarikan data dari peladen
- [ ] Unggah foto katalog ke Storage
- [ ] Daftar rekap bulanan + total tahunan, meniru halaman buku tulisnya
- [ ] Barang terlaris & jam paling ramai — jawaban yang buku tulis tidak akan pernah bisa beri
- [ ] Ekspor ke Excel

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
| — | selesai | Fondasi, skema, logika, 220 tes + 68 penegasan DB |
| 1 | selesai | **Kasir, katalog, dan struk jalan** |
| 2 | 3 hari | Stok yang lingkarannya tertutup |
| 3 | 4 hari | Printer termal & piutang |
| 4 | 4 hari | Laporan & sinkronisasi peladen |
| 5 | 4 hari | Layak dipercaya jangka panjang |
| 6 | 30 hari | Bukti, bukan asumsi |

Sekitar 15 hari kerja sampai lengkap.
