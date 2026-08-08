> **Ditulis ulang setelah arah produknya dikoreksi.** Versi sebelumnya
> punya satu tabel transaksi (`cash_entries`) dan `quick_entries` sebagai
> pengganti katalog, dengan kolom `book` untuk memisahkan uang usaha dari
> uang rumah tangga. Alasan perubahannya di
> [`08-posisi-produk.md`](08-posisi-produk.md) §1 dan §7.

# 03 — Data Model

## 1. Prinsip

**1. Barang dan jasa satu tabel, dibedakan constraint.**
Di layar kasir keduanya hal yang sama: sesuatu yang dijual, punya nama dan harga, diketuk untuk masuk keranjang. Satu-satunya bedanya — **barang punya stok, jasa tidak** — ditegakkan di lapisan data, bukan diserahkan ke kedisiplinan kode.

**2. Satu ketukan "Bayar", satu operasi atomik.**
Penjualan, barisnya, mutasi stok, entri kas, dan piutang ditulis bersama-sama atau tidak sama sekali. Koneksi yang putus di tengah — hal biasa di HP — akan meninggalkan penjualan tanpa entri kas, atau stok yang berkurang tanpa penjualannya, kalau ditulis terpisah. Aplikasi kasir yang angkanya tidak cocok dengan laci kehilangan kepercayaan penggunanya untuk seterusnya.

**3. Uang disimpan sebagai `bigint` rupiah utuh.**
Di TypeScript nilainya dipetakan ke `number` bertanda merek, bukan `bigint` JavaScript — lihat `src/lib/money.ts` untuk alasannya. Yang membuatnya aman adalah invarian yang dipaksakan di setiap titik masuk: selalu bilangan bulat, selalu di bawah batas aman.

**4. Primary key `uuid` dibuat di perangkat.**
Konsekuensi langsung dari luring-lebih-dulu. Pembeli tidak bisa disuruh menunggu sinyal untuk menerima struknya, jadi barisnya butuh ID sekarang juga — termasuk nomor struknya.

**5. Riwayat tidak berubah karena master datanya diubah.**
`sale_items` menyimpan salinan nama, harga jual, dan harga modal saat transaksi. Harga naik dan nama diperbaiki; struk bulan lalu harus tetap seperti waktu itu. Karena itu juga barang **diarsipkan, bukan dihapus.**

**6. Stok adalah turunan yang dijaga, bukan angka yang diketik.**
`items.stock_qty` selalu berpasangan dengan satu baris di `stock_movements`. Angka stok yang bisa disetel langsung dari formulir katalog adalah angka yang tidak bisa dijelaskan asalnya.

**7. `tenant_id` di setiap tabel sejak hari pertama.**
Meski UI-nya satu pengguna.

---

## 2. Peta tabel

```
auth.users
    │
    └─▶ memberships ──▶ tenants
                            │
        ┌───────────────────┴──────────┬────────────────┐
        ▼                              ▼                ▼
     wallets                        items            sale_sequences
   (uang di mana)         (barang: punya stok        (nomor struk
        │                  jasa : tidak punya)        per tahun)
        │                        │
        │            ┌───────────┼───────────┐
        │            ▼           ▼           ▼
        │       sale_items  stock_movements  purchase_items
        │            │           │                │
        │            ▼           │                ▼
        │         sales ─────────┘            purchases
        │            │                            │
        └──▶ cash_entries ◀──────────────────────┘
                     ▲
                   debts
        (tidak menyentuh kas sampai uang berpindah)
```

Sebelas tabel. Bertambah dari lima, dan tiap tambahan menjawab satu hal yang tidak bisa dijawab satu tabel transaksi: apa yang dijual, berapa sisanya, dan apa isi struknya.

---

## 3. Tabel

### `items` — jantung pembedanya

```sql
kind        text    not null check (kind in ('barang', 'jasa'))
stock_qty   numeric(12,3)          -- kosong untuk jasa
min_stock   numeric(12,3)          -- kosong untuk jasa

constraint stock_only_for_goods check (
  (kind = 'barang') = (stock_qty is not null)
)
constraint min_stock_follows_stock check (
  (stock_qty is null) = (min_stock is null)
)
```

Constraint pertama itu inti produk ini. Ia dua arah: barang **wajib** punya stok, jasa **tidak boleh** punya. Bukan stok nol, bukan stok tak terbatas — kolomnya memang kosong, jadi tidak ada yang bisa dikurangi saat jasanya terjual.

Ditegakkan tiga lapis, karena satu kebocoran saja membuat "Potong celana" bisa dilaporkan habis:

