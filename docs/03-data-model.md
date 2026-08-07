> **Ditulis ulang setelah melihat catatan ibu.** Versi sebelumnya punya
> `products`, `sale_items`, `stock_movements`, `purchases`,
> `tailor_orders`, dan `customer_measurements` — semuanya dibangun untuk
> mencatat hal yang ternyata tidak pernah ibu catat. Bukti:
> [`07-temuan-catatan-ibu.md`](07-temuan-catatan-ibu.md).

# 03 — Data Model

## 1. Prinsip

**1. Buku kas adalah satu-satunya tabel transaksi.**
Yang benar-benar ada di buku ibu: tanggal, keterangan, nominal. Tidak lebih. Setiap tabel tambahan adalah satu layar setup yang harus dilewati sebelum manfaat pertama terasa.

**2. Dua buku, dipisahkan di lapisan data.**
Ibu sudah memisahkan uang hasil kerjanya dari uang belanja pemberian bapak bertahun-tahun. Pemisahan itu ditegakkan di peladen — bukan cuma di aplikasi — karena satu perangkat dengan versi lama sudah cukup untuk mencampurnya, dan begitu tercampur, rekap bulanan yang ibu percayai jadi salah.

**3. Uang disimpan sebagai `bigint` rupiah utuh.**
Di TypeScript nilainya dipetakan ke `number` bertanda merek, bukan `bigint` JavaScript — lihat `src/lib/money.ts` untuk alasannya. Yang membuatnya aman adalah invarian yang dipaksakan di setiap titik masuk: selalu bilangan bulat, selalu di bawah batas aman.

**4. Primary key `uuid` dibuat di perangkat.**
Konsekuensi langsung dari luring-lebih-dulu. Kalau ibu mencatat tanpa sinyal, barisnya butuh ID sekarang juga.

**5. Riwayat tidak berubah karena master datanya diubah.**
`book` disalin ke setiap entri saat dibuat, tidak dibaca lewat join. Kalau nanti sebuah dompet dipindah bukunya, laporan bulan lalu harus tetap seperti waktu itu.

**6. `tenant_id` di setiap tabel sejak hari pertama.**
Meski UI-nya satu pengguna.

---

## 2. Peta tabel

```
auth.users
    │
    └─▶ memberships ──▶ tenants
                            │
        ┌───────────────────┼──────────────────┐
        ▼                   ▼                  ▼
     wallets          quick_entries          debts
        │                   │                  │
        │  (buku disalin)   │ (tumbuh sendiri) │ (tidak menyentuh kas
        │                   │                  │  sampai uang berpindah)
        └───────────▶ cash_entries ◀───────────┘
                     satu-satunya tabel
                     transaksi
```

Lima tabel. Versi sebelumnya punya lima belas.

---

## 3. Tabel

### `wallets`

Dompet fisik yang benar-benar ibu pisahkan — ini bukan abstraksi akuntansi, ini benda.

Kolom penentu: `book` (`usaha` | `rumah`). Dompet Jahit dan Dompet Snack di buku usaha; Dompet Belanja di buku rumah.

Dibuat otomatis saat tenant dibuat. Tanpa itu, pencatatan pertama gagal karena tidak ada wadah untuk uangnya — dan itu terjadi persis di menit paling menentukan.

Indeks unik parsial memastikan **tepat satu dompet bawaan per buku**; kalau tidak, layar catat harus menebak dompet mana yang dimaksud.

### `cash_entries`

Satu-satunya tabel transaksi.

| Kolom | Catatan |
|---|---|
| `book` | Disalin dari dompet saat dibuat, bukan dibaca lewat join |
| `kind` | `income` / `expense` / `transfer` — hanya dua yang pertama masuk laporan |
| `direction` | `in` / `out`, ditegakkan sepadan dengan `kind` oleh constraint |
| `category` | Daftar tertutup; pasangan buku/kategori ditegakkan di jalur tulis |
| `note` | Keterangan bebas, seperti "syr, tahu, cabe, bensin" |
| `transfer_group_id` | Dua sisi pemindahan berbagi nilai ini |
| `deleted_at` | Penghapusan lunak |

Empat constraint yang menjaga kebenarannya:

```sql
transfer_needs_group  -- (kind = 'transfer') = (transfer_group_id is not null)
transfer_category     -- pemindahan selalu berkategori 'pindah'
income_is_in          -- pemasukan tidak mungkin berarah keluar
expense_is_out        -- pengeluaran tidak mungkin berarah masuk
```

`transfer_needs_group` yang paling penting: tanpa itu, satu sisi pemindahan yang gagal tersimpan akan terlihat seperti uang yang lenyap.

**Kategori adalah daftar tertutup.** Kategori bebas akan berkembang jadi puluhan ejaan untuk hal yang sama ("bensin", "Bensin", "bensin motor"), dan rekap bulanan yang menjumlahkannya berhenti bisa dipercaya. Isinya diambil dari kata yang benar-benar ibu tulis.

| Buku | Masuk | Keluar |
|---|---|---|
| usaha | `jahit`, `snack`, `lain` | `modal`, `operasional`, `lain` |
| rumah | `dari_bapak`, `lain` | `belanja`, `listrik_air`, `gas`, `transport`, `arisan`, `sekolah`, `kesehatan`, `lain` |

