# 05 — Roadmap

## Prinsip

**Setiap fase berakhir dengan sesuatu yang ibu bisa pakai.** Tidak ada fase yang menghasilkan "fondasi yang belum kelihatan". Kalau pengerjaan berhenti di tengah jalan karena apa pun, yang sudah jadi tetap berguna.

Ini juga alasan urutannya bukan seperti blueprint awal (auth → produk → kasir → stok → laporan → WhatsApp → AI). Urutan itu baru memberi nilai di akhir. Urutan di bawah memberi nilai di hari ke-12.

Perkiraan waktu memakai asumsi pengerjaan hampir setiap hari.

---

## Fase 0 — Turun ke lapangan (2 hari, tanpa kode)

Sebelum satu baris kode ditulis.

- [ ] Foto setiap halaman buku catatan ibu, minimal dua minggu terakhir
- [ ] Duduk menemani ibu jualan satu hari penuh, catat setiap kali dia menulis
- [ ] Wawancara terstruktur — pertanyaannya di [`06-wawancara-lapangan.md`](06-wawancara-lapangan.md)
- [ ] Daftar 20 produk yang paling sering dijual, dengan harga jual dan harga modal
- [ ] Kumpulkan istilah yang ibu pakai sendiri — ini yang jadi label tombol, bukan istilah aplikasi
- [ ] Catat semua yang belum dibayar per hari ini, dan semua order jahit yang berjalan

**Selesai kalau:** kamu bisa menggambar ulang isi buku ibu sebagai skema data, dan bisa menyebut lima hal yang ibu catat yang belum ada di [`03-data-model.md`](03-data-model.md).

> Fase ini yang paling sering dilewati, dan paling mahal akibatnya. Semua asumsi di dokumen ini disusun dari wawancara denganmu, bukan dengan ibu. Fase 0 yang memeriksanya.

---

## Fase 1 — Buku kas + jualan (hari 3–12)

Target: **ibu mulai memakai aplikasi di akhir fase ini.**

**Fondasi**
- [ ] Proyek Next.js + Supabase, PWA bisa dipasang
- [ ] Migrasi: `tenants`, `memberships`, `wallets`, `products`, `cash_entries`, `sales`, `sale_items`, `stock_movements`
- [ ] RLS aktif di semua tabel + uji isolasi dua tenant
- [ ] Dexie + antrean sinkron + RPC idempoten
- [ ] Login (satu akun; tanpa alur pendaftaran publik)

**Fitur**
- [ ] Beranda: tiga tombol + uang masuk hari ini
- [ ] Katalog produk: tambah, ubah, foto (kompres di perangkat)
- [ ] Layar jual: grid produk, tap-tambah, keranjang, bayar
- [ ] Tombol "Lainnya" untuk nominal bebas
- [ ] Catat pengeluaran (kulakan / ongkos / lain-lain)
- [ ] Riwayat buku kas dengan saldo berjalan
- [ ] Input mundur (backdate)

**Selesai kalau:**
- Ibu mencatat penjualan sendiri, tanpa dibantu, dalam < 10 detik
- Mode pesawat: 5 transaksi tercatat, koneksi kembali, semuanya tersinkron sekali (bukan dua kali)
- Saldo aplikasi cocok dengan uang laci di akhir hari

**Setelah fase ini, buku tulis belum boleh dibuang.** Jalankan keduanya berdampingan selama seminggu dan bandingkan. Perbedaan apa pun adalah bug, atau alur yang belum ada.

---

## Fase 2 — Order jahit (hari 13–19)

Bagian yang paling tidak ada padanannya di aplikasi lain.

- [ ] Migrasi: `customers`, `customer_measurements`, `tailor_orders`, `payments`
- [ ] Daftar pelanggan + tambah cepat
- [ ] Form ukuran per jenis jahitan (jsonb), terisi otomatis dari order sebelumnya
- [ ] Buat order: jenis, harga, DP, tanggal janji jadi
- [ ] Papan status: antre / dikerjakan / selesai / diambil
- [ ] Terima pelunasan
- [ ] Beranda menampilkan "jatuh tempo minggu ini"
- [ ] Share detail order & kabar "sudah jadi" ke WhatsApp pelanggan

**Selesai kalau:** ibu bisa menjawab "jahitan siapa yang harus jadi besok" tanpa membuka buku, dan semua order berjalan sudah masuk aplikasi.

---

## Fase 3 — Piutang & pemisahan uang (hari 20–25)

- [ ] Tandai penjualan "belum bayar" → piutang
- [ ] Daftar piutang: siapa, berapa, sejak kapan
- [ ] Cicilan
- [ ] Dompet (Tunai / bank / e-wallet)
- [ ] "Ambil buat rumah" dan "Tambah modal"
- [ ] Laporan memisahkan untung usaha dari uang yang diambil
- [ ] Share pengingat halus ke yang belum bayar
- [ ] Fitur "cocokkan kas": hitung uang fisik, aplikasi tunjukkan selisihnya

