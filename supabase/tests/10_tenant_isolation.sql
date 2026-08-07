-- Isolasi antar tenant.
--
-- Pengujian keamanan, bukan pengujian fitur. Semua dijalankan sebagai
-- peran `authenticated`, bukan superuser — superuser melewati RLS tanpa
-- peduli policy apa pun, jadi pengujian yang dijalankan sebagai superuser
-- selalu lulus dan tidak membuktikan apa-apa.

\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ibu@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'orang.lain@example.com')
on conflict (id) do nothing;

-- ── Tenant A ─────────────────────────────────────────────────────────────

select login_as('11111111-1111-1111-1111-111111111111');
set role authenticated;

select create_tenant('aaaaaaaa-0000-0000-0000-000000000001', 'Catatan Ibu');

select assert_eq(
  (select count(*)::int from tenants), 1,
  'pemilik A melihat tenantnya sendiri'
);

-- Dompet bawaan mencontoh dompet fisik yang sudah ibu pisahkan sendiri.
select assert_eq(
  (select count(*)::int from wallets
   where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  3,
  'tiga dompet bawaan dibuat bersama tenant'
);

select assert_eq(
  (select count(*)::int from wallets where book = 'usaha'), 2,
  'dua dompet usaha: jahit dan snack'
);

select assert_eq(
  (select count(*)::int from wallets where book = 'rumah'), 1,
  'satu dompet rumah'
);

-- Tepat satu dompet bawaan per buku, kalau tidak layar catat harus
-- menebak dompet mana yang dimaksud.
select assert_eq(
  (select count(*)::int from wallets where is_default), 2,
  'satu dompet bawaan per buku'
);

select assert_denied($$
  insert into wallets (id, tenant_id, name, book, is_default)
  values (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001',
          'Dompet Kedua', 'usaha', true)
$$, 'tidak boleh ada dua dompet bawaan dalam satu buku');

reset role;

-- ── Tenant B ─────────────────────────────────────────────────────────────

select login_as('22222222-2222-2222-2222-222222222222');
set role authenticated;

select create_tenant('bbbbbbbb-0000-0000-0000-000000000001', 'Warung Sebelah');

select assert_eq(
  (select count(*)::int from tenants), 1,
  'B tidak melihat tenant A'
);

select assert_eq(
  (select count(*)::int from wallets), 3,
  'B hanya melihat dompetnya sendiri'
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
         w.id, 'usaha', 'in', 50000, 'income', 'jahit'
  from wallets w limit 1
$$, 'B tidak bisa menyisipkan entri ke tenant A');

select assert_denied($$
  insert into debts (id, tenant_id, book, side, person, amount)
  values (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001',
          'usaha', 'receivable', 'Sisipan', 1000)
$$, 'B tidak bisa menyisipkan utang ke tenant A');

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
