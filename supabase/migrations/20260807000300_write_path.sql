-- Jalur tulis.
--
-- Setiap operasi yang menyentuh lebih dari satu baris dijalankan lewat
-- satu fungsi di sini. Koneksi yang putus di tengah — hal biasa di HP —
-- akan meninggalkan separuh pemindahan uang kalau ditulis terpisah, dan
-- aplikasi yang angkanya tidak cocok dengan isi dompet kehilangan
-- kepercayaan penggunanya untuk seterusnya.
--
-- Semua idempoten terhadap `id` dari perangkat, supaya pemutaran ulang
-- antrean luring aman. Semua `security invoker` supaya RLS tetap berlaku
-- — kecuali `create_tenant`, yang berjalan saat keanggotaan belum ada.

-- ── Pasangan buku dan kategori ───────────────────────────────────────────

-- Kategori tidak boleh nyasar buku. "Belanja" di buku usaha atau
-- "penjualan" di buku rumah akan merusak laporan tanpa pernah terlihat
-- salah di layar mana pun.
--
-- `lainnya` sengaja sah di mana saja: selalu ada hal yang tidak masuk
-- kategori mana pun, dan pengguna yang terjebak tanpa pilihan akan
-- berhenti mencatat sama sekali.
create or replace function category_fits(
  p_book text, p_kind text, p_category text
)
returns boolean
language sql
immutable
as $$
  select case
    when p_kind = 'transfer' then p_category = 'pindah'
    when p_category = 'lainnya' then p_book in ('usaha', 'rumah')
    when p_book = 'usaha' and p_kind = 'income'
      then p_category in ('penjualan', 'jasa')
    when p_book = 'usaha' and p_kind = 'expense'
      then p_category in ('modal', 'operasional', 'upah', 'sewa')
    when p_book = 'rumah' and p_kind = 'income'
      then p_category in ('gaji', 'pemberian')
    when p_book = 'rumah' and p_kind = 'expense'
      then p_category in ('belanja', 'transportasi', 'utilitas',
                          'komunikasi', 'pendidikan', 'kesehatan',
                          'sosial', 'angsuran')
    else false
  end
$$;

-- ── Pembuatan tenant ─────────────────────────────────────────────────────

