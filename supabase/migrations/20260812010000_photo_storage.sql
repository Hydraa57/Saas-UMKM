-- Penyimpanan foto barang.
--
-- Sampai sekarang foto katalog hanya ada sebagai blob di IndexedDB satu
-- HP. Katalognya sendiri sudah tersalin ke peladen, jadi kalau HP-nya
-- hilang, yang kembali adalah daftar barang **tanpa satu pun fotonya** —
-- dan pada kasir yang seluruh cara pakainya "ketuk fotonya", katalog
-- tanpa foto praktis harus diisi ulang dari nol.
--
-- Ember **tidak publik.** Foto snack memang bukan rahasia, tapi ember
-- publik berarti tautan yang bocor sekali bisa dibuka selamanya oleh
-- siapa pun, dan tidak ada yang didapat sebagai gantinya: layar kasir
-- membaca foto dari blob di perangkat, bukan dari peladen. Salinan di
-- peladen cuma dipakai saat memulihkan ke HP baru, dan saat itu
-- pemakainya sudah login.

insert into storage.buckets (id, name, public)
values ('foto-barang', 'foto-barang', false)
on conflict (id) do nothing;

-- Nama berkasnya `<tenant_id>/<item_id>`. Map folder pertama ke tenant
-- adalah seluruh dasar keamanannya, jadi ia diperiksa di keempat policy —
-- bukan cuma saat menulis.
--
-- `storage.foldername(name)` mengembalikan larik segmen jalur; segmen
-- pertama itulah tenant-nya. Kalau namanya tidak berbentuk UUID, cast-nya
-- akan gagal dan barisnya tidak cocok — yang berarti ditolak, bukan
-- diloloskan.

drop policy if exists foto_barang_baca on storage.objects;
create policy foto_barang_baca on storage.objects
  for select to authenticated
  using (
    bucket_id = 'foto-barang'
    and (storage.foldername(name))[1] in (
      select id::text from tenants where id in (select public.current_tenant_ids())
    )
  );

drop policy if exists foto_barang_tulis on storage.objects;
create policy foto_barang_tulis on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'foto-barang'
    and (storage.foldername(name))[1] in (
      select id::text from tenants where id in (select public.current_tenant_ids())
    )
  );

drop policy if exists foto_barang_ganti on storage.objects;
create policy foto_barang_ganti on storage.objects
  for update to authenticated
  using (
    bucket_id = 'foto-barang'
    and (storage.foldername(name))[1] in (
      select id::text from tenants where id in (select public.current_tenant_ids())
    )
  );

drop policy if exists foto_barang_hapus on storage.objects;
create policy foto_barang_hapus on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'foto-barang'
    and (storage.foldername(name))[1] in (
      select id::text from tenants where id in (select public.current_tenant_ids())
    )
  );

-- Menandai di mana foto sebuah barang tersimpan.
--
-- Fungsi sendiri, bukan `upsert_item`, dan itu disengaja: pengunggahan
-- foto selesai belakangan dan terpisah dari penyimpanan barangnya.
-- Memakai `upsert_item` berarti mengirim ulang seluruh isi barang —
-- termasuk stok — hanya untuk menuliskan satu kolom, dan stok yang
-- ikut terkirim dari salinan lama adalah cara paling mudah membuat angka
-- di rak dan di layar berhenti cocok.
create or replace function set_item_photo(
  p_item_id    uuid,
  p_photo_path text
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update items
  set photo_path = nullif(trim(coalesce(p_photo_path, '')), ''),
      updated_at = now()
  where id = p_item_id;

  if not found then
    raise exception 'Barang ini tidak bisa diubah dari akun ini';
  end if;
end;
$$;

revoke all on function set_item_photo(uuid, text) from public, anon;
grant execute on function set_item_photo(uuid, text) to authenticated;
