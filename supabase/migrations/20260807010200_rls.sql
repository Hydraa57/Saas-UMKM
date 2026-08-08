-- Isolasi antar tenant.
--
-- Empat hal yang menentukan benar dan cepatnya:
--
--   1. Policy dibungkus `(select ...)` supaya PostgreSQL mengevaluasinya
--      sekali sebagai InitPlan, bukan per baris.
--   2. `with check` ditulis eksplisit. Untuk policy `for all`, PostgreSQL
--      memakai ulang `using` kalau `with check` dihilangkan — jadi ini
--      tidak mengubah perilaku hari ini. Yang dijaga adalah hari nanti:
--      begitu policy dipecah per-perintah, atau ada policy `for insert`
--      (yang tidak punya `using`), perilaku implisit itu tidak berlaku.
--   3. Setiap kolom yang dipakai policy sudah diindeks — indeks yang
--      hilang adalah penyebab nomor satu RLS jadi lambat.
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
-- policy-nya berbeda sendiri hampir selalu berbeda karena kelalaian, dan
-- kelalaian di sini berarti kebocoran data.
do $$
declare
  target text;
begin
  foreach target in array array[
    'wallets', 'items', 'sales', 'sale_items', 'sale_sequences',
    'stock_movements', 'purchases', 'purchase_items', 'cash_entries', 'debts'
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

alter table tenants enable row level security;
alter table tenants force row level security;

create policy tenant_read on tenants
  for select to authenticated
  using (id in (select public.current_tenant_ids()));

create policy tenant_update on tenants
  for update to authenticated
  using (
    exists (select 1 from memberships m
            where m.tenant_id = tenants.id and m.user_id = auth.uid()
              and m.role = 'owner')
  )
  with check (
    exists (select 1 from memberships m
            where m.tenant_id = tenants.id and m.user_id = auth.uid()
              and m.role = 'owner')
  );

-- `memberships` menentukan siapa boleh melihat apa, jadi policy-nya tidak
-- boleh bergantung pada `current_tenant_ids()` — itu akan memanggil
-- dirinya sendiri.
alter table memberships enable row level security;
alter table memberships force row level security;

create policy membership_self_read on memberships
  for select to authenticated
  using (user_id = auth.uid());

-- ── Hak akses peran ──────────────────────────────────────────────────────

-- Hak tabel dan RLS adalah dua lapis berbeda: hak menentukan tabel mana
-- yang boleh disentuh, RLS menentukan baris mana. Keduanya harus ada.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant execute on functions to authenticated;

-- `anon` tidak diberi apa pun.
