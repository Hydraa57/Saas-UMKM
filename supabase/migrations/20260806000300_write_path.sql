-- Jalur tulis.
--
-- Setiap operasi yang menyentuh lebih dari satu tabel dijalankan lewat
-- satu fungsi di sini, bukan beberapa panggilan terpisah dari klien.
--
-- Alasannya langsung berkaitan dengan kriteria penerimaan yang paling
-- keras: saldo aplikasi harus cocok dengan uang di laci. Kalau klien
-- menulis `sales`, lalu `sale_items`, lalu `stock_movements`, lalu
-- `cash_entries` sebagai empat panggilan, maka koneksi yang putus di
-- tengah — hal yang biasa terjadi di HP — meninggalkan penjualan tanpa
-- entri kas. Aplikasi jadi berbohong, dan sekali ibu menemukan angkanya
-- tidak cocok, dia berhenti percaya pada seluruh aplikasi.
--
-- Semua fungsi di sini idempoten terhadap `id` yang dikirim perangkat.
-- Ini yang membuat pemutaran ulang antrean offline aman: kalau jaringan
-- putus setelah peladen memproses tapi sebelum balasannya sampai, klien
-- mengirim ulang dengan UUID yang sama dan hasilnya tetap satu transaksi.
--
-- Fungsi-fungsi ini sengaja `security invoker` (bawaan), supaya RLS tetap
-- berlaku dan isolasi tenant tidak bergantung pada kebenaran kode di sini.
-- Satu-satunya pengecualian adalah `create_tenant`, yang memang berjalan
-- saat keanggotaan belum ada.

-- ── Pembulatan ───────────────────────────────────────────────────────────

-- Harus sepadan dengan `roundHalfUp` di src/lib/money.ts: setengah selalu
-- menjauh dari nol. `round()` PostgreSQL untuk `numeric` sudah berperilaku
-- begitu — berbeda dari `Math.round` JavaScript, yang membulatkan nilai
-- negatif ke arah nol. Kalau keduanya tidak sepadan, subtotal yang dihitung
-- di perangkat dan di peladen bisa berbeda satu rupiah, dan selisih itu
-- akan menumpuk diam-diam.
create or replace function money_round(value numeric)
returns bigint
language sql
immutable
as $$
  select round(value)::bigint
$$;

-- ── Pembuatan tenant ─────────────────────────────────────────────────────

-- `security definer` karena saat dipanggil, penggunanya belum jadi anggota
-- tenant mana pun, sehingga RLS akan menolak semua penulisan.
create or replace function create_tenant(
  p_tenant_id     uuid,
  p_name          text,
  p_business_type text default null,
  p_wallet_id     uuid default null,
  p_membership_id uuid default null
)
returns uuid
language plpgsql
security definer
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
  values (coalesce(p_membership_id, gen_random_uuid()), p_tenant_id, v_user_id, 'owner');

  -- Dompet tunai dibuat sekaligus. Tanpa ini, penjualan pertama akan
  -- gagal karena tidak ada dompet untuk menampung uangnya — dan itu
  -- terjadi persis di menit paling menentukan, saat ibu mencoba
  -- aplikasinya untuk pertama kali.
  insert into wallets (id, tenant_id, name, kind, is_default)
  values (coalesce(p_wallet_id, gen_random_uuid()), p_tenant_id, 'Tunai', 'cash', true);

  return p_tenant_id;
end;
$$;

-- ── Penjualan ────────────────────────────────────────────────────────────

-- p_items: [{ "id", "product_id", "item_name", "qty", "unit_price", "unit_cost" }]
create or replace function record_sale(
  p_sale_id        uuid,
  p_tenant_id      uuid,
  p_items          jsonb,
  p_wallet_id      uuid,
  p_paid_amount    bigint default 0,
  p_discount       bigint default 0,
  p_payment_method text default 'cash',
  p_customer_id    uuid default null,
  p_occurred_at    timestamptz default now(),
  p_note           text default null,
  p_payment_id     uuid default null,
  p_cash_entry_id  uuid default null
)
returns jsonb
language plpgsql
as $$
declare
  v_item      jsonb;
  v_subtotal  bigint := 0;
  v_discount  bigint;
  v_total     bigint;
  v_line      bigint;
  v_qty       numeric;
