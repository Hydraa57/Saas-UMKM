# Ezura

**Aplikasi kasir untuk usaha yang menjual barang sekaligus menerima jasa.**
Layani pembeli, cetak struk — pembukuan dan stok terisi sendiri.

Untuk usaha mikro Indonesia pada umumnya: warung, katering, laundry, jahit, servis, bengkel, salon, konter pulsa.

Temuan lapangannya berasal dari satu usaha nyata — ibu saya, yang menjual snack sekaligus menerima jahitan dan sampai hari ini mencatat semuanya di buku tulis. Itu **asal-usul buktinya, bukan batas sasarannya.** Satu usaha yang bisa diamati dari dekat selama bertahun-tahun memberi hal yang tidak bisa diberi survei seratus responden: catatan asli yang bisa dibaca baris per baris, dan alasan sebenarnya kenapa sebuah aplikasi ditinggalkan. Tapi tiap keputusan di repo ini harus bisa dipertahankan untuk usaha mikro mana pun — kalau alasannya cuma berlaku untuk satu orang, alasannya belum selesai.

## Celah yang dituju

Semua aplikasi kasir dibangun untuk barang. Jasa ditempelkan belakangan — biasanya sebagai "produk dengan stok tak terbatas", yang berarti pengguna harus mengarang angka stok untuk sesuatu yang tidak punya stok, lalu menunggu sampai suatu hari "Potong celana" dilaporkan habis.

Padahal usaha mikro Indonesia jarang murni satu jenis: tukang jahit menjual kancing, bengkel menjual oli, salon menjual sampo, warung snack menerima jahitan.

Di sini bedanya ditegakkan di lapisan data, bukan diserahkan ke kedisiplinan kode:

```sql
constraint stock_only_for_goods check (
  (kind = 'barang') = (stock_qty is not null)
)
```

Jasa **tidak punya kolom stok yang terisi** — bukan nol, bukan tak terbatas. Tiga lapis menjaganya: tipe TypeScript (`stockQty` hanya ada pada `Barang`), fungsi RPC, dan constraint tabel. Di layar, kolom stok **hilang** dari formulir jasa, bukan dinonaktifkan.

Uraian lengkapnya di [`docs/08-posisi-produk.md`](docs/08-posisi-produk.md).

## Kenapa repo ini ada

Bukan lahir dari riset pasar, tapi dari melihat ibu saya menjumlah rekap bulanan dengan pulpen — delapan belas bulan berturut-turut, lengkap dengan total tahunan.

Yang membuat itu layak jadi dasar produk umum bukan karena dia satu-satunya sasaran, melainkan karena perilakunya **khas**: jutaan usaha mikro di Indonesia mencatat dengan cara yang sama, gagal dengan cara yang sama, dan berhenti memakai aplikasi karena alasan yang sama. Buku tulis yang bisa dibuka dan dibaca halaman demi halaman adalah spesifikasi yang lebih jujur daripada wawancara, karena ia tidak bisa mengarang.

Target keberhasilan tahap pertama tetap satu kalimat:

> **Setelah 30 hari, buku tulis itu tidak dipakai lagi.**

Satu pengguna yang bertahan sebulan lebih membuktikan daripada seratus pendaftar yang berhenti di minggu pertama — dan yang bertahan sebulan itulah yang menunjukkan mana bagian produk yang benar-benar tahan dipakai orang lain.

## Tiga arah yang sudah dicoba dan dibuang

Arah produknya berbelok dua kali, dan keduanya tercatat karena alasannya masih berlaku:

1. **"POS universal untuk semua UMKM"** — cabang, RBAC, stock opname, WhatsApp API, add-on AI. Dirancang tanpa satu pun pengguna nyata. Daftar fitur yang cocok untuk semua orang dan tidak dipakai siapa pun.
2. **Aplikasi pencatat pemasukan/pengeluaran dua buku** (usaha & rumah tangga). Alurnya jalan, tesnya lengkap, dan tetap salah jenis: saya **sudah punya** [NayyiraAI](https://nayyiraai.online) untuk itu. Membangunnya berarti bersaing dengan produk sendiri.
3. **Sekarang: aplikasi kasir.** Pencatatan bukan fiturnya — pencatatan adalah akibat dari melayani pembeli.

Kesalahan kedua punya akar yang bisa ditunjuk, dan akarnya berlaku umum. Buku tulis yang diamati tidak memuat stok, harga modal, maupun daftar barang, dan itu dibaca sebagai *"stok tidak dibutuhkan"*. Yang benar: **buku tulis memang tidak bisa melacak stok.** Ketiadaan di kertas adalah batas kertasnya, bukan batas kebutuhannya — dan itu berlaku untuk setiap usaha yang catatannya masih di kertas, bukan cuma satu.

Kesalahan pertama juga punya pelajaran yang masih berlaku sekarang: **"untuk semua UMKM" bukan izin membangun tanpa satu pun pengguna nyata.** Sasaran yang luas dan bukti yang tipis adalah kombinasi yang menghasilkan daftar fitur, bukan produk.

## Pelajaran dari percobaan sebelumnya

Pernah dibangun pencatat keuangan lewat WhatsApp dengan AI dan spreadsheet. Penggunanya memakainya sebentar lalu berhenti — AI-nya sering error, dan balasannya cuma *"sudah disimpan"*. Untuk tahu pemasukan sebulan, tetap harus membuka spreadsheet.

Diagnosisnya bukan soal AI. Yang dibangun cuma separuh: pencatatannya jalan, pembacaan-kembalinya tidak ada. Aturan yang lahir dari situ, dan berlaku di seluruh aplikasi:

> **Setiap kali pengguna memasukkan sesuatu, dia harus langsung menerima sesuatu.**

Di kasir, yang diterima berwujud: **struk.** Bisa dilihat, dikirim ke WhatsApp pembeli, dan nanti dicetak ke printer termal — teks lebar-tetap yang sama persis untuk ketiganya, supaya struk yang dilihat, dibagikan, dan dicetak tidak pernah berbeda.

Percobaan itu juga meninggalkan bukti berharga: penggunanya bersedia memakai aplikasi. Yang gagal bukan kesediaannya — dan itu temuan yang berlaku luas, karena kesediaan justru bagian yang paling sering dikira jadi hambatan.

## Status

Alur pokoknya sudah jalan dari ujung ke ujung: pengaturan awal → isi katalog → kasir → struk → stok berkurang → pembukuan terisi. Diuji di peramban sungguhan, bukan cuma di tes unit.

| Selesai | Tes |
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
| Tarik dua arah: watermark, gagal di tengah, aturan bentrok | 13 |
| Pesan galat yang bisa ditindaklanjuti | 14 |
| Menyebut isi antrean dengan kata pemiliknya | 8 |
| Aksi tulis (tulis lokal + antre, tanpa menunggu jaringan) | 40 |
| Skema, RLS, jalur tulis (PostgreSQL sungguhan) | 92 penegasan |

Layar yang sudah ada: pengaturan awal, beranda, barang & jasa (tab Daftar + Stok), tambah/ubah/arsip, kasir, struk, riwayat struk, kulakan, koreksi hitung fisik, piutang, uang keluar, cadangan, laporan, pasang QRIS, pengaturan (termasuk ganti akun).

Struk bisa dicetak ke printer termal Bluetooth (Web Bluetooth + ESC/POS) — **teks yang sama persis** dengan yang tampil di layar dan yang dikirim ke WhatsApp. Penyandinya menerima string, bukan `Sale`, jadi tidak ada tempat kedua yang bisa melenceng. Kodenya sudah lengkap dan teruji; yang belum adalah pengujian dengan printer sungguhan.

**Login wajib di awal.** Arahnya sempat sebaliknya — login sebagai pilihan, dengan alasan bahwa gerbang sebelum manfaat pertama adalah tempat orang berhenti.

Alasan pembalikannya waktu itu: penggunanya diantar langsung, jadi gerbang tidak memakan siapa-siapa. **Alasan itu tidak berlaku lagi** begitu sasarannya usaha mikro pada umumnya — orang yang menemukan aplikasi ini sendiri memang berhenti di gerbang, dan itu terukur. Yang menahan keputusannya sekarang adalah alasan kedua, yang tidak bergantung pada bagaimana penggunanya datang: **catatan yang tidak pernah dicadangkan adalah catatan yang akan hilang**, dan yang hilang di sini penghasilan orang, bukan draf tulisan. Berapa banyak pendaftar yang berhenti di gerbang itu masuk daftar hal yang harus diukur sebelum pendaftaran dibuka untuk umum — bukan ditebak.

Gerbangnya **cuma sekali**. Sesudah sebuah HP pernah berhasil masuk, ia ditandai dan tidak pernah dikunci lagi — kasir yang menolak terbuka karena sinyal mati adalah kasir yang ditinggalkan hari itu juga. Tenant dibuat di perangkat dengan UUID sendiri, dan diklaim akun saat antrean pertama kali terkirim; `create_tenant` memang menerima `p_tenant_id` dari perangkat. Antrean kirim berjalan saat aplikasi dibuka, saat sinyal kembali, saat antrean bertambah, dan berkala.

Laporan bulanan sudah ada: rekap per bulan, total tahunan, barang terlaris, untung kotor dari harga modal yang disalin saat transaksi, dan jam paling ramai. Seluruh catatan bisa diunduh jadi satu berkas `.xlsx` — **penyandinya ditulis sendiri**, tanpa pustaka: `.xlsx` cuma ZIP berisi XML, dan `exceljs` membawa lebih dari satu megabita untuk tabel datar. Ekspor dipakai sebulan sekali; kasir dibuka puluhan kali sehari.

Penyandi buatan sendiri punya satu bahaya khas: tes yang ditulis di repo yang sama membaca hasilnya dengan anggapan yang sama, jadi keduanya bisa sama-sama salah dan tetap cocok. Karena itu ada satu berkas tes yang menyerahkan hasilnya ke **`openpyxl`** — pustaka Python yang menerapkan OOXML secara terpisah — dengan peringatan dinaikkan jadi galat. Uji asap melangkah lebih jauh lagi: ia menekan tombolnya di Chromium sungguhan, menangkap berkas yang benar-benar terunduh, lalu membacanya dengan `openpyxl`. Bagian `<cellStyles>` yang hilang tertangkap justru oleh pemeriksaan itu, dan tidak oleh satu pun tes di repo ini.

**QRIS dengan nominal sudah terisi**, tanpa penyedia jasa pembayaran dan tanpa biaya tambahan. Caranya memakai QRIS statis yang **sudah dimiliki** usahanya — yang tertempel di meja: muatannya mengikuti spesifikasi EMVCo, jadi nominalnya bisa disisipkan di HP (ubah tag `01` jadi `12`, sisipkan tag `54`, hitung ulang CRC-16). Murni komputasi lokal, jalan tanpa sinyal. QRIS dinamis dari PJP menuntut badan usaha terdaftar dan potongan tiap transaksi; ini tidak.

Batasnya ditulis di layarnya sendiri dan tidak dikaburkan: **aplikasi tidak pernah tahu uangnya sudah masuk.** Tidak ada jalur balik dari bank, jadi penjualannya baru tercatat setelah pemiliknya menekan tombol — bukan otomatis begitu QR-nya tampil.

Diuji dengan cara yang sama kerasnya seperti ekspor: CRC dan muatan pembandingnya dihitung `binascii.crc_hqx` milik Python, dan uji asap **memotret QR yang tergambar di layar lalu memindainya balik** dengan `jsqr`, memastikan yang akan dilihat kamera pembeli benar-benar berisi nominal yang tepat dengan data merchant yang tidak tergeser. Pemeriksaan itu langsung menangkap satu bug tata letak nyata: bilah tombol di dasar layar menutupi seperempat bagian bawah kodenya, dan QR yang terpotong gagal dipindai sama sekali.

Foto katalog ikut tersalin ke Supabase Storage. Sebelumnya foto hanya ada sebagai blob di IndexedDB satu HP — katalognya tersalin, fotonya tidak, jadi kalau HP-nya hilang yang kembali adalah daftar barang **tanpa satu pun fotonya**. Pada kasir yang seluruh cara pakainya "ketuk fotonya", itu praktis berarti mengisi ulang katalog dari nol.

Embernya **tidak publik**, dan nama berkasnya `<tenant>/<item>` — seluruh keamanannya bertumpu pada policy yang memeriksa segmen folder pertama. Harness lokal sekarang punya tiruan skema `storage` supaya keempat policy itu benar-benar diuji: kontrol negatif membuktikannya sensitif — pemeriksaan foldernya dilepas, dan satu tenant langsung bisa menulis foto ke folder tenant lain.

Satu putaran terakhir menjawab keluhan yang tidak menyebut satu layar pun: *"UI nya msh ga smooth, msh bnyak ui2 bawaan browser."* Keluhan seperti itu mudah dijawab dengan menambah animasi, dan itu akan salah. Sebabnya ada tiga dan semuanya bisa dihitung:

- **Empat puluh tautan masih `<a href>`**, dan `next/link` dipakai **nol** kali. Tiap ketukan menu karena itu memuat ulang seluruh dokumen — layar berkedip putih dan Dexie dibuka lagi dari nol. Itu bukan "kurang halus", itu memang menekan *refresh*. `window.location` tinggal di ganti akun, satu-satunya tempat yang muat ulang penuhnya memang disengaja.
- **Kendali bawaan peramban.** `<details>` menggambar segitiga yang bentuk dan warnanya ditentukan sistem operasi; `<input type="file">` telanjang menuliskan "Choose file / no file chosen" berikut nama berkas yang tidak berarti apa-apa. Keduanya tidak bisa diwarnai dan berbeda di tiap HP. Penggantinya ditulis sendiri.
- **Foto cuma bisa dari kamera.** `capture="environment"` bukan "utamakan kamera" melainkan **paksa kamera**: di Android galerinya tidak ditawarkan sama sekali, jadi foto kiriman pemasok lewat WhatsApp tidak bisa dipakai dan tiap barang harus difoto ulang saat itu juga.

Putaran berikutnya menjawab dua keluhan sekaligus: *"layout dan fontnya kayak ga simetris ukurannya, dan terlalu besar."*

**Tidak simetris** ternyata bisa dihitung, bukan soal perasaan. Radiusnya diklaim "dua nilai saja" dan ternyata **enam** yang dipakai berdampingan — `rounded-2xl` (16px, 49×), `rounded-kartu` (18px, 13×), `rounded-xl` (12px), `rounded-lg`, dan dua nilai karangan. Pasangan 16px dan 18px itu yang paling merusak: bedanya terlalu kecil untuk terbaca sebagai pilihan, dan cukup besar untuk terbaca sebagai kelalaian. Jarak dalam kartu sama saja — `.kartu` memakai 20px sementara 30 tempat lain menulis `p-4` langsung, jadi tepi kiri isi kartu tidak pernah lurus dari satu kartu ke kartu berikutnya. Sekarang tiga radius dengan aturan yang bisa diperiksa (**kotak di dalam kotak memakai radius lebih kecil**) dan satu jarak dalam.

**Terlalu besar** adalah akibat langsung dari menganggap produk ini milik satu orang. Seluruh skala dinaikkan satu tingkat atas nama mata yang tidak lagi sempurna, dan di layar selebar 390px itu bekerja melawan tujuannya sendiri: huruf besar membantu membaca satu baris, tapi menghambat membaca satu daftar. Sekarang base 16px dan target sentuh 48px — dan yang butuh lebih besar **memilihnya sendiri** di Pengaturan → Ukuran huruf. Seluruh skala ditulis dalam `rem`, jadi satu angka di akar menggeser huruf, tombol, dan jarak secara sepadan; huruf yang membesar sendiri di dalam tombol yang tidak ikut membesar justru lebih sulit dibaca. Pilihannya dipasang oleh skrip sebaris di `<head>` supaya sudah berlaku sebelum gambar pertama — kontrol negatifnya tegas: tanpa skrip itu pilihannya **hilang sama sekali** setelah muat ulang, bukan cuma berkedip.

**Sinkronisasinya sekarang dua arah.** Sampai putaran ini alirannya cuma satu: perangkat menulis, antrean mengirim, peladen menyimpan — dan tidak pernah ada jalan pulangnya. Akibatnya satu janji di layar ganti akun tidak bisa ditepati sama sekali: *"yang sudah terkirim tetap aman di peladen dan bisa ditarik lagi nanti."*

Sekarang bisa. Masuk akun yang sama di HP lain, dan katalog, penjualan, stok, kas, serta utangnya turun ke sana sendiri; fotonya menyusul di belakang supaya kasirnya bisa dipakai sejak menit pertama. HP baru yang kosong adalah kasus HP kedua dengan watermark nol, jadi pemulihan tidak butuh jalur tersendiri.

Dua keputusan kecil yang menentukan benar-tidaknya, dan keduanya punya kontrol negatif:

- **Pembandingnya `>=`, bukan `>`.** Dengan `>`, baris yang ditulis pada detik yang sama persis dengan watermark hilang **selamanya** — dan dua penjualan dalam satu detik itu biasa di jam ramai. Akibatnya sebagian baris terambil dua kali, dan itu tidak apa-apa: penyimpanannya `bulkPut` berdasarkan `id`.
- **Watermark diambil dari jam peladen**, bukan jam perangkat. Jam HP murah sering meleset berjam-jam, dan watermark yang lebih maju daripada kenyataan berarti baris yang hilang tanpa gejala apa pun sampai ada yang mencari struk lama dan tidak menemukannya.

Yang bentrok ternyata hampir tidak ada, dan itu bukan keberuntungan: antreannya mengangkut **maksud**, bukan baris. Yang dikirim `record_sale`, bukan "tulis nilai stok jadi 8" — jadi dua HP yang menjual barang yang sama menghasilkan dua penjualan berbeda dan peladen yang menjumlahkan akibatnya. Sisanya tiga aturan: rollup selalu milik peladen, yang diketik manusia dipilih dari `updated_at`, dan tidak ada yang dihapus keras sehingga tarikan tidak pernah perlu menghapus. Rincian di [`docs/04-arsitektur.md`](docs/04-arsitektur.md) §2.

Satu aturan menahan tarikan: **ia tidak berjalan selama antrean kirim masih berisi.** Kalau dilanggar, baris yang perubahannya masih di antrean akan ditimpa keadaan lama dari peladen — suntingan terlihat kembali seperti semula, lalu berubah lagi beberapa detik kemudian.

**Kalau ada yang rusak, aplikasinya tidak lagi menakuti.** Tiga lubang, dan ketiganya cuma terlihat kalau dicari:

- **Tidak ada satu pun error boundary.** Layar yang gagal digambar menampilkan layar bawaan Next.js: *"Application error: a client-side exception has occurred"*, latar putih, tanpa satu pun tombol. Sekarang yang muncul jaminan lebih dulu — *"Catatannya aman"* — lalu tombol buka-lagi, lalu **sekoci**: unduh semua ke Excel, langsung dari layar galat itu. Sekocinya ada di sana justru karena layar laporan mungkin yang sedang rusak. Bilah navigasi sengaja tetap hidup, jadi satu layar rusak tidak menghentikan jualan hari itu.
- **Peringatan "N catatan ditolak" mengantar ke jalan buntu** — ia menuju layar cadangan, yang tidak menyebut catatan tertolak sama sekali. `retryFailed` dan `discardFailed` sudah ada di kode sejak lama dan **tidak pernah dipanggil dari layar mana pun.** Sekarang ada layarnya: tiap catatan disebut dengan hal yang menandainya di ingatan ("Penjualan · dibayar Rp 45.000 — 2 baris · atas nama Bu Sri"), bukan dengan tulisan `record_sale`. Dan dinyatakan terang-terangan bahwa **membuang berarti berhenti mengirim, bukan menghapus** — kalau tidak, tombol itu tidak akan pernah ditekan siapa pun, dan peringatannya menetap sampai berhenti dilihat.
- **Pesan Postgres bocor mentah ke layar.** *"duplicate key value violates unique constraint"* sekarang jadi *"Catatan ini sudah pernah tersimpan sebelumnya, jadi tidak ditulis dua kali"* — dan itu bukan sekadar terjemahan: yang aslinya terbaca sebagai kegagalan sebenarnya kabar baik, dan menampilkannya sebagai galat membuat pemiliknya mencatat ulang penjualan yang sudah tercatat.

**Satu akun = satu usaha, dan itu ternyata belum pernah benar.** `tenant_id` dibuat di perangkat sebagai UUID acak — keputusan yang benar, karena itu yang membuat penulisan idempoten dan aplikasinya jalan sebelum ada sinyal. Tapi tidak pernah ada kode yang menanyakan hal sebaliknya: **akun ini sudah punya usaha yang mana?** Tabel `memberships` tidak pernah dibaca sama sekali.

Akibatnya HP kedua yang masuk dengan akun yang sama membuat UUID baru, mengirim `create_tenant`, dan peladen dengan patuh membuat **usaha kedua** beserta membership kedua — `create_tenant` cuma idempoten terhadap UUID yang dikirim, dan UUID itu memang berbeda. Satu akun berakhir memiliki dua warung yang tidak saling melihat, penarikan datanya berjalan rajin untuk tenant yang salah, dan yang terlihat pemiliknya: *"masuk pakai akun yang sama, tapi kok seperti daftar dari awal."*

Sekarang perangkat bertanya lebih dulu sebelum membuat apa pun. Akun punya usaha dan perangkat belum → adopsi, lalu tarikan mengisi sendiri. Keduanya ada tapi berbeda → **berhenti dan tanya**, karena memilih sendiri berarti entah menelantarkan catatan yang ada di HP itu, atau membuat usaha kedua.

**Penjualan melebihi stok ditolak.** Sebelumnya cuma diperingatkan, dengan alasan bahwa hitungan di aplikasi sering tertinggal dari isi rak. Yang terlihat pemiliknya bukan kelonggaran melainkan kesalahan hitung: stok 2, terjual 3. Penolakannya menyebut sisanya dan mengantar ke koreksi hitung fisik di layar yang sama — karena yang paling sering terjadi memang angka stok yang tertinggal, bukan pembeli yang meminta lebih banyak dari yang ada.

**Bisa dipasang ke layar depan, dan sekarang ada yang memberitahunya.** Semua bahan PWA sudah ada sejak lama — manifest, ikon, service worker, header — dan tidak satu pun berguna, karena tidak ada yang memberitahu bahwa aplikasinya bisa dipasang. Orang yang tidak terbiasa dengan peramban tidak akan pernah menemukan "Tambah ke layar utama" di balik menu tiga titik, jadi aplikasinya dibuka dengan mengetik alamat dan terasa seperti situs web. Sekarang ajakannya muncul di beranda (bisa ditutup, dan penutupannya diingat) dengan jalan kedua di Pengaturan. Di iPhone yang muncul petunjuk manual — Safari tidak menyediakan cara memasang dari dalam halaman, dan tombol "Pasang" yang tidak melakukan apa-apa lebih buruk daripada petunjuk yang jujur.

Satu bug ikut ketemu di situ, dan gejalanya muncul jauh dari penyebabnya: **service worker cuma didaftarkan di komponen beranda.** Alur pertama di HP baru tidak lewat sana sama sekali — gerbang → masuk → pengaturan awal → katalog — jadi orang bisa memakai kasirnya seharian tanpa service worker pernah terpasang, lalu sinyalnya hilang dan aplikasinya tidak terbuka. Kontrol negatifnya tegas: tanpa perbaikannya, daftar service worker terdaftar benar-benar kosong.

Untuk yang mau `.apk`: dibangun lewat GitHub Actions, bukan di komputer sendiri. Isinya PWA yang sama dibungkus Trusted Web Activity, jadi tidak ada kode kedua yang harus dijaga sepadan. Rincian dan langkah yang paling sering terlewat di [`docs/09-pasang-di-hp.md`](docs/09-pasang-di-hp.md).

**Tata letaknya diaudit dengan alat, bukan dengan mata.** `npm run audit` mengambil persegi tiap elemen dari peramban di 21 layar dan memeriksa aturan yang bisa dijawab benar atau salah. Yang dicari terutama satu hal: **tombol yang tertimpa tombol lain.** Cacat itu tidak terlihat rusak — ia terlihat baik-baik saja dan ketukannya jatuh ke yang salah, jadi ketahuannya baru saat tombolnya dibutuhkan.

Delapan cacat nyata di putaran pertama, dan akarnya satu angka: token `bilah` bernilai 68px sementara bilahnya sebenarnya **77px**, jadi tiap `calc(bilah + …)` sudah meleset 9px sebelum menghitung apa pun — dan tombol Kasir yang ditinggikan menonjol 11px lagi di atasnya. Halangan sebenarnya 88px, dan tidak ada satu pun angka di kode yang tahu itu. Akibatnya "+ Jasa" bertabrakan dengan tombol Kasir di tiga layar, dan enam elemen tersembunyi permanen di dasar beranda.

Satu temuan datang dari memeriksa auditnya sendiri: `.ruang-bilah` terpasang di markup beranda dan padding bawahnya tetap 16px, karena `p-4` di elemen yang sama menimpanya — utility Tailwind menang atas kelas komponen. Pembacaan kode meyakinkan; nilai terhitungnya yang tidak bisa berbohong, dan sekarang itu ikut diperiksa.

Auditnya diuji dengan mengembalikan ketiga perbaikannya sekaligus: keempat aturan menyala pada regresi yang tepat.

Layar galat adalah satu-satunya bagian aplikasi yang tidak pernah terlihat selama semuanya berjalan benar — jadi ia bisa rusak berbulan-bulan tanpa gejala, dan yang menemukannya pertama kali adalah pemilik warung yang aplikasinya baru saja mati di depan pembeli. Karena itu ada `npm run uji:galat`: ia **benar-benar merusak satu halaman**, membangun ulang, lalu memeriksa layar galatnya muncul, pesan aslinya tidak bocor, dan sekocinya menghasilkan `.xlsx` yang benar-benar bisa dibuka pustaka di luar repo ini.

Dua hal yang baru jadi masalah **karena** sasarannya umum, dan sengaja dicatat sebagai terbuka alih-alih ditutup diam-diam: **auto-pause Supabase** (proyek gratis tertidur setelah 7 hari menganggur — pengguna harian aman, pendaftar yang mencoba lalu menghilang tidak) dan **kasir yang dijaga pegawai** (sekarang jalan satu-satunya berbagi akun, jadi tidak ada jejak siapa yang menerima uangnya; `memberships` sudah ada di skema, layarnya belum).

### Supabase

Proyeknya sudah berdiri dan keenam migrasi sudah terpasang — 12 tabel, RLS aktif di semuanya, 14 fungsi jalur tulis. Advisor Supabase dijalankan setelahnya dan menemukan satu hal yang benar-benar berbahaya:

> **`anon` bisa memanggil setiap fungsi dan membaca setiap tabel di skema `public`.**

Bukan karena migrasinya salah, tapi karena Supabase memberi `anon` hak itu lewat *default privileges* untuk tiap objek baru — dan `revoke ... from public` tidak mencabutnya, karena ia grant eksplisit, bukan warisan `public`. Hari itu tidak ada yang bocor (RLS aktif dan tidak satu pun policy menyebut `anon`), tapi sifatnya buruk: satu tabel baru yang lupa RLS langsung terbuka tanpa login.

Ditutup di `20260810120000_harden.sql` dan `20260810120100_harden_anon_tables.sql`, lalu diuji: harness lokal sekarang **meniru pemberian hak itu** supaya penegasannya benar-benar menguji pencabutannya. Kontrol negatif membuktikan tesnya sensitif — dengan `revoke`-nya dimatikan, tes menyebutkan ke-18 fungsi dan ke-12 tabel yang terbuka.

Lubang yang sama sempat terbuka lagi: bentuk `alter default privileges **in schema public** revoke execute on functions from public` diterima tanpa galat, tersimpan rapi di `pg_default_acl`, dan tidak mengubah apa pun — bawaan PostgreSQL hanya bisa ditekan lewat default privileges tingkat peran, tanpa `in schema`. Fungsi berikutnya yang dibuat kembali bisa dipanggil tanpa login, dan lagi-lagi yang menangkapnya adalah tesnya.

Dua peringatan yang tersisa dibiarkan sadar: `create_tenant` dan `current_tenant_ids` memang harus bisa dipanggil pengguna yang login. Alasannya ditulis di migrasinya.

## Dokumen

| Dokumen | Isi |
|---|---|
| [`docs/08-posisi-produk.md`](docs/08-posisi-produk.md) | **Mulai di sini.** Untuk siapa, kenapa dipilih, dan tiga arah yang dibuang |
| [`docs/07-temuan-catatan-ibu.md`](docs/07-temuan-catatan-ibu.md) | Bukti dari catatan asli, dan asumsi mana yang gugur |
| [`docs/09-pasang-di-hp.md`](docs/09-pasang-di-hp.md) | Pasang sebagai PWA, dan membangun `.apk` lewat GitHub Actions |
| [`docs/02-prd.md`](docs/02-prd.md) | Scope, alur, keputusan UX |
| [`docs/03-data-model.md`](docs/03-data-model.md) | Skema, RLS, jalur tulis |
| [`docs/04-arsitektur.md`](docs/04-arsitektur.md) | Stack, luring, notifikasi, biaya |
| [`docs/05-roadmap.md`](docs/05-roadmap.md) | Rencana bertahap |
| [`docs/01-riset-dan-temuan.md`](docs/01-riset-dan-temuan.md) | Riset pasar & teknis (sebagian sudah tidak berlaku) |
| [`docs/06-wawancara-lapangan.md`](docs/06-wawancara-lapangan.md) | Panduan wawancara (sebagian besar sudah terjawab) |

## Menjalankan

```bash
npm install
cp .env.example .env.local     # isi dari dasbor Supabase
npm run dev
```

### Pengujian

```bash
npm test          # 380 tes unit
npm run typecheck
npm run db:test   # 92 penegasan: migrasi, RLS, jalur tulis

npm run build && npx next start -p 3311 &
npm run smoke     # alur nyata di peramban sungguhan
npm run shots     # tangkapan layar tiap halaman, dengan data yang masuk akal
```

`npm run shots` mengisi katalog, menjual, kulakan, dan menagih lebih dulu, lalu memotret seluruh halaman ke `shots/`. Dipakai untuk melihat rancangannya sebagai satu kesatuan: kebanyakan kejanggalan tata letak baru terlihat saat sepuluh layar dijejerkan, bukan saat dilihat satu per satu.

`npm run smoke` menjalankan satu hari kerja lengkap di Chromium — 46 langkah: gerbang masuk, buka usaha, isi katalog dengan satu barang dan satu jasa, jual keduanya dalam satu struk, kulakan, koreksi hitung fisik, jual berutang, terima pelunasan, batalkan satu struk, baca laporannya, unduh seluruh catatan ke Excel, pasang QRIS dan bayar dengannya, lalu ganti nama usaha dan pastikan namanya ikut berubah di kepala struk. Yang diperiksa bukan "layarnya muncul" melainkan angkanya: kulakan **ikut mengurangi kas**, pembatalan **menarik uangnya kembali** dan mengembalikan stok lewat retur, penjumlahan riwayat stok tetap cocok setelah semuanya, dan **stok jasa tidak pernah berkurang.**

Ia menangkap hal yang tidak bisa ditangkap tes unit. Empat bug lolos dari seluruh tes unit dan baru ketahuan di sana: pilihan yang hilang saat kembali dari layar lain, ikon PWA yang tidak ada, **stok awal yang tidak pernah tercatat sebagai mutasi** (sehingga penjumlahan riwayat selamanya meleset sebesar stok awal tiap barang), dan laporan yang **terus menagih pembeli yang sudah melunasi** — karena sisa tagihannya dihitung dari `total − paid` di struk, padahal pelunasan tercatat di daftar utang dan tidak pernah mengubah `paid`. Yang terakhir cuma muncul kalau ada penjualan berutang **dan** pelunasan **dan** laporan dibuka sesudahnya; tidak ada tes unit yang kebetulan menyusun ketiganya.

Tes penyandi `.xlsx` punya satu berkas yang memanggil `openpyxl` lewat `python3`. Kalau pustaka itu tidak terpasang, berkas tesnya **dilewati dengan tanda yang terlihat di keluaran**, bukan lulus diam-diam:

```bash
pip install openpyxl   # opsional; tanpa ini tes oracle dilewati
```

`db:test` butuh cluster PostgreSQL lokal, sekali siapkan:

```bash
export PATH=/usr/lib/postgresql/16/bin:$PATH
initdb -D ~/pgdata -U postgres --auth=trust
pg_ctl -D ~/pgdata -l ~/pg.log -o '-p 55432 -k /tmp' start
```

Supabase CLI butuh Docker; harness di `supabase/tests/` meniru bagian Supabase yang dipakai (skema `auth`, `auth.uid()`, peran `authenticated`) supaya migrasi bisa diuji tanpa itu. Menunda pengujian skema sampai Docker tersedia berarti migrasi pertama yang benar-benar dijalankan adalah yang berjalan di produksi.

Pengujian isolasi tenant dijalankan sebagai peran `authenticated`, bukan superuser — superuser melewati RLS tanpa peduli policy apa pun, jadi pengujian yang dijalankan sebagai superuser selalu lulus dan tidak membuktikan apa-apa.

## Catatan nama

Namanya **Ezura**. Dua nama kerja sebelumnya dibuang: "NexaPOS" karena "POS" salah menarik pembanding — kalau namanya POS, orang membandingkannya dengan Majoo dan Kasir Pintar, dan kita kalah di setiap kolom fitur kecuali satu; lalu "NexaUsaha" karena terdengar seperti aplikasi pembukuan, padahal yang dibangun adalah kasir.

Nama basis data lokalnya juga `ezura`, dan itu **tidak boleh diganti lagi** setelah ada pengguna sungguhan: mengganti nama IndexedDB tidak memindahkan datanya, ia membuat basis data baru yang kosong.