-- `p_wallet_id` dikirim perangkat, tidak dibuat di sini.
--
-- Pengaturan awal dikerjakan di perangkat lebih dulu supaya pencatatan
-- bisa langsung jalan tanpa sinyal. Kalau peladen membuat ID dompetnya
-- sendiri, entri pertama yang menyusul akan menunjuk dompet yang tidak
-- ada di sana — dan gagal karena kunci asing, tepat setelah pengguna
-- mengira catatannya sudah aman.
create or replace function create_tenant(
  p_tenant_id      uuid,
  p_name           text,
  p_business_type  text default 'lainnya',
  p_household_book boolean default true,
  p_wallet_id      uuid default null
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

  insert into tenants (id, name, business_type, household_book)
  values (p_tenant_id, p_name, p_business_type, p_household_book);

  insert into memberships (id, tenant_id, user_id, role)
  values (gen_random_uuid(), p_tenant_id, v_user_id, 'owner');

  -- Satu dompet saja secara bawaan.
  --
  -- Mayoritas usaha mikro memang cuma punya satu tempat uang, dan
  -- membuatkan beberapa dompet di awal memaksa pengguna memilih sesuatu
  -- yang belum dia butuhkan — persis jenis gerbang yang membuat orang
  -- berhenti sebelum manfaat pertama terasa. Yang sudah memisahkan
  -- uangnya tinggal menambah dompet sendiri; buku tetap jalan tanpa itu.
  insert into wallets (id, tenant_id, name, kind, is_default, sort_order)
  values (
    coalesce(p_wallet_id, gen_random_uuid()),
    p_tenant_id, 'Dompet Utama', 'tunai', true, 1
  );

  perform seed_quick_entries(p_tenant_id, p_business_type, p_household_book);

  return p_tenant_id;
end;
$$;

-- Pintasan awal supaya hari pertama tidak kosong sama sekali.
--
-- Sengaja sedikit dan bernominal nol: ini usulan bentuk catatan, bukan
-- tebakan harga. Yang tidak terpakai tenggelam sendiri karena daftar
-- diurutkan menurut frekuensi.
create or replace function seed_quick_entries(
  p_tenant_id      uuid,
  p_business_type  text,
  p_household_book boolean default true
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_seeds text[][];
  v_seed  text[];
begin
  v_seeds := case p_business_type
    when 'dagang' then array[
      array['usaha', 'income',  'penjualan', 'Penjualan hari ini'],
      array['usaha', 'expense', 'modal',     'Belanja kulakan']
    ]
    when 'makanan' then array[
      array['usaha', 'income',  'penjualan', 'Penjualan hari ini'],
      array['usaha', 'expense', 'modal',     'Belanja bahan']
    ]
    when 'jasa' then array[
      array['usaha', 'income',  'jasa',        'Jasa hari ini'],
      array['usaha', 'expense', 'operasional', 'Ongkos usaha']
    ]
    when 'campuran' then array[
      array['usaha', 'income',  'penjualan', 'Penjualan hari ini'],
      array['usaha', 'income',  'jasa',      'Jasa hari ini'],
      array['usaha', 'expense', 'modal',     'Belanja kulakan']
    ]
    else array[
      array['usaha', 'income',  'penjualan', 'Pemasukan hari ini'],
      array['usaha', 'expense', 'operasional', 'Pengeluaran usaha']
    ]
  end;

  foreach v_seed slice 1 in array v_seeds
  loop
    insert into quick_entries (
      id, tenant_id, book, kind, category, label, default_amount, use_count
    )
    values (
      gen_random_uuid(), p_tenant_id,
      v_seed[1], v_seed[2], v_seed[3], v_seed[4], 0, 0
    )
    on conflict (tenant_id, book, kind, category, label) do nothing;
  end loop;

  if p_household_book then
    insert into quick_entries (
      id, tenant_id, book, kind, category, label, default_amount, use_count
    )
    values
      (gen_random_uuid(), p_tenant_id, 'rumah', 'expense', 'belanja',
       'Belanja dapur', 0, 0),
      (gen_random_uuid(), p_tenant_id, 'rumah', 'expense', 'transportasi',
       'Bensin', 0, 0)
    on conflict (tenant_id, book, kind, category, label) do nothing;
  end if;
end;
$$;

-- ── Entri buku kas ───────────────────────────────────────────────────────

-- Satu pemasukan atau satu pengeluaran.
--
-- `p_book` dikirim eksplisit, tidak diambil dari dompet. Inilah yang
-- membuat pengguna berdompet tunggal — mayoritas usaha mikro — tetap bisa
-- memisahkan uang usaha dari uang rumah tangga: belanja dapur yang
-- dibayar dari uang dagangan cukup dicatat berbuku rumah, dari dompet
-- yang sama.
--
-- `p_label` adalah keterangan seperti yang ditulis di buku ("Potong",
-- "sayur, tahu, cabai"). Kalau diisi, label itu sekaligus menaikkan
-- pintasan yang sesuai — begitulah daftar pintasan tumbuh sendiri, tanpa
-- layar pengaturan dan tanpa gerbang di awal.
create or replace function record_entry(
  p_entry_id    uuid,
  p_tenant_id   uuid,
  p_wallet_id   uuid,
  p_book        text,
  p_kind        text,
  p_amount      bigint,
  p_category    text,
  p_occurred_at timestamptz default now(),
  p_label       text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_direction text;
begin
  if exists (select 1 from cash_entries where id = p_entry_id) then
    return jsonb_build_object('entry_id', p_entry_id, 'replayed', true);
  end if;

  if p_amount <= 0 then
    raise exception 'Jumlah harus lebih dari nol';
  end if;

  if p_kind not in ('income', 'expense') then
    raise exception 'Pemindahan antar dompet lewat record_transfer';
  end if;

  if not exists (
    select 1 from wallets
    where id = p_wallet_id and tenant_id = p_tenant_id and archived_at is null
  ) then
    raise exception 'Dompet tidak ditemukan';
  end if;

  if not category_fits(p_book, p_kind, p_category) then
    raise exception 'Kategori % tidak cocok untuk % di buku %',
      p_category, p_kind, p_book;
  end if;

  v_direction := case when p_kind = 'income' then 'in' else 'out' end;

  insert into cash_entries (
    id, tenant_id, wallet_id, book, occurred_at,
    direction, amount, kind, category, note, created_by
  )
  values (
    p_entry_id, p_tenant_id, p_wallet_id, p_book, p_occurred_at,
    v_direction, p_amount, p_kind, p_category, p_label, auth.uid()
  );

  if p_label is not null and length(trim(p_label)) > 0 then
    insert into quick_entries (
      id, tenant_id, book, kind, category, label,
      default_amount, use_count, last_used_at
    )
    values (
      gen_random_uuid(), p_tenant_id, p_book, p_kind, p_category,
      trim(p_label), p_amount, 1, p_occurred_at
    )
    on conflict (tenant_id, book, kind, category, label) do update
      set use_count      = quick_entries.use_count + 1,
          -- Nominal terakhir yang menang: harga naik, dan pintasan yang
          -- menawarkan harga lama justru membuat pengguna membetulkannya
          -- tiap kali.
          default_amount = excluded.default_amount,
          last_used_at   = excluded.last_used_at,
          archived_at    = null;
  end if;

  return jsonb_build_object(
    'entry_id', p_entry_id, 'book', p_book, 'replayed', false
  );
end;
$$;

-- ── Pemindahan antar dompet ──────────────────────────────────────────────

-- Dua entri berpasangan: keluar dari satu dompet, masuk ke dompet lain.
--
-- Tanpa buku, dan tidak pernah masuk laporan mana pun — memindahkan uang
-- antar dompet bukan kegiatan usaha maupun rumah tangga. Saldo dompet
-- tetap bergerak, karena uangnya memang berpindah.
--
-- Hanya berguna bagi pengguna yang benar-benar punya lebih dari satu
-- tempat menyimpan uang. Yang berdompet tunggal tidak akan pernah
-- membukanya, dan memang tidak perlu.
create or replace function record_transfer(
  p_transfer_id   uuid,
  p_tenant_id     uuid,
  p_from_wallet   uuid,
  p_to_wallet     uuid,
  p_amount        bigint,
  p_occurred_at   timestamptz default now(),
  p_note          text default null,
  p_out_entry_id  uuid default null,
  p_in_entry_id   uuid default null
)
returns jsonb
language plpgsql
as $$
declare
  v_count integer;
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
    id, tenant_id, wallet_id, book, occurred_at, direction,
    amount, kind, category, note, transfer_group_id, created_by
  )
  values
    (coalesce(p_out_entry_id, gen_random_uuid()), p_tenant_id, p_from_wallet,
     null, p_occurred_at, 'out', p_amount, 'transfer', 'pindah',
     p_note, p_transfer_id, auth.uid()),
    (coalesce(p_in_entry_id, gen_random_uuid()), p_tenant_id, p_to_wallet,
     null, p_occurred_at, 'in', p_amount, 'transfer', 'pindah',
     p_note, p_transfer_id, auth.uid());

  return jsonb_build_object('transfer_id', p_transfer_id, 'replayed', false);
end;
$$;

-- ── Pembatalan entri ─────────────────────────────────────────────────────

-- Penghapusan lunak. Baris yang benar-benar hilang tidak bisa dibedakan
-- dari baris yang belum pernah sampai ke perangkat, sehingga
-- penghapusannya tidak akan pernah tersinkron.
--
-- Pemindahan dibatalkan sepasang: membatalkan satu sisinya saja akan
-- membuat uang seolah lenyap dari salah satu dompet.
create or replace function delete_entry(
  p_entry_id  uuid,
  p_tenant_id uuid
)
returns jsonb
language plpgsql
as $$
declare
  v_group uuid;
  v_count integer;
begin
  select transfer_group_id into v_group from cash_entries
  where id = p_entry_id and tenant_id = p_tenant_id and deleted_at is null;

  if not found then
    return jsonb_build_object('entry_id', p_entry_id, 'replayed', true);
  end if;

  if v_group is not null then
    update cash_entries set deleted_at = now()
    where transfer_group_id = v_group and tenant_id = p_tenant_id
      and deleted_at is null;
  else
    update cash_entries set deleted_at = now()
    where id = p_entry_id and tenant_id = p_tenant_id;
  end if;

  get diagnostics v_count = row_count;
  return jsonb_build_object('entry_id', p_entry_id, 'deleted', v_count);
end;
$$;

-- ── Utang & piutang ──────────────────────────────────────────────────────

create or replace function record_debt(
  p_debt_id     uuid,
  p_tenant_id   uuid,
  p_book        text,
  p_side        text,
  p_person      text,
  p_amount      bigint,
  p_occurred_at timestamptz default now(),
  p_note        text default null
)
returns jsonb
language plpgsql
as $$
begin
  if exists (select 1 from debts where id = p_debt_id) then
    return jsonb_build_object('debt_id', p_debt_id, 'replayed', true);
  end if;

  if p_amount <= 0 then
    raise exception 'Jumlah harus lebih dari nol';
  end if;

  insert into debts (
    id, tenant_id, book, side, person, amount, occurred_at, note
  )
  values (
    p_debt_id, p_tenant_id, p_book, p_side, trim(p_person),
    p_amount, p_occurred_at, p_note
  );

  return jsonb_build_object('debt_id', p_debt_id, 'replayed', false);
end;
$$;

-- Pembayaran utang: uang benar-benar berpindah, jadi masuk buku kas.
--
-- Kategorinya `lainnya`, bukan `penjualan` atau `jasa`. Pelunasan piutang
-- bukan penghasilan baru — penghasilannya sudah terjadi saat barang atau
-- jasanya diberikan. Menghitungnya sebagai penjualan berarti laporan
-- menghitung uang yang sama dua kali.
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

  -- Kelebihan bayar tidak disimpan sebagai utang aplikasi ke siapa pun.
  -- Sisanya jadi kembalian, dan itu urusan layar bayar.
  v_applied := least(p_amount, v_debt.amount - v_debt.paid_amount);

  if v_applied <= 0 then
    return jsonb_build_object('payment_id', p_payment_id, 'applied', 0,
                              'settled', true);
  end if;

  if not exists (
    select 1 from wallets
    where id = p_wallet_id and tenant_id = p_tenant_id and archived_at is null
  ) then
    raise exception 'Dompet tidak ditemukan';
  end if;

  insert into cash_entries (
    id, tenant_id, wallet_id, book, occurred_at, direction,
    amount, kind, category, note, created_by
  )
  values (
    p_payment_id, p_tenant_id, p_wallet_id, v_debt.book, p_occurred_at,
    case when v_debt.side = 'receivable' then 'in' else 'out' end,
    v_applied,
    case when v_debt.side = 'receivable' then 'income' else 'expense' end,
    'lainnya',
    case when v_debt.side = 'receivable'
         then 'Pembayaran utang: ' || v_debt.person
         else 'Pelunasan utang kepada: ' || v_debt.person end,
    auth.uid()
  );

  update debts
  set paid_amount = paid_amount + v_applied,
      settled_at  = case when paid_amount + v_applied >= amount
                         then now() else settled_at end
  where id = p_debt_id and tenant_id = p_tenant_id;

  return jsonb_build_object(
    'payment_id', p_payment_id,
    'applied', v_applied,
    'settled', v_debt.paid_amount + v_applied >= v_debt.amount,
    'replayed', false
  );
end;
$$;