Pasangannya ditegakkan fungsi `category_fits` di jalur tulis. "Belanja" di buku usaha atau "jahit" di buku rumah akan merusak rekap bulanan tanpa pernah terlihat salah di layar mana pun.

### `quick_entries`

Menggantikan katalog produk.

Katalog mengharuskan ibu menyiapkan puluhan barang sebelum bisa mencatat apa pun, dan itu tempat orang berhenti. Tabel ini terisi sendiri: begitu "Potong 30.000" dicatat dua kali, barisnya naik ke atas dan jadi tombol sekali tap.

Tidak ada layar pengaturan, tidak ada gerbang di awal, dan daftarnya selalu menggambarkan apa yang benar-benar sering terjadi — bukan apa yang dikira sering saat mengisi katalog.

`default_amount` memakai nominal terakhir, bukan yang pertama: harga jahit naik, dan pintasan yang menawarkan harga lama justru membuat ibu harus membetulkannya tiap kali.

### `debts`

Sengaja kecil dan berdiri sendiri.

Ibu tidak mencatat utang secara rapi — di buku belanja, "hutang" cuma muncul sebagai satu kata dalam keterangan. Tapi berutang memang terjadi, dan lupa menagih adalah kerugian nyata.

Aturan yang menentukan bentuknya: **sebuah utang tidak menyentuh buku kas sampai uangnya benar-benar berpindah.** Mencatatnya lebih awal akan membuat saldo menunjukkan uang yang belum ada di dompet.

Saat dibayar, entri kasnya berkategori `lain` — bukan `snack` atau `jahit`. Penghasilannya sudah terjadi saat barang atau jasanya diberikan; menghitungnya sebagai penjualan baru berarti rekap bulanan menghitung uang yang sama dua kali.

---

## 4. Saldo tidak disimpan

Saldo dompet dihitung dari `opening_balance` ditambah seluruh entri hidup di dompet itu.

Kolom saldo yang diperbarui tiap transaksi akan melenceng cepat atau lambat — satu sinkronisasi gagal separuh sudah cukup — dan begitu melenceng tidak ada cara memulihkannya, karena tidak ada lagi kebenaran untuk dibandingkan. Saldo turunan selalu bisa dihitung ulang dari nol.

Pemindahan **ikut** menggerakkan saldo dompet (uangnya memang pindah) tapi **tidak** masuk rekap penghasilan.

---

## 5. Row Level Security

Sama seperti versi sebelumnya, dan itu bagian yang memang tidak perlu berubah:

- Fungsi bantu `current_tenant_ids()` ber-`security definer`, supaya pengecekan keanggotaan tidak ikut disaring RLS dan tidak menimbulkan rekursi policy
- Policy dibungkus `(select ...)` supaya dievaluasi sekali sebagai InitPlan, bukan per baris
- `with check` ditulis eksplisit
- Setiap kolom yang dipakai policy sudah diindeks
- Service role key tidak boleh pernah sampai ke sisi klien

Pengujian isolasi punya tiga penjaga untuk tabel yang ditambahkan nanti: setiap tabel wajib punya RLS aktif, minimal satu policy, dan indeks yang diawali `tenant_id`. Tabel baru yang lupa salah satunya akan membuat pengujian gagal jauh sebelum datanya bocor.

---

## 6. Jalur tulis

| Fungsi | Menyentuh |
|---|---|
| `create_tenant` | tenant + membership + tiga dompet bawaan |
| `record_entry` | satu entri kas + menaikkan pintasan |
| `record_transfer` | dua entri kas berpasangan |
| `delete_entry` | penghapusan lunak; pemindahan dibatalkan sepasang |
| `record_debt` | satu utang, tanpa menyentuh kas |
| `pay_debt` | entri kas + memperbarui utang |

Semua idempoten terhadap `id` dari perangkat. Ini menutup celah paling merusak: permintaan yang **berhasil** di peladen lalu putus sebelum balasannya sampai. Tanpa itu, klien mengira gagal, mengirim ulang, dan catatannya tercatat dua kali.

Semua `security invoker` supaya RLS tetap berlaku — kecuali `create_tenant`, yang memang berjalan saat keanggotaan belum ada.

---

## 7. Yang sengaja tidak dibuat

| Tidak dibuat | Alasan |
|---|---|
| `products`, `sale_items` | Snack dicatat nominal saja |
| `stocks`, `stock_movements` | Ibu tidak melacak stok |
| `purchases`, `purchase_items` | Kulakan cukup satu entri pengeluaran |
| `tailor_orders`, `customer_measurements` | Yang ibu tulis: tanggal + jenis + harga |
| `customers` | Nama cukup teks di `debts.person` |
| `payments` | Pembayaran utang langsung jadi entri kas |
| `branches`, `roles` | Satu orang, satu tempat |
| `categories` | Daftar tertutup di constraint |
| `audit_logs` | Berguna saat multi-user; belum sekarang |
| `ai_jobs` | Satu-satunya kegunaannya (katalog dari foto) ikut hilang bersama katalognya |