| Lapis | Bentuknya |
|---|---|
| TypeScript | `Item = Barang \| Jasa`; `stockQty` hanya ada pada `Barang` |
| RPC | `upsert_item` memaksa `null` untuk jasa, apa pun yang dikirim klien |
| Tabel | `stock_only_for_goods` |

Kolom lain yang perlu penjelasan:

| Kolom | Catatan |
|---|---|
| `sold_count` | Menentukan urutan grid kasir. Yang sering dijual naik sendiri, tanpa ada yang perlu mengaturnya |
| `cost_price` | Harga modal. Disimpan sejak sekarang meski laporan untung per barang belum ada — data yang tidak dikumpulkan sejak awal tidak bisa dihitung mundur |
| `photo_path` | Jalur di Supabase Storage. Blob-nya tetap di perangkat supaya grid kasir terisi penuh tanpa sinyal |
| `archived_at` | Diarsipkan, bukan dihapus: barangnya sudah muncul di struk lama |

### `sales` + `sale_items`

`sale_items` menyimpan `item_name`, `unit_price`, dan `unit_cost` sebagai salinan, bukan lewat join ke `items`. `item_id` boleh kosong — untuk barang di luar katalog, supaya kasir tidak pernah macet karena ada yang belum sempat didaftarkan.

`invoice_no` diberikan `sale_sequences` per tenant per tahun. Perangkat membuat nomor sementaranya sendiri supaya struk bisa keluar tanpa sinyal; kalau berbeda saat antrean terkirim, yang menang nomor peladen — dan struk yang sudah tercetak tetap sah, karena penjualannya dikenali lewat UUID, bukan lewat nomornya.

`voided_at` untuk pembatalan lunak. Membatalkan mengembalikan stok, membatalkan entri kasnya, dan membatalkan piutangnya.

### `stock_movements`

Satu baris untuk tiap perubahan stok, dengan `reason`: `penjualan`, `kulakan`, `koreksi`, `retur`, `rusak`.

Tanpa tabel ini, stok yang tidak cocok dengan rak tidak bisa ditelusuri — dan angka stok yang tidak bisa dijelaskan akan berhenti dipercaya, lalu berhenti dipakai. Jasa **tidak pernah** menghasilkan baris di sini.

### `cash_entries`

Buku kas. `book` sudah tidak ada lagi — semua yang masuk aplikasi ini adalah uang usaha.

| Kolom | Catatan |
|---|---|
| `kind` | `income` / `expense` / `transfer` — hanya dua yang pertama masuk laporan |
| `direction` | `in` / `out`, ditegakkan sepadan dengan `kind` oleh constraint |
| `category` | Daftar tertutup |
| `source_type` / `source_id` | Dari mana entri ini lahir: `sale`, `purchase`, `debt`, atau `manual` |
| `transfer_group_id` | Dua sisi pemindahan berbagi nilai ini |
| `deleted_at` | Penghapusan lunak |

```sql
transfer_needs_group  -- (kind = 'transfer') = (transfer_group_id is not null)
transfer_category     -- pemindahan selalu berkategori 'pindah'
income_is_in          -- pemasukan tidak mungkin berarah keluar
expense_is_out        -- pengeluaran tidak mungkin berarah masuk
```

`transfer_needs_group` yang paling penting: tanpa itu, satu sisi pemindahan yang gagal tersimpan akan terlihat seperti uang yang lenyap.

**Kategori adalah daftar tertutup.** Kategori bebas akan berkembang jadi puluhan ejaan untuk hal yang sama ("bensin", "Bensin", "bensin motor"), dan rekap bulanan yang menjumlahkannya berhenti bisa dipercaya.

| Kategori | Dari mana |
|---|---|
| `penjualan` | Kasir |
| `jasa` | Kasir |
| `modal` | Kulakan |
| `operasional`, `upah`, `sewa`, `lainnya` | Dicatat manual |
| `pindah` | Pemindahan antar dompet — tidak masuk laporan |

Tiga yang pertama ditolak `record_expense`. Kalau bisa dibuat manual, buku kas akan punya baris kulakan yang tidak berpasangan dengan kulakan mana pun.

### `debts`

Aturan yang menentukan bentuknya: **sebuah utang tidak menyentuh buku kas sampai uangnya benar-benar berpindah.** Mencatatnya lebih awal akan membuat saldo menunjukkan uang yang belum ada di laci.

Dibuat otomatis dari struk yang kurang bayar, tapi **hanya kalau nama pembelinya ada.** Piutang tanpa nama tidak bisa ditagih; ia cuma angka yang membuat laporan terlihat salah.

Saat dibayar, entri kasnya berkategori `lainnya` — bukan `penjualan`. Penghasilannya sudah terjadi saat barangnya diberikan; menghitungnya sebagai penjualan baru berarti laporan menghitung uang yang sama dua kali.

