-- Stok awal harus punya mutasinya sendiri.
--
-- Ditemukan uji asap: setelah barang dibuat dengan stok 10, dijual 2,
-- dikulak 20, lalu dikoreksi jadi 25 — penjumlahan seluruh mutasinya
-- menghasilkan 15, sementara `items.stock_qty` menunjukkan 25. Selisih
-- 10, persis sebesar stok awalnya.
--
-- Sebabnya: `upsert_item` menulis `stock_qty` langsung tanpa mutasi
-- pasangannya. Itu melanggar satu-satunya aturan yang membuat angka stok
-- bisa dipercaya:
--
--   > Setiap perubahan `stock_qty` menulis satu baris `stock_movements`
--   > di transaksi yang sama.
--
-- Tanpa aturan itu, `stock_movements` berhenti jadi kebenaran yang bisa
-- dipakai memeriksa rollup-nya, dan selisih stok tidak lagi bisa
-- dijelaskan — cuma bisa ditimpa. Bagi pemilik warung yang stoknya tidak
-- cocok dengan rak, "tidak tahu kenapa" adalah awal dari berhenti
-- memakai angkanya sama sekali.

alter table stock_movements drop constraint stock_movements_reason_check;

alter table stock_movements add constraint stock_movements_reason_check
  check (reason in ('awal', 'penjualan', 'kulakan', 'koreksi', 'retur', 'rusak'));

-- Versi lama dibuang lebih dulu, bukan di-`create or replace`.
--
-- Menambah parameter mengubah tanda tangannya, dan `create or replace`
-- dengan tanda tangan berbeda **menambah overload** alih-alih mengganti.
-- Akibatnya panggilan lama jadi ambigu dan seluruh jalur katalog mati
-- dengan "function upsert_item(...) is not unique".
drop function if exists upsert_item(
  uuid, uuid, text, text, bigint, bigint, text, numeric, numeric, text, text
);

-- `p_movement_id` dikirim perangkat supaya pemutaran ulang antrean tidak
-- membuat mutasi awal dua kali. Kosong berarti tidak ada stok awal yang
-- perlu dicatat.
create or replace function upsert_item(
  p_item_id     uuid,
  p_tenant_id   uuid,
  p_kind        text,
  p_name        text,
  p_price       bigint,
  p_cost_price  bigint default 0,
  p_unit        text default 'pcs',
  p_stock_qty   numeric default null,
  p_min_stock   numeric default null,
  p_photo_path  text default null,
  p_barcode     text default null,
  p_movement_id uuid default null
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_stock numeric;
  v_min   numeric;
  v_baru  boolean;
begin
  if p_kind not in ('barang', 'jasa') then
    raise exception 'Jenis harus barang atau jasa';
  end if;

  -- Jasa tidak pernah habis. "Potong celana" tidak punya stok, dan
  -- memaksanya punya berarti kasir suatu saat akan menolak menjualnya.
  if p_kind = 'jasa' then
    v_stock := null;
    v_min := null;
  else
    v_stock := coalesce(p_stock_qty, 0);
    v_min := coalesce(p_min_stock, 0);
  end if;

  v_baru := not exists (select 1 from items where id = p_item_id);

  insert into items (
    id, tenant_id, kind, name, price, cost_price, unit,
    stock_qty, min_stock, photo_path, barcode
  )
  values (
    p_item_id, p_tenant_id, p_kind, trim(p_name), p_price, p_cost_price,
    p_unit, v_stock, v_min, p_photo_path, nullif(trim(coalesce(p_barcode, '')), '')
  )
  on conflict (id) do update set
    name       = excluded.name,
    price      = excluded.price,
    cost_price = excluded.cost_price,
    unit       = excluded.unit,
    photo_path = coalesce(excluded.photo_path, items.photo_path),
    barcode    = excluded.barcode,
    min_stock  = excluded.min_stock,
    -- Stok **tidak** ditimpa di sini. Jumlah stok berubah lewat
    -- penjualan, kulakan, dan koreksi — bukan lewat menyunting katalog.
    archived_at = null;

  -- Hanya saat barangnya benar-benar baru. Menyunting katalog tidak
  -- mengubah stok, jadi tidak ada mutasi yang boleh lahir dari situ.
  if v_baru and p_kind = 'barang' and v_stock <> 0 then
    insert into stock_movements (
      id, tenant_id, item_id, qty_change, reason, note
    )
    values (
      coalesce(p_movement_id, gen_random_uuid()), p_tenant_id, p_item_id,
      v_stock, 'awal', 'Stok saat barang didaftarkan'
    )
    on conflict (id) do nothing;
  end if;

  return jsonb_build_object('item_id', p_item_id);
end;
$$;
