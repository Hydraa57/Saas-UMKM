> **Sebagian isi dokumen ini sudah tidak berlaku.** Ditulis sebelum melihat
> catatan ibu, jadi bagian tentang katalog produk, stok, dan order jahit
> berjangka berangkat dari asumsi yang ternyata keliru. Riset pasar dan
> riset teknisnya masih berlaku. Yang gugur dan buktinya:
> [`07-temuan-catatan-ibu.md`](07-temuan-catatan-ibu.md).

# 01 — Riset & Temuan

Dokumen ini merekam apa yang ditemukan dari riset, dan mengapa blueprint awal digeser. Setiap keputusan di dokumen lain merujuk ke sini.

---

## 1. Masalah yang sebenarnya

Kalimat aslinya:

> "ibu saya jualan snack biskuit, dan juga menerima jasa jahit, setiap ada pemasukan atau pengeluaran dia harus nyatet sendiri"

Dari wawancara, yang benar-benar terjadi di usaha ibu:

| Fakta | Konsekuensi desain |
|---|---|
| Kulakan snack dalam jumlah besar | Perlu catat modal, supaya yang terlihat untung bersih — bukan cuma omzet |
| Ada yang ngutang / bayar nyicil | Piutang wajib masuk MVP |
| Uang usaha & pribadi tercampur | Butuh konsep dompet + "ambil buat rumah" |
| Ibu **tidak** sering lupa mencatat | Masalahnya media, bukan kebiasaan |
| Ibu sendiri yang akan input, di HP Android | UX harus lolos uji "lebih enteng daripada buku" |
| Jasa jahit perlu DP, deadline, status | Jahit adalah order berjangka, bukan item harga tetap |

Temuan paling penting ada di baris keempat. Ibu **sudah** disiplin mencatat. Artinya kita tidak sedang membangun alat untuk mengubah kebiasaan orang — kita sedang membangun pengganti media yang harus lebih baik dari yang sekarang.

Ini menaikkan standar, bukan menurunkannya. Buku tulis punya keunggulan yang sering diremehkan:

- Terbuka dalam 0 detik, tidak pernah loading
- Tidak pernah minta login
- Tidak pernah error
- Tidak pernah kehabisan baterai
- Bisa ditulis apa saja, termasuk hal yang tidak ada di daftar mana pun
- Gratis

Aplikasi apa pun yang kalah di poin-poin itu akan ditinggal, tidak peduli seberapa pintar laporannya. Ini yang mendasari keputusan offline-first dan keputusan selalu menyediakan jalan keluar berupa catatan bebas.

---

## 2. Kritik terhadap blueprint awal

Blueprint awal merancang SaaS POS universal multi-tenant multi-cabang dengan RBAC, stock opname, supplier, barcode, S3, Redis + BullMQ, WhatsApp API, dan AI add-on berbayar.

Sebagai dokumen SaaS generik, isinya wajar. Sebagai solusi untuk masalah di atas, ada enam masalah serius.

### 2.1 Modelnya POS, masalahnya buku kas

Blueprint menempatkan `transactions` (transaksi kasir) sebagai pusat data. Tapi ibu punya **tiga aliran uang yang berbeda bentuk**:

1. Penjualan snack — barang, per item, stok berkurang, kadang belum dibayar
2. Order jahit — jasa, berhari-hari, DP di depan, pelunasan di belakang
3. Uang keluar lain — kulakan, ongkos, dan uang dagangan yang dipakai belanja rumah

Nomor 2 dan 3 tidak muat di model transaksi kasir. Memaksakannya menghasilkan skema yang aneh: order jahit yang belum selesai bukan "transaksi", tapi uang DP-nya sudah masuk laci. Kulakan bukan "transaksi penjualan", tapi itu pengeluaran terbesar ibu.

Yang menyatukan ketiganya bukan transaksi — tapi **entri buku kas**. Ini pergeseran arsitektural utama, dijabarkan di [`03-data-model.md`](03-data-model.md).