begin
  -- Idempotensi: pemutaran ulang menghasilkan keadaan yang sama, bukan
  -- penjualan kedua.
  if exists (select 1 from sales where id = p_sale_id) then
    return jsonb_build_object('sale_id', p_sale_id, 'replayed', true);
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

  if p_paid_amount < 0 then
    raise exception 'Jumlah bayar tidak boleh negatif';
  end if;

  insert into sales (
    id, tenant_id, occurred_at, customer_id,
    total_amount, discount_amount, paid_amount, payment_method, note
  )
  values (
    p_sale_id, p_tenant_id, p_occurred_at, p_customer_id,
    v_total, v_discount, least(p_paid_amount, v_total),
    case when p_paid_amount <= 0 then 'unpaid' else p_payment_method end,
    p_note
  );

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'qty')::numeric;
    v_line := money_round(v_qty * (v_item->>'unit_price')::bigint);

    insert into sale_items (
      id, tenant_id, sale_id, product_id, item_name,
      qty, unit_price, unit_cost, subtotal
    )
    values (
      coalesce((v_item->>'id')::uuid, gen_random_uuid()),
      p_tenant_id, p_sale_id,
      nullif(v_item->>'product_id', '')::uuid,
      v_item->>'item_name',
      v_qty,
      (v_item->>'unit_price')::bigint,
      coalesce((v_item->>'unit_cost')::bigint, 0),
      v_line
    );

    -- Baris tanpa produk (tombol "Lainnya") tidak menyentuh stok —
    -- barangnya memang tidak ada di katalog.
    if nullif(v_item->>'product_id', '') is not null then
      insert into stock_movements (
        id, tenant_id, product_id, occurred_at,
        qty_change, reason, source_type, source_id
      )
      values (
        gen_random_uuid(), p_tenant_id, (v_item->>'product_id')::uuid,
        p_occurred_at, -v_qty, 'sale', 'sale', p_sale_id
      );

      -- `sold_count` naik satu per penjualan, bukan per jumlah barang:
      -- yang menentukan urutan grid adalah seberapa sering sebuah produk
      -- dipilih, bukan seberapa banyak terjual sekali beli.
      update products
      set stock_qty = stock_qty - v_qty,
          sold_count = sold_count + 1
      where id = (v_item->>'product_id')::uuid
        and tenant_id = p_tenant_id;
    end if;
  end loop;

  if p_paid_amount > 0 then
    insert into payments (
      id, tenant_id, subject_type, subject_id, kind,
      amount, wallet_id, method, occurred_at
    )
    values (
      coalesce(p_payment_id, gen_random_uuid()), p_tenant_id, 'sale', p_sale_id,
      case when p_paid_amount >= v_total then 'full' else 'installment' end,
      least(p_paid_amount, v_total), p_wallet_id, p_payment_method, p_occurred_at
    );

    insert into cash_entries (
      id, tenant_id, wallet_id, occurred_at, direction,
      amount, category, source_type, source_id, created_by
    )
    values (
      coalesce(p_cash_entry_id, gen_random_uuid()), p_tenant_id, p_wallet_id,
      p_occurred_at, 'in', least(p_paid_amount, v_total), 'sale',
      'sale', p_sale_id, auth.uid()
    );
  end if;

  return jsonb_build_object(
    'sale_id', p_sale_id,
    'subtotal', v_subtotal,
    'discount', v_discount,
    'total', v_total,
    'replayed', false
  );
end;
$$;

