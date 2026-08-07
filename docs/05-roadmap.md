> **Ditulis ulang setelah melihat catatan ibu.**
> Bukti: [`07-temuan-catatan-ibu.md`](07-temuan-catatan-ibu.md).

# 05 — Roadmap

## Prinsip

**Setiap fase berakhir dengan sesuatu yang ibu bisa pakai.** Kalau pengerjaan berhenti di tengah jalan karena apa pun, yang sudah jadi tetap berguna.

Scope-nya menyusut drastis setelah melihat bukunya — tidak ada katalog, stok, kulakan per item, maupun order jahit berjangka. Yang tersisa bisa selesai jauh lebih cepat.

---

## Sudah selesai (tanpa perlu jawaban wawancara)

- Perhitungan uang, 43 tes
- Tanggal & zona waktu, 18 tes
- Buku kas, dua buku, saldo dompet, cocokkan — 23 tes
- Rekap bulanan & total tahunan — 14 tes
- Utang & piutang — 17 tes
- Antrean kirim luring + penggolongan kegagalan — 30 tes
- Skema, RLS, jalur tulis — 51 penegasan di PostgreSQL sungguhan
- Kerangka PWA, papan angka, tampilan rupiah

---

## Fase 1 — Layar catat (perkiraan 5 hari)

Yang paling menentukan, dan sekarang satu-satunya yang tersisa antara kode dan ibu.

- [ ] Onboarding: nama usaha, jenis usaha, buku rumah aktif atau tidak
- [ ] Layar catat pemasukan: pintasan sekali tap + papan angka
- [ ] Layar catat pengeluaran, buku rumah dan buku usaha
- [ ] Timbal balik di tiap layar: total hari ini dan bulan ini terlihat setelah menyimpan
- [ ] Undo beberapa detik setelah menyimpan
- [ ] Input mundur (backdate)
- [ ] Login satu akun, tanpa alur pendaftaran publik
- [ ] Sambungkan antrean kirim ke Supabase sungguhan

**Selesai kalau:** ibu mencatat sendiri, tanpa dibantu, di bawah 10 detik; dan setelah menyimpan, dia langsung melihat totalnya berubah.

---

## Fase 2 — Rekap & dompet (perkiraan 4 hari)

- [ ] Daftar rekap bulanan + total tahunan, meniru halaman bukunya
- [ ] Riwayat per buku, bisa disaring bulan
- [ ] Saldo tiap dompet
- [ ] Pindah dompet
- [ ] Cocokkan dompet: hitung fisik, aplikasi tunjukkan selisih
- [ ] Ekspor ke Excel

**Selesai kalau:** ibu bisa menjawab "bulan ini dapat berapa" tanpa menghitung, dan angkanya cocok dengan dompetnya.

---

## Fase 3 — Utang & pengingat (perkiraan 3 hari)

- [ ] Daftar siapa belum bayar, diurutkan dari yang paling lama
- [ ] Cicilan
- [ ] Web Push: pengingat malam kalau belum mencatat, ringkasan akhir bulan
- [ ] Tombol bagikan ringkasan ke WhatsApp

---

## Fase 4 — Pengerasan (perkiraan 4 hari)

Tidak ada fitur baru.

- [ ] Ekspor cadangan otomatis ke luar Supabase
- [ ] Penanganan error yang tidak menakutkan
- [ ] Uji di HP ibu yang sebenarnya, bukan emulator
- [ ] **Pendampingan hari pertama** — duduk bersama ibu, jangan bantu, catat di mana dia macet

---

## Fase 5 — Pemakaian nyata, 30 hari

**Jangan menambah fitur.** Amati.

- [ ] Buku tulis masih dipakai? Untuk apa? — jawabannya adalah spesifikasi fitur berikutnya
- [ ] Apakah pemisahan dua buku benar-benar dipakai, atau semua masuk satu buku saja?
- [ ] Fitur mana yang tidak pernah disentuh? Hapus atau sembunyikan
- [ ] Berapa hari berturut-turut ibu memakainya?
- [ ] Setelah pemasukan yang dulu tidak dicatat ikut masuk, penghasilannya jadi berapa? — angka yang belum pernah dilihat, dan mungkin jadi kejutan yang menyenangkan

**Gerbang:** kalau setelah 30 hari ibu masih memakai buku tulis untuk hal yang seharusnya sudah tercakup, jangan lanjut ke fase produk. Perbaiki dulu.

---

## Fase 6 — Baru bicara produk

Hanya kalau Fase 5 lulus.

- [ ] Pendaftaran publik + onboarding
- [ ] Pemilih tenant di UI (lapisan datanya sudah siap)
- [ ] Cari 5 usaha **berbeda jenis** — warung, kuliner, jasa. Ini yang menguji apakah kosakatanya benar-benar umum, atau cuma terasa umum

Posisi lengkapnya di [`08-posisi-produk.md`](08-posisi-produk.md). Ringkasnya: bukan POS, bukan aplikasi kasir — aplikasi yang **melakukan** pemisahan uang usaha dan rumah tangga, untuk 73% UMKM yang belum memisahkannya.

---

## Ringkasan

| Fase | Perkiraan | Hasil |
|---|---|---|
| 0 | selesai | Paham cara ibu mencatat, dari bukunya sendiri |
| — | selesai | Fondasi, skema, logika, 196 tes |
| 1 | 5 hari | **Ibu mulai memakai aplikasi** |
| 2 | 4 hari | Rekap bulanan & dompet |
| 3 | 3 hari | Utang & pengingat |
| 4 | 4 hari | Layak dipercaya jangka panjang |
| 5 | 30 hari | Bukti, bukan asumsi |

Sekitar 16 hari kerja sampai lengkap — turun dari 40 hari di rencana sebelumnya, karena separuh yang direncanakan ternyata tidak dibutuhkan.
