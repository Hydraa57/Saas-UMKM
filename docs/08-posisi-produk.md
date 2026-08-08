# 08 — Posisi Produk

Dokumen ini menjawab pertanyaan yang lebih besar dari "apa yang ibu butuhkan": untuk siapa produk ini, dan kenapa orang akan memilihnya.

Ditulis ulang setelah rancangannya sempat melenceng dua kali — sekali terlalu umum, sekali menjadi aplikasi yang salah jenis.

---

## 1. Tiga cara gagal, dan ketiganya sudah terjadi di repo ini

**Terlalu umum.** Blueprint pertama proyek ini merancang "POS universal untuk semua jenis UMKM" — cabang, RBAC, stock opname, integrasi WhatsApp API, add-on AI — tanpa satu pun pengguna nyata. Hasilnya daftar fitur yang cocok untuk semua orang dan tidak dipakai siapa pun.

**Terlalu sempit.** Rancangan berikutnya berangkat dari catatan satu orang dan menyerap kekhususannya sampai ke nama kategori — `jahit`, `snack`, `dari_bapak`. Berguna untuk satu orang, tidak bisa dipakai orang kedua.

**Salah jenis aplikasi.** Rancangan ketiga — yang paling halus salahnya — menjadi aplikasi pencatat pemasukan dan pengeluaran. Alurnya benar, tesnya lengkap, dan tetap salah: pemiliknya **sudah punya** [NayyiraAI](https://nayyiraai.online), pencatat keuangan lewat WhatsApp. Membangun pencatat keuangan kedua berarti bersaing dengan produk sendiri.

Kesalahan ketiga ini punya akar yang bisa ditunjuk. Catatan buku tulis yang jadi buktinya tidak memuat stok, harga modal, maupun daftar barang, dan itu dibaca sebagai *"stok tidak dibutuhkan"*. Yang benar: **buku tulis memang tidak bisa melacak stok.** Ketiadaan di kertas adalah batas kertasnya, bukan batas kebutuhannya. Menyalin batas alat lama ke alat baru menghasilkan buku tulis versi layar sentuh.

---

## 2. Posisi

> **Aplikasi kasir untuk usaha yang menjual barang sekaligus menerima jasa.**
>
> Layani pembeli, cetak struk — pembukuan dan stok terisi sendiri.

Pencatatan bukan fiturnya. Pencatatan adalah **akibat** dari melayani pembeli.

Itu jawaban langsung atas kegagalan bot WhatsApp: di sana mencatat adalah pekerjaan tambahan di atas pekerjaan yang sudah selesai, jadi ia ditinggalkan begitu sedang sibuk. Di sini, satu-satunya yang dikerjakan adalah yang memang harus dikerjakan — melayani pembeli dan memberi struk. Angkanya ikut karena strukya ikut.

| | Yang dikerjakan pengguna | Yang didapat |
|---|---|---|
| Buku tulis | Menulis setelah melayani | Catatan mentah |
| Bot WhatsApp | Mengetik ulang setelah melayani | "Sudah disimpan" |
| **Ini** | Melayani, lalu ketuk "Bayar" | Struk, uang masuk tercatat, stok berkurang |

---

## 3. Celah yang dituju: jasa sebagai warga kelas satu

Semua aplikasi kasir dibangun untuk barang. Jasa ditempelkan belakangan — biasanya sebagai "produk dengan stok tak terbatas", yang berarti pengguna harus mengarang angka stok untuk sesuatu yang tidak punya stok, dan menunggu sampai suatu hari "Potong celana" dilaporkan habis.

Padahal usaha mikro Indonesia jarang murni satu jenis:

- Tukang jahit menjual kancing, resleting, dan benang
- Bengkel menjual oli sambil menerima servis
- Salon menjual sampo sambil menerima potong rambut
- Warung snack menerima jahitan

Di produk ini bedanya ditegakkan di lapisan data, bukan diserahkan ke kedisiplinan kode:

```sql
constraint stock_only_for_goods check (
  (kind = 'barang') = (stock_qty is not null)
)
```

Jasa **tidak punya kolom stok yang terisi** — bukan nol, bukan tak terbatas. Ditegakkan tiga lapis: tipe TypeScript (`stockQty` hanya ada pada `Barang`), fungsi RPC, dan constraint tabel. Menjual jasa seratus kali tidak menghasilkan satu pun mutasi stok, dan itu diuji di ketiga lapisan.

Di layar, akibatnya terlihat: kolom stok **hilang** dari formulir jasa, bukan dinonaktifkan. Baris "sisa" tidak ada di daftar katalog untuk jasa, bukan diisi tanda hubung.

---

## 4. Untuk siapa

**Usaha mikro yang melayani pembeli langsung, satu orang yang merangkap pemilik dan kasir.** Warung, toko kelontong, katering, gerobak, laundry, jahit, salon, servis, toko online.

Yang menyatukan mereka bukan jenis dagangannya, tapi empat keadaan:

1. Pemiliknya juga yang melayani, di HP, sambil pembeli menunggu
2. Sering menjual barang dan jasa sekaligus
3. Sinyal tidak bisa diandalkan, dan pembeli tidak bisa disuruh menunggu
4. Belum pernah tahu barang mana yang paling laku, karena tidak ada yang mencatatnya

**Bukan untuk:** usaha yang sudah punya kasir, karyawan, dan rekening perusahaan terpisah. Mereka sudah dilayani Majoo, Qasir, dan Kasir Pintar — dan bersaing di sana berarti bersaing di kelengkapan fitur melawan tim yang jauh lebih besar.

---

## 5. Kenapa bukan pemain yang sudah ada

| Pembanding | Kalah di mana |
|---|---|
| **Buku tulis** | Tidak bisa cetak struk, tidak bisa melacak stok, tidak tahu apa yang paling laku |
| **POS (Majoo, Qasir, Kasir Pintar)** | Jasa ditempel sebagai barang berstok tak terbatas; berbayar; butuh setup panjang sebelum transaksi pertama |
| **BukuWarung / BukuKas** | Pencatatan, bukan kasir — tidak ada struk, tidak ada stok |
| **NayyiraAI (produk sendiri)** | Mencatat keuangan lewat WhatsApp; tidak melayani pembeli, tidak mencetak struk, tidak tahu stok |

Baris terakhir yang menjaga arah: kalau produk ini bisa diringkas jadi "mencatat pemasukan dan pengeluaran", ia tidak perlu ada.

Baris pertama yang menentukan rancangan teknis: **pesaing sebenarnya tetap buku tulis**, dan buku tulis terbuka dalam nol detik tanpa sinyal, tidak pernah minta login, tidak pernah error. Karena itu seluruh jalur kasir menulis ke perangkat lebih dulu dan tidak pernah menunggu jaringan — lihat [`04-arsitektur.md`](04-arsitektur.md).

---

## 6. Yang membuat orang bertahan

Aturan yang lahir dari kegagalan nyata — bot WhatsApp yang dipakai sebentar lalu ditinggalkan karena hanya menjawab "sudah disimpan":

> **Setiap kali pengguna memasukkan sesuatu, dia harus langsung menerima sesuatu.**

Di sini yang diterima berwujud: **struk.** Bisa dilihat, bisa dikirim ke WhatsApp pembeli, nanti bisa dicetak ke printer termal — teks lebar-tetap yang sama persis untuk ketiganya, supaya struk yang dilihat, dibagikan, dan dicetak tidak pernah berbeda.

Empat hal lain yang menahan orang bertahan, semuanya sudah tertanam:

- **Gerbang awal sependek mungkin.** Pengaturan awal hanya menanyakan nama usaha. Menambah katalog cukup nama dan harga — foto, stok, dan modal boleh menyusul.
- **Tidak pernah menunggu jaringan.** Struk keluar karena penulisan lokal berhasil, bukan karena peladen menjawab. Nomor struk pun dibuat di perangkat.
- **Stok memperingatkan, tidak melarang.** Angka stok sering tertinggal dari kenyataan; menolak penjualan karenanya akan membuat kasir ditinggalkan tepat saat pembeli menunggu.
- **Angkanya cocok dengan isi laci.** Sekali tidak cocok tanpa penjelasan, kepercayaan hilang dan tidak kembali. Karena itu kulakan juga mengurangi kas, bukan cuma menambah stok.

---

## 7. Yang dibuang, dan kenapa

**Buku rumah tangga.** Rancangan sebelumnya punya dua buku — usaha dan rumah — dengan alasan yang benar: [73% UMKM Indonesia tidak memisahkan keuangan usaha dan pribadi](https://journal.unespadang.ac.id/jaaip/article/view/596).

Alasannya benar, tempatnya salah. Aplikasi kasir dibuka saat ada pembeli di depan meja; belanja dapur tidak terjadi di situ. Mempertahankannya berarti tiap layar harus menjawab "ini buku yang mana" — sebuah pertanyaan yang tidak pernah muncul di kepala orang yang sedang melayani pembeli.

Pemisahan uang usaha dari uang rumah tetap terjadi, tapi lewat batas yang lebih tegas dan tidak butuh pilihan apa pun: **yang masuk ke aplikasi ini hanya uang usaha.** Untuk keuangan rumah tangga sudah ada NayyiraAI.

---

## 8. Urutan pembuktian

1. **Satu pengguna, 30 hari.** Katalognya diisi bersama-sama sekali di awal — itu bagian dari uji, karena pengisian katalog adalah gerbang terbesar produk ini. Kalau buku tulisnya berhenti dipakai, produknya benar.
2. **Lima usaha berbeda jenis.** Warung, kuliner, dan jasa — untuk menguji apakah kosakatanya benar-benar umum, atau cuma terasa umum.
3. **Baru bicara harga.**

Gerbang di antara tahap satu dan dua tidak boleh dilewati. Membuka pendaftaran sebelum satu pengguna yang paling termotivasi pun belum bertahan adalah cara memperbanyak kegagalan.

Ukuran keberhasilan tahap pertama tetap satu kalimat:

> **Setelah 30 hari, buku tulis itu tidak dipakai lagi.**

---

## 9. Kosakata

Kategori memakai kata baku dan cukup umum untuk usaha apa pun. Setelah buku rumah dibuang, yang tersisa hanya kategori usaha:

| Kategori | Dari mana asalnya |
|---|---|
| `penjualan` | Kasir |
| `jasa` | Kasir |
| `modal` | Kulakan |
| `operasional` | Dicatat manual |
| `upah` | Dicatat manual |
| `sewa` | Dicatat manual |
| `lainnya` | Dicatat manual |
| `pindah` | Pemindahan antar dompet — tidak masuk laporan |

Tiga yang pertama sengaja **tidak bisa** dipilih saat mencatat biaya manual: ketiganya lahir dari kasir dan kulakan. Kalau bisa dibuat manual, buku kas akan punya baris kulakan yang tidak berpasangan dengan kulakan mana pun.

Semua sebutan dikumpulkan di `CATEGORY_LABELS` supaya bisa diganti tanpa menyentuh sisa aplikasi. Daftar lengkapnya di [`03-data-model.md`](03-data-model.md).

**Sumber:** [Pemisahan keuangan pribadi–usaha UMKM](https://journal.unespadang.ac.id/jaaip/article/view/596) · [SAK EMKM](https://accounting.binus.ac.id/2023/08/01/sak-emkm-standar-akuntansi-keuangan-entitas-mikro-kecil-menengah/) · [Harga aplikasi kasir 2026](https://founderplus.id/blog/aplikasi-kasir-pos-ukm-terbaik/)
