-- Jalur tulis.
--
-- Setiap operasi yang menyentuh lebih dari satu baris dijalankan lewat
-- satu fungsi di sini, bukan beberapa panggilan terpisah dari klien.
-- Koneksi yang putus di tengah — hal biasa di HP — akan meninggalkan
-- separuh pemindahan uang kalau ditulis terpisah, dan aplikasi yang
-- angkanya tidak cocok dengan isi dompet kehilangan kepercayaan
-- penggunanya untuk seterusnya.
--
-- Semua idempoten terhadap `id` yang dikirim perangkat, supaya pemutaran
-- ulang antrean luring aman. Semua `security invoker` (bawaan) supaya RLS
-- tetap berlaku — kecuali `create_tenant`, yang memang berjalan saat
-- keanggotaan belum ada.

-- ── Pasangan buku, jenis, dan kategori ───────────────────────────────────

-- Kategori tidak boleh nyasar buku. "Belanja" di buku usaha atau "jahit"
-- di buku rumah akan merusak rekap bulanan tanpa pernah terlihat salah
-- di layar mana pun — dan rekap bulanan itu satu-satunya angka yang
-- selama ini ibu hitung sendiri.
create or replace function category_fits(
  p_book text, p_kind text, p_category text
)
returns boolean
language sql
immutable
as $$
  select case
    when p_kind = 'transfer' then p_category = 'pindah'
    when p_book = 'usaha' and p_kind = 'income'
      then p_category in ('jahit', 'snack', 'lain')
    when p_book = 'usaha' and p_kind = 'expense'
      then p_category in ('modal', 'operasional', 'lain')
    when p_book = 'rumah' and p_kind = 'income'
      then p_category in ('dari_bapak', 'lain')
    when p_book = 'rumah' and p_kind = 'expense'
      then p_category in ('belanja', 'listrik_air', 'gas', 'transport',
                          'arisan', 'sekolah', 'kesehatan', 'lain')
    else false
  end
$$;

-- ── Pembuatan tenant ─────────────────────────────────────────────────────