### 2.2 Tabel `services` tidak bisa menampung jasa jahit

Blueprint mendefinisikan:

```
services: id, tenant_id, branch_id, category_id, name, description, price, is_active
```

Itu model jasa harga tetap yang selesai seketika — potong rambut, cuci motor. Jasa jahit bukan itu. Jasa jahit adalah **order dengan siklus hidup**:

```
terima order → ukur → sepakati harga → DP → antre → dikerjakan → jadi → dikabari → diambil → pelunasan
```

Yang perlu disimpan: siapa pelanggannya, jenis jahitannya apa, ukurannya berapa, dijanjikan kapan, sudah DP berapa, kurang berapa, statusnya di mana. Tidak satu pun muat di tabel `services`.

Ini gap terbesar di blueprint, dan kebetulan justru di bagian yang paling personal. Riset kompetitor menunjukkan celah ini juga ada di pasar: aplikasi pembukuan UMKM populer fokus ke jual-beli barang, sementara aplikasi khusus manajemen jahitan jumlahnya sedikit dan umumnya dijual sebagai [software pesanan, bukan produk yang bisa dipakai sendiri](https://accessmedia.co.id/product/aplikasi-manajemen-jahitan). Pola "order + DP + pelunasan otomatis" yang rapi justru [muncul di aplikasi jastip](https://www.jastipku.com/), bukan di aplikasi UMKM umum.

Artinya: kombinasi **jualan barang + order jasa berjangka dalam satu buku kas** adalah posisi yang benar-benar kosong. Bukan karena tidak ada yang bisa membuatnya, tapi karena pemain besar mengejar segmen retail yang lebih seragam.

### 2.3 Hutang-piutang tidak ada sama sekali

Blueprint tidak punya satu pun tabel atau endpoint untuk utang pelanggan. Padahal di usaha rumahan, tetangga ambil barang dulu bayar belakangan adalah keseharian — dan wawancara mengonfirmasi ini terjadi di usaha ibu.

Ini bukan fitur pinggiran. Ini alasan utama orang memakai aplikasi sejenis: [BukuKas dipakai lebih dari 250.000 UMKM](https://www.fanruan.com/id/blog/aplikasi-laporan-keuangan-umkm-terbaik-dan-paling-direkomendasikan), dan pencatatan utang-piutang adalah salah satu fungsi intinya, bukan pelengkap.

Melewatkan ini berarti membangun aplikasi yang, setelah dipakai seminggu, angkanya tidak cocok dengan uang di laci — dan ibu akan kembali ke buku tulis yang setidaknya jujur.

### 2.4 WhatsApp API: mahal, berat, dan salah sasaran

Blueprint menempatkan notifikasi WhatsApp sebagai fitur MVP. Kenyataannya:

- WhatsApp Business API resmi di Indonesia dikenakan biaya per pesan — [sekitar Rp356 per pesan utility ditambah PPN 11%](https://cekat.ai/en/blog/harga-whatsapp-api-indonesia-2026), dengan tarif marketing lebih mahal lagi
- Perlu verifikasi Meta Business dan umumnya lewat penyedia (BSP)
- Dan yang paling penting: sasarannya **ibu sendiri**. Membangun integrasi berbayar dan berizin untuk mengirim "omzet hari ini" ke orang yang HP-nya sedang memegang aplikasi itu adalah biaya tanpa manfaat.

Jalur tidak resmi (library seperti Baileys/whatsapp-web.js) menghindari biaya, tapi menukarnya dengan risiko nomor WhatsApp diblokir. Mempertaruhkan nomor WhatsApp ibu — yang dipakai pelanggan jahitnya untuk memesan — demi notifikasi yang bisa digantikan Web Push adalah pertukaran yang buruk.

Keputusan: lihat [`04-arsitektur.md`](04-arsitektur.md#notifikasi).

### 2.5 Infrastrukturnya over-engineered untuk satu pengguna

Blueprint meminta NestJS + PostgreSQL + Prisma + Redis + BullMQ + S3 + WebSocket + worker terpisah, di-deploy ke VPS/Docker.

Untuk satu pengguna yang mencatat belasan transaksi sehari, tidak satu pun dari Redis, BullMQ, WebSocket, dan worker terpisah dibutuhkan. Yang mereka tambahkan bukan kemampuan, tapi permukaan yang bisa rusak dan tagihan bulanan.

Ini juga bertabrakan dengan dua batasan yang sudah dikonfirmasi: anggaran harus semurah mungkin, dan targetnya ibu bisa mulai memakai dalam hitungan minggu, bukan bulan.

### 2.6 Posisi pasarnya head-on melawan pemain bermodal

"POS universal untuk semua jenis usaha, dengan AI sebagai add-on berbayar" adalah deskripsi yang, di 2026, sudah cocok untuk sepuluh produk yang sudah ada dan sudah murah:

| Produk | Harga (2026) |
|---|---|
| Kasir Pintar Pro | mulai ~Rp55.500/bulan |
| Qasir Pro | ~Rp66.780/bulan (tagihan tahunan) |
| Majoo | mulai Rp129.000/bulan |
| Olsera | mulai ~Rp1.288.000/tahun |

Sumber: [founderplus.id](https://founderplus.id/blog/aplikasi-kasir-pos-ukm-terbaik/), [inticore.co.id](https://inticore.co.id/aplikasi-kasir-terbaik-gratis-berbayar/)

Semuanya sudah menambahkan fitur AI. "Universal + AI" bukan lagi pembeda; itu tabel fitur standar. Bersaing di sana berarti bersaing di harga dan kelengkapan fitur melawan tim yang jauh lebih besar.

Posisi yang bisa dimenangkan justru yang lebih sempit: **usaha rumahan yang menjual barang sekaligus menerima pesanan jasa berjangka.** Penjahit yang juga jual kain. Katering yang juga terima pesanan acara. Servis elektronik yang juga jual sparepart. Segmen ini terlalu kecil dan terlalu tidak seragam untuk dikejar pemain besar, dan buruk dilayani oleh POS retail murni.

### 2.7 Risiko terbesar: aplikasinya tidak dipakai

Riset adopsi digital UMKM Indonesia konsisten menunjuk ke [literasi digital dan kerumitan sebagai hambatan utama](https://gradasigo.com/article/umkm-dan-adopsi-digital-langkah-maju-atau-tantangan-baru), bukan kekurangan fitur. Blueprint awal punya sepuluh menu utama dan mengharuskan pengguna menyiapkan kategori, satuan, varian, cabang, dan role sebelum bisa mencatat penjualan pertamanya.

Setiap layar setup sebelum nilai pertama adalah tempat orang berhenti.

---

## 3. Riset teknis

### 3.1 Supabase free tier (per 2026)

| Batas | Nilai |
|---|---|
| Database | 500 MB |
| File storage | 1 GB |
| Monthly active users | 50.000 |
| Database egress | 5 GB |
| Proyek aktif | 2 |
| **Auto-pause** | **setelah 7 hari tanpa aktivitas database** |

Sumber: [uibakery.io](https://uibakery.io/blog/supabase-pricing), [automationatlas.io](https://automationatlas.io/answers/supabase-free-tier-limits-2026/)

Dua catatan penting:

- **Auto-pause bukan risiko untuk kasus ini.** Ibu memakainya harian, jadi database tidak pernah menganggur 7 hari. Tapi ini jadi risiko nyata saat nanti ada tenant percobaan yang mendaftar lalu menghilang — perlu diingat di fase komersial.
- **500 MB sangat lapang.** Transaksi teks satu warung setahun tidak sampai puluhan MB. Yang akan menghabiskan kuota lebih dulu adalah **foto produk**, dan itu masuk ke storage 1 GB. Konsekuensi: foto wajib dikompres di sisi klien sebelum diunggah.

### 3.2 Multi-tenant dengan Row Level Security

Karena tujuannya "mulai dari ibu, siapkan jadi produk", isolasi tenant harus benar sejak awal — menambahkannya belakangan berarti menyentuh ulang setiap tabel dan setiap query.

Temuan yang menentukan desain:

- **Kolom yang dipakai di policy RLS wajib diindeks.** Indeks yang hilang adalah penyebab nomor satu RLS jadi lambat.
- **Tetap tulis filter `tenant_id` eksplisit di query**, walaupun RLS sudah menyaring baris yang sama. Filter eksplisit membuat perencana query PostgreSQL memakai indeks dengan lebih baik.
- **Gunakan fungsi `SECURITY DEFINER`** untuk pengecekan keanggotaan, bukan subquery `EXISTS` di dalam policy — subquery dievaluasi per baris dan tidak menskala.
- **`USING` untuk baca/hapus, `WITH CHECK` untuk tulis.** `UPDATE` butuh keduanya; melewatkan `WITH CHECK` membuat baris bisa dipindahkan ke tenant lain.
- **Service role key mem-bypass RLS sepenuhnya** dan tidak boleh pernah sampai ke sisi klien.

Sumber: [makerkit.dev](https://makerkit.dev/blog/tutorials/supabase-rls-best-practices), [Supabase](https://supabase.com/features/row-level-security)

### 3.3 Offline-first

Pola yang mapan: service worker untuk aset, **IndexedDB sebagai sumber kebenaran lokal**, dan antrean tulis yang diputar ulang saat koneksi kembali. Baca dan tulis terjadi di sisi klien lebih dulu, jaringan menyusul.

Sumber: [rohitraj.tech](https://rohitraj.tech/en/notes/pwa-offline-sync), [pixelfreestudio](https://blog.pixelfreestudio.com/best-practices-for-making-pwas-offline-first/)

Untuk kasus ini, offline-first **bukan fitur kenyamanan — ini syarat menang melawan buku tulis.** Aplikasi yang menampilkan spinner saat ibu ingin mencatat penjualan Rp5.000 sudah kalah sebelum dinilai.

Soal konflik data: selama satu tenant dipakai satu orang, "tulisan terakhir menang" sudah memadai dan tidak perlu mekanisme yang lebih rumit. Ini baru perlu ditinjau ulang kalau nanti ada dua orang mencatat bersamaan.

### 3.4 QRIS

Kalau nanti ibu menerima pembayaran QRIS, tarif MDR yang berlaku: **0% untuk usaha mikro pada transaksi ≤ Rp500.000**, 0,3% di atas itu, dan biaya ini ditanggung merchant serta [dilarang dibebankan ke pembeli](https://www.bi.go.id/id/publikasi/ruang-media/cerita-bi/Pages/mdr-qris.aspx).

Praktisnya untuk ibu: hampir semua transaksi snack di bawah Rp500.000, jadi potongannya nol. Order jahit bisa melewatinya. Aplikasi cukup mencatat metode bayar; tidak perlu menghitung MDR di MVP.

---

## 4. Kesimpulan

Blueprint awal tidak salah sebagai dokumen SaaS. Yang salah adalah urutannya: ia merancang produk untuk pasar sebelum memvalidasi produk untuk satu orang yang masalahnya sudah diketahui persis.

Arah yang diambil:

1. Bangun buku kas yang benar-benar dipakai ibu, dengan tiga aliran uangnya yang nyata
2. Simpan fondasi multi-tenant di lapisan data, sembunyikan dari permukaan
3. Setelah terbukti dipakai 30 hari, baru buka untuk pengguna lain — dengan bukti, bukan asumsi

Rinciannya di [`02-prd.md`](02-prd.md) dan [`05-roadmap.md`](05-roadmap.md).
