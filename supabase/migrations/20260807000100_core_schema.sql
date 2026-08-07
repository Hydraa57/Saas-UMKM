-- Skema inti.
--
-- Dirancang untuk UMKM mikro Indonesia pada umumnya, divalidasi pada satu
-- pengguna nyata (docs/07-temuan-catatan-ibu.md). Kosakatanya umum;
-- pembuktiannya spesifik.
--
-- Prinsip:
--   1. Uang selalu `bigint` rupiah utuh.
--   2. Primary key `uuid` dibuat di perangkat, supaya pencatatan tanpa
--      sinyal tidak menunggu apa pun.
--   3. Riwayat memakai salinan, bukan referensi.
--   4. `tenant_id` di setiap tabel sejak hari pertama.
--
--   5. **Dompet dan buku tegak lurus.**
--
--      Dompet menjawab "uangnya ada di mana" — itu soal saldo.
--      Buku menjawab "kegiatan mana yang menghasilkan atau
--      menghabiskannya" — itu soal laporan.
--
--      Keduanya sengaja tidak diikat. Penelitian menemukan 73% UMKM
--      Indonesia belum memisahkan keuangan usaha dan pribadi, dan
--      mayoritas usaha mikro hanya punya satu rekening untuk keduanya.
--      Kalau buku ditentukan oleh dompet, mereka harus mengarang dompet
--      palsu sebelum bisa memakai fiturnya sama sekali.
--
--      Dengan buku melekat pada tiap entri, pengguna berdompet tunggal
--      tetap bisa memisahkan: belanja dapur yang dibayar dari uang
--      dagangan cukup dicatat sebagai pengeluaran berbuku rumah dari
--      dompet yang sama. Pemisahannya terjadi tepat saat uangnya keluar,
--      bukan menuntut penggunanya sudah memisahkan lebih dulu.

-- ── Tenant & akses ───────────────────────────────────────────────────────

create table tenants (
  id            uuid primary key,
  name          text not null check (length(trim(name)) > 0),

  -- Menentukan pintasan awal yang disemai. Bukan pembatas: kategori dan
  -- pintasan tidak bergantung pada nilai ini setelah tenant dibuat.
  business_type text not null default 'lainnya' check (business_type in (
                  'dagang',    -- warung, toko, kelontong, olshop
                  'makanan',   -- kuliner, katering, gerobak
                  'jasa',      -- jahit, laundry, salon, servis
                  'campuran',  -- barang sekaligus jasa
                  'lainnya'
                )),

  -- Buku rumah tangga bisa dimatikan untuk usaha yang keuangannya sudah
  -- benar-benar terpisah. Menyala secara bawaan karena mayoritas UMKM
  -- mikro belum memisahkannya, dan bagi merekalah buku ini paling berguna.
  household_book boolean not null default true,

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

-- Tempat uang berada: laci, amplop, rekening, e-wallet. Menentukan saldo,
-- bukan menentukan buku.
create table wallets (
  id              uuid primary key,
  tenant_id       uuid not null references tenants(id) on delete cascade,
  name            text not null check (length(trim(name)) > 0),
  kind            text not null default 'tunai'
                  check (kind in ('tunai', 'bank', 'ewallet')),

  -- Sekadar usulan untuk mengisi layar catat, bukan aturan. Boleh kosong,
  -- dan memang kosong untuk pengguna yang dompetnya cuma satu.
  default_book    text check (default_book in ('usaha', 'rumah')),

  opening_balance bigint not null default 0,
  is_default      boolean not null default false,
  sort_order      integer not null default 0,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index wallets_tenant_idx on wallets (tenant_id);

-- Tepat satu dompet bawaan per tenant. Tanpa ini, layar catat harus
-- menebak dompet mana yang dimaksud.
create unique index wallets_one_default_idx
  on wallets (tenant_id)
  where is_default and archived_at is null;

-- ── Buku kas ─────────────────────────────────────────────────────────────

-- Satu-satunya tabel transaksi.
create table cash_entries (
  id          uuid primary key,
  tenant_id   uuid not null references tenants(id) on delete cascade,

  -- Di mana uangnya berpindah.
  wallet_id   uuid not null references wallets(id),

  -- Kegiatan mana yang menghasilkan atau menghabiskannya. Kosong untuk
  -- pemindahan — memindahkan uang antar dompet bukan kegiatan usaha
  -- maupun rumah tangga, cuma uang berpindah tempat.
  book        text check (book in ('usaha', 'rumah')),

  occurred_at timestamptz not null default now(),
  direction   text not null check (direction in ('in', 'out')),
  amount      bigint not null check (amount > 0),
  kind        text not null check (kind in ('income', 'expense', 'transfer')),

  -- Daftar tertutup. Kategori bebas akan berkembang jadi puluhan ejaan
  -- untuk hal yang sama ("bensin", "Bensin", "bensin motor"), dan laporan
  -- yang menjumlahkannya berhenti bisa dipercaya.
  --
  -- Dipilih supaya cukup umum untuk usaha apa pun — warung, kuliner,
  -- laundry, jahit, bengkel — dan memakai kata baku, bukan singkatan.
  category    text not null check (category in (
                -- pemasukan usaha
                'penjualan', 'jasa',
                -- pengeluaran usaha
                'modal', 'operasional', 'upah', 'sewa',
                -- pemasukan rumah
                'gaji', 'pemberian',
                -- pengeluaran rumah
                'belanja', 'transportasi', 'utilitas', 'komunikasi',
                'pendidikan', 'kesehatan', 'sosial', 'angsuran',
                -- di mana saja
                'lainnya', 'pindah'
              )),

  -- Keterangan bebas, seperti di buku tulis: "sayur, tahu, cabai, bensin".
  -- Pengguna tidak memecah per barang, dan memaksanya memecah membuat
  -- aplikasi lebih lambat daripada buku.
  note        text,

  -- Dua sisi sebuah pemindahan berbagi nilai ini.
  transfer_group_id uuid,

  created_by  uuid references auth.users(id),
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Pemasukan dan pengeluaran selalu punya buku; pemindahan tidak pernah.
  -- Tanpa ini, pemindahan bisa bocor ke laporan dan menghitung uang yang
  -- sama dua kali.
  constraint book_only_for_flows check (
    (kind = 'transfer') = (book is null)
  ),
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

-- Rekap bulanan per buku — laporan yang paling sering dibuka.
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
-- Katalog mengharuskan pengguna menyiapkan puluhan barang sebelum bisa
-- mencatat apa pun, dan di situlah orang berhenti. Tabel ini terisi
-- sendiri dari pemakaian: begitu "Potong rambut 15.000" dicatat dua kali,
-- barisnya naik ke atas dan jadi tombol sekali tap.
--
-- Beberapa baris disemai saat pendaftaran sesuai jenis usaha, supaya hari
-- pertama tidak kosong sama sekali. Yang tidak terpakai tenggelam sendiri.
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
-- Aturan yang menentukan bentuknya: **sebuah utang tidak menyentuh buku
-- kas sampai uangnya benar-benar berpindah.** Mencatatnya lebih awal
-- membuat saldo menunjukkan uang yang belum ada di dompet, dan saat itu
-- terjadi penggunanya berhenti percaya pada seluruh angkanya.
create table debts (
  id          uuid primary key,
  tenant_id   uuid not null references tenants(id) on delete cascade,
  book        text not null check (book in ('usaha', 'rumah')),

  -- 'receivable' = orang lain berutang kepada kita.
  -- 'payable'    = kita berutang kepada orang lain.
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
-- pernah sampai ke perangkat lain, tanpa pesan error apa pun.
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