create or replace function create_tenant(
  p_tenant_id uuid,
  p_name      text
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

  insert into tenants (id, name) values (p_tenant_id, p_name);

  insert into memberships (id, tenant_id, user_id, role)
  values (gen_random_uuid(), p_tenant_id, v_user_id, 'owner');

  -- Dompet bawaan dibuat sekaligus, mencontoh dompet fisik yang sudah
  -- ibu pisahkan sendiri. Tanpa ini, pencatatan pertama gagal karena
  -- tidak ada wadah untuk uangnya — dan itu terjadi persis di menit
  -- paling menentukan, saat aplikasinya dicoba pertama kali.
  insert into wallets (id, tenant_id, name, book, kind, is_default, sort_order)
  values
    (gen_random_uuid(), p_tenant_id, 'Dompet Jahit',   'usaha', 'cash', true,  1),
    (gen_random_uuid(), p_tenant_id, 'Dompet Snack',   'usaha', 'cash', false, 2),
    (gen_random_uuid(), p_tenant_id, 'Dompet Belanja', 'rumah', 'cash', true,  1);

  return p_tenant_id;
end;
$$;

-- ── Entri buku kas ───────────────────────────────────────────────────────

-- Satu pemasukan atau satu pengeluaran.
--
-- `p_label` adalah keterangan seperti yang ibu tulis di buku ("Potong",
-- "syr, tahu, cabe"). Kalau diisi, label itu sekaligus menaikkan pintasan
-- yang sesuai — itulah cara daftar pintasan tumbuh sendiri, tanpa layar
-- pengaturan dan tanpa gerbang di awal.
create or replace function record_entry(
  p_entry_id    uuid,
  p_tenant_id   uuid,
  p_wallet_id   uuid,
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
  v_book      text;
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

  select book into v_book from wallets
  where id = p_wallet_id and tenant_id = p_tenant_id and archived_at is null;

  if v_book is null then
    raise exception 'Dompet tidak ditemukan';
  end if;

  if not category_fits(v_book, p_kind, p_category) then
    raise exception 'Kategori % tidak cocok untuk % di buku %',
      p_category, p_kind, v_book;
  end if;

  v_direction := case when p_kind = 'income' then 'in' else 'out' end;

  insert into cash_entries (
    id, tenant_id, wallet_id, book, occurred_at,
    direction, amount, kind, category, note, created_by
  )
  values (
    p_entry_id, p_tenant_id, p_wallet_id, v_book, p_occurred_at,
    v_direction, p_amount, p_kind, p_category, p_label, auth.uid()
  );

  if p_label is not null and length(trim(p_label)) > 0 then
    insert into quick_entries (
      id, tenant_id, book, kind, category, label,
      default_amount, use_count, last_used_at
    )
    values (
      gen_random_uuid(), p_tenant_id, v_book, p_kind, p_category,
      trim(p_label), p_amount, 1, p_occurred_at
    )
    on conflict (tenant_id, book, kind, category, label) do update
      set use_count      = quick_entries.use_count + 1,
          -- Nominal terakhir yang menang: harga jahit naik, dan pintasan
          -- yang menawarkan harga lama justru membuat ibu harus
          -- membetulkannya tiap kali.
          default_amount = excluded.default_amount,
          last_used_at   = excluded.last_used_at,
          archived_at    = null;
  end if;

  return jsonb_build_object(
    'entry_id', p_entry_id, 'book', v_book, 'replayed', false
  );
end;
$$;

-- ── Pemindahan antar dompet ──────────────────────────────────────────────

-- Dua entri berpasangan: keluar dari satu dompet, masuk ke dompet lain.
--
-- Inilah yang menggantikan "ambil buat rumah" di rancangan sebelumnya.
-- Rancangan itu mengasumsikan uang usaha dan pribadi tercampur lalu
-- perlu dipisahkan. Kenyataannya ibu **sudah** memisahkannya dengan
-- dompet fisik; yang dia butuhkan bukan pemisahan, melainkan cara
-- mencatat saat uang benar-benar berpindah antar dompet.
--
-- Pemindahan tidak pernah dihitung sebagai penghasilan maupun biaya,
-- termasuk saat menyeberangi buku. Uang jahit yang dipakai belanja bukan
-- penghasilan rumah tangga — itu uang yang sama, pindah tempat.
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
  v_from_book text;
  v_to_book   text;
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

  select book into v_from_book from wallets
  where id = p_from_wallet and tenant_id = p_tenant_id and archived_at is null;
  select book into v_to_book from wallets
  where id = p_to_wallet and tenant_id = p_tenant_id and archived_at is null;

  if v_from_book is null or v_to_book is null then
    raise exception 'Dompet tidak ditemukan';
  end if;

  insert into cash_entries (
    id, tenant_id, wallet_id, book, occurred_at, direction,
    amount, kind, category, note, transfer_group_id, created_by
  )
  values
    (coalesce(p_out_entry_id, gen_random_uuid()), p_tenant_id, p_from_wallet,
     v_from_book, p_occurred_at, 'out', p_amount, 'transfer', 'pindah',
     p_note, p_transfer_id, auth.uid()),
    (coalesce(p_in_entry_id, gen_random_uuid()), p_tenant_id, p_to_wallet,
     v_to_book, p_occurred_at, 'in', p_amount, 'transfer', 'pindah',
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
-- Kategorinya `lain`, bukan `jahit` atau `snack`. Pelunasan piutang bukan
-- penghasilan baru — penghasilannya sudah terjadi saat barang atau jasa
-- diberikan. Menghitungnya sebagai pemasukan berarti rekap bulanan
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
  v_book    text;
  v_kind    text;
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

  select book into v_book from wallets
  where id = p_wallet_id and tenant_id = p_tenant_id and archived_at is null;

  if v_book is null then
    raise exception 'Dompet tidak ditemukan';
  end if;

  v_kind := case when v_debt.side = 'receivable' then 'income' else 'expense' end;

  insert into cash_entries (
    id, tenant_id, wallet_id, book, occurred_at, direction,
    amount, kind, category, note, created_by
  )
  values (
    p_payment_id, p_tenant_id, p_wallet_id, v_book, p_occurred_at,
    case when v_debt.side = 'receivable' then 'in' else 'out' end,
    v_applied, v_kind, 'lain',
    case when v_debt.side = 'receivable'
         then 'Bayar utang: ' || v_debt.person
         else 'Lunasi utang ke: ' || v_debt.person end,
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
