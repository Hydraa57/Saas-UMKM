-- Mengubah identitas usaha setelah pengaturan awal.
--
-- Sebelumnya nama usaha hanya bisa ditulis sekali, saat `create_tenant`.
-- Itu keliru dan sebabnya sederhana: nama yang diketik terburu-buru di
-- layar pertama — sebelum pemiliknya tahu namanya akan muncul di setiap
-- struk — adalah nama yang paling mungkin ingin diperbaiki.
--
-- **Bukan** `security definer`. Berbeda dari `create_tenant`, yang memang
-- harus berjalan saat keanggotaannya belum ada, fungsi ini dipanggil oleh
-- pemilik yang sudah terdaftar. Menjalankannya sebagai pemanggil berarti
-- policy `tenant_update` yang menentukan siapa boleh mengubah apa, dan
-- aturan itu sudah ada serta sudah diuji — tidak perlu ditulis ulang di
-- sini, dengan risiko dua salinan yang lama-lama berbeda.
--
-- `p_business_type` boleh kosong: mengubah nama tidak boleh diam-diam
-- mengembalikan jenis usaha ke bawaannya.

create or replace function update_tenant(
  p_tenant_id     uuid,
  p_name          text,
  p_business_type text default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Nama usaha tidak boleh kosong';
  end if;

  update tenants
  set name          = trim(p_name),
      business_type = coalesce(p_business_type, business_type),
      updated_at    = now()
  where id = p_tenant_id;

  -- Nol baris berarti policy menahannya — bukan tenant yang tidak ada,
  -- karena `select` pun tidak akan menemukannya. Digagalkan terang-terangan
  -- supaya antrean kirim menggolongkannya permanen dan tidak mengulanginya
  -- selamanya.
  if not found then
    raise exception 'Usaha ini tidak bisa diubah dari akun ini';
  end if;

  return p_tenant_id;
end;
$$;

revoke all on function update_tenant(uuid, text, text) from public, anon;
grant execute on function update_tenant(uuid, text, text) to authenticated;
