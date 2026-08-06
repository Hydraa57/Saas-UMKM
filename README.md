# NexaUsaha

Aplikasi pencatatan usaha untuk UMKM mikro Indonesia — dimulai dari satu pengguna nyata: ibu saya, yang jualan snack biskuit dan menerima jasa jahit, dan sampai hari ini masih mencatat semuanya di buku tulis.

## Kenapa repo ini ada

Ini bukan proyek yang lahir dari riset pasar. Ini lahir dari melihat ibu saya membuka buku tulis tiap malam untuk menghitung uang yang masuk hari itu, dan sering tidak yakin sisa uang usaha yang sebenarnya berapa — karena tercampur uang belanja rumah, dan karena ada beberapa orang yang belum bayar.

Target keberhasilannya bukan jumlah fitur. Target keberhasilannya satu kalimat:

> **Setelah 30 hari, buku tulis itu tidak dipakai lagi.**

Kalau itu tercapai, produknya benar. Kalau tidak, tidak ada jumlah fitur yang bisa menyelamatkannya.

## Status

**Fase 0 (riset lapangan) sedang berjalan.** Wawancara dengan ibu belum selesai, jadi yang sudah dikerjakan sengaja dibatasi pada bagian yang tidak akan berubah apa pun hasilnya: fondasi proyek, perhitungan uang, skema database, jalur tulis, dan mesin luring.

Yang sengaja **belum** dikerjakan, karena hasil wawancara yang menentukan bentuknya:

- Layar jual, layar order jahit, layar pengeluaran
- Daftar field ukuran per jenis jahitan
- Label tombol dan istilah di seluruh aplikasi — harus memakai kata yang ibu pakai sendiri
- Nominal pintasan di papan angka

## Menjalankan

```bash
npm install
cp .env.example .env.local     # isi dari dasbor Supabase
npm run dev
```

### Pengujian

```bash
npm test          # tes unit: perhitungan uang, logika domain, antrean sinkron
npm run typecheck
npm run db:test   # migrasi + RLS + jalur tulis, di PostgreSQL lokal
```

`db:test` butuh cluster PostgreSQL lokal sekali siapkan:

```bash
export PATH=/usr/lib/postgresql/16/bin:$PATH
initdb -D ~/pgdata -U postgres --auth=trust
pg_ctl -D ~/pgdata -l ~/pg.log -o '-p 55432 -k /tmp' start
```

Supabase CLI butuh Docker; harness di `supabase/tests/` meniru bagian Supabase yang dipakai (skema `auth`, `auth.uid()`, peran `authenticated`) supaya migrasi bisa diuji tanpa itu. Menunda pengujian skema sampai Docker tersedia berarti migrasi pertama yang benar-benar dijalankan adalah yang berjalan di produksi.

Pengujian isolasi tenant dijalankan sebagai peran `authenticated`, bukan superuser — superuser melewati RLS tanpa peduli policy apa pun.

## Dokumen

| Dokumen | Isi |
|---|---|
| [`docs/01-riset-dan-temuan.md`](docs/01-riset-dan-temuan.md) | Hasil riset pasar & teknis, dan kritik terhadap blueprint awal |
| [`docs/02-prd.md`](docs/02-prd.md) | PRD revisi — scope, user flow, keputusan UX |
| [`docs/03-data-model.md`](docs/03-data-model.md) | Skema database + SQL + RLS |
| [`docs/04-arsitektur.md`](docs/04-arsitektur.md) | Stack, offline-first, notifikasi, biaya |
| [`docs/05-roadmap.md`](docs/05-roadmap.md) | Rencana fase & definisi selesai |
| [`docs/06-wawancara-lapangan.md`](docs/06-wawancara-lapangan.md) | Pertanyaan untuk ibu sebelum baris kode pertama |

## Ringkas: apa yang berubah dari blueprint awal

Blueprint awal (hasil brainstorm dengan ChatGPT) merancang **SaaS POS universal multi-cabang dengan AI add-on berbayar**. Setelah riset dan wawancara, arahnya digeser:

- **Buku-first, bukan POS-first.** Yang digantikan aplikasi ini adalah buku tulis, bukan mesin kasir.
- **Jasa jahit naik jadi warga kelas satu.** Di blueprint awal jasa cuma `(nama, harga)`. Padahal jahit adalah order berjangka: DP, deadline, ukuran, pelunasan. Ini justru bagian paling bernilai dan paling kosong di kompetitor.
- **Hutang-piutang masuk MVP.** Sama sekali tidak ada di blueprint awal, padahal ini keseharian usaha rumahan.
- **Pemisahan uang usaha vs pribadi jadi fitur, bukan disiplin.**
- **WhatsApp API ditunda.** Web Push + tombol share ke WhatsApp: gratis, legal, cukup.
- **Multi-tenant di lapisan data sejak awal, tapi UI tetap satu toko.** Fondasi produk siap tanpa membebani pengguna pertama.

Alasan lengkap tiap keputusan ada di [`docs/01-riset-dan-temuan.md`](docs/01-riset-dan-temuan.md).

## Catatan nama

Nama kerja awal "NexaPOS" saya usulkan diganti, karena "POS" salah menggambarkan produknya — dan salah menarik pembanding. Kalau namanya POS, orang membandingkannya dengan Majoo dan Kasir Pintar, dan kita kalah di semua kolom fitur. Kalau namanya aplikasi pencatatan usaha, pembandingnya buku tulis, dan kita menang telak.

Nama final belum diputuskan. `NexaUsaha` dipakai sementara.
