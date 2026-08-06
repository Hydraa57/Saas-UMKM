# 03 — Data Model

## 1. Prinsip

Lima keputusan yang mendasari seluruh skema:

**1. Buku kas adalah pusat, bukan transaksi kasir.**
Blueprint awal menaruh `transactions` di tengah. Di sini pusatnya `cash_entries`. Penjualan, order jahit, dan kulakan adalah *sumber* yang menghasilkan entri buku kas. Ini yang membuat tiga aliran uang ibu muat dalam satu model tanpa dipaksakan.

**2. Uang disimpan sebagai `bigint` rupiah penuh.**
Bukan `numeric`, bukan `float`, dan tanpa sen. Rupiah praktis tidak memakai pecahan di level UMKM. `bigint` menghilangkan seluruh kelas bug pembulatan floating point, dan `9.223.372.036.854.775.807` rupiah cukup untuk siapa pun.

Di sisi TypeScript, nilainya **tidak** dipetakan ke `bigint` JavaScript melainkan ke `number` yang diberi merek (lihat `src/lib/money.ts`). `bigint` tidak bisa di-`JSON.stringify`, tidak bisa dicampur dengan `number` tanpa konversi eksplisit, dan PostgREST mengirim kolom `int8` sebagai angka JSON biasa — memakainya berarti mengonversi bolak-balik di setiap batas sistem, dan setiap konversi adalah tempat bug bersembunyi. Yang membuat `number` aman bukan tipenya melainkan invarian yang dipaksakan di setiap titik masuk: selalu bilangan bulat, selalu di bawah `Number.MAX_SAFE_INTEGER`. Pada syarat itu aritmetika double IEEE-754 bersifat eksak.

**3. Primary key UUID dibuat di perangkat, bukan di server.**
Ini konsekuensi langsung dari offline-first. Kalau ibu mencatat penjualan tanpa sinyal, baris itu butuh ID sekarang juga — tidak bisa menunggu `serial` dari server. Semua PK `uuid` yang di-generate klien.

**4. Riwayat tidak boleh berubah karena master datanya diubah.**
Nama produk, harga jual, harga modal, dan ukuran badan pelanggan disalin (snapshot) ke baris transaksi saat kejadian. Kalau ibu mengganti harga snack bulan depan, laporan bulan lalu tidak boleh ikut berubah.

**5. `tenant_id` ada di setiap tabel sejak hari pertama.**
Meski UI-nya satu toko. Menambahkan isolasi tenant belakangan berarti menyentuh ulang setiap tabel, setiap query, dan setiap policy — pekerjaan yang jauh lebih besar daripada menuliskannya sekarang.

---

## 2. Peta tabel

```
auth.users (Supabase)
    │
    └─▶ memberships ──▶ tenants
                            │
       ┌────────────────────┼────────────────────┬──────────────────┐
       ▼                    ▼                    ▼                  ▼
    wallets             products             customers          ai_jobs
       │                    │                    │
       │                    │      ┌─────────────┴──────────────┐
       │                    │      ▼                            ▼
       │                    │  customer_measurements      tailor_orders
       │                    │                                   │
       │                    ▼                                   │
       │            stock_movements ◀──── purchase_items         │
       │                    ▲                    ▲               │
       │                    │                    │               │
       │              sale_items            purchases            │
       │                    ▲                    │               │
       │                    │                    │               │
       │                 sales                   │               │
       │                    │                    │               │
       │                    └──────┐   ┌─────────┘   ┌───────────┘
       │                           ▼   ▼             ▼
       └──────────────────────▶  cash_entries  ◀── payments
                                 (BUKU KAS)
```

---

## 3. Skema

### 3.1 Tenant & akses

```sql
create table tenants (
  id            uuid primary key,
  name          text not null,
  business_type text,                        -- 'toko_jasa', 'toko', 'jasa'
  timezone      text not null default 'Asia/Jakarta',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table memberships (
  id         uuid primary key,
  tenant_id  uuid not null references tenants(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'owner',  -- 'owner' | 'staff'
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index on memberships (user_id);
create index on memberships (tenant_id);
```

