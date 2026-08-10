-- Jalur tulis.
--
-- Setiap operasi yang menyentuh lebih dari satu tabel dijalankan lewat
-- satu fungsi di sini. Koneksi yang putus di tengah — hal biasa di HP —
-- akan meninggalkan penjualan tanpa entri kas, atau stok yang berkurang
-- tanpa penjualannya, kalau ditulis terpisah. Aplikasi kasir yang
-- angkanya tidak cocok dengan laci kehilangan kepercayaan penggunanya
-- untuk seterusnya.
--
-- Semua idempoten terhadap `id` dari perangkat, supaya pemutaran ulang
-- antrean luring aman. Semua `security invoker` supaya RLS tetap berlaku
-- — kecuali `create_tenant`, yang berjalan saat keanggotaan belum ada.
--
-- Semua memakai `set search_path` tetap: tanpa itu, pemanggil bisa
-- menyisipkan skema di depan `public` dan membuat fungsinya menulis ke
-- tabel yang salah.

-- Sepadan dengan `roundHalfUp` di src/lib/money.ts: setengah menjauh dari
-- nol. `round()` PostgreSQL untuk `numeric` sudah begitu — berbeda dari
-- `Math.round` JavaScript, yang membulatkan nilai negatif ke arah nol.
create or replace function money_round(value numeric)
returns bigint
language sql immutable
set search_path = public, pg_temp
as $$ select round(value)::bigint $$;

-- ── Pembuatan tenant ─────────────────────────────────────────────────────

-- `p_wallet_id` dikirim perangkat, tidak dibuat di sini: pengaturan awal
-- dikerjakan di perangkat lebih dulu supaya kasir bisa langsung jalan
-- tanpa sinyal, dan penjualan pertama menunjuk dompet ini. ID yang
-- berbeda akan membuatnya gagal karena kunci asing, tepat setelah
-- pengguna mengira catatannya sudah aman.
create or replace function create_tenant(
  p_tenant_id     uuid,
  p_name          text,
  p_business_type text default 'lainnya',
  p_wallet_id     uuid default null
)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Tidak ada pengguna yang login';
  end if;

  if exists (select 1 from tenants where id = p_tenant_id) then
    return p_tenant_id;
  end if;

  insert into tenants (id, name, business_type)
  values (p_tenant_id, p_name, p_business_type);

  insert into memberships (id, tenant_id, user_id, role)
  values (gen_random_uuid(), p_tenant_id, v_user_id, 'owner');

  insert into wallets (id, tenant_id, name, kind, is_default, sort_order)
  values (coalesce(p_wallet_id, gen_random_uuid()), p_tenant_id,
          'Kas Utama', 'tunai', true, 1);

  return p_tenant_id;
end;
$$;

-- ── Katalog ──────────────────────────────────────────────────────────────

