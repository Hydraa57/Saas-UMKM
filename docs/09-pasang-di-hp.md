# 09 — Memasang Ezura di HP

Dua jalan, dan yang pertama sudah cukup untuk hampir semua orang.

---

## 1. Pasang langsung dari peramban (PWA)

Yang paling sederhana, dan **tidak butuh Play Store, akun, atau biaya
apa pun.** Sesudah terpasang, ikon Ezura duduk di layar depan bersama
WhatsApp, dan membukanya penuh layar — tanpa bilah alamat.

Semua bahannya sudah ada di repo ini sejak lama: manifest, ikon,
service worker, header. Yang **tidak** ada sampai sekarang adalah yang
memberitahu penggunanya bahwa itu bisa dilakukan. Orang yang tidak
terbiasa dengan peramban tidak akan pernah menemukan "Tambah ke layar
utama" di balik menu tiga titik — jadi aplikasinya dibuka dengan
mengetik alamat, tergambar dengan bilah peramban di atasnya, dan terasa
seperti situs web.

Sekarang ajakannya muncul sendiri:

- **Kartu di beranda**, selama belum terpasang. Bisa ditutup, dan
  penutupannya diingat.
- **Baris di Pengaturan → Aplikasi di layar depan.** Jalan kedua, dan
  itu memang gunanya: yang menutup kartunya sekali tidak boleh
  kehilangan caranya selamanya.

Di iPhone tidak ada tombol yang bisa ditekan — Safari tidak menyediakan
cara memasang dari dalam halaman sama sekali. Yang muncul di sana
petunjuk manual, dan itu disengaja: tombol "Pasang" yang tidak melakukan
apa-apa lebih buruk daripada petunjuk yang jujur.

### Satu bug yang ikut ketemu

Service worker sebelumnya cuma didaftarkan di komponen beranda. Alur
pertama di HP baru tidak lewat sana sama sekali — gerbang mengantar ke
layar masuk, lalu pengaturan awal, lalu langsung katalog — jadi orang
bisa memakai kasirnya seharian tanpa service worker pernah terpasang,
**lalu sinyalnya hilang dan aplikasinya tidak terbuka.**

Gejalanya muncul jauh sesudah penyebabnya, di tempat yang paling tidak
mungkin dihubungkan dengannya. Sekarang pendaftarannya di tata letak
akar, dan `npm run uji:pasang` memeriksanya dari alur yang sebenarnya.

---

## 2. Berkas `.apk`

Berguna kalau ingin membagikannya lewat WhatsApp, atau nanti menerbitkan
ke Play Store.

Isinya **bukan aplikasi kedua.** Ia PWA yang sama persis, dibungkus
*Trusted Web Activity* — jadi tidak ada kode yang harus dijaga tetap
sepadan di dua tempat, dan pembaruan sampai ke pengguna lewat deploy web
biasa tanpa membangun ulang `.apk`.

Dibangun lewat GitHub Actions (`.github/workflows/apk.yml`), bukan di
komputer sendiri: yang dibutuhkan Bubblewrap adalah Android SDK dan JDK,
berpuluh gigabita untuk sesuatu yang dijalankan sebulan sekali. Runner
GitHub sudah membawa keduanya.

### Sekali saja: buat kunci penanda tangan

```sh
keytool -genkeypair -v -keystore android.keystore \
  -alias ezura -keyalg RSA -keysize 2048 -validity 10000
```

> **Simpan berkas dan sandinya baik-baik.** Kunci yang hilang berarti
> aplikasi yang tidak bisa diperbarui lagi — selamanya. Pengguna harus
> mencopot dan memasang ulang, dan pada aplikasi yang sumber
> kebenarannya di perangkat, itu berarti kehilangan catatannya.

Ubah jadi teks, lalu simpan sebagai secret repo:

```sh
base64 -w0 android.keystore
```

| Secret | Isi |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | hasil perintah di atas |
| `ANDROID_KEYSTORE_PASSWORD` | sandi keystore |
| `ANDROID_KEY_PASSWORD` | sandi alias, biasanya sama |

### Bangun

Jalankan workflow **Bangun APK** dari tab Actions. Isi domainnya (tanpa
`https://`), nama paket, dan versi. Hasilnya `.apk` dan `.aab` sebagai
artifact.

### Langkah yang paling sering terlewat

Di akhir, workflow mencetak **sidik jari SHA-256**. Pasang di Vercel
sebagai env, lalu deploy ulang:

```
ANDROID_PACKAGE_NAME     = id.ezura.app
ANDROID_CERT_FINGERPRINT = AA:BB:CC:…
```

Tanpa ini `.apk`-nya tetap jalan, tapi **menampilkan bilah alamat Chrome
di atas layar** — dan seluruh alasan membuatnya hilang.

Yang membacanya `/.well-known/assetlinks.json`, dan berkas itu sengaja
**404 selama env-nya belum diisi.** Menulis nilai contoh justru
berbahaya: Android akan membaca berkas yang "ada tapi salah", lalu gagal
tanpa gejala. 404 adalah keadaan yang dicari orang saat memeriksa kenapa
bilah alamatnya masih muncul.

Kalau nanti penandatanganannya diserahkan ke Play Store, sidik jari
Google harus **ikut ditambahkan** — dipisah koma, bukan menggantikan
yang lama. Melewatkan ini adalah cara paling umum bilah alamat muncul
kembali justru setelah aplikasinya terbit.

---

## Yang tidak dikerjakan, dan kenapa

**Play Store.** Perlu akun pengembang berbayar, review, kebijakan
privasi, dan pengelolaan kunci. Roadmap menempatkannya di Fase 7 —
sesudah 30 hari pemakaian nyata, karena sebelum itu belum ada yang
dicari orang di toko aplikasi.

**Notifikasi push di `.apk`.** `enableNotifications` sengaja `false`.
Menyalakannya menuntut izin notifikasi saat pertama dibuka, dan meminta
izin sebelum satu pun manfaat terasa adalah cara tercepat ditolak
permanen.