Ini menggantikan `roles` + `user_roles` + `branches` dari blueprint awal. Satu tabel, satu kolom role. Cukup untuk owner + staf, dan bisa dikembangkan tanpa migrasi besar.

`branch_id` sengaja **tidak** dibuat. Menambahkannya nanti sebagai kolom nullable jauh lebih murah daripada memelihara tabel dan relasi yang tidak dipakai selama berbulan-bulan.

### 3.2 Dompet

```sql
create table wallets (
  id              uuid primary key,
  tenant_id       uuid not null references tenants(id) on delete cascade,
  name            text not null,             -- 'Tunai', 'BCA', 'DANA'
  kind            text not null,             -- 'cash' | 'bank' | 'ewallet'
  opening_balance bigint not null default 0,
  is_default      boolean not null default false,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index on wallets (tenant_id);
```

Saldo dompet **tidak disimpan sebagai kolom.** Saldo = `opening_balance` + jumlah semua `cash_entries` di dompet itu. Kolom saldo yang disimpan akan cepat melenceng dan tidak ada cara memperbaikinya; saldo turunan selalu bisa dihitung ulang dari nol.

Untuk performa nanti, ini bisa jadi materialized view atau tabel ringkasan harian — tapi jangan sebelum ada bukti lambat.

### 3.3 Produk & stok

```sql
create table products (
  id          uuid primary key,
  tenant_id   uuid not null references tenants(id) on delete cascade,
  name        text not null,
  photo_path  text,                          -- path di Supabase Storage
  sell_price  bigint not null default 0,
  cost_price  bigint not null default 0,     -- modal terakhir, diperbarui tiap kulakan
  stock_qty   numeric(12,3) not null default 0,
  min_stock   numeric(12,3) not null default 0,
  unit_label  text not null default 'pcs',
  barcode     text,
  sold_count  integer not null default 0,    -- untuk urutan grid
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index on products (tenant_id) where archived_at is null;
create index on products (tenant_id, sold_count desc);
```

`stock_qty` memakai `numeric(12,3)`, bukan integer — snack sering dijual per kilo atau per ons, dan pecahan harus muat.

`sold_count` adalah denormalisasi yang disengaja, untuk mengurutkan grid produk berdasarkan frekuensi tanpa agregasi setiap kali layar dibuka. Ini langsung mendukung keputusan UX di [`02-prd.md §5.2`](02-prd.md).

```sql
create table stock_movements (
  id          uuid primary key,
  tenant_id   uuid not null references tenants(id) on delete cascade,
  product_id  uuid not null references products(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  qty_change  numeric(12,3) not null,        -- negatif = keluar
  reason      text not null,                 -- 'sale'|'purchase'|'correction'|'return'|'waste'
  source_type text,                          -- 'sale'|'purchase'|null
  source_id   uuid,
  note        text,
  created_at  timestamptz not null default now()
);

create index on stock_movements (tenant_id, product_id, occurred_at desc);
```

`products.stock_qty` adalah rollup dari tabel ini. Kalau suatu saat tidak cocok, kebenaran ada di `stock_movements` dan `stock_qty` bisa dihitung ulang.

### 3.4 Pelanggan & ukuran

```sql
create table customers (
  id          uuid primary key,
  tenant_id   uuid not null references tenants(id) on delete cascade,
  name        text not null,
  phone       text,
  note        text,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index on customers (tenant_id) where archived_at is null;

create table customer_measurements (
  id           uuid primary key,
  tenant_id    uuid not null references tenants(id) on delete cascade,
  customer_id  uuid not null references customers(id) on delete cascade,
  garment_type text not null,                -- 'kemeja','celana','kebaya','gamis',...
  data         jsonb not null,               -- {"lingkar_dada":92,"panjang_lengan":58,...}
  recorded_at  timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create index on customer_measurements (tenant_id, customer_id, garment_type, recorded_at desc);
```