-- Menyimpan barang atau jasa.
--
-- Stok hanya diterima untuk barang; untuk jasa nilainya dipaksa kosong.
-- Constraint tabel sudah menjaganya, tapi ditegakkan juga di sini supaya
-- pesan galatnya bisa dimengerti pengguna, bukan sekadar pelanggaran
-- constraint.
create or replace function upsert_item(
  p_item_id    uuid,
  p_tenant_id  uuid,
  p_kind       text,
  p_name       text,
  p_price      bigint,
  p_cost_price bigint default 0,
  p_unit       text default 'pcs',
  p_stock_qty  numeric default null,
  p_min_stock  numeric default null,
  p_photo_path text default null,
  p_barcode    text default null
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_stock numeric;
  v_min   numeric;
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
    -- Menimpanya akan diam-diam menghapus mutasi yang sudah tercatat.
    archived_at = null;

  return jsonb_build_object('item_id', p_item_id);
end;
$$;

-- Mengarsipkan, bukan menghapus.
--
-- Barang yang pernah terjual sudah muncul di struk dan di riwayat
-- penjualan. Menghapus barisnya membuat penjualan lama menunjuk sesuatu
-- yang tidak ada lagi, dan laporan bulan lalu berubah setelah dicetak.
-- Yang diarsipkan hanya hilang dari kasir dan katalog.
create or replace function archive_item(p_item_id uuid, p_archived boolean default true)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update items
  set archived_at = case when p_archived then now() else null end,
      updated_at = now()
  where id = p_item_id;

  return jsonb_build_object('item_id', p_item_id, 'archived', p_archived);
end;
$$;

-- ── Nomor struk ──────────────────────────────────────────────────────────

create or replace function next_invoice_no(p_tenant_id uuid, p_year integer)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare v_next integer;
begin
  insert into sale_sequences (tenant_id, year, last_value)
  values (p_tenant_id, p_year, 1)
  on conflict (tenant_id, year)
  do update set last_value = sale_sequences.last_value + 1
  returning last_value into v_next;

  return p_year::text || '-' || lpad(v_next::text, 4, '0');
end;
$$;

-- ── Penjualan ────────────────────────────────────────────────────────────

-- Inti aplikasi. Satu transaksi kasir, dalam satu operasi atomik:
--
--   penjualan + itemnya → stok berkurang (barang saja) → uang masuk
--                       → piutang kalau bayarnya kurang
--
-- p_items: [{ "id", "item_id", "item_kind", "item_name", "qty",
--             "unit_price", "unit_cost" }]
--
-- Urutan larik menentukan urutan baris di struk, jadi `line_no` diambil
-- dari posisinya di sini — bukan dari urutan penyimpanan, yang mengikuti
-- UUID acak dan berbeda tiap kali dibaca.
create or replace function record_sale(
  p_sale_id       uuid,
  p_tenant_id     uuid,
  p_items         jsonb,
  p_wallet_id     uuid,
  p_paid          bigint default 0,
  p_discount      bigint default 0,
  p_method        text default 'tunai',
  p_customer_name text default null,
  p_occurred_at   timestamptz default now(),
  p_note          text default null,
  p_cash_entry_id uuid default null,
  p_debt_id       uuid default null
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_item       jsonb;
  v_pos        integer;
  v_subtotal   bigint := 0;
  v_discount   bigint;
  v_total      bigint;
  v_qty        numeric;
  v_line       bigint;
  v_invoice    text;
  v_applied    bigint;
  v_outstanding bigint;
begin
  if exists (select 1 from sales where id = p_sale_id) then
    select invoice_no into v_invoice from sales where id = p_sale_id;
    return jsonb_build_object(
      'sale_id', p_sale_id, 'invoice_no', v_invoice, 'replayed', true
    );
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'Penjualan tanpa item';
  end if;

  -- Total dihitung ulang di sini, tidak diambil dari klien. Perangkat
  -- boleh salah versi, salah pembulatan, atau dimanipulasi; angka yang
  -- masuk buku kas harus berasal dari satu sumber saja.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_subtotal := v_subtotal + money_round(
      (v_item->>'qty')::numeric * (v_item->>'unit_price')::bigint
    );
  end loop;

  v_discount := least(greatest(coalesce(p_discount, 0), 0), v_subtotal);
  v_total := v_subtotal - v_discount;
  v_invoice := next_invoice_no(p_tenant_id, extract(year from p_occurred_at)::integer);

  -- Uang yang benar-benar diterima tidak pernah melebihi tagihannya;
  -- kelebihannya adalah kembalian, bukan uang usaha.
  v_applied := least(greatest(coalesce(p_paid, 0), 0), v_total);
  v_outstanding := v_total - v_applied;

  insert into sales (
    id, tenant_id, invoice_no, occurred_at, subtotal, discount, total,
    paid, payment_method, wallet_id, customer_name, note, created_by
  )
  values (
    p_sale_id, p_tenant_id, v_invoice, p_occurred_at, v_subtotal, v_discount,
    v_total, v_applied,
    case when v_applied = 0 then 'utang' else p_method end,
    p_wallet_id, nullif(trim(coalesce(p_customer_name, '')), ''), p_note, auth.uid()
  );

  v_pos := 0;
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'qty')::numeric;
    v_line := money_round(v_qty * (v_item->>'unit_price')::bigint);

    insert into sale_items (
      id, tenant_id, sale_id, item_id, item_kind, item_name,
      qty, unit_price, unit_cost, subtotal, line_no
    )
    values (
      coalesce((v_item->>'id')::uuid, gen_random_uuid()),
      p_tenant_id, p_sale_id,
      nullif(v_item->>'item_id', '')::uuid,
      v_item->>'item_kind',
      v_item->>'item_name',
      v_qty,
      (v_item->>'unit_price')::bigint,
      coalesce((v_item->>'unit_cost')::bigint, 0),
      v_line,
      v_pos
    );
    v_pos := v_pos + 1;

    if nullif(v_item->>'item_id', '') is not null then
      -- Stok hanya berkurang untuk barang. Jasa tidak pernah habis, dan
      -- itu bukan kasus khusus yang perlu diingat — kolom stoknya memang
      -- kosong, dan constraint tabel menjamin begitu.
      if v_item->>'item_kind' = 'barang' then
        insert into stock_movements (
          id, tenant_id, item_id, occurred_at, qty_change,
          reason, source_type, source_id
        )
        values (
          gen_random_uuid(), p_tenant_id, (v_item->>'item_id')::uuid,
          p_occurred_at, -v_qty, 'penjualan', 'sale', p_sale_id
        );

        update items set stock_qty = stock_qty - v_qty
        where id = (v_item->>'item_id')::uuid and tenant_id = p_tenant_id;
      end if;

      -- Naik satu per penjualan, bukan per jumlah barang: yang menentukan
      -- urutan grid kasir adalah seberapa sering sesuatu dipilih, bukan
      -- seberapa banyak terjual sekali beli.
      update items set sold_count = sold_count + 1
      where id = (v_item->>'item_id')::uuid and tenant_id = p_tenant_id;
    end if;
  end loop;

  if v_applied > 0 then
    -- Satu entri kas untuk satu penjualan, karena uangnya memang
    -- berpindah sekali. Rincian barang vs jasa dihitung dari
    -- `sale_items`, bukan dari kategori — itu lebih tepat, dan tidak
    -- perlu membagi diskon secara sembarang antar dua kategori.
    insert into cash_entries (
      id, tenant_id, wallet_id, occurred_at, direction, amount,
      kind, category, note, source_type, source_id, created_by
    )
    values (
      coalesce(p_cash_entry_id, gen_random_uuid()), p_tenant_id, p_wallet_id,
      p_occurred_at, 'in', v_applied, 'income', 'penjualan',
      'Struk ' || v_invoice, 'sale', p_sale_id, auth.uid()
    );
  end if;

  -- Kurang bayar jadi piutang, tapi hanya kalau tahu siapa yang berutang.
  -- Piutang tanpa nama tidak bisa ditagih, dan cuma jadi angka yang
  -- membuat laporan terlihat salah.
  if v_outstanding > 0 and nullif(trim(coalesce(p_customer_name, '')), '') is not null then
    insert into debts (
      id, tenant_id, side, person, amount, sale_id, occurred_at, note
    )
    values (
      coalesce(p_debt_id, gen_random_uuid()), p_tenant_id, 'receivable',
      trim(p_customer_name), v_outstanding, p_sale_id, p_occurred_at,
      'Struk ' || v_invoice
    );
  end if;

  return jsonb_build_object(
    'sale_id', p_sale_id,
    'invoice_no', v_invoice,
    'subtotal', v_subtotal,
    'discount', v_discount,
    'total', v_total,
    'paid', v_applied,
    'outstanding', v_outstanding,
    'replayed', false
  );
end;
$$;

-- Membatalkan penjualan: stok kembali, uang ditarik dari buku kas.
-- Penjualannya tidak dihapus — riwayat yang hilang tidak bisa diperiksa,
-- dan pembatalan justru yang paling perlu bisa diperiksa.
create or replace function void_sale(
  p_sale_id   uuid,
  p_tenant_id uuid,
  p_reason    text default null
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_sale sales%rowtype;
  v_item sale_items%rowtype;
begin
  select * into v_sale from sales
  where id = p_sale_id and tenant_id = p_tenant_id;

  if not found then
    raise exception 'Penjualan tidak ditemukan';
  end if;

  if v_sale.voided_at is not null then
    return jsonb_build_object('sale_id', p_sale_id, 'replayed', true);
  end if;

  for v_item in select * from sale_items
                where sale_id = p_sale_id and tenant_id = p_tenant_id
  loop
    if v_item.item_id is not null and v_item.item_kind = 'barang' then
      insert into stock_movements (
        id, tenant_id, item_id, occurred_at, qty_change,
        reason, source_type, source_id, note
      )
      values (
        gen_random_uuid(), p_tenant_id, v_item.item_id, now(),
        v_item.qty, 'retur', 'sale', p_sale_id, p_reason
      );

      update items set stock_qty = stock_qty + v_item.qty
      where id = v_item.item_id and tenant_id = p_tenant_id;
    end if;
  end loop;

  -- Uang dikembalikan sebagai entri kas keluar, bukan dengan menghapus
  -- entri masuknya. Buku kas hanya boleh bertambah barisnya.
  if v_sale.paid > 0 and v_sale.wallet_id is not null then
    insert into cash_entries (
      id, tenant_id, wallet_id, occurred_at, direction, amount,
      kind, category, note, source_type, source_id, created_by
    )
    values (
      gen_random_uuid(), p_tenant_id, v_sale.wallet_id, now(), 'out',
      v_sale.paid, 'expense', 'lainnya',
      coalesce(p_reason, 'Pembatalan struk ' || v_sale.invoice_no),
      'sale', p_sale_id, auth.uid()
    );
  end if;

  update debts set deleted_at = now()
  where sale_id = p_sale_id and tenant_id = p_tenant_id and deleted_at is null;

  update sales set voided_at = now(), note = coalesce(p_reason, note)
  where id = p_sale_id and tenant_id = p_tenant_id;

  return jsonb_build_object('sale_id', p_sale_id, 'replayed', false);
end;
$$;

-- ── Kulakan ──────────────────────────────────────────────────────────────

-- Satu aksi, tiga akibat: stok bertambah, uang keluar tercatat, harga
-- modal diperbarui. Ini yang tidak bisa dilakukan buku tulis.
create or replace function record_purchase(
  p_purchase_id   uuid,
  p_tenant_id     uuid,
  p_items         jsonb,
  p_wallet_id     uuid,
  p_supplier_name text default null,
  p_occurred_at   timestamptz default now(),
  p_note          text default null,
  p_cash_entry_id uuid default null
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_item  jsonb;
  v_total bigint := 0;
  v_qty   numeric;
  v_line  bigint;
begin
  if exists (select 1 from purchases where id = p_purchase_id) then
    return jsonb_build_object('purchase_id', p_purchase_id, 'replayed', true);
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'Kulakan tanpa item';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_total := v_total + money_round(
      (v_item->>'qty')::numeric * (v_item->>'unit_cost')::bigint
    );
  end loop;

  insert into purchases (
    id, tenant_id, occurred_at, supplier_name, total, wallet_id, note
  )
  values (
    p_purchase_id, p_tenant_id, p_occurred_at, p_supplier_name,
    v_total, p_wallet_id, p_note
  );

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'qty')::numeric;
    v_line := money_round(v_qty * (v_item->>'unit_cost')::bigint);

    insert into purchase_items (
      id, tenant_id, purchase_id, item_id, item_name, qty, unit_cost, subtotal
    )
    values (
      coalesce((v_item->>'id')::uuid, gen_random_uuid()),
      p_tenant_id, p_purchase_id,
      nullif(v_item->>'item_id', '')::uuid,
      v_item->>'item_name', v_qty,
      (v_item->>'unit_cost')::bigint, v_line
    );

    if nullif(v_item->>'item_id', '') is not null then
      insert into stock_movements (
        id, tenant_id, item_id, occurred_at, qty_change,
        reason, source_type, source_id
      )
      values (
        gen_random_uuid(), p_tenant_id, (v_item->>'item_id')::uuid,
        p_occurred_at, v_qty, 'kulakan', 'purchase', p_purchase_id
      );

      -- Hanya barang yang punya stok; kalau ada jasa yang nyasar ke
      -- kulakan, `stock_qty`-nya kosong dan penambahan ini tidak
      -- berpengaruh — tapi harga modalnya tetap diperbarui.
      update items
      set stock_qty  = coalesce(stock_qty, 0) + v_qty,
          cost_price = (v_item->>'unit_cost')::bigint
      where id = (v_item->>'item_id')::uuid
        and tenant_id = p_tenant_id
        and kind = 'barang';
    end if;
  end loop;

  insert into cash_entries (
    id, tenant_id, wallet_id, occurred_at, direction, amount,
    kind, category, note, source_type, source_id, created_by
  )
  values (
    coalesce(p_cash_entry_id, gen_random_uuid()), p_tenant_id, p_wallet_id,
    p_occurred_at, 'out', v_total, 'expense', 'modal',
    coalesce(p_note, p_supplier_name), 'purchase', p_purchase_id, auth.uid()
  );

  return jsonb_build_object(
    'purchase_id', p_purchase_id, 'total', v_total, 'replayed', false
  );
end;
$$;

-- ── Koreksi stok ─────────────────────────────────────────────────────────

-- Menyetel stok ke hasil hitung fisik. Yang dicatat adalah selisihnya,
-- bukan angka akhirnya, supaya `stock_movements` tetap bisa dijumlahkan
-- dari nol untuk memeriksa `items.stock_qty`.
create or replace function adjust_stock(
  p_movement_id uuid,
  p_tenant_id   uuid,
  p_item_id     uuid,
  p_counted_qty numeric,
  p_note        text default null
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_kind    text;
  v_current numeric;
  v_delta   numeric;
begin
  if exists (select 1 from stock_movements where id = p_movement_id) then
    return jsonb_build_object('movement_id', p_movement_id, 'replayed', true);
  end if;

  select kind, stock_qty into v_kind, v_current from items
  where id = p_item_id and tenant_id = p_tenant_id;

  if v_kind is null then
    raise exception 'Barang tidak ditemukan';
  end if;
  if v_kind <> 'barang' then
    raise exception 'Jasa tidak punya stok';
  end if;

  v_delta := p_counted_qty - v_current;
  if v_delta = 0 then
    return jsonb_build_object('movement_id', p_movement_id, 'delta', 0);
  end if;

  insert into stock_movements (id, tenant_id, item_id, qty_change, reason, note)
  values (p_movement_id, p_tenant_id, p_item_id, v_delta, 'koreksi', p_note);

  update items set stock_qty = p_counted_qty
  where id = p_item_id and tenant_id = p_tenant_id;

  return jsonb_build_object('movement_id', p_movement_id, 'delta', v_delta);
end;
$$;

-- ── Biaya lain & pemindahan ──────────────────────────────────────────────

create or replace function record_expense(
  p_entry_id    uuid,
  p_tenant_id   uuid,
  p_wallet_id   uuid,
  p_amount      bigint,
  p_category    text,
  p_occurred_at timestamptz default now(),
  p_note        text default null
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from cash_entries where id = p_entry_id) then
    return jsonb_build_object('entry_id', p_entry_id, 'replayed', true);
  end if;

  if p_amount <= 0 then
    raise exception 'Jumlah harus lebih dari nol';
  end if;

  -- Kategori yang punya sumber dibuat lewat fungsinya masing-masing;
  -- kalau bisa dibuat manual, buku kas akan punya baris kulakan yang
  -- tidak berpasangan dengan kulakan mana pun.
  if p_category not in ('operasional', 'upah', 'sewa', 'lainnya') then
    raise exception 'Kategori % dibuat lewat kasir atau kulakan', p_category;
  end if;

  insert into cash_entries (
    id, tenant_id, wallet_id, occurred_at, direction, amount,
    kind, category, note, source_type, created_by
  )
  values (
    p_entry_id, p_tenant_id, p_wallet_id, p_occurred_at, 'out', p_amount,
    'expense', p_category, p_note, 'manual', auth.uid()
  );

  return jsonb_build_object('entry_id', p_entry_id, 'replayed', false);
end;
$$;

create or replace function record_transfer(
  p_transfer_id  uuid,
  p_tenant_id    uuid,
  p_from_wallet  uuid,
  p_to_wallet    uuid,
  p_amount       bigint,
  p_occurred_at  timestamptz default now(),
  p_note         text default null,
  p_out_entry_id uuid default null,
  p_in_entry_id  uuid default null
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare v_count integer;
begin
  if exists (select 1 from cash_entries where transfer_group_id = p_transfer_id) then
    return jsonb_build_object('transfer_id', p_transfer_id, 'replayed', true);
  end if;

  if p_amount <= 0 then
    raise exception 'Jumlah harus lebih dari nol';
  end if;
  if p_from_wallet = p_to_wallet then
    raise exception 'Dompet asal dan tujuan sama';
  end if;

  select count(*) into v_count from wallets
  where id in (p_from_wallet, p_to_wallet)
    and tenant_id = p_tenant_id and archived_at is null;
  if v_count <> 2 then
    raise exception 'Dompet tidak ditemukan';
  end if;

  insert into cash_entries (
    id, tenant_id, wallet_id, occurred_at, direction, amount,
    kind, category, note, transfer_group_id, created_by
  )
  values
    (coalesce(p_out_entry_id, gen_random_uuid()), p_tenant_id, p_from_wallet,
     p_occurred_at, 'out', p_amount, 'transfer', 'pindah', p_note,
     p_transfer_id, auth.uid()),
    (coalesce(p_in_entry_id, gen_random_uuid()), p_tenant_id, p_to_wallet,
     p_occurred_at, 'in', p_amount, 'transfer', 'pindah', p_note,
     p_transfer_id, auth.uid());

  return jsonb_build_object('transfer_id', p_transfer_id, 'replayed', false);
end;
$$;

-- ── Piutang ──────────────────────────────────────────────────────────────

create or replace function pay_debt(
  p_payment_id  uuid,
  p_tenant_id   uuid,
  p_debt_id     uuid,
  p_amount      bigint,
  p_wallet_id   uuid,
  p_occurred_at timestamptz default now()
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_debt    debts%rowtype;
  v_applied bigint;
begin
  if exists (select 1 from cash_entries where id = p_payment_id) then
    return jsonb_build_object('payment_id', p_payment_id, 'replayed', true);
  end if;

  select * into v_debt from debts
  where id = p_debt_id and tenant_id = p_tenant_id and deleted_at is null;
  if not found then
    raise exception 'Utang tidak ditemukan';
  end if;

  v_applied := least(p_amount, v_debt.amount - v_debt.paid_amount);
  if v_applied <= 0 then
    return jsonb_build_object('payment_id', p_payment_id, 'applied', 0,
                              'settled', true);
  end if;

  -- Kategorinya `lainnya`, bukan `penjualan`. Penghasilannya sudah diakui
  -- saat strukya keluar; menghitungnya sebagai penjualan baru berarti
  -- laporan menghitung uang yang sama dua kali.
  insert into cash_entries (
    id, tenant_id, wallet_id, occurred_at, direction, amount,
    kind, category, note, created_by
  )
  values (
    p_payment_id, p_tenant_id, p_wallet_id, p_occurred_at,
    case when v_debt.side = 'receivable' then 'in' else 'out' end,
    v_applied,
    case when v_debt.side = 'receivable' then 'income' else 'expense' end,
    'lainnya',
    case when v_debt.side = 'receivable'
         then 'Bayar utang: ' || v_debt.person
         else 'Lunasi utang kepada: ' || v_debt.person end,
    auth.uid()
  );

  update debts
  set paid_amount = paid_amount + v_applied,
      settled_at  = case when paid_amount + v_applied >= amount
                         then now() else settled_at end
  where id = p_debt_id and tenant_id = p_tenant_id;

  return jsonb_build_object(
    'payment_id', p_payment_id, 'applied', v_applied,
    'settled', v_debt.paid_amount + v_applied >= v_debt.amount,
    'replayed', false
  );
end;
$$;
