-- Isolasi antar tenant.
--
-- Diaktifkan sejak hari pertama meski UI-nya masih satu toko. Menambahkan
-- isolasi belakangan berarti menyentuh ulang setiap tabel dan setiap
-- query — dan satu tabel yang terlewat berarti data satu usaha terlihat
-- oleh usaha lain.
--
-- Empat hal yang menentukan benar dan cepatnya:
--
--   1. Policy dibungkus `(select ...)` supaya PostgreSQL mengevaluasinya
--      sekali sebagai InitPlan. Tanpa itu, fungsinya dipanggil ulang
--      untuk setiap baris yang diperiksa.
--   2. `with check` ditulis eksplisit, tidak cuma `using`. Untuk policy
--      `for all`, PostgreSQL sebenarnya memakai ulang `using` sebagai
--      pemeriksa penulisan kalau `with check` dihilangkan — jadi
--      menuliskannya tidak mengubah perilaku hari ini. Yang dijaga adalah
--      hari nanti: begitu policy ini dipecah per-perintah, atau ada policy
--      `for insert` (yang tidak punya `using` sama sekali), perilaku
--      implisit itu tidak berlaku lagi dan penulisan lintas-tenant jadi
--      terbuka.
--   3. Setiap kolom yang dipakai policy sudah diindeks di migrasi
--      sebelumnya — indeks yang hilang adalah penyebab nomor satu RLS
--      menjadi lambat.
--   4. Fungsi bantunya `security definer`, supaya pengecekan keanggotaan
--      tidak ikut disaring RLS dan tidak menimbulkan rekursi policy.

create or replace function public.current_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select tenant_id from public.memberships where user_id = auth.uid()
$$;

revoke all on function public.current_tenant_ids() from public;
grant execute on function public.current_tenant_ids() to authenticated;

-- Ditulis sebagai perulangan, bukan disalin sekian kali: tabel yang
-- policy-nya berbeda sendiri dari yang lain hampir selalu berbeda karena
-- kelalaian, dan kelalaian di sini berarti kebocoran data.
do $$
declare
  target text;
begin
  foreach target in array array[
    'wallets', 'cash_entries', 'quick_entries', 'debts'
  ]
  loop
    execute format('alter table %I enable row level security', target);
    execute format('alter table %I force row level security', target);
    execute format(
      'create policy tenant_rw on %I
         for all
         to authenticated
         using      (tenant_id in (select public.current_tenant_ids()))
         with check (tenant_id in (select public.current_tenant_ids()))',
      target
    );
  end loop;
end;
$$;

-- `tenants` tidak punya kolom `tenant_id`; kuncinya kolom `id` sendiri.
alter table tenants enable row level security;
alter table tenants force row level security;

create policy tenant_read on tenants
  for select
  to authenticated
  using (id in (select public.current_tenant_ids()));

create policy tenant_update on tenants
  for update
  to authenticated
  using (
    exists (
      select 1 from memberships m
      where m.tenant_id = tenants.id
        and m.user_id = auth.uid()
        and m.role = 'owner'
    )
  )
  with check (
    exists (
      select 1 from memberships m
      where m.tenant_id = tenants.id
        and m.user_id = auth.uid()
        and m.role = 'owner'
    )
  );

-- `memberships` menentukan siapa boleh melihat apa, jadi policy-nya tidak
-- boleh bergantung pada `current_tenant_ids()` — itu akan memanggil
-- dirinya sendiri.
alter table memberships enable row level security;
alter table memberships force row level security;

create policy membership_self_read on memberships
  for select
  to authenticated
  using (user_id = auth.uid());

-- Pembuatan tenant lewat fungsi ber-`security definer` di migrasi
-- berikutnya, bukan `insert` langsung dari klien. Membiarkan klien
-- menulis ke tabel ini berarti membiarkan siapa pun menambahkan dirinya
-- ke tenant orang lain.

-- ── Hak akses peran ──────────────────────────────────────────────────────

-- Hak tabel dan RLS adalah dua lapis berbeda: hak menentukan tabel mana
-- yang boleh disentuh, RLS menentukan baris mana. Keduanya harus ada;
-- hak tanpa RLS berarti semua baris terbuka, RLS tanpa hak berarti tidak
-- ada yang bisa dibaca sama sekali.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant execute on functions to authenticated;

-- `anon` tidak diberi apa pun. Tidak ada data di aplikasi ini yang boleh
-- dibaca tanpa login.
