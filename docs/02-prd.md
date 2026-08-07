> **Ditulis ulang setelah melihat catatan ibu.** Versi sebelumnya merancang
> POS dengan katalog produk, stok, dan order jahit berjangka. Tidak satu pun
> dari itu ada di bukunya. Bukti dan asumsi yang gugur:
> [`07-temuan-catatan-ibu.md`](07-temuan-catatan-ibu.md).

# 02 — PRD

## 1. Posisi produk

> Aplikasi pencatatan yang **melakukan** pemisahan uang usaha dan uang rumah tangga — bukan yang menuntut penggunanya memisahkan lebih dulu.

Untuk usaha mikro apa pun: warung, katering, laundry, jahit, servis, toko online. Uraian lengkap beserta risetnya di [`08-posisi-produk.md`](08-posisi-produk.md).

Pembandingnya buku tulis, bukan Majoo. Ini strategi, bukan kerendahan hati: melawan buku tulis kita menang di penjumlahan, rekap, dan ingatan. Melawan POS bermodal kita kalah di setiap kolom fitur.

Dan pembanding yang lebih dekat lagi: **bot WhatsApp yang sudah pernah dicoba dan ditinggalkan.** Aplikasi ini harus menang melawan itu, bukan cuma melawan kertas.

---

## 2. Pengguna

