> **Ditulis ulang setelah melihat catatan ibu.** Versi sebelumnya punya
> `products`, `sale_items`, `stock_movements`, `purchases`,
> `tailor_orders`, dan `customer_measurements` — semuanya dibangun untuk
> mencatat hal yang ternyata tidak pernah ibu catat. Bukti:
> [`07-temuan-catatan-ibu.md`](07-temuan-catatan-ibu.md).

# 03 — Data Model

## 1. Prinsip

**1. Buku kas adalah satu-satunya tabel transaksi.**
Yang benar-benar ada di buku tulis UMKM: tanggal, keterangan, nominal. Tidak lebih. Setiap tabel tambahan adalah satu layar setup yang harus dilewati sebelum manfaat pertama terasa.

**2. Dompet dan buku tegak lurus.**
Dompet menjawab "uangnya ada di mana" — itu soal saldo. Buku menjawab "kegiatan mana yang menghasilkan atau menghabiskannya" — itu soal laporan.

Keduanya sengaja tidak diikat. [73% UMKM Indonesia belum memisahkan keuangan usaha dan pribadi](https://journal.unespadang.ac.id/jaaip/article/view/596), dan mayoritas usaha mikro cuma punya satu rekening untuk keduanya. Kalau buku ditentukan oleh dompet, mereka harus mengarang dompet palsu sebelum bisa memakai fitur intinya sama sekali.

Pasangan buku dan kategori ditegakkan di peladen, bukan cuma di aplikasi — satu perangkat dengan versi lama sudah cukup untuk mencampurnya, dan begitu tercampur, rekap bulanan jadi salah tanpa terlihat salah.

**3. Uang disimpan sebagai `bigint` rupiah utuh.**
Di TypeScript nilainya dipetakan ke `number` bertanda merek, bukan `bigint` JavaScript — lihat `src/lib/money.ts` untuk alasannya. Yang membuatnya aman adalah invarian yang dipaksakan di setiap titik masuk: selalu bilangan bulat, selalu di bawah batas aman.

**4. Primary key `uuid` dibuat di perangkat.**
Konsekuensi langsung dari luring-lebih-dulu. Kalau pengguna mencatat tanpa sinyal, barisnya butuh ID sekarang juga.

**5. Riwayat tidak berubah karena master datanya diubah.**
`book` melekat di entri, bukan dibaca lewat join ke dompet. Kalau sebuah dompet nanti diganti perannya, laporan bulan lalu harus tetap seperti waktu itu.

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
   (uang di mana)    (tumbuh sendiri)   (tidak menyentuh kas
        │                   │            sampai uang berpindah)
        │                   │                  │
        └───────────▶ cash_entries ◀───────────┘
                   (buku melekat di sini)
                     satu-satunya tabel
                     transaksi
```

Lima tabel. Versi sebelumnya punya lima belas.

---

## 3. Tabel

### `wallets`

Tempat uang berada: laci, amplop, rekening, e-wallet. Menentukan saldo — **bukan** menentukan buku.

`default_book` boleh kosong, dan memang kosong untuk pengguna yang dompetnya cuma satu. Isinya sekadar usulan untuk mengisi layar catat, bukan aturan.

Satu dompet dibuat otomatis saat tenant dibuat. Tanpa itu, pencatatan pertama gagal karena tidak ada wadah untuk uangnya — dan itu terjadi persis di menit paling menentukan. Sengaja cuma satu: membuatkan beberapa dompet di awal memaksa pengguna memilih sesuatu yang belum dia butuhkan.

### `cash_entries`

Satu-satunya tabel transaksi.

| Kolom | Catatan |
|---|---|
| `wallet_id` | Di mana uangnya berpindah |
| `book` | Kegiatan mana. Kosong untuk pemindahan antar dompet |
| `kind` | `income` / `expense` / `transfer` — hanya dua yang pertama masuk laporan |
| `direction` | `in` / `out`, ditegakkan sepadan dengan `kind` oleh constraint |
| `category` | Daftar tertutup; pasangan buku/kategori ditegakkan di jalur tulis |
| `note` | Keterangan bebas, seperti "syr, tahu, cabe, bensin" |
| `transfer_group_id` | Dua sisi pemindahan berbagi nilai ini |
| `deleted_at` | Penghapusan lunak |

Lima constraint yang menjaga kebenarannya:

```sql
book_only_for_flows   -- (kind = 'transfer') = (book is null)
transfer_needs_group  -- (kind = 'transfer') = (transfer_group_id is not null)
transfer_category     -- pemindahan selalu berkategori 'pindah'
income_is_in          -- pemasukan tidak mungkin berarah keluar
expense_is_out        -- pengeluaran tidak mungkin berarah masuk
```

Dua yang paling penting. `book_only_for_flows` membuat pemindahan **secara struktural tidak mungkin** bocor ke laporan mana pun — bukan diandalkan pada penyaringan yang bisa terlupa. Dan `transfer_needs_group`: tanpa itu, satu sisi pemindahan yang gagal tersimpan akan terlihat seperti uang yang lenyap.

**Kategori adalah daftar tertutup.** Kategori bebas akan berkembang jadi puluhan ejaan untuk hal yang sama ("bensin", "Bensin", "bensin motor"), dan rekap bulanan yang menjumlahkannya berhenti bisa dipercaya. Isinya memakai kata baku dan dipilih supaya cukup umum untuk usaha apa pun.

| Buku | Masuk | Keluar |
|---|---|---|
| usaha | `penjualan`, `jasa` | `modal`, `operasional`, `upah`, `sewa` |
| rumah | `gaji`, `pemberian` | `belanja`, `transportasi`, `utilitas`, `komunikasi`, `pendidikan`, `kesehatan`, `sosial`, `angsuran` |

`lainnya` sah di kedua buku: selalu ada hal yang tidak masuk kategori mana pun, dan pengguna yang terjebak tanpa pilihan akan berhenti mencatat sama sekali.

Pasangannya ditegakkan fungsi `category_fits` di jalur tulis. "Belanja" di buku usaha akan merusak laporan tanpa pernah terlihat salah di layar mana pun.

### `quick_entries`

Menggantikan katalog produk.

Katalog mengharuskan pengguna menyiapkan puluhan barang sebelum bisa mencatat apa pun, dan itu tempat orang berhenti. Tabel ini terisi sendiri: begitu "Potong rambut 15.000" dicatat dua kali, barisnya naik ke atas dan jadi tombol sekali tap.

Beberapa baris disemai saat pendaftaran sesuai jenis usaha, supaya hari pertama tidak kosong sama sekali. Nominalnya nol — itu usulan bentuk catatan, bukan tebakan harga. Yang tidak terpakai tenggelam sendiri karena daftar diurutkan menurut frekuensi.

`default_amount` memakai nominal terakhir, bukan yang pertama: harga naik, dan pintasan yang menawarkan harga lama justru membuat pengguna membetulkannya tiap kali.

### `debts`

Sengaja kecil dan berdiri sendiri.

Aturan yang menentukan bentuknya: **sebuah utang tidak menyentuh buku kas sampai uangnya benar-benar berpindah.** Mencatatnya lebih awal akan membuat saldo menunjukkan uang yang belum ada di dompet, dan saat itu terjadi penggunanya berhenti percaya pada seluruh angkanya.

Saat dibayar, entri kasnya berkategori `lainnya` — bukan `penjualan` atau `jasa`. Penghasilannya sudah terjadi saat barang atau jasanya diberikan; menghitungnya sebagai penjualan baru berarti laporan menghitung uang yang sama dua kali.

---

## 4. Saldo tidak disimpan

Saldo dompet dihitung dari `opening_balance` ditambah seluruh entri hidup di dompet itu.

Kolom saldo yang diperbarui tiap transaksi akan melenceng cepat atau lambat — satu sinkronisasi gagal separuh sudah cukup — dan begitu melenceng tidak ada cara memulihkannya, karena tidak ada lagi kebenaran untuk dibandingkan. Saldo turunan selalu bisa dihitung ulang dari nol.

Pemindahan **ikut** menggerakkan saldo dompet (uangnya memang pindah) tapi **tidak** masuk laporan — dan itu dijamin constraint, bukan penyaringan.

Tidak ada yang namanya "saldo buku". Uang punya tempat (dompet); buku cuma menggolongkan arusnya. Satu dompet bisa menampung uang usaha dan uang rumah sekaligus — itu keadaan mayoritas usaha mikro.

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
| `create_tenant` | tenant + membership + satu dompet bawaan + pintasan semaian |
| `record_entry` | satu entri kas (buku dikirim eksplisit) + menaikkan pintasan |
| `record_transfer` | dua entri kas berpasangan, tanpa buku |
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
| `categories` | Daftar tertutup di constraint; kategori bebas merusak laporan |
| `payments` | Pembayaran utang langsung jadi entri kas |
| `branches`, `roles` | Satu orang, satu tempat |
| `categories` | Daftar tertutup di constraint |
| `audit_logs` | Berguna saat multi-user; belum sekarang |
| `ai_jobs` | Satu-satunya kegunaannya (katalog dari foto) ikut hilang bersama katalognya |
