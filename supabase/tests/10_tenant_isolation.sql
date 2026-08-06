-- Isolasi antar tenant.
--
-- Ini pengujian keamanan, bukan pengujian fitur, dan satu-satunya cara
-- memastikan RLS benar-benar aktif di setiap tabel — termasuk tabel yang
-- ditambahkan berbulan-bulan dari sekarang oleh orang yang lupa
-- mengaktifkannya.
--
-- Semua dijalankan sebagai peran `authenticated`, bukan superuser.
-- Superuser melewati RLS tanpa peduli policy apa pun, jadi pengujian yang
-- dijalankan sebagai superuser akan selalu lulus dan tidak membuktikan
-- apa-apa.

\set ON_ERROR_STOP on

-- Dua pemilik usaha yang tidak saling kenal.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ibu@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'orang.lain@example.com');

-- ── Tenant A ─────────────────────────────────────────────────────────────

select login_as('11111111-1111-1111-1111-111111111111');
set role authenticated;

select create_tenant(
  'aaaaaaaa-0000-0000-0000-000000000001',
  'Warung Ibu',
  'toko_jasa',
  'aaaaaaaa-0000-0000-0000-0000000f0001'
);

select assert_eq(
  (select count(*)::int from tenants), 1,
  'pemilik A melihat tenantnya sendiri'
);

select assert_eq(
  (select count(*)::int from wallets where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  1,
  'dompet tunai dibuat otomatis bersama tenant'
);

insert into products (id, tenant_id, name, sell_price, cost_price, stock_qty)
values (
  'aaaaaaaa-1111-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'Biskuit Roma', 5000, 3500, 100
);

reset role;

-- ── Tenant B ─────────────────────────────────────────────────────────────

select login_as('22222222-2222-2222-2222-222222222222');
set role authenticated;

select create_tenant(
  'bbbbbbbb-0000-0000-0000-000000000001',
  'Toko Sebelah'
);

insert into products (id, tenant_id, name, sell_price, cost_price, stock_qty)
values (
  'bbbbbbbb-1111-0000-0000-000000000001',
  'bbbbbbbb-0000-0000-0000-000000000001',
  'Rahasia Dagang', 9999, 1, 50
);

-- ── Yang harus tidak terlihat ────────────────────────────────────────────

select assert_eq(
  (select count(*)::int from products), 1,
  'B hanya melihat produknya sendiri, bukan produk A'
);

select assert_eq(
  (select count(*)::int from products
   where id = 'aaaaaaaa-1111-0000-0000-000000000001'),
  0,
  'produk A tidak bisa dibaca B walau ID-nya diketahui'
);

select assert_eq(
  (select count(*)::int from tenants), 1,
  'B tidak melihat tenant A'
);

select assert_eq(
  (select count(*)::int from wallets), 1,
  'B tidak melihat dompet A'
);

select assert_eq(
  (select count(*)::int from memberships), 1,
  'B tidak melihat keanggotaan orang lain'
);

-- ── Yang harus ditolak ───────────────────────────────────────────────────

-- Menulis ke tenant lain: `with check` yang harus menahannya.
select assert_denied($$
  insert into products (id, tenant_id, name, sell_price)
  values (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 'Sisipan', 1)
$$, 'B tidak bisa menyisipkan produk ke tenant A');

select assert_denied($$
  insert into cash_entries (id, tenant_id, wallet_id, direction, amount, category)
  select gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001',
         'aaaaaaaa-0000-0000-0000-0000000f0001', 'in', 1, 'sale'
$$, 'B tidak bisa menyisipkan entri kas ke tenant A');

-- Memindahkan baris sendiri ke tenant lain — cara paling halus untuk
-- menyelundupkan data, karena barisnya memang milik sendiri saat
-- diperiksa `using`. Yang menahannya adalah pemeriksaan atas baris
-- *hasil* perubahan.
select assert_denied($$
  update products
  set tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001'
  where id = 'bbbbbbbb-1111-0000-0000-000000000001'
$$, 'B tidak bisa memindahkan produknya ke tenant A');

-- `update` yang menyasar baris tenant lain tidak melempar galat; ia
-- hanya tidak menemukan baris apa pun. Yang diperiksa adalah datanya
-- tetap utuh.
update products set sell_price = 1
where id = 'aaaaaaaa-1111-0000-0000-000000000001';

delete from products where id = 'aaaaaaaa-1111-0000-0000-000000000001';

reset role;
select login_as('11111111-1111-1111-1111-111111111111');
set role authenticated;

select assert_eq(
  (select sell_price from products where id = 'aaaaaaaa-1111-0000-0000-000000000001'),
  5000::bigint,
  'harga produk A tidak berubah oleh update dari B'
);

select assert_eq(
  (select count(*)::int from products where id = 'aaaaaaaa-1111-0000-0000-000000000001'),
  1,
  'produk A tidak terhapus oleh delete dari B'
);

reset role;

-- ── Tanpa login ──────────────────────────────────────────────────────────

select login_as(null);
set role authenticated;

select assert_eq(
  (select count(*)::int from products), 0,
  'tanpa login tidak ada produk yang terlihat'
);
select assert_eq(
  (select count(*)::int from cash_entries), 0,
  'tanpa login tidak ada entri kas yang terlihat'
);

reset role;

-- ── Semua tabel wajib punya RLS ──────────────────────────────────────────

-- Penjaga untuk masa depan: tabel baru yang lupa diaktifkan RLS-nya akan
-- membuat pengujian ini gagal, jauh sebelum datanya bocor di produksi.
select assert_eq(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and not c.relrowsecurity),
  '',
  'setiap tabel di skema public punya RLS aktif'
);

select assert_eq(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and not exists (select 1 from pg_policy p where p.polrelid = c.oid)),
  '',
  'setiap tabel punya minimal satu policy'
);

-- Kolom yang dipakai policy harus terindeks — indeks yang hilang adalah
-- penyebab nomor satu RLS menjadi lambat.
select assert_eq(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id'
   where n.nspname = 'public'
     and c.relkind = 'r'
     and not exists (
       select 1 from pg_index i
       where i.indrelid = c.oid and a.attnum = i.indkey[0]
     )),
  '',
  'setiap tabel ber-tenant_id punya indeks yang diawali tenant_id'
);