-- Membatalkan penjualan: mengembalikan stok dan menarik uangnya dari
-- buku kas. Penjualan tidak dihapus — riwayat yang hilang tidak bisa
-- diperiksa, dan pembatalan justru hal yang paling perlu bisa diperiksa.
create or replace function void_sale(
  p_sale_id   uuid,
  p_tenant_id uuid,
  p_reason    text default null
)
returns jsonb
language plpgsql
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
    if v_item.product_id is not null then
      insert into stock_movements (
        id, tenant_id, product_id, occurred_at,
        qty_change, reason, source_type, source_id, note
      )
      values (
        gen_random_uuid(), p_tenant_id, v_item.product_id, now(),
        v_item.qty, 'return', 'sale', p_sale_id, p_reason
      );

      update products
      set stock_qty = stock_qty + v_item.qty
      where id = v_item.product_id and tenant_id = p_tenant_id;
    end if;
  end loop;

  -- Uang yang sudah diterima dikembalikan sebagai entri kas keluar,
  -- bukan dengan menghapus entri masuknya. Buku kas hanya boleh
  -- bertambah barisnya.
  if v_sale.paid_amount > 0 then
    insert into cash_entries (
      id, tenant_id, wallet_id, occurred_at, direction,
      amount, category, note, source_type, source_id, created_by
    )
    select
      gen_random_uuid(), p_tenant_id, ce.wallet_id, now(), 'out',
      v_sale.paid_amount, 'other_out',
      coalesce(p_reason, 'Pembatalan penjualan'), 'sale', p_sale_id, auth.uid()
    from cash_entries ce
    where ce.source_type = 'sale' and ce.source_id = p_sale_id
      and ce.tenant_id = p_tenant_id and ce.direction = 'in'
    limit 1;
  end if;

  update sales set voided_at = now(), note = coalesce(p_reason, note)
  where id = p_sale_id and tenant_id = p_tenant_id;

  return jsonb_build_object('sale_id', p_sale_id, 'replayed', false);
end;
$$;

-- ── Kulakan ──────────────────────────────────────────────────────────────

-- Satu aksi, tiga akibat: stok bertambah, uang keluar tercatat, dan harga
-- modal produk diperbarui. Inilah yang tidak bisa dilakukan buku tulis.
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
as $$
declare
  v_item  jsonb;
  v_total bigint := 0;
  v_line  bigint;
  v_qty   numeric;
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
    id, tenant_id, occurred_at, supplier_name, total_amount, note
  )
  values (
    p_purchase_id, p_tenant_id, p_occurred_at, p_supplier_name, v_total, p_note
  );

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'qty')::numeric;
    v_line := money_round(v_qty * (v_item->>'unit_cost')::bigint);

    insert into purchase_items (
      id, tenant_id, purchase_id, product_id, item_name, qty, unit_cost, subtotal
    )
    values (
      coalesce((v_item->>'id')::uuid, gen_random_uuid()),
      p_tenant_id, p_purchase_id,
      nullif(v_item->>'product_id', '')::uuid,
      v_item->>'item_name',
      v_qty,
      (v_item->>'unit_cost')::bigint,
      v_line
    );

    if nullif(v_item->>'product_id', '') is not null then
      insert into stock_movements (
        id, tenant_id, product_id, occurred_at,
        qty_change, reason, source_type, source_id
      )
      values (
        gen_random_uuid(), p_tenant_id, (v_item->>'product_id')::uuid,
        p_occurred_at, v_qty, 'purchase', 'purchase', p_purchase_id
      );

      -- Harga modal diperbarui ke harga kulakan terakhir. Penjualan
      -- berikutnya menyalin nilai ini ke `sale_items.unit_cost`, jadi
      -- laporan untung mengikuti harga yang benar-benar dibayar terakhir.
      update products
      set stock_qty = stock_qty + v_qty,
          cost_price = (v_item->>'unit_cost')::bigint
      where id = (v_item->>'product_id')::uuid
        and tenant_id = p_tenant_id;
    end if;
  end loop;

  insert into cash_entries (
    id, tenant_id, wallet_id, occurred_at, direction,
    amount, category, note, source_type, source_id, created_by
  )
  values (
    coalesce(p_cash_entry_id, gen_random_uuid()), p_tenant_id, p_wallet_id,
    p_occurred_at, 'out', v_total, 'purchase',
    coalesce(p_note, p_supplier_name), 'purchase', p_purchase_id, auth.uid()
  );

  return jsonb_build_object(
    'purchase_id', p_purchase_id, 'total', v_total, 'replayed', false
  );
