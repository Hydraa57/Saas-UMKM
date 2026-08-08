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

-- ID dompet dikirim perangkat, bukan dibuat peladen. Kalau berbeda,
-- penjualan pertama yang menyusul akan menunjuk dompet yang tidak ada di
-- sini dan gagal karena kunci asing — tepat setelah pengguna mengira
-- catatannya sudah aman.
select create_tenant(
  'aaaaaaaa-0000-0000-0000-000000000001', 'Usaha Satu', 'dagang',
  'aaaaaaaa-ffff-0000-0000-000000000001'
);

select assert_eq(
  (select count(*)::int from tenants), 1, 'pemilik A melihat tenantnya sendiri'
);

select assert_eq(
  (select count(*)::int from wallets
   where id = 'aaaaaaaa-ffff-0000-0000-000000000001'),
  1, 'peladen memakai ID dompet yang dikirim perangkat'
);

select upsert_item(
  'aaaaaaaa-1111-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'barang', 'Rahasia Dagang A', 9999, 1, 'pcs', 50, 5
);

-- Penjualan pertama dari perangkat langsung diterima.
select record_sale(
  'aaaaaaaa-2222-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000001',
  '[{"item_id":"aaaaaaaa-1111-0000-0000-000000000001","item_kind":"barang",
     "item_name":"Rahasia Dagang A","qty":1,"unit_price":9999,"unit_cost":1}]'::jsonb,
  'aaaaaaaa-ffff-0000-0000-000000000001', 9999
);

select assert_eq(
  (select count(*)::int from sales), 1,
  'penjualan pertama dari perangkat langsung diterima peladen'
);

select assert_denied($$
  insert into wallets (id, tenant_id, name, is_default)
  values (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001',
          'Kas Kedua', true)
$$, 'tidak boleh ada dua dompet bawaan');

reset role;

-- ── Tenant B ─────────────────────────────────────────────────────────────

select login_as('22222222-2222-2222-2222-222222222222');
set role authenticated;

select create_tenant('bbbbbbbb-0000-0000-0000-000000000001', 'Usaha Dua', 'jasa');

select assert_eq((select count(*)::int from tenants), 1, 'B tidak melihat tenant A');
select assert_eq((select count(*)::int from wallets), 1, 'B hanya melihat dompetnya sendiri');
select assert_eq((select count(*)::int from items), 0, 'B tidak melihat katalog A');
select assert_eq((select count(*)::int from sales), 0, 'B tidak melihat penjualan A');
select assert_eq((select count(*)::int from stock_movements), 0, 'B tidak melihat mutasi stok A');
select assert_eq(
  (select count(*)::int from memberships), 1,
  'B tidak melihat keanggotaan orang lain'
);

-- ── Yang harus ditolak ───────────────────────────────────────────────────

select assert_denied($$
  insert into items (id, tenant_id, kind, name, price, stock_qty, min_stock)
  values (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001',
          'barang', 'Sisipan', 1, 0, 0)
$$, 'B tidak bisa menyisipkan barang ke katalog A');

select assert_denied($$
  insert into sale_items (id, tenant_id, sale_id, item_kind, item_name,
                          qty, unit_price, subtotal)
  values (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001',
          'aaaaaaaa-2222-0000-0000-000000000001', 'barang', 'Sisipan',
          1, 1, 1)
$$, 'B tidak bisa menyisipkan baris ke struk A');

-- Memindahkan baris sendiri ke tenant lain — cara paling halus
-- menyelundupkan data, karena barisnya memang milik sendiri saat
-- diperiksa. Yang menahannya adalah pemeriksaan atas baris hasil.
select assert_denied($$
  update wallets set tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001'
  where tenant_id = 'bbbbbbbb-0000-0000-0000-000000000001'
$$, 'B tidak bisa memindahkan dompetnya ke tenant A');

reset role;

-- ── Tanpa login ──────────────────────────────────────────────────────────

select login_as(null);
set role authenticated;

select assert_eq((select count(*)::int from items), 0, 'tanpa login katalog tidak terlihat');
select assert_eq((select count(*)::int from sales), 0, 'tanpa login penjualan tidak terlihat');
select assert_eq((select count(*)::int from cash_entries), 0, 'tanpa login buku kas tidak terlihat');

reset role;

-- ── Penjaga untuk tabel yang ditambahkan nanti ───────────────────────────

select assert_eq(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  '', 'setiap tabel di skema public punya RLS aktif'
);

select assert_eq(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and not exists (select 1 from pg_policy p where p.polrelid = c.oid)),
  '', 'setiap tabel punya minimal satu policy'
);

select assert_eq(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id'
   where n.nspname = 'public' and c.relkind = 'r'
     and not exists (select 1 from pg_index i
                     where i.indrelid = c.oid and a.attnum = i.indkey[0])),
  '', 'setiap tabel ber-tenant_id punya indeks yang diawali tenant_id'
);
