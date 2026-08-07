> **Ditulis ulang setelah melihat catatan ibu.** Versi sebelumnya merancang
> POS dengan katalog produk, stok, dan order jahit berjangka. Tidak satu pun
> dari itu ada di bukunya. Bukti dan asumsi yang gugur:
> [`07-temuan-catatan-ibu.md`](07-temuan-catatan-ibu.md).

# 02 — PRD

## 1. Posisi produk

> Aplikasi pencatatan untuk usaha rumahan yang punya **dua buku**: uang hasil kerja sendiri, dan uang belanja rumah tangga.

Pembandingnya buku tulis, bukan Majoo. Ini strategi, bukan kerendahan hati: melawan buku tulis kita menang di penjumlahan, rekap, dan ingatan. Melawan POS bermodal kita kalah di setiap kolom fitur.

Dan pembanding yang lebih dekat lagi: **bot WhatsApp yang sudah pernah dicoba dan ditinggalkan.** Aplikasi ini harus menang melawan itu, bukan cuma melawan kertas.

---

## 2. Pengguna

**Pengguna tunggal MVP: Ibu.** Satu orang nyata, HP Android, yang sudah mencatat rapi di buku tulis selama bertahun-tahun.

Yang penting dari profilnya, dan semuanya terbaca dari bukunya:

- **Sudah disiplin mencatat.** Delapan belas bulan rekap bulanan berturut-turut. Masalahnya media, bukan kebiasaan.
- **Sudah memisahkan uang.** Dompet fisik terpisah untuk snack, jahit, dan belanja. Aplikasi mengikuti sistem yang sudah ada.
- **Sudah pernah mencoba aplikasi dan berhenti.** Itu bukti kesediaannya, sekaligus daftar hal yang tidak boleh diulang.
- **Mencatat ringkas.** Satu baris memuat beberapa barang: "syr, tahu, cabe, bensin — 42.000". Memaksanya memecah per barang membuat aplikasi lebih lambat daripada bukunya.

---

## 3. Dua buku

Kerangka yang menggantikan model POS.

```
┌───────────────────────┐     ┌───────────────────────┐
│    BUKU USAHA         │     │    BUKU RUMAH         │
│  penghasilan ibu      │     │  belanja rumah tangga │
│                       │     │                       │
│  masuk : jahit, snack │     │  masuk : dari bapak   │
│  keluar: modal,ongkos │     │  keluar: belanja,gas, │
│                       │     │          listrik,dll  │
│  Dompet Jahit         │     │  Dompet Belanja       │
│  Dompet Snack         │     │                       │
└───────────┬───────────┘     └───────────┬───────────┘
            │                             │
            └────── pindah dompet ────────┘
                  (bukan pemasukan,
                   bukan pengeluaran)
```

Tiga hal yang mengalir dari sini:

**Rekap bulanan buku usaha adalah angka utama aplikasi.** Itu angka yang ibu hitung tangan tiap bulan, dan dia sendiri menegaskan tidak termasuk uang dari bapak.

**Pemindahan antar dompet bukan penghasilan dan bukan biaya.** Uang jahit yang dipakai belanja bukan pemasukan rumah tangga — itu uang yang sama, pindah tempat. Menghitungnya berarti rekap bulanan menghitung dua kali, dan angkanya akan berbeda dari yang biasa ibu dapat. Kalau berbeda, yang dia percayai adalah bukunya.

**Snack akan mengubah angkanya.** Selama ini uang snack dipisah tapi tidak pernah dicatat, jadi rekap ibu sebenarnya di bawah yang sebenarnya. Ini perlu diberitahukan, bukan dibiarkan jadi kejutan yang bikin ragu.

---

## 4. Scope MVP

### Masuk

**Catat pemasukan** — jahit, snack, lain. Tanggal, keterangan, nominal, dompet.

**Catat pengeluaran** — buku usaha (modal, ongkos) dan buku rumah (belanja, gas, listrik, transport, arisan, sekolah, kesehatan).

**Pintasan yang tumbuh sendiri** — begitu "Potong 30.000" dicatat dua kali, ia naik jadi tombol sekali tap. Tidak ada layar pengaturan, tidak ada gerbang di awal.

**Pindah dompet** — dengan kedua sisinya tercatat sekaligus.

**Rekap bulanan per buku** — pemasukan, pengeluaran, sisa; plus total tahunan, persis seperti di bukunya.

