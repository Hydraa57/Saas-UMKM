-- Pengerasan, ditulis setelah menjalankan advisor Supabase pada proyek
-- sungguhan. Tiga temuan yang benar-benar berlaku; sisanya sengaja
-- dibiarkan dan alasannya dicatat di bawah.

-- ── 1. `anon` tidak boleh memanggil apa pun ──────────────────────────────
--
-- Supabase memberi `anon` hak eksekusi pada setiap fungsi baru di skema
-- `public` lewat default privileges, dan hak itu **tidak** hilang dengan
-- `revoke ... from public` — ia grant eksplisit, bukan warisan `public`.
--
-- Akibatnya seluruh jalur tulis bisa dipanggil tanpa login lewat
-- `/rest/v1/rpc/...`. Sebagian besar gagal sendiri karena RLS, dan
-- `create_tenant` menolak saat `auth.uid()` kosong — tapi mengandalkan
-- setiap fungsi menjaga dirinya sendiri adalah cara yang salah. Yang
-- benar: pintunya ditutup satu kali di sini.

revoke execute on all functions in schema public from anon;
revoke execute on all functions in schema public from public;

-- Dan untuk fungsi yang ditambahkan nanti, supaya lubangnya tidak
-- terbuka lagi diam-diam pada migrasi berikutnya.
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke execute on functions from public;

grant execute on all functions in schema public to authenticated;
alter default privileges in schema public grant execute on functions to authenticated;

-- Advisor Supabase tetap menandai dua fungsi `security definer` yang
-- masih bisa dipanggil `authenticated`, dan keduanya memang disengaja:
--
--   * `create_tenant` — justru harus bisa dipanggil pengguna yang baru
--     login, karena keanggotaannya belum ada saat itu. Ia menolak sendiri
--     kalau `auth.uid()` kosong.
--   * `current_tenant_ids` — dipanggil dari dalam policy RLS, dan policy
--     dievaluasi dengan hak peran yang bertanya. Mencabut haknya membuat
--     seluruh RLS berhenti bekerja. Ia hanya mengembalikan tenant milik
--     pemanggilnya sendiri.
--
-- Dibiarkan sadar, bukan terlewat.

-- ── 2. `auth.uid()` dievaluasi sekali, bukan per baris ───────────────────
--
-- Dua policy ini memanggil `auth.uid()` telanjang, jadi PostgreSQL
-- mengevaluasinya ulang untuk setiap baris. Dibungkus `(select ...)`
-- supaya jadi InitPlan — sama seperti policy tabel lain yang sudah
-- memakai `(select public.current_tenant_ids())`.

drop policy if exists tenant_update on tenants;
create policy tenant_update on tenants
  for update to authenticated
  using (
    exists (select 1 from memberships m
            where m.tenant_id = tenants.id
              and m.user_id = (select auth.uid())
              and m.role = 'owner')
  )
  with check (
    exists (select 1 from memberships m
            where m.tenant_id = tenants.id
              and m.user_id = (select auth.uid())
              and m.role = 'owner')
  );

drop policy if exists membership_self_read on memberships;
create policy membership_self_read on memberships
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ── 3. Indeks kunci asing yang benar-benar dipakai ───────────────────────
--
-- `void_sale` menjalankan `update debts ... where sale_id = ?` tanpa
-- menyebut `tenant_id`, jadi indeks gabungan yang diawali `tenant_id`
-- tidak menolongnya sama sekali.
create index if not exists debts_sale_idx on debts (sale_id)
  where sale_id is not null;

-- Kunci asing lain yang dilaporkan advisor sengaja dibiarkan tanpa
-- indeks tersendiri:
--
--   * `sale_items(sale_id)`, `purchase_items(purchase_id)`,
--     `stock_movements(item_id)` — setiap query aplikasi selalu menyebut
--     `tenant_id`, dan indeks gabungan yang sudah ada persis melayani
--     itu. Yang tidak terlayani hanya cascade delete, dan baris induknya
--     tidak pernah dihapus: penjualan dibatalkan, barang diarsipkan.
--   * `*_created_by` ke `auth.users` — hanya terpakai kalau sebuah akun
--     dihapus, dan itu operasi yang boleh lambat.
--
-- Indeks yang tidak dipakai bukan gratis: setiap penulisan ikut
-- memperbaruinya, dan jalur kasir adalah jalur yang paling sering
-- menulis.
