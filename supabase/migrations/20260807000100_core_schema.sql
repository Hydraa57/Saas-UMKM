-- Skema inti.
--
-- Ditulis ulang setelah melihat catatan ibu yang sebenarnya
-- (docs/07-temuan-catatan-ibu.md). Versi sebelumnya dirancang untuk POS
-- dengan katalog produk, stok, dan order jahit berjangka — tidak satu pun
-- dari itu ada di bukunya. Migrasi lama diganti, bukan ditumpuk migrasi
-- baru, karena belum pernah ada yang dijalankan di produksi.
--
-- Prinsip yang bertahan dari versi sebelumnya:
--   1. Uang selalu `bigint` rupiah utuh.
--   2. Primary key `uuid` dibuat di perangkat, supaya pencatatan tanpa
--      sinyal tidak menunggu apa pun.
--   3. Riwayat memakai salinan, bukan referensi.
--   4. `tenant_id` di setiap tabel sejak hari pertama.
--
-- Yang baru, dan berasal langsung dari bukunya:
--   5. **Dua buku.** Ibu memisahkan uang hasil kerjanya dari uang belanja
--      pemberian bapak, dan sudah menjalankannya bertahun-tahun. Aplikasi
--      mengikuti pemisahan itu, tidak mencampurnya lalu memberi label.
--   6. **Dompet adalah wadah nyata.** Ibu benar-benar memisahkan uang ke
--      dompet berbeda. Ini bukan abstraksi akuntansi, ini benda.

-- ── Tenant & akses ───────────────────────────────────────────────────────