**Saldo per dompet + cocokkan** — hitung isi dompet fisik, aplikasi tunjukkan selisihnya.

**Utang & piutang** — siapa, berapa, sejak kapan. Tidak menyentuh buku kas sampai uangnya berpindah.

**Input mundur** — untuk memindahkan catatan buku yang belum masuk.

**Jalan penuh tanpa internet**, PWA bisa dipasang, Web Push untuk pengingat.

### Tidak masuk

| Dibuang | Alasan |
|---|---|
| Katalog produk | Ibu belum pernah mencatat snack sama sekali. Katalog jadi gerbang sebelum manfaat pertama terasa |
| Stok, kulakan per item, produk terlaris | Tidak ada satu pun yang ibu lacak |
| Untung dengan modal barang terjual (COGS) | Tanpa katalog dan stok, tidak ada dasarnya |
| Order jahit: ukuran, DP, deadline, status | Yang ibu tulis cuma tanggal + jenis + harga |
| Barcode, kasir, struk | Tidak ada satu pun di bukunya |
| Multi-cabang, RBAC | Satu orang |
| WhatsApp Business API | Berbayar per pesan, perlu verifikasi Meta. Web Push cukup |
| Redis, BullMQ, WebSocket | Tidak dibutuhkan untuk skala ini |

---

## 5. Keputusan UX

### 5.1 Beranda

Satu angka besar (masuk hari ini), tiga tombol, lalu **rekap bulan ini**.

Rekap bulanan naik ke layar pertama, tidak disembunyikan di balik menu laporan. Inilah kegagalan bot WhatsApp sebelumnya: ibu menyerahkan datanya dan tidak pernah menerima apa pun sebagai gantinya.

### 5.2 Aturan timbal balik

> **Setiap kali ibu memasukkan sesuatu, dia harus langsung menerima sesuatu.**

Minimal: total hari ini dan total bulan ini, terlihat tanpa berpindah layar. Ini berlaku di setiap layar catat, bukan cuma di beranda.

### 5.3 Mencatat harus lebih ringan daripada menulis

Target: **satu catatan selesai di bawah 10 detik.**

- Pintasan sekali tap untuk yang sering, dengan nominal terakhir sudah terisi
- Papan angka sendiri, bukan keyboard bawaan yang memakan separuh layar
- Keterangan bebas, tidak dipecah per barang
- Kategori sudah dipilihkan dari tombol yang ditekan; ibu tidak memilih dari daftar panjang
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

Sebutan kategori diambil dari kata yang benar-benar ibu tulis: belanja, listrik, gas, bensin, arisan. Semuanya dikumpulkan di `CATEGORY_LABELS` supaya bisa diganti tanpa menyentuh sisa aplikasi.

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
  Beranda → Jahit masuk → tap "Potong 30.000"  → selesai
                        └ atau ketik nominal    → selesai

Catat belanja
  Beranda → Belanja → nominal → keterangan bebas → selesai

Pindah dompet
  Dompet → Pindah → dari, ke, nominal → selesai
        (dua sisi tercatat sekaligus, tidak masuk hitungan penghasilan)

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
| 5 | Ibu tahu penghasilannya bulan ini tanpa bertanya | Tanya langsung |
| 6 | Angka uang dari bapak tidak pernah tercampur ke penghasilan | Periksa rekap |
| 7 | **Hari ke-30, buku tulis tidak dipakai lagi** | Lihat bukunya |

---

## 8. Yang membuat ini gagal

1. **Mengulang kesalahan bot WhatsApp** — menerima catatan tanpa memberi apa pun kembali. → Rekap di layar pertama, timbal balik di setiap layar catat.
2. **Mencatat terasa lebih berat daripada menulis.** → Pintasan, papan angka sendiri, luring lebih dulu.
3. **Angkanya tidak cocok dengan dompet.** Sekali tidak cocok tanpa penjelasan, kepercayaan hilang. → Cocokkan dompet, pemindahan berpasangan, pembatalan lunak.
4. **Dua buku diam-diam tercampur.** Angka penghasilan yang tiba-tiba melonjak karena uang dari bapak ikut terhitung akan langsung terasa salah oleh ibu. → Ditegakkan di peladen, bukan cuma di aplikasi.
5. **Membangun untuk pasar imajiner.** → Multi-tenant hanya boleh menyentuh lapisan data, tidak menambah satu pun layar di MVP.