end;
$$;

-- ── Pembayaran ───────────────────────────────────────────────────────────

-- DP, cicilan, dan pelunasan — untuk penjualan maupun order jahit.
create or replace function record_payment(
  p_payment_id    uuid,
  p_tenant_id     uuid,
  p_subject_type  text,
  p_subject_id    uuid,
  p_amount        bigint,
  p_wallet_id     uuid,
  p_kind          text default 'installment',
  p_method        text default 'cash',
  p_occurred_at   timestamptz default now(),
  p_note          text default null,
  p_cash_entry_id uuid default null
)
returns jsonb
language plpgsql
as $$
declare
  v_total     bigint;
  v_paid      bigint;
  v_applied   bigint;
  v_category  text;
begin
  if exists (select 1 from payments where id = p_payment_id) then
    return jsonb_build_object('payment_id', p_payment_id, 'replayed', true);
  end if;

  if p_amount <= 0 then
    raise exception 'Jumlah pembayaran harus lebih dari nol';
  end if;

  if p_subject_type = 'sale' then
    select total_amount, paid_amount into v_total, v_paid
    from sales where id = p_subject_id and tenant_id = p_tenant_id;
    -- Pelunasan penjualan lama adalah pelunasan piutang, bukan pendapatan
    -- baru — pendapatannya sudah diakui saat barangnya berpindah.
    v_category := 'receivable';
  elsif p_subject_type = 'tailor_order' then
    select price, paid_amount into v_total, v_paid
    from tailor_orders where id = p_subject_id and tenant_id = p_tenant_id;
    -- DP dan pelunasan jahit dikategorikan sebagai jasa; pengakuan
    -- pendapatannya diatur terpisah oleh status order, bukan oleh
    -- kapan uangnya masuk.
    v_category := 'service';
  else
    raise exception 'Jenis subjek tidak dikenal: %', p_subject_type;
  end if;

  if v_total is null then
    raise exception 'Transaksi yang mau dibayar tidak ditemukan';
  end if;

  -- Kelebihan bayar tidak disimpan sebagai utang aplikasi ke pelanggan.
  -- Sisanya jadi kembalian, dan itu urusan layar bayar.
  v_applied := least(p_amount, greatest(v_total - v_paid, 0));

  if v_applied = 0 then
    return jsonb_build_object(
      'payment_id', p_payment_id, 'applied', 0, 'settled', true, 'replayed', false
    );
  end if;

  insert into payments (
    id, tenant_id, subject_type, subject_id, kind,
    amount, wallet_id, method, occurred_at, note
  )
  values (
    p_payment_id, p_tenant_id, p_subject_type, p_subject_id,
    case when v_paid + v_applied >= v_total then 'settlement' else p_kind end,
    v_applied, p_wallet_id, p_method, p_occurred_at, p_note
  );

  if p_subject_type = 'sale' then
    update sales set paid_amount = paid_amount + v_applied
    where id = p_subject_id and tenant_id = p_tenant_id;
  else
    update tailor_orders set paid_amount = paid_amount + v_applied
    where id = p_subject_id and tenant_id = p_tenant_id;
  end if;

  insert into cash_entries (
    id, tenant_id, wallet_id, occurred_at, direction,
    amount, category, note, source_type, source_id, created_by
  )
  values (
    coalesce(p_cash_entry_id, gen_random_uuid()), p_tenant_id, p_wallet_id,
    p_occurred_at, 'in', v_applied, v_category, p_note,
    p_subject_type, p_subject_id, auth.uid()
  );

  return jsonb_build_object(
    'payment_id', p_payment_id,
    'applied', v_applied,
    'settled', v_paid + v_applied >= v_total,
    'replayed', false
  );
end;
$$;