**Kenapa `jsonb` dan bukan kolom tetap.** Ukuran kemeja, celana, kebaya, dan gamis tidak berbagi satu himpunan field. Membuat kolom untuk setiap kemungkinan menghasilkan tabel dengan puluhan kolom yang mayoritas `null`, dan tetap salah begitu ibu menerima jenis jahitan yang belum terpikir. `jsonb` membiarkan bentuknya ditentukan pemakaian, dan tetap bisa di-query.

**Kenapa disimpan sebagai riwayat, bukan satu baris per pelanggan.** Ukuran badan berubah. Yang dipakai untuk mengisi otomatis adalah baris terbaru per `(customer, garment_type)`, tapi yang lama tidak dihapus — kalau pelanggan protes "kok beda dengan yang dulu", riwayatnya ada.

### 3.5 Penjualan

```sql
create table sales (
  id              uuid primary key,
  tenant_id       uuid not null references tenants(id) on delete cascade,
  occurred_at     timestamptz not null default now(),
  customer_id     uuid references customers(id) on delete set null,
  total_amount    bigint not null default 0,
  discount_amount bigint not null default 0,
  paid_amount     bigint not null default 0,
  payment_method  text,                      -- 'cash'|'qris'|'transfer'|'unpaid'
  note            text,
  voided_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index on sales (tenant_id, occurred_at desc);
create index on sales (tenant_id, customer_id)
  where paid_amount < total_amount and voided_at is null;

create table sale_items (
  id         uuid primary key,
  tenant_id  uuid not null references tenants(id) on delete cascade,
  sale_id    uuid not null references sales(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  item_name  text not null,                  -- snapshot
  qty        numeric(12,3) not null,
  unit_price bigint not null,                -- snapshot
  unit_cost  bigint not null default 0,      -- snapshot, untuk hitung untung
  subtotal   bigint not null
);

create index on sale_items (tenant_id, sale_id);
create index on sale_items (tenant_id, product_id);
```

`product_id` boleh `null` — ini yang menopang tombol "Lainnya" di layar jual. Ibu bisa mencatat penjualan barang yang belum ada di katalog tanpa terjebak, dan `item_name` tetap terisi.

**Piutang tidak punya tabelnya sendiri.** Piutang adalah keadaan, bukan entitas: `paid_amount < total_amount`. Indeks parsial di atas membuat query "siapa yang belum bayar" tetap cepat tanpa tabel tambahan yang harus dijaga konsistensinya.

### 3.6 Order jahit

Ini bagian yang tidak ada padanannya di blueprint awal.

```sql
create table tailor_orders (
  id                   uuid primary key,
  tenant_id            uuid not null references tenants(id) on delete cascade,
  customer_id          uuid not null references customers(id) on delete restrict,
  order_no             text not null,        -- '2026-0041', untuk disebut ke pelanggan
  garment_type         text not null,
  description          text,
  qty                  integer not null default 1,
  price                bigint not null default 0,
  paid_amount          bigint not null default 0,
  promised_date        date,
  status               text not null default 'queued',
      -- 'queued'|'in_progress'|'done'|'picked_up'|'cancelled'
  measurement_snapshot jsonb,                -- salinan ukuran saat order dibuat
  note                 text,
  started_at           timestamptz,
  completed_at         timestamptz,
  picked_up_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (tenant_id, order_no)
);

create index on tailor_orders (tenant_id, status, promised_date);
create index on tailor_orders (tenant_id, customer_id);
create index on tailor_orders (tenant_id, promised_date)
  where status in ('queued','in_progress');
```

Poin-poin yang penting:

- **`measurement_snapshot`** menyalin ukuran saat order dibuat. Kalau ukuran pelanggan diperbarui bulan depan, jahitan yang sedang dikerjakan tidak ikut berubah. Ini mencegah kesalahan yang mahal secara nyata — kain sudah dipotong.
- **`order_no`** yang bisa diucapkan, bukan UUID. Pelanggan menyebut nomor ini saat mengambil.
- **`paid_amount`** menampung DP dan pelunasan sekaligus. Sisa bayar = `price - paid_amount`. Sama seperti penjualan, tidak perlu tabel piutang terpisah.
- **Indeks parsial pada `promised_date`** untuk yang masih berjalan — inilah query "jahitan jatuh tempo minggu ini" yang muncul di beranda.
- `customer_id` memakai `on delete restrict`: order jahit tanpa pelanggan tidak punya arti.

### 3.7 Kulakan

```sql
create table purchases (
  id            uuid primary key,
  tenant_id     uuid not null references tenants(id) on delete cascade,
  occurred_at   timestamptz not null default now(),
  supplier_name text,                        -- teks bebas, bukan tabel supplier
  total_amount  bigint not null default 0,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index on purchases (tenant_id, occurred_at desc);

create table purchase_items (
  id          uuid primary key,
  tenant_id   uuid not null references tenants(id) on delete cascade,
  purchase_id uuid not null references purchases(id) on delete cascade,
  product_id  uuid references products(id) on delete set null,
  item_name   text not null,
  qty         numeric(12,3) not null,
  unit_cost   bigint not null,
  subtotal    bigint not null
);

create index on purchase_items (tenant_id, purchase_id);
```

`supplier_name` sebagai teks, bukan relasi ke tabel `suppliers`. Ibu kulakan di dua atau tiga tempat yang sama; tabel supplier menambah satu layar setup untuk keuntungan yang mendekati nol. Kalau nanti terbukti perlu, teks yang sudah terkumpul bisa dinormalisasi.

### 3.8 Pembayaran

```sql
create table payments (
  id           uuid primary key,
  tenant_id    uuid not null references tenants(id) on delete cascade,
  subject_type text not null,                -- 'sale' | 'tailor_order'
  subject_id   uuid not null,
  kind         text not null,                -- 'dp'|'installment'|'settlement'|'full'
  amount       bigint not null,
  wallet_id    uuid not null references wallets(id),
  method       text,                         -- 'cash'|'qris'|'transfer'
  occurred_at  timestamptz not null default now(),
  note         text,
  created_at   timestamptz not null default now()
);

create index on payments (tenant_id, subject_type, subject_id);
create index on payments (tenant_id, occurred_at desc);
```

Satu tabel untuk DP, cicilan, dan pelunasan — baik untuk penjualan maupun order jahit. Relasi polimorfik (`subject_type` + `subject_id`) sengaja dipilih di atas dua tabel terpisah: alur pembayarannya identik, dan menduplikasinya berarti menduplikasi setiap query piutang.

### 3.9 Buku kas

```sql
create table cash_entries (
  id          uuid primary key,
  tenant_id   uuid not null references tenants(id) on delete cascade,
  wallet_id   uuid not null references wallets(id),
  occurred_at timestamptz not null default now(),
  direction   text not null,                 -- 'in' | 'out'
  amount      bigint not null check (amount > 0),
  category    text not null,
  note        text,
  source_type text,                          -- 'sale'|'purchase'|'payment'|'manual'
  source_id   uuid,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index on cash_entries (tenant_id, occurred_at desc);
create index on cash_entries (tenant_id, wallet_id, occurred_at);
create index on cash_entries (tenant_id, category, occurred_at);
```

Kategori yang dipakai:

| `direction` | `category` | Arti | Masuk hitungan untung? |
|---|---|---|---|
| `in` | `sale` | Penjualan barang | Ya, sebagai pendapatan |
| `in` | `service` | DP / pelunasan jahit | Ya, sebagai pendapatan |
| `in` | `receivable` | Pelunasan utang lama | Tidak — sudah diakui saat penjualan |
| `in` | `capital` | Tambah modal dari uang pribadi | **Tidak** |
| `in` | `other` | Lain-lain | Tergantung |
| `out` | `purchase` | Kulakan barang | Ya, sebagai modal |
| `out` | `operational` | Ongkos, listrik, plastik, benang | Ya, sebagai biaya |
| `out` | `owner_draw` | **Ambil buat rumah** | **Tidak** |
| `out` | `other` | Lain-lain | Tergantung |

Kolom paling kanan adalah inti dari fitur "uang usaha vs pribadi". `capital` dan `owner_draw` menggerakkan saldo kas tapi **tidak** menyentuh laba-rugi. Inilah yang membuat aplikasi bisa menjawab dua pertanyaan sekaligus yang selama ini tercampur di buku ibu:

- "Uang saya sekarang berapa?" → saldo kas, termasuk semua pergerakan
- "Usaha saya untung berapa?" → hanya kategori yang masuk hitungan

Di buku tulis kedua pertanyaan itu terlihat sama, dan itu sumber kebingungannya.

### 3.10 AI

```sql
create table ai_jobs (
  id          uuid primary key,
  tenant_id   uuid not null references tenants(id) on delete cascade,
  kind        text not null,                 -- MVP: hanya 'catalog_from_photo'
  input       jsonb,
  output      jsonb,
  status      text not null default 'pending',
  error       text,
  created_at  timestamptz not null default now(),
  finished_at timestamptz
);

create index on ai_jobs (tenant_id, created_at desc);
```

