-- Skema inti.
--
-- Aplikasi manajemen usaha untuk UMKM mikro: kasir, katalog barang dan
-- jasa, stok, dan laporan. Kasir adalah cara masuknya; buku kas adalah
-- buku besar di bawahnya; rekap adalah keluarannya.
--
--   kasir → struk ─┬─▶ penjualan + itemnya
--                  ├─▶ stok berkurang (barang saja)
--                  └─▶ uang masuk (buku kas) ──▶ rekap harian & bulanan
--
-- Satu transaksi, tiga akibat, dalam satu operasi atomik.
--
-- Prinsip:
--   1. Uang selalu `bigint` rupiah utuh.
--   2. Primary key `uuid` dibuat di perangkat — kasir harus jalan tanpa
--      sinyal, dan barisnya butuh ID sekarang juga.
--   3. Riwayat memakai salinan, bukan referensi: nama dan harga disalin
--      ke baris penjualan, supaya mengubah katalog tidak mengubah
--      laporan bulan lalu.
--   4. `tenant_id` di setiap tabel sejak hari pertama.

-- ── Tenant & akses ───────────────────────────────────────────────────────

create table tenants (
  id            uuid primary key,
  name          text not null check (length(trim(name)) > 0),
  business_type text not null default 'lainnya' check (business_type in (
                  'dagang',    -- warung, toko, kelontong, toko online
                  'makanan',   -- kuliner, katering, gerobak
                  'jasa',      -- jahit, laundry, salon, servis
                  'campuran',  -- barang sekaligus jasa
                  'lainnya'
                )),
  timezone      text not null default 'Asia/Jakarta',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table memberships (
  id         uuid primary key,
  tenant_id  uuid not null references tenants(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'owner' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index memberships_user_idx on memberships (user_id);
create index memberships_tenant_idx on memberships (tenant_id);

-- ── Dompet ───────────────────────────────────────────────────────────────

create table wallets (
  id              uuid primary key,
  tenant_id       uuid not null references tenants(id) on delete cascade,
  name            text not null check (length(trim(name)) > 0),
  kind            text not null default 'tunai'
                  check (kind in ('tunai', 'bank', 'ewallet')),
  opening_balance bigint not null default 0,
  is_default      boolean not null default false,
  sort_order      integer not null default 0,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index wallets_tenant_idx on wallets (tenant_id);

create unique index wallets_one_default_idx
  on wallets (tenant_id) where is_default and archived_at is null;

-- ── Katalog ──────────────────────────────────────────────────────────────

-- Barang dan jasa dalam satu tabel.
--
-- Di layar kasir keduanya adalah hal yang sama: sesuatu yang dijual,
-- punya nama dan harga, diketuk untuk masuk keranjang. Memisahkannya jadi
-- dua tabel berarti dua query, dua bentuk baris penjualan, dan dua jalur
-- kode yang 90% identik.
--
-- Satu-satunya bedanya: **barang punya stok, jasa tidak.** "Potong
-- celana" tidak pernah habis. Perbedaan itu ditegakkan constraint, bukan
-- diserahkan ke kedisiplinan kode aplikasi.
create table items (
  id          uuid primary key,
  tenant_id   uuid not null references tenants(id) on delete cascade,
  kind        text not null check (kind in ('barang', 'jasa')),
  name        text not null check (length(trim(name)) > 0),
  photo_path  text,
  price       bigint not null default 0 check (price >= 0),

  -- Harga modal. Dipakai untuk memperbarui nilai saat kulakan dan untuk
  -- menyalin ke baris penjualan; laporan untung per barang menyusul.
  cost_price  bigint not null default 0 check (cost_price >= 0),

  unit        text not null default 'pcs',

  -- Kosong untuk jasa, dan itu ditegakkan constraint di bawah.
  stock_qty   numeric(12,3),
  min_stock   numeric(12,3),

  barcode     text,

  -- Menentukan urutan di grid kasir. Yang sering dijual naik sendiri,
  -- jadi barang terlaris selalu ada di layar pertama tanpa perlu diatur.
  sold_count  integer not null default 0,

  sort_order  integer not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Inti pembeda aplikasi ini, ditegakkan di lapisan data: jasa tidak
  -- mungkin punya stok, barang wajib punya. Tidak ada jalan bagi bug di
  -- aplikasi untuk membuat "Potong celana" kehabisan stok.
  constraint stock_only_for_goods check (
    (kind = 'barang') = (stock_qty is not null)
  ),
  constraint min_stock_follows_stock check (
    (stock_qty is null) = (min_stock is null)
  )
);

create index items_tenant_active_idx
  on items (tenant_id) where archived_at is null;

-- Urutan grid kasir.
create index items_popular_idx
  on items (tenant_id, sold_count desc) where archived_at is null;

-- "Apa yang harus dibeli lagi" — dibuka tiap mau kulakan.
create index items_low_stock_idx
  on items (tenant_id)
  where archived_at is null and stock_qty is not null and stock_qty <= min_stock;

-- Barcode boleh kosong (kebanyakan dagangan mikro memang tanpa barcode),
-- tapi kalau diisi harus unik dalam satu tenant.
create unique index items_barcode_idx
  on items (tenant_id, barcode) where barcode is not null;

-- ── Penjualan ────────────────────────────────────────────────────────────

create table sales (
  id              uuid primary key,
  tenant_id       uuid not null references tenants(id) on delete cascade,

  -- Nomor yang tercetak di struk dan bisa diucapkan pelanggan.
  invoice_no      text not null,

  occurred_at     timestamptz not null default now(),
  subtotal        bigint not null default 0 check (subtotal >= 0),
  discount        bigint not null default 0 check (discount >= 0),
  total           bigint not null default 0 check (total >= 0),

  -- Uang yang benar-benar diterima. Lebih besar dari total berarti ada
  -- kembalian; lebih kecil berarti sisanya jadi piutang.
  paid            bigint not null default 0 check (paid >= 0),

  payment_method  text check (payment_method in ('tunai', 'qris', 'transfer', 'utang')),
  wallet_id       uuid references wallets(id),
  customer_name   text,
  note            text,
  voided_at       timestamptz,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (tenant_id, invoice_no)
);

create index sales_time_idx
  on sales (tenant_id, occurred_at desc) where voided_at is null;

create index sales_unpaid_idx
  on sales (tenant_id, occurred_at)
  where paid < total and voided_at is null;

-- Nama dan harga **disalin**, tidak dirujuk. Mengubah harga di katalog
-- bulan depan tidak boleh mengubah struk yang sudah tercetak.
create table sale_items (
  id         uuid primary key,
  tenant_id  uuid not null references tenants(id) on delete cascade,
  sale_id    uuid not null references sales(id) on delete cascade,

  -- Boleh kosong: penjualan barang yang belum ada di katalog tetap bisa
  -- dicatat lewat tombol "lainnya". Pengguna tidak boleh terjebak hanya
  -- karena katalognya belum lengkap.
  item_id    uuid references items(id) on delete set null,

  item_kind  text not null check (item_kind in ('barang', 'jasa')),
  item_name  text not null,
  qty        numeric(12,3) not null check (qty > 0),
  unit_price bigint not null check (unit_price >= 0),
  unit_cost  bigint not null default 0 check (unit_cost >= 0),
  subtotal   bigint not null,

  -- Urutan baris di keranjang. Tanpa kolom ini, urutan struk mengikuti
  -- urutan penyimpanan — yang berarti UUID acak — dan struk yang sama
  -- bisa tercetak dengan urutan berbeda tiap kali dibuka. Pembeli yang
  -- baru saja melihat barangnya diketuk satu per satu akan menghitung
  -- ulang, dan struk yang bikin ragu lebih buruk daripada tanpa struk.
  line_no    integer not null default 0
);

create index sale_items_sale_idx on sale_items (tenant_id, sale_id);
create index sale_items_item_idx on sale_items (tenant_id, item_id);

-- Penomoran struk per tahun, supaya nomornya tidak pernah tumbuh
-- terlalu panjang untuk diucapkan.
create table sale_sequences (
  tenant_id  uuid not null references tenants(id) on delete cascade,
  year       integer not null,
  last_value integer not null default 0,
  primary key (tenant_id, year)
);

-- ── Stok ─────────────────────────────────────────────────────────────────

-- `items.stock_qty` adalah rollup dari tabel ini. Kalau suatu saat tidak
-- cocok, kebenarannya ada di sini dan bisa dihitung ulang dari nol.
create table stock_movements (
  id          uuid primary key,
  tenant_id   uuid not null references tenants(id) on delete cascade,
  item_id     uuid not null references items(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  qty_change  numeric(12,3) not null check (qty_change <> 0),
  reason      text not null check (
                reason in ('penjualan', 'kulakan', 'koreksi', 'retur', 'rusak')
              ),
  source_type text,
  source_id   uuid,
  note        text,
  created_at  timestamptz not null default now()
);

create index stock_movements_item_idx
  on stock_movements (tenant_id, item_id, occurred_at desc);
create index stock_movements_source_idx
  on stock_movements (tenant_id, source_type, source_id);

-- ── Kulakan ──────────────────────────────────────────────────────────────

create table purchases (
  id            uuid primary key,
  tenant_id     uuid not null references tenants(id) on delete cascade,
  occurred_at   timestamptz not null default now(),
  supplier_name text,
  total         bigint not null default 0 check (total >= 0),
  wallet_id     uuid references wallets(id),
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index purchases_time_idx on purchases (tenant_id, occurred_at desc);

create table purchase_items (
  id          uuid primary key,
  tenant_id   uuid not null references tenants(id) on delete cascade,
  purchase_id uuid not null references purchases(id) on delete cascade,
  item_id     uuid references items(id) on delete set null,
  item_name   text not null,
  qty         numeric(12,3) not null check (qty > 0),
  unit_cost   bigint not null check (unit_cost >= 0),
  subtotal    bigint not null
);

create index purchase_items_purchase_idx on purchase_items (tenant_id, purchase_id);

-- ── Buku kas ─────────────────────────────────────────────────────────────

-- Buku besar di bawah kasir. Penjualan dan kulakan menghasilkan baris di
-- sini; biaya lain dicatat langsung.
create table cash_entries (
  id          uuid primary key,
  tenant_id   uuid not null references tenants(id) on delete cascade,
  wallet_id   uuid not null references wallets(id),
  occurred_at timestamptz not null default now(),
  direction   text not null check (direction in ('in', 'out')),
  amount      bigint not null check (amount > 0),

  -- 'income'/'expense' ikut laporan; 'transfer' tidak. Memindahkan uang
  -- antar dompet bukan penghasilan dan bukan biaya.
  kind        text not null check (kind in ('income', 'expense', 'transfer')),

  -- Daftar tertutup. Kategori bebas akan berkembang jadi puluhan ejaan
  -- untuk hal yang sama, dan laporan yang menjumlahkannya berhenti bisa
  -- dipercaya.
  category    text not null check (category in (
                'penjualan', 'jasa',                     -- masuk
                'modal', 'operasional', 'upah', 'sewa',  -- keluar
                'lainnya', 'pindah'
              )),

  note        text,
  source_type text,
  source_id   uuid,
  transfer_group_id uuid,
  created_by  uuid references auth.users(id),
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint transfer_needs_group check (
    (kind = 'transfer') = (transfer_group_id is not null)
  ),
  constraint transfer_category check (
    kind <> 'transfer' or category = 'pindah'
  ),
  constraint income_is_in check (kind <> 'income' or direction = 'in'),
  constraint expense_is_out check (kind <> 'expense' or direction = 'out')
);

create index cash_entries_time_idx
  on cash_entries (tenant_id, occurred_at desc) where deleted_at is null;
create index cash_entries_kind_idx
  on cash_entries (tenant_id, kind, occurred_at) where deleted_at is null;
create index cash_entries_wallet_idx
  on cash_entries (tenant_id, wallet_id, occurred_at) where deleted_at is null;
create index cash_entries_source_idx
  on cash_entries (tenant_id, source_type, source_id);

-- ── Piutang ──────────────────────────────────────────────────────────────

-- Sengaja kecil. Sebuah utang tidak menyentuh buku kas sampai uangnya
-- benar-benar berpindah — mencatatnya lebih awal membuat saldo
-- menunjukkan uang yang belum ada di laci.
create table debts (
  id          uuid primary key,
  tenant_id   uuid not null references tenants(id) on delete cascade,
  side        text not null check (side in ('receivable', 'payable')),
  person      text not null check (length(trim(person)) > 0),
  amount      bigint not null check (amount > 0),
  paid_amount bigint not null default 0 check (paid_amount >= 0),
  sale_id     uuid references sales(id) on delete set null,
  note        text,
  occurred_at timestamptz not null default now(),
  settled_at  timestamptz,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint paid_not_over check (paid_amount <= amount)
);

create index debts_open_idx
  on debts (tenant_id, side, occurred_at)
  where settled_at is null and deleted_at is null;
create index debts_person_idx on debts (tenant_id, person);

-- ── updated_at otomatis ──────────────────────────────────────────────────

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  target text;
begin
  foreach target in array array[
    'tenants', 'wallets', 'items', 'sales', 'purchases',
    'cash_entries', 'debts'
  ]
  loop
    execute format(
      'create trigger %I_set_updated_at
         before update on %I
         for each row execute function set_updated_at()',
      target, target
    );
  end loop;
end;
$$;