**Sasarannya usaha mikro yang keuangannya masih menyatu dengan rumah tangga** — [73% UMKM Indonesia](https://journal.unespadang.ac.id/jaaip/article/view/596).

**Pengguna nomor satu, yang membuktikan: Ibu.** Satu orang nyata, HP Android, yang sudah mencatat rapi di buku tulis selama bertahun-tahun. Kosakata aplikasinya umum; pembuktiannya lewat dia.

Menariknya ibu justru ada di 27% yang **sudah** memisahkan uangnya — pakai dompet fisik. Itu sebabnya rancangan sempat salah arah: kebiasaannya diambil sebagai kebiasaan umum, padahal dia pengecualian. Buku kini melekat pada tiap catatan, bukan pada dompet, supaya mayoritas yang berdompet tunggal juga terlayani.

Yang penting dari profilnya, dan semuanya terbaca dari bukunya:

- **Sudah disiplin mencatat.** Delapan belas bulan rekap bulanan berturut-turut. Masalahnya media, bukan kebiasaan.
- **Sudah pernah mencoba aplikasi dan berhenti.** Itu bukti kesediaannya, sekaligus daftar hal yang tidak boleh diulang.
- **Mencatat ringkas.** Satu baris memuat beberapa barang: "sayur, tahu, cabai, bensin — 42.000". Memaksanya memecah per barang membuat aplikasi lebih lambat daripada bukunya.

---

## 3. Dua buku

Kerangka yang menggantikan model POS.

```
        DOMPET  (uangnya ada di mana)          BUKU  (kegiatan apa)
        ────────────────────────────           ──────────────────────
                                        ┌───▶  USAHA
        Dompet Utama  ──── tiap ────────┤        masuk : penjualan, jasa
        (Rekening)         catatan      │        keluar: modal, operasional,
                           diberi       │                upah, sewa
                           label        │
                                        └───▶  RUMAH TANGGA
        pindah dompet                            masuk : gaji, pemberian
        (tanpa buku,                             keluar: belanja, transportasi,
         tidak masuk laporan)                            utilitas, komunikasi,
                                                         pendidikan, kesehatan,
                                                         sosial, angsuran
```

Tiga hal yang mengalir dari sini:

**Buku dipilih per catatan, bukan ditebak dari dompet.** Mayoritas usaha mikro cuma punya satu tempat uang. Kalau bukunya ditentukan dompet, mereka tidak bisa memisahkan apa pun. Dengan buku melekat di tiap catatan, belanja dapur yang dibayar pakai uang dagangan cukup dicatat berbuku rumah dari dompet yang sama.

**Rekap bulanan buku usaha adalah angka utama aplikasi.** Itu angka yang selama ini dihitung tangan tiap bulan.

**Pemindahan antar dompet bukan penghasilan dan bukan biaya.** Uang yang dipindahkan ke rekening bukan pemasukan baru — itu uang yang sama, pindah tempat. Menghitungnya berarti rekap bulanan menghitung dua kali.

---

## 4. Scope MVP

### Masuk

**Catat pemasukan** — buku usaha (penjualan, jasa) dan buku rumah (gaji, pemberian). Tanggal, keterangan, nominal, dompet.

**Catat pengeluaran** — buku usaha (modal, operasional, upah, sewa) dan buku rumah (belanja, transportasi, utilitas, komunikasi, pendidikan, kesehatan, sosial, angsuran).

**Pintasan yang tumbuh sendiri** — begitu "Potong rambut 15.000" dicatat dua kali, ia naik jadi tombol sekali tap. Tidak ada layar pengaturan, tidak ada gerbang di awal.

**Pindah dompet** — dengan kedua sisinya tercatat sekaligus.

**Rekap bulanan per buku** — pemasukan, pengeluaran, sisa; plus total tahunan, persis seperti di bukunya.

**Saldo per dompet + cocokkan** — hitung isi dompet fisik, aplikasi tunjukkan selisihnya.

**Utang & piutang** — siapa, berapa, sejak kapan. Tidak menyentuh buku kas sampai uangnya berpindah.

**Input mundur** — untuk memindahkan catatan buku yang belum masuk.

**Jalan penuh tanpa internet**, PWA bisa dipasang, Web Push untuk pengingat.

### Tidak masuk

| Dibuang | Alasan |
|---|---|
| Katalog produk | Gerbang sebelum manfaat pertama terasa. Diganti pintasan yang tumbuh dari pemakaian |
| Stok, kulakan per item, produk terlaris | Bukan yang dilacak usaha mikro; menambah beban input tanpa jawaban yang dicari |
| Untung dengan modal barang terjual (COGS) | Tanpa katalog dan stok, tidak ada dasarnya |
| Order berjangka: DP, tenggat, status | Yang dicatat cuma tanggal + jenis + harga |
| Barcode, kasir, struk | Untuk usaha berkasir, bukan usaha rumahan |
| Multi-cabang, RBAC | Satu orang yang mencatat |
| WhatsApp Business API | Berbayar per pesan, perlu verifikasi Meta. Web Push cukup |
| Redis, BullMQ, WebSocket | Tidak dibutuhkan untuk skala ini |

---

## 5. Keputusan UX

### 5.1 Beranda

Pemilih buku di paling atas, satu angka besar (masuk hari ini), dua tombol, lalu **rekap bulan ini**.

Pemilih buku ada di atas karena itu keputusan pertama tiap kali mencatat — dan karena menaruhnya di sana membuat pemisahan terasa wajar, bukan seperti pengaturan lanjutan.

Rekap bulanan naik ke layar pertama, tidak disembunyikan di balik menu laporan. Inilah kegagalan bot WhatsApp sebelumnya: penggunanya menyerahkan data dan tidak pernah menerima apa pun sebagai gantinya.

### 5.2 Aturan timbal balik

> **Setiap kali pengguna memasukkan sesuatu, dia harus langsung menerima sesuatu.**

Minimal: total hari ini dan total bulan ini, terlihat tanpa berpindah layar. Ini berlaku di setiap layar catat, bukan cuma di beranda.

### 5.3 Mencatat harus lebih ringan daripada menulis

Target: **satu catatan selesai di bawah 10 detik.**

- Pintasan sekali tap untuk yang sering, dengan nominal terakhir sudah terisi
- Papan angka sendiri, bukan keyboard bawaan yang memakan separuh layar
- Keterangan bebas, tidak dipecah per barang
- Kategori dipersempit oleh buku yang sedang aktif; tidak ada daftar panjang
- Tidak pernah ada layar tunggu di jalur mencatat

### 5.4 Bahasa

| Jangan | Pakai |
|---|---|
| Revenue / Omzet | Masuk |
| Expense | Keluar |
| Receivable | Belum bayar |
| Transfer | Pindah dompet |
| Balance | Isi dompet |
| Reconcile | Cocokkan |

Sebutan kategori memakai kata baku dan cukup umum untuk usaha apa pun: Penjualan, Jasa, Belanja, Transportasi. Semuanya dikumpulkan di `CATEGORY_LABELS` supaya bisa diganti tanpa menyentuh sisa aplikasi.

### 5.5 Fisik layar

- Target sentuh minimal 56px
- Ukuran dasar 18px; angka utama jauh lebih besar
- Kontras tinggi
- Rupiah selalu diformat penuh (`Rp 5.000`)
- Perbesar-cubit **tidak** dimatikan

---

## 6. Alur utama

```
Catat pemasukan
  Beranda → [Usaha] → Uang Masuk → tap pintasan   → selesai
                                 └ atau ketik nominal + kategori → selesai

Catat belanja rumah
  Beranda → [Rumah] → Uang Keluar → nominal → Belanja → keterangan → selesai
        (dibayar dari dompet mana pun, termasuk dompet yang sama
         dengan uang dagangan)

Pindah dompet
  Dompet → Pindah → dari, ke, nominal → selesai
        (dua sisi tercatat sekaligus, tanpa buku, tidak masuk laporan)

Lihat rekap
  Beranda → sudah terlihat
          → ketuk untuk daftar bulanan + total tahunan
```

---

## 7. Kriteria penerimaan

| # | Kriteria | Cara ukur |
|---|---|---|
| 1 | Satu catatan selesai < 10 detik | Stopwatch, 10 percobaan, ambil median |
| 2 | Ibu mencatat pertama kali tanpa dibantu | Amati, jangan dibantu, catat di mana macet |
| 3 | Saldo aplikasi cocok dengan isi dompet | Hitung fisik akhir hari, 7 hari berturut |
| 4 | Jalan penuh tanpa internet | Mode pesawat, catat 5 entri, nyalakan, pastikan tersinkron sekali |
| 5 | Pengguna tahu penghasilannya bulan ini tanpa bertanya | Tanya langsung |
| 6 | Pemasukan rumah tangga tidak pernah tercampur ke penghasilan usaha | Periksa rekap |
| 7 | **Hari ke-30, buku tulis tidak dipakai lagi** | Lihat bukunya |

---

## 8. Yang membuat ini gagal

1. **Mengulang kesalahan bot WhatsApp** — menerima catatan tanpa memberi apa pun kembali. → Rekap di layar pertama, timbal balik di setiap layar catat.
2. **Mencatat terasa lebih berat daripada menulis.** → Pintasan, papan angka sendiri, luring lebih dulu.
3. **Angkanya tidak cocok dengan dompet.** Sekali tidak cocok tanpa penjelasan, kepercayaan hilang. → Cocokkan dompet, pemindahan berpasangan, pembatalan lunak.
4. **Dua buku diam-diam tercampur.** Angka penghasilan yang melonjak karena uang rumah tangga ikut terhitung akan langsung terasa salah. → Ditegakkan di peladen, bukan cuma di aplikasi.
5. **Membangun untuk pasar imajiner.** → Multi-tenant hanya boleh menyentuh lapisan data, tidak menambah satu pun layar di MVP.