Satu jenis job saja di MVP. Lihat [`04-arsitektur.md`](04-arsitektur.md#ai) untuk alasannya.

---

## 4. Row Level Security

### 4.1 Fungsi bantu

```sql
create or replace function public.current_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from memberships where user_id = auth.uid()
$$;

revoke all on function public.current_tenant_ids() from public;
grant execute on function public.current_tenant_ids() to authenticated;
```

`security definer` dipakai supaya pengecekan keanggotaan tidak ikut disaring RLS dan tidak menimbulkan rekursi policy.

### 4.2 Policy

```sql
alter table products enable row level security;

create policy tenant_rw on products
  for all
  to authenticated
  using       (tenant_id in (select public.current_tenant_ids()))
  with check  (tenant_id in (select public.current_tenant_ids()));
```

Diulang untuk setiap tabel ber-`tenant_id`.

Tiga detail yang menentukan benar dan cepatnya:

1. **`(select ...)` wajib, bukan pemanggilan langsung.** Dibungkus `select`, PostgreSQL mengevaluasinya sekali sebagai InitPlan. Tanpa itu, fungsinya dipanggil ulang untuk setiap baris.
2. **`with check` tidak boleh dilewat.** `using` saja mencegah membaca baris tenant lain, tapi masih memungkinkan `update` memindahkan baris ke `tenant_id` lain.
3. **Setiap kolom yang dipakai policy harus punya indeks.** Semua `create index on … (tenant_id …)` di atas ada untuk alasan ini — indeks yang hilang adalah penyebab utama RLS jadi lambat.

Dan satu aturan operasional: **service role key tidak boleh pernah sampai ke sisi klien.** Key itu mem-bypass RLS sepenuhnya. Tempatnya hanya di Edge Function atau route server.

### 4.3 Query tetap menulis filter tenant

Meski RLS sudah menyaring, query aplikasi tetap menuliskan filternya:

```ts
// Ya
supabase.from('products').select('*').eq('tenant_id', tenantId)

// Jangan — bergantung pada RLS saja
supabase.from('products').select('*')
```

Bukan karena RLS tidak dipercaya, tapi karena filter eksplisit membuat perencana query memilih indeks dengan lebih baik.

---

## 5. Jalur tulis: fungsi RPC

Operasi yang menyentuh beberapa tabel dijalankan lewat fungsi PostgreSQL, bukan beberapa panggilan terpisah dari klien.

Alasannya langsung berkaitan dengan kriteria penerimaan "saldo aplikasi cocok dengan uang di laci": kalau klien menulis `sales`, lalu `sale_items`, lalu `stock_movements`, lalu `cash_entries` sebagai empat panggilan, maka koneksi yang putus di tengah — hal yang biasa terjadi di HP — meninggalkan penjualan tanpa entri kas. Aplikasi jadi berbohong, dan kepercayaan hilang.

Satu fungsi, satu transaksi, semua atau tidak sama sekali.

```
record_sale(p_tenant, p_sale_id, p_items, p_payment, p_customer, p_occurred_at)
  → sales + sale_items + stock_movements + products.stock_qty
  + products.sold_count + payments + cash_entries

record_purchase(p_tenant, p_purchase_id, p_items, p_wallet, p_occurred_at)
  → purchases + purchase_items + stock_movements + products.stock_qty
  + products.cost_price + cash_entries

record_payment(p_tenant, p_payment_id, p_subject_type, p_subject_id, p_amount, p_wallet)
  → payments + (sales|tailor_orders).paid_amount + cash_entries

record_cash(p_tenant, p_entry_id, p_direction, p_amount, p_category, p_wallet, p_note)
  → cash_entries

complete_tailor_order(p_tenant, p_order_id, p_status)
  → tailor_orders.status + stempel waktu
```

Parameter `p_*_id` diisi UUID dari perangkat. Ini yang membuat pemutaran ulang antrean offline menjadi **idempoten**: kalau jaringan putus setelah server memproses tapi sebelum klien menerima balasan, klien mengirim ulang dengan UUID yang sama, dan fungsinya cukup melakukan `on conflict do nothing`. Tanpa ini, sinkronisasi yang gagal separuh akan menghasilkan penjualan ganda — kesalahan yang tepat sasaran merusak kepercayaan pengguna.

---

## 6. Dukungan sinkronisasi

Setiap tabel yang bisa diubah dari perangkat membawa:

```sql
updated_at timestamptz not null default now()   -- untuk pull inkremental
deleted_at timestamptz                          -- soft delete
```

Soft delete diperlukan karena penghapusan keras tidak bisa disebarkan ke perangkat lain: baris yang hilang tidak bisa dibedakan dari baris yang belum pernah sampai.

Klien menarik perubahan dengan `where updated_at > last_sync_at`, dan mendorong perubahan lewat antrean RPC di §5.

Selama satu tenant dipakai satu orang, resolusi konflik cukup "tulisan terakhir menang". Ini perlu ditinjau ulang saat ada dua orang mencatat bersamaan — bukan sebelumnya.

---

## 7. Yang sengaja tidak dibuat

| Tidak dibuat | Alasan |
|---|---|
| `branches` | Satu tempat. Nanti cukup kolom nullable |
| `roles`, `user_roles` | Digantikan `memberships.role` |
| `product_variants` | Snack biskuit tidak punya varian |
| `units` | `unit_label` teks sudah cukup |
| `suppliers` | `purchases.supplier_name` teks sudah cukup |
| `stock_opnames` | Cukup `stock_movements` dengan `reason='correction'` |
| `payment_methods` | Nilainya terbatas dan jarang berubah; cukup kolom teks |
| `transaction_discounts` | Cukup kolom di `sales` |
| `receivables` | Piutang adalah keadaan (`paid_amount < total_amount`), bukan entitas |
| `audit_logs` | Berguna saat multi-user; belum sekarang |
| `wa_notifications` | Tidak ada WhatsApp API di MVP |
| `categories` | Ditunda sampai katalog cukup besar untuk butuh pengelompokan |

Setiap tabel yang tidak dibuat adalah satu layar setup yang tidak perlu ibu lewati sebelum bisa mencatat penjualan pertamanya.