-- ── Entri kas manual ─────────────────────────────────────────────────────

-- Untuk biaya jalan, "ambil buat rumah", dan "tambah modal".
create or replace function record_cash(
  p_entry_id    uuid,
  p_tenant_id   uuid,
  p_direction   text,
  p_amount      bigint,
  p_category    text,
  p_wallet_id   uuid,
  p_occurred_at timestamptz default now(),
  p_note        text default null
)
returns jsonb
language plpgsql
as $$
begin
  if exists (select 1 from cash_entries where id = p_entry_id) then
    return jsonb_build_object('entry_id', p_entry_id, 'replayed', true);
  end if;

  if p_amount <= 0 then
    raise exception 'Jumlah harus lebih dari nol';
  end if;

  -- Kategori yang punya sumber (penjualan, kulakan, pembayaran) tidak
  -- boleh dibuat lewat jalur manual — kalau bisa, buku kas akan punya
  -- baris penjualan yang tidak berpasangan dengan penjualan mana pun.
  if p_category in ('sale', 'purchase', 'receivable') then
    raise exception
      'Kategori % dibuat lewat record_sale/record_purchase/record_payment',
      p_category;
  end if;

  insert into cash_entries (
    id, tenant_id, wallet_id, occurred_at, direction,
    amount, category, note, source_type, created_by
  )
  values (
    p_entry_id, p_tenant_id, p_wallet_id, p_occurred_at, p_direction,
    p_amount, p_category, p_note, 'manual', auth.uid()
  );

  return jsonb_build_object('entry_id', p_entry_id, 'replayed', false);
end;
$$;

-- ── Order jahit ──────────────────────────────────────────────────────────

create or replace function next_order_no(p_tenant_id uuid, p_year integer)
returns text
language plpgsql
as $$
declare
  v_next integer;
begin
  insert into tailor_order_sequences (tenant_id, year, last_value)
  values (p_tenant_id, p_year, 1)
  on conflict (tenant_id, year)
  do update set last_value = tailor_order_sequences.last_value + 1
  returning last_value into v_next;

  return p_year::text || '-' || lpad(v_next::text, 4, '0');
end;
$$;

create or replace function create_tailor_order(
  p_order_id       uuid,
  p_tenant_id      uuid,
  p_customer_id    uuid,
  p_garment_type   text,
  p_price          bigint,
  p_wallet_id      uuid,
  p_dp_amount      bigint default 0,
  p_promised_date  date default null,
  p_description    text default null,
  p_qty            integer default 1,
  p_measurement    jsonb default null,
  p_note           text default null,
  p_occurred_at    timestamptz default now(),
  p_payment_id     uuid default null,
  p_cash_entry_id  uuid default null
)
returns jsonb
language plpgsql
as $$
declare
  v_order_no text;
  v_dp       bigint;
begin
  if exists (select 1 from tailor_orders where id = p_order_id) then
    select order_no into v_order_no from tailor_orders where id = p_order_id;
    return jsonb_build_object(
      'order_id', p_order_id, 'order_no', v_order_no, 'replayed', true
    );
  end if;

  v_order_no := next_order_no(
    p_tenant_id, extract(year from p_occurred_at)::integer
  );
  v_dp := least(greatest(coalesce(p_dp_amount, 0), 0), p_price);

  insert into tailor_orders (
    id, tenant_id, customer_id, order_no, garment_type, description,
    qty, price, paid_amount, promised_date, status,
    measurement_snapshot, note, created_at
  )
  values (
    p_order_id, p_tenant_id, p_customer_id, v_order_no, p_garment_type,
    p_description, coalesce(p_qty, 1), p_price, v_dp, p_promised_date,
    'queued', p_measurement, p_note, p_occurred_at
  );

  if v_dp > 0 then
    insert into payments (
      id, tenant_id, subject_type, subject_id, kind,
      amount, wallet_id, method, occurred_at
    )
    values (
      coalesce(p_payment_id, gen_random_uuid()), p_tenant_id,
      'tailor_order', p_order_id,
      case when v_dp >= p_price then 'full' else 'dp' end,
      v_dp, p_wallet_id, 'cash', p_occurred_at
    );

    insert into cash_entries (
      id, tenant_id, wallet_id, occurred_at, direction,
      amount, category, note, source_type, source_id, created_by
    )
    values (
      coalesce(p_cash_entry_id, gen_random_uuid()), p_tenant_id, p_wallet_id,
      p_occurred_at, 'in', v_dp, 'service',
      'DP ' || v_order_no, 'tailor_order', p_order_id, auth.uid()
    );
  end if;

  return jsonb_build_object(
    'order_id', p_order_id, 'order_no', v_order_no, 'replayed', false
  );