**Selesai kalau:** ibu bisa menjawab "siapa saja yang belum bayar, totalnya berapa" dalam satu tap, dan tahu bedanya "uang saya" dengan "untung usaha saya".

---

## Fase 4 — Stok, laporan, AI katalog (hari 26–33)

- [ ] Kulakan menambah stok + mencatat uang keluar dalam satu aksi
- [ ] Peringatan stok menipis
- [ ] Koreksi stok
- [ ] Laporan harian & bulanan: omzet, modal, untung, uang diambil
- [ ] Produk terlaris + untung per produk
- [ ] Grafik sederhana
- [ ] Ekspor Excel
- [ ] AI katalog dari foto (`ai_jobs`, Edge Function, Claude vision)

**Selesai kalau:** ibu bisa menjawab "bulan ini untung berapa" tanpa menghitung manual, dan angkanya dia percayai.

---

## Fase 5 — Pengerasan (hari 34–40)

Tidak ada fitur baru. Membuat yang ada layak dipercaya untuk jangka panjang.

- [ ] Web Push + pengingat terjadwal (pg_cron)
- [ ] Ekspor cadangan otomatis ke luar Supabase
- [ ] Uji unit perhitungan uang, termasuk kasus tepi
- [ ] Uji idempotensi sinkronisasi
- [ ] Uji isolasi tenant menyeluruh
- [ ] Penanganan error yang tidak menakutkan pengguna
- [ ] Undo di setiap aksi yang menyimpan
- [ ] Uji di HP ibu yang sebenarnya, bukan emulator

---

## Fase 6 — Evaluasi 30 hari (hari 40–70)

**Jangan menambah fitur di fase ini.** Amati.

- [ ] Apakah buku tulis masih dipakai? Untuk apa? — jawaban ini adalah spesifikasi fitur berikutnya
- [ ] Fitur mana yang tidak pernah disentuh? Hapus atau sembunyikan
- [ ] Di mana ibu masih macet?
- [ ] Berapa hari berturut-turut ibu memakainya?
- [ ] Apa yang ibu ceritakan ke orang lain tentang aplikasi ini? Itu positioning yang sebenarnya

**Gerbang:** kalau setelah 30 hari ibu masih memakai buku tulis untuk hal yang seharusnya sudah tercakup, **jangan lanjut ke fase produk.** Perbaiki dulu. Membuka aplikasi untuk pengguna lain sebelum satu pengguna yang paling termotivasi pun belum bertahan adalah cara memperbanyak kegagalan.

---

## Fase 7 — Baru bicara produk (setelah gerbang terlewati)

Hanya kalau Fase 6 lulus.

- [ ] Pendaftaran publik + onboarding
- [ ] Pemilih toko di UI (lapisan datanya sudah siap sejak Fase 1)
- [ ] Undang anggota (`memberships.role`)
- [ ] Landing page dengan cerita nyata: aplikasi yang dibuat untuk ibu sendiri, dipakai harian selama sekian bulan
- [ ] Cari 5 UMKM sejenis — yang menjual barang **sekaligus** menerima pesanan jasa
- [ ] Baru setelah ada yang bertahan: bicara harga

**Tentang penetapan harga nanti.** Pasar POS sudah [di kisaran Rp55–130 ribu/bulan](https://founderplus.id/blog/aplikasi-kasir-pos-ukm-terbaik/) dengan fitur jauh lebih lengkap. Bersaing di sana adalah kalah. Yang bisa dimenangkan adalah segmen yang tidak dilayani mereka: usaha rumahan yang campur barang dan jasa pesanan. Segmen itu lebih kecil, tapi tidak ada yang mengejarnya.

---

## Ringkasan

| Fase | Waktu | Hasil |
|---|---|---|
| 0 | 2 hari | Paham cara ibu mencatat sekarang |
| 1 | 10 hari | **Ibu mulai memakai aplikasi** |
| 2 | 7 hari | Order jahit lengkap |
| 3 | 6 hari | Piutang & pemisahan uang pribadi |
| 4 | 8 hari | Stok, laporan, AI katalog |
| 5 | 7 hari | Layak dipercaya jangka panjang |
| 6 | 30 hari | Bukti, bukan asumsi |
| 7 | — | Hanya kalau fase 6 lulus |

Sekitar 40 hari sampai produk lengkap untuk satu pengguna, lalu 30 hari membuktikannya sebelum menambah pengguna kedua.

Bandingkan dengan blueprint awal: lima sprint yang baru menghasilkan sesuatu yang bisa dipakai ibu di sprint ketiga, dan menghabiskan sprint pertama untuk RBAC dan multi-cabang yang tidak akan pernah dia sentuh.
