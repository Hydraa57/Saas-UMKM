-- Isolasi antar tenant.
--
-- Pengujian keamanan, bukan pengujian fitur. Dijalankan sebagai peran
-- `authenticated`, bukan superuser — superuser melewati RLS tanpa peduli
-- policy apa pun, jadi pengujian yang dijalankan sebagai superuser selalu
-- lulus dan tidak membuktikan apa-apa.

\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'satu@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'dua@example.com')
on conflict (id) do nothing;

-- ── Tenant A ─────────────────────────────────────────────────────────────

select login_as('11111111-1111-1111-1111-111111111111');
set role authenticated;

select create_tenant(
  'aaaaaaaa-0000-0000-0000-000000000001', 'Usaha Satu', 'campuran'
);

select assert_eq(
  (select count(*)::int from tenants), 1,
  'pemilik A melihat tenantnya sendiri'
);

-- Satu dompet saja secara bawaan. Mayoritas usaha mikro memang cuma
-- punya satu tempat uang, dan membuatkan beberapa dompet di awal memaksa
-- pengguna memilih sesuatu yang belum dia butuhkan.
select assert_eq(
  (select count(*)::int from wallets
   where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  1,
  'satu dompet bawaan, bukan beberapa'
);

select assert_eq(
  (select bool_and(default_book is null) from wallets
   where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  true,
  'dompet bawaan tidak terikat buku mana pun'
);

-- ID dompet dikirim perangkat, bukan dibuat peladen. Kalau berbeda,
-- entri pertama yang menyusul akan menunjuk dompet yang tidak ada di
-- sini dan gagal karena kunci asing — tepat setelah pengguna mengira
-- catatannya sudah aman.
select create_tenant(
  'aaaaaaaa-0000-0000-0000-000000000002', 'Usaha Dengan Dompet Kiriman',
  'jasa', true, 'aaaaaaaa-dddd-0000-0000-000000000001'
);

select assert_eq(
  (select count(*)::int from wallets
   where id = 'aaaaaaaa-dddd-0000-0000-000000000001'),
  1,
  'peladen memakai ID dompet yang dikirim perangkat'
);

-- Dan entri yang menyusul benar-benar bisa memakainya.
select record_entry(
  gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000002',
  'aaaaaaaa-dddd-0000-0000-000000000001', 'usaha', 'income', 15000, 'jasa'
);

select assert_eq(
  (select count(*)::int from cash_entries
   where wallet_id = 'aaaaaaaa-dddd-0000-0000-000000000001'),
  1,
  'entri pertama dari perangkat langsung diterima peladen'
);

select assert_denied($$
  insert into wallets (id, tenant_id, name, is_default)
  values (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001',
          'Dompet Kedua', true)
$$, 'tidak boleh ada dua dompet bawaan');

-- Pintasan awal disemai sesuai jenis usaha supaya hari pertama tidak
-- kosong sama sekali.
select assert_eq(
  (select count(*)::int from quick_entries
   where book = 'usaha' and tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  3,
  'jenis usaha campuran disemai pintasan barang sekaligus jasa'
);

select assert_eq(
  (select count(*)::int from quick_entries
   where book = 'rumah' and tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  2,
  'buku rumah disemai pintasan belanja dan transportasi'
);

reset role;

-- ── Tenant B: buku rumah dimatikan ───────────────────────────────────────

select login_as('22222222-2222-2222-2222-222222222222');
set role authenticated;

select create_tenant(
  'bbbbbbbb-0000-0000-0000-000000000001', 'Usaha Dua', 'dagang', false
);

select assert_eq(
  (select count(*)::int from quick_entries where book = 'rumah'), 0,
  'buku rumah yang dimatikan tidak disemai pintasan'
);

select assert_eq(
  (select household_book from tenants), false,
  'usaha yang keuangannya sudah terpisah bisa mematikan buku rumah'
);

-- ── Yang harus tidak terlihat ────────────────────────────────────────────

select assert_eq(
  (select count(*)::int from tenants), 1, 'B tidak melihat tenant A'
);
select assert_eq(
  (select count(*)::int from wallets), 1, 'B hanya melihat dompetnya sendiri'
);
select assert_eq(
  (select count(*)::int from quick_entries), 2,
  'B hanya melihat pintasannya sendiri'
);
select assert_eq(
  (select count(*)::int from memberships), 1,
  'B tidak melihat keanggotaan orang lain'
);

-- ── Yang harus ditolak ───────────────────────────────────────────────────

select assert_denied($$
  insert into cash_entries (id, tenant_id, wallet_id, book, direction,
                            amount, kind, category)
  select gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001',
         w.id, 'usaha', 'in', 50000, 'income', 'penjualan'
  from wallets w limit 1
$$, 'B tidak bisa menyisipkan entri ke tenant A');

select assert_denied($$
  update wallets set tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001'
  where tenant_id = 'bbbbbbbb-0000-0000-0000-000000000001'
$$, 'B tidak bisa memindahkan dompetnya ke tenant A');

reset role;

-- ── Tanpa login ──────────────────────────────────────────────────────────

select login_as(null);
set role authenticated;

select assert_eq(
  (select count(*)::int from cash_entries), 0,
  'tanpa login tidak ada entri yang terlihat'
);
select assert_eq(
  (select count(*)::int from wallets), 0,
  'tanpa login tidak ada dompet yang terlihat'
);

reset role;

-- ── Penjaga untuk tabel yang ditambahkan nanti ───────────────────────────

select assert_eq(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  '',
  'setiap tabel di skema public punya RLS aktif'
);

select assert_eq(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and not exists (select 1 from pg_policy p where p.polrelid = c.oid)),
  '',
  'setiap tabel punya minimal satu policy'
);

select assert_eq(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id'
   where n.nspname = 'public' and c.relkind = 'r'
     and not exists (
       select 1 from pg_index i
       where i.indrelid = c.oid and a.attnum = i.indkey[0]
     )),
  '',
  'setiap tabel ber-tenant_id punya indeks yang diawali tenant_id'
);