end;
$$;

-- Perpindahan status order jahit.
--
-- Aturan perpindahannya diulang di sini, bukan hanya dipercayakan ke
-- klien, karena satu perangkat dengan versi lama sudah cukup untuk
-- membuat order melompat dari "antre" langsung ke "sudah diambil"
-- tanpa pernah dikerjakan.
create or replace function set_tailor_status(
  p_order_id  uuid,
  p_tenant_id uuid,
  p_status    text
)
returns jsonb
language plpgsql
as $$
declare
  v_current text;
  v_allowed text[];
begin
  select status into v_current from tailor_orders
  where id = p_order_id and tenant_id = p_tenant_id;

  if v_current is null then
    raise exception 'Order tidak ditemukan';
  end if;

  if v_current = p_status then
    return jsonb_build_object('order_id', p_order_id, 'replayed', true);
  end if;

  v_allowed := case v_current
    when 'queued'      then array['in_progress', 'done', 'cancelled']
    when 'in_progress' then array['done', 'queued', 'cancelled']
    when 'done'        then array['picked_up', 'in_progress']
    else array[]::text[]
  end;

  if not (p_status = any(v_allowed)) then
    raise exception 'Tidak bisa mengubah status dari % ke %', v_current, p_status;
  end if;

  update tailor_orders
  set status = p_status,
      started_at   = case when p_status = 'in_progress'
                          then coalesce(started_at, now()) else started_at end,
      completed_at = case when p_status = 'done'
                          then coalesce(completed_at, now()) else completed_at end,
      picked_up_at = case when p_status = 'picked_up'
                          then coalesce(picked_up_at, now()) else picked_up_at end
  where id = p_order_id and tenant_id = p_tenant_id;

  return jsonb_build_object(
    'order_id', p_order_id, 'status', p_status, 'replayed', false
  );
end;
$$;

-- ── Koreksi stok ─────────────────────────────────────────────────────────

-- Menyetel stok ke jumlah hasil hitung fisik. Yang dicatat adalah
-- selisihnya, bukan angka akhirnya — supaya `stock_movements` tetap bisa
-- dijumlahkan dari nol untuk memeriksa `products.stock_qty`.
create or replace function adjust_stock(
  p_movement_id uuid,
  p_tenant_id   uuid,
  p_product_id  uuid,
  p_counted_qty numeric,
  p_note        text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_current numeric;
  v_delta   numeric;
begin
  if exists (select 1 from stock_movements where id = p_movement_id) then
    return jsonb_build_object('movement_id', p_movement_id, 'replayed', true);
  end if;

  select stock_qty into v_current from products
  where id = p_product_id and tenant_id = p_tenant_id;

  if v_current is null then
    raise exception 'Produk tidak ditemukan';
  end if;

  v_delta := p_counted_qty - v_current;

  if v_delta = 0 then
    return jsonb_build_object('movement_id', p_movement_id, 'delta', 0);
  end if;

  insert into stock_movements (
    id, tenant_id, product_id, qty_change, reason, note
  )
  values (p_movement_id, p_tenant_id, p_product_id, v_delta, 'correction', p_note);

  update products set stock_qty = p_counted_qty
  where id = p_product_id and tenant_id = p_tenant_id;

  return jsonb_build_object('movement_id', p_movement_id, 'delta', v_delta);
end;
$$;