create table tenants (
  id            uuid primary key,
  name          text not null check (length(trim(name)) > 0),
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

-- `book` menentukan dompet ini bagian dari uang usaha atau uang rumah.
-- Dua nilai saja, dan sengaja tidak dibuat tabel tersendiri: ibu punya
-- dua buku, bukan sejumlah buku yang bisa bertambah. Tabel referensi
-- untuk dua nilai tetap hanya menambah join di setiap query.
create table wallets (
  id              uuid primary key,
  tenant_id       uuid not null references tenants(id) on delete cascade,
  name            text not null check (length(trim(name)) > 0),
  book            text not null check (book in ('usaha', 'rumah')),
  kind            text not null default 'cash' check (kind in ('cash', 'bank', 'ewallet')),
  opening_balance bigint not null default 0,
  is_default      boolean not null default false,
  sort_order      integer not null default 0,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index wallets_tenant_idx on wallets (tenant_id);
create index wallets_book_idx on wallets (tenant_id, book) where archived_at is null;

-- Satu dompet bawaan per buku. Tanpa ini, layar catat harus menebak
-- dompet mana yang dimaksud — dan tebakan yang salah soal uang selalu
-- ketahuan belakangan, saat isi dompet tidak cocok dengan catatan.
create unique index wallets_one_default_per_book_idx
  on wallets (tenant_id, book)
  where is_default and archived_at is null;

-- ── Buku kas ─────────────────────────────────────────────────────────────

-- Satu-satunya tabel transaksi di aplikasi ini.
--
-- Versi sebelumnya punya sales, sale_items, purchases, purchase_items,
-- stock_movements, tailor_orders, payments, dan customer_measurements.
-- Semuanya dibangun untuk mencatat hal yang ternyata tidak pernah ibu
-- catat. Yang benar-benar ada di bukunya: tanggal, keterangan, nominal.
create table cash_entries (
  id          uuid primary key,
  tenant_id   uuid not null references tenants(id) on delete cascade,
  wallet_id   uuid not null references wallets(id),

  -- Disalin dari dompet saat entri dibuat, bukan dibaca lewat join.
  -- Kalau nanti sebuah dompet dipindah bukunya, riwayat lama tidak boleh
  -- ikut berpindah — laporan bulan lalu harus tetap seperti waktu itu.
  book        text not null check (book in ('usaha', 'rumah')),

  occurred_at timestamptz not null default now(),
  direction   text not null check (direction in ('in', 'out')),
  amount      bigint not null check (amount > 0),

  -- 'income'/'expense' ikut hitungan laporan; 'transfer' tidak.
  -- Memindahkan uang antar dompet bukan penghasilan dan bukan biaya,
  -- tapi tetap harus terlihat di saldo masing-masing dompet.
  kind        text not null check (kind in ('income', 'expense', 'transfer')),

  -- Daftar tertutup. Kategori bebas akan berkembang jadi puluhan ejaan
  -- untuk hal yang sama ("bensin", "Bensin", "bensin motor"), dan rekap
  -- bulanan yang menjumlahkannya berhenti bisa dipercaya.
  --
  -- Isinya diambil dari kata yang benar-benar dipakai ibu di bukunya:
  -- belanja, listrik, gas, bensin, arisan. Pasangan buku/kategori yang
  -- masuk akal ditegakkan di jalur tulis, bukan di sini.
  category    text not null check (category in (
                -- pemasukan usaha
                'jahit', 'snack',
                -- pemasukan rumah
                'dari_bapak',
                -- pengeluaran usaha
                'modal', 'operasional',
                -- pengeluaran rumah
                'belanja', 'listrik_air', 'gas', 'transport',
                'arisan', 'sekolah', 'kesehatan',
                -- keduanya
                'lain', 'pindah'
              )),

  -- Keterangan bebas, seperti di buku: "syr, tahu, cabe, bensin".
  -- Ibu tidak memecah per barang, dan memaksanya memecah akan membuat
  -- aplikasi lebih lambat daripada bukunya.
  note        text,

  -- Dua sisi sebuah pemindahan berbagi nilai ini.
  transfer_group_id uuid,

  created_by  uuid references auth.users(id),
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Pemindahan wajib berpasangan; tanpa ini, satu sisi yang gagal
  -- tersimpan akan terlihat seperti uang yang lenyap.
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

-- Rekap bulanan per buku — laporan yang paling sering dibuka, dan yang
-- selama ini ibu hitung tangan.
create index cash_entries_book_idx
  on cash_entries (tenant_id, book, kind, occurred_at) where deleted_at is null;

create index cash_entries_wallet_idx
  on cash_entries (tenant_id, wallet_id, occurred_at) where deleted_at is null;

create index cash_entries_category_idx
  on cash_entries (tenant_id, category, occurred_at) where deleted_at is null;

create index cash_entries_transfer_idx
  on cash_entries (tenant_id, transfer_group_id) where transfer_group_id is not null;

-- ── Pintasan ─────────────────────────────────────────────────────────────

-- Menggantikan katalog produk.
--
-- Katalog mengharuskan ibu menyiapkan puluhan barang sebelum bisa
-- mencatat apa pun, dan itu tempat orang berhenti. Tabel ini terisi
-- sendiri dari pemakaian: begitu ibu mencatat "Potong 30.000" dua kali,
-- barisnya naik ke atas dan jadi tombol sekali tap.
--
-- Tidak ada layar pengaturan, tidak ada gerbang di awal, dan daftarnya
-- selalu menggambarkan apa yang benar-benar sering terjadi — bukan apa
-- yang dikira sering saat mengisi katalog.
create table quick_entries (
  id             uuid primary key,
  tenant_id      uuid not null references tenants(id) on delete cascade,
  book           text not null check (book in ('usaha', 'rumah')),
  kind           text not null check (kind in ('income', 'expense')),
  category       text not null,
  label          text not null,
  default_amount bigint not null default 0 check (default_amount >= 0),
  use_count      integer not null default 0,
  last_used_at   timestamptz,
  archived_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (tenant_id, book, kind, category, label)
);

create index quick_entries_popular_idx
  on quick_entries (tenant_id, book, kind, use_count desc)
  where archived_at is null;

-- ── Utang & piutang ──────────────────────────────────────────────────────

-- Sengaja kecil dan berdiri sendiri.
--
-- Ibu tidak mencatat utang secara rapi — di buku belanja, "hutang" cuma
-- muncul sebagai salah satu kata dalam keterangan. Tapi berutang memang
-- terjadi, dan lupa menagih adalah kerugian yang nyata. Jadi tabelnya ada,
-- tapi tidak menjadi pusat apa pun: sebuah utang tidak menyentuh buku kas
-- sampai uangnya benar-benar berpindah.
create table debts (
  id          uuid primary key,
  tenant_id   uuid not null references tenants(id) on delete cascade,
  book        text not null check (book in ('usaha', 'rumah')),

  -- 'receivable' = orang lain berutang ke ibu.
  -- 'payable'    = ibu berutang ke orang lain.
  side        text not null check (side in ('receivable', 'payable')),

  person      text not null check (length(trim(person)) > 0),
  amount      bigint not null check (amount > 0),
  paid_amount bigint not null default 0 check (paid_amount >= 0),
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

-- Sinkronisasi inkremental menarik perubahan dengan `updated_at > terakhir`.
-- Satu pembaruan yang lupa menyentuh kolom ini berarti perubahannya tidak
-- pernah sampai ke perangkat lain, tanpa pesan error apa pun. Karena itu
-- diurus trigger, bukan kode aplikasi.
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
    'tenants', 'wallets', 'cash_entries', 'quick_entries', 'debts'
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
