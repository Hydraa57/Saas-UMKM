-- Skema inti.
--
-- Rujukan lengkap beserta alasan tiap keputusan: docs/03-data-model.md
--
-- Prinsip yang dipakai di seluruh berkas ini:
--   1. Uang selalu `bigint` rupiah utuh. Tanpa sen, tanpa numeric,
--      tanpa floating point.
--   2. Primary key `uuid` dibuat di perangkat, bukan di server, supaya
--      pencatatan tanpa sinyal tidak perlu menunggu apa pun.
--   3. Riwayat memakai salinan (snapshot), bukan referensi, supaya
--      laporan bulan lalu tidak berubah saat master data diubah.
--   4. `tenant_id` di setiap tabel sejak hari pertama, meski UI-nya
--      masih satu toko.

-- ── Tenant & akses ───────────────────────────────────────────────────────

create table tenants (
  id            uuid primary key,
  name          text not null check (length(trim(name)) > 0),
  business_type text,
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
  kind            text not null check (kind in ('cash', 'bank', 'ewallet')),
  opening_balance bigint not null default 0,
  is_default      boolean not null default false,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index wallets_tenant_idx on wallets (tenant_id);

-- Tepat satu dompet bawaan per tenant. Tanpa ini, layar bayar harus
-- menebak dompet mana yang dimaksud, dan tebakan yang salah pada uang
-- selalu ketahuan belakangan.
create unique index wallets_one_default_idx
  on wallets (tenant_id)
  where is_default and archived_at is null;

-- ── Produk & stok ────────────────────────────────────────────────────────

create table products (
  id          uuid primary key,
  tenant_id   uuid not null references tenants(id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  photo_path  text,
  sell_price  bigint not null default 0 check (sell_price >= 0),
  cost_price  bigint not null default 0 check (cost_price >= 0),
  stock_qty   numeric(12,3) not null default 0,
  min_stock   numeric(12,3) not null default 0 check (min_stock >= 0),
  unit_label  text not null default 'pcs',
  barcode     text,
  sold_count  integer not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index products_tenant_active_idx
  on products (tenant_id) where archived_at is null;

-- Grid di layar jual diurutkan menurut frekuensi. Indeks ini yang
-- membuatnya tidak perlu agregasi tiap kali layarnya dibuka.
create index products_tenant_popular_idx
  on products (tenant_id, sold_count desc) where archived_at is null;

create index products_tenant_lowstock_idx
  on products (tenant_id) where archived_at is null and stock_qty <= min_stock;

-- Barcode boleh kosong (kebanyakan snack curah memang tidak punya),
-- tapi kalau diisi harus unik dalam satu tenant.
create unique index products_tenant_barcode_idx
  on products (tenant_id, barcode) where barcode is not null;

create table stock_movements (
  id          uuid primary key,
  tenant_id   uuid not null references tenants(id) on delete cascade,
  product_id  uuid not null references products(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  qty_change  numeric(12,3) not null check (qty_change <> 0),
  reason      text not null check (
                reason in ('sale', 'purchase', 'correction', 'return', 'waste')
              ),
  source_type text,
  source_id   uuid,
  note        text,
  created_at  timestamptz not null default now()
);

create index stock_movements_product_idx
  on stock_movements (tenant_id, product_id, occurred_at desc);
create index stock_movements_source_idx
  on stock_movements (tenant_id, source_type, source_id);

-- ── Pelanggan & ukuran ───────────────────────────────────────────────────

create table customers (
  id          uuid primary key,
  tenant_id   uuid not null references tenants(id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  phone       text,
  note        text,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index customers_tenant_idx
  on customers (tenant_id) where archived_at is null;

-- Ukuran disimpan sebagai jsonb karena himpunan fieldnya berbeda per
-- jenis jahitan, dan tiap pengukuran disimpan sebagai baris baru —
-- badan pelanggan berubah, dan riwayatnya kadang perlu dibuktikan.
create table customer_measurements (
  id           uuid primary key,
  tenant_id    uuid not null references tenants(id) on delete cascade,
  customer_id  uuid not null references customers(id) on delete cascade,
  garment_type text not null,
  data         jsonb not null default '{}'::jsonb,
  recorded_at  timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create index customer_measurements_latest_idx
  on customer_measurements (tenant_id, customer_id, garment_type, recorded_at desc);

-- ── Penjualan ────────────────────────────────────────────────────────────

create table sales (
  id              uuid primary key,
  tenant_id       uuid not null references tenants(id) on delete cascade,
  occurred_at     timestamptz not null default now(),
  customer_id     uuid references customers(id) on delete set null,
  total_amount    bigint not null default 0 check (total_amount >= 0),
  discount_amount bigint not null default 0 check (discount_amount >= 0),
  paid_amount     bigint not null default 0 check (paid_amount >= 0),
  payment_method  text check (
                    payment_method in ('cash', 'qris', 'transfer', 'unpaid')
                  ),
  note            text,
  voided_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index sales_tenant_time_idx on sales (tenant_id, occurred_at desc);

-- "Siapa yang belum bayar" adalah salah satu pertanyaan yang paling
-- sering ditanyakan. Indeks parsial ini yang membuatnya tetap murah
-- tanpa perlu tabel piutang tersendiri.
create index sales_unpaid_idx
  on sales (tenant_id, customer_id, occurred_at)
  where paid_amount < total_amount and voided_at is null;

create table sale_items (
  id         uuid primary key,
  tenant_id  uuid not null references tenants(id) on delete cascade,
  sale_id    uuid not null references sales(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  item_name  text not null,
  qty        numeric(12,3) not null check (qty > 0),
  unit_price bigint not null check (unit_price >= 0),
  unit_cost  bigint not null default 0 check (unit_cost >= 0),
  subtotal   bigint not null
);

create index sale_items_sale_idx on sale_items (tenant_id, sale_id);
create index sale_items_product_idx on sale_items (tenant_id, product_id);

-- ── Order jahit ──────────────────────────────────────────────────────────

create table tailor_orders (
  id                   uuid primary key,
  tenant_id            uuid not null references tenants(id) on delete cascade,
  customer_id          uuid not null references customers(id) on delete restrict,
  order_no             text not null,
  garment_type         text not null,
  description          text,
  qty                  integer not null default 1 check (qty > 0),
  price                bigint not null default 0 check (price >= 0),
  paid_amount          bigint not null default 0 check (paid_amount >= 0),
  promised_date        date,
  status               text not null default 'queued' check (
                         status in ('queued', 'in_progress', 'done',
                                    'picked_up', 'cancelled')
                       ),
  measurement_snapshot jsonb,
  note                 text,
  started_at           timestamptz,
  completed_at         timestamptz,
  picked_up_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (tenant_id, order_no)
);

create index tailor_orders_status_idx
  on tailor_orders (tenant_id, status, promised_date);
create index tailor_orders_customer_idx
  on tailor_orders (tenant_id, customer_id);

-- "Jahitan mana yang jatuh tempo" di beranda, tiap kali aplikasi dibuka.
create index tailor_orders_due_idx
  on tailor_orders (tenant_id, promised_date)
  where status in ('queued', 'in_progress');

-- Penomoran per tahun, supaya nomor yang diucapkan pelanggan tetap pendek.
create table tailor_order_sequences (
  tenant_id  uuid not null references tenants(id) on delete cascade,
  year       integer not null,
  last_value integer not null default 0,
  primary key (tenant_id, year)
);

-- ── Kulakan ──────────────────────────────────────────────────────────────

create table purchases (
  id            uuid primary key,
  tenant_id     uuid not null references tenants(id) on delete cascade,
  occurred_at   timestamptz not null default now(),
  supplier_name text,
  total_amount  bigint not null default 0 check (total_amount >= 0),
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index purchases_tenant_time_idx on purchases (tenant_id, occurred_at desc);

create table purchase_items (
  id          uuid primary key,
  tenant_id   uuid not null references tenants(id) on delete cascade,
  purchase_id uuid not null references purchases(id) on delete cascade,
  product_id  uuid references products(id) on delete set null,
  item_name   text not null,
  qty         numeric(12,3) not null check (qty > 0),
  unit_cost   bigint not null check (unit_cost >= 0),
  subtotal    bigint not null
);

create index purchase_items_purchase_idx on purchase_items (tenant_id, purchase_id);

-- ── Pembayaran ───────────────────────────────────────────────────────────

-- Satu tabel untuk DP, cicilan, dan pelunasan — baik untuk penjualan
-- maupun order jahit. Alur pembayarannya identik; memisahkannya berarti
-- menduplikasi setiap query piutang.
create table payments (
  id           uuid primary key,
  tenant_id    uuid not null references tenants(id) on delete cascade,
  subject_type text not null check (subject_type in ('sale', 'tailor_order')),
  subject_id   uuid not null,
  kind         text not null check (
                 kind in ('dp', 'installment', 'settlement', 'full')
               ),
  amount       bigint not null check (amount > 0),
  wallet_id    uuid not null references wallets(id),
  method       text check (method in ('cash', 'qris', 'transfer')),
  occurred_at  timestamptz not null default now(),
  note         text,
  created_at   timestamptz not null default now()
);

create index payments_subject_idx on payments (tenant_id, subject_type, subject_id);
create index payments_tenant_time_idx on payments (tenant_id, occurred_at desc);

-- ── Buku kas ─────────────────────────────────────────────────────────────

-- Pusat dari seluruh aplikasi. Penjualan, order jahit, dan kulakan
-- adalah sumber yang menghasilkan baris di sini.
create table cash_entries (
  id          uuid primary key,
  tenant_id   uuid not null references tenants(id) on delete cascade,
  wallet_id   uuid not null references wallets(id),
  occurred_at timestamptz not null default now(),
  direction   text not null check (direction in ('in', 'out')),
  amount      bigint not null check (amount > 0),
  category    text not null check (
                category in ('sale', 'service', 'receivable', 'capital',
                             'other_in', 'purchase', 'operational',
                             'owner_draw', 'other_out')
              ),
  note        text,
  source_type text,
  source_id   uuid,
  created_by  uuid references auth.users(id),
  -- Penghapusan lunak, bukan keras: baris yang benar-benar hilang tidak
  -- bisa dibedakan dari baris yang belum pernah sampai ke perangkat,
  -- sehingga penghapusan tidak akan pernah tersinkron.
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Arah dan kategori tidak boleh saling bertentangan. Entri "keluar"
  -- berkategori "sale" akan merusak laporan tanpa pernah terlihat
  -- sebagai kesalahan di layar mana pun.
  constraint cash_entries_direction_matches_category check (
    (direction = 'in'  and category in ('sale', 'service', 'receivable',
                                        'capital', 'other_in')) or
    (direction = 'out' and category in ('purchase', 'operational',
                                        'owner_draw', 'other_out'))
  )
);

create index cash_entries_tenant_time_idx
  on cash_entries (tenant_id, occurred_at desc) where deleted_at is null;
create index cash_entries_wallet_idx on cash_entries (tenant_id, wallet_id, occurred_at);
create index cash_entries_category_idx on cash_entries (tenant_id, category, occurred_at);
create index cash_entries_source_idx on cash_entries (tenant_id, source_type, source_id);

-- ── AI ───────────────────────────────────────────────────────────────────

create table ai_jobs (
  id          uuid primary key,
  tenant_id   uuid not null references tenants(id) on delete cascade,
  kind        text not null check (kind in ('catalog_from_photo')),
  input       jsonb,
  output      jsonb,
  status      text not null default 'pending' check (
                status in ('pending', 'running', 'done', 'failed')
              ),
  error       text,
  created_at  timestamptz not null default now(),
  finished_at timestamptz
);

create index ai_jobs_tenant_idx on ai_jobs (tenant_id, created_at desc);

-- ── updated_at otomatis ──────────────────────────────────────────────────

-- Sinkronisasi inkremental menarik perubahan dengan `updated_at > terakhir`.
-- Kalau satu saja pembaruan lupa menyentuh kolom ini, perubahannya tidak
-- akan pernah sampai ke perangkat lain — dan tidak ada pesan error yang
-- menandainya. Karena itu diurus trigger, bukan kode aplikasi.
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
    'tenants', 'wallets', 'products', 'customers', 'sales',
    'tailor_orders', 'purchases', 'cash_entries'
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