### `wallets`

Tempat uang berada: laci, rekening, e-wallet. Satu dompet (`Kas Utama`) dibuat saat tenant dibuat — ID-nya **dikirim perangkat**, tidak dibuat peladen: penjualan pertama menunjuk dompet itu, dan ID yang berbeda membuatnya gagal karena kunci asing, tepat setelah pengguna mengira catatannya sudah aman.

---

## 4. Saldo dan stok

Saldo dompet **tidak** disimpan. Dihitung dari `opening_balance` ditambah seluruh entri hidup di dompet itu. Kolom saldo yang diperbarui tiap transaksi akan melenceng cepat atau lambat — satu sinkronisasi gagal separuh sudah cukup — dan begitu melenceng tidak ada kebenaran untuk dibandingkan.

Stok **disimpan** di `items.stock_qty`, dan itu perbedaan yang disengaja: grid kasir harus menampilkan sisa stok puluhan barang sekaligus, dan menjumlah seluruh riwayat mutasi tiap kali grid digambar terlalu mahal untuk HP kelas bawah. Yang menjaganya tetap benar adalah aturan bahwa setiap perubahan `stock_qty` menulis satu baris `stock_movements` di transaksi yang sama — jadi kalau melenceng, selisihnya bisa ditemukan dan dijelaskan.

**Stok boleh minus.** Angka stok sering tertinggal dari kenyataan, dan menolak penjualan karenanya akan membuat kasir ditinggalkan tepat saat pembeli menunggu.

---

## 5. Row Level Security

- Fungsi bantu `current_tenant_ids()` ber-`security definer`, supaya pengecekan keanggotaan tidak ikut disaring RLS dan tidak menimbulkan rekursi policy
- Policy dibungkus `(select ...)` supaya dievaluasi sekali sebagai InitPlan, bukan per baris
- `with check` ditulis eksplisit. Untuk policy `for all`, PostgreSQL memang memakai ulang `using` sebagai pemeriksa tulis — jadi ini bukan penambal lubang, melainkan penjaga kalau policy per-perintah ditambahkan nanti
- Setiap kolom yang dipakai policy sudah diindeks
- Service role key tidak boleh pernah sampai ke sisi klien

Pengujian isolasi punya tiga penjaga untuk tabel yang ditambahkan nanti: setiap tabel wajib punya RLS aktif, minimal satu policy, dan indeks yang diawali `tenant_id`. Tabel baru yang lupa salah satunya akan membuat pengujian gagal jauh sebelum datanya bocor.

---

## 6. Jalur tulis

| Fungsi | Menyentuh |
|---|---|
| `create_tenant` | tenant + membership + dompet bawaan (ID dari perangkat) |
| `upsert_item` | satu barang/jasa; stok **tidak** ditimpa saat menyunting |
| `archive_item` | menandai arsip, tidak menghapus |
| `next_invoice_no` | nomor struk per tenant per tahun |
| `record_sale` | penjualan + barisnya + mutasi stok (barang saja) + entri kas + piutang |
| `void_sale` | membatalkan penjualan, mengembalikan stok, membatalkan kas & piutangnya |
| `record_purchase` | kulakan + mutasi stok + entri kas |
| `adjust_stock` | selisih hasil hitung fisik + mutasi stok |
| `record_expense` | satu entri kas; menolak kategori yang lahir dari kasir/kulakan |
| `record_transfer` | dua entri kas berpasangan |
| `pay_debt` | entri kas + memperbarui utang |

Semua idempoten terhadap `id` dari perangkat. Ini menutup celah paling merusak: permintaan yang **berhasil** di peladen lalu putus sebelum balasannya sampai. Tanpa itu, klien mengira gagal, mengirim ulang, dan penjualannya tercatat dua kali.

Semua `security invoker` supaya RLS tetap berlaku — kecuali `create_tenant`, yang memang berjalan saat keanggotaan belum ada.

---

## 7. Yang sengaja tidak dibuat

| Tidak dibuat | Alasan |
|---|---|
| `products.variants` | Varian menambah beban input di depan pembeli, untuk kasus yang belum terbukti ada |
| `customers` | Nama cukup teks di `sales.customer_name` dan `debts.person` |
| `categories` | Daftar tertutup di constraint; kategori bebas merusak laporan |
| `payments` | Pembayaran utang langsung jadi entri kas |
| `tailor_orders`, `customer_measurements` | Yang dicatat cuma nama jasa + harga |
| `branches`, `roles` | Satu orang, satu tempat |
| `audit_logs` | Berguna saat multi-user; belum sekarang |
| `ai_jobs` | Katalog dari foto menarik, tapi bukan yang menahan orang bertahan |
