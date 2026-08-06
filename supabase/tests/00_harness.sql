-- Harness pengujian.
--
-- Meniru bagian Supabase yang dipakai migrasi — skema `auth`, tabel
-- `auth.users`, fungsi `auth.uid()`, dan peran `authenticated` — supaya
-- migrasi dan RLS bisa dijalankan sungguhan di PostgreSQL polos, tanpa
-- Docker dan tanpa proyek Supabase.
--
-- Ini bukan tiruan yang lengkap, dan tidak perlu. Yang penting: RLS,
-- fungsi `security definer`, dan seluruh jalur tulis benar-benar
-- dieksekusi, bukan sekadar diperiksa sintaksnya.

create extension if not exists pgcrypto;

create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key,
  email text
);

-- Di Supabase, `auth.uid()` membaca klaim `sub` dari JWT. Di sini nilainya
-- disetel langsung lewat parameter sesi, supaya tiap kasus uji bisa
-- berpura-pura menjadi pengguna yang berbeda.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('test.user_id', true), '')::uuid
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end;
$$;

grant usage on schema public to authenticated, anon;
grant usage on schema auth to authenticated, anon;
grant select on auth.users to authenticated;

-- ── Penegasan ────────────────────────────────────────────────────────────

create or replace function assert(condition boolean, label text)
returns void
language plpgsql
as $$
begin
  if condition is not true then
    raise exception 'GAGAL: %', label;
  end if;
  raise notice '  ok  %', label;
end;
$$;

create or replace function assert_eq(actual anyelement, expected anyelement, label text)
returns void
language plpgsql
as $$
begin
  if actual is distinct from expected then
    raise exception 'GAGAL: % — dapat %, harusnya %', label, actual, expected;
  end if;
  raise notice '  ok  %', label;
end;
$$;

-- Menegaskan bahwa sebuah perintah memang ditolak. Dipakai untuk menguji
-- RLS: pengujian keamanan harus membuktikan yang terlarang benar-benar
-- gagal, bukan cuma yang diizinkan berhasil.
create or replace function assert_denied(sql text, label text)
returns void
language plpgsql
as $$
begin
  begin
    execute sql;
  exception
    -- Cara-cara sah sebuah perintah ditolak: policy RLS
    -- (insufficient_privilege), constraint tabel (check_violation),
    -- relasi yang masih dirujuk (foreign_key_violation), dan
    -- `raise exception` di dalam fungsi jalur tulis (raise_exception).
    -- Sengaja tidak menangkap `others` — galat sintaks di dalam `sql`
    -- akan terlihat seperti penolakan yang berhasil, dan pengujiannya
    -- lulus tanpa menguji apa pun.
    when insufficient_privilege
      or check_violation
      or foreign_key_violation
      or raise_exception then
      raise notice '  ok  %', label;
      return;
  end;
  raise exception 'GAGAL: % — perintah seharusnya ditolak tapi berhasil', label;
end;
$$;

create or replace function login_as(user_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('test.user_id', user_id::text, false);
end;
$$;
