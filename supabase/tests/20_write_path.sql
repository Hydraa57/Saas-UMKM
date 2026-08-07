-- Jalur tulis: entri buku kas, pemindahan antar dompet, utang.
--
-- Yang paling penting diuji bukan "jalan atau tidak", tapi tiga sifat
-- yang kalau rusak akan salah tanpa memunculkan pesan error apa pun:
--
--   1. Idempotensi — pemutaran ulang antrean luring tidak menggandakan.
--   2. Pemisahan buku — uang dari bapak tidak boleh pernah masuk rekap
--      penghasilan ibu, karena ibu sendiri memisahkannya bertahun-tahun.
--   3. Pemindahan bukan penghasilan — uang yang sama pindah tempat tidak
--      boleh terhitung dua kali.

\set ON_ERROR_STOP on

insert into auth.users (id, email)
values ('33333333-3333-3333-3333-333333333333', 'ibu2@example.com')
on conflict (id) do nothing;

select login_as('33333333-3333-3333-3333-333333333333');
set role authenticated;

select create_tenant('cccccccc-0000-0000-0000-000000000001', 'Catatan Ibu');

-- Pegang id dompet dalam tabel sementara supaya kasus uji terbaca.
create temp table w as
select
  (select id from wallets where book='usaha' and name='Dompet Jahit')   as jahit,
  (select id from wallets where book='usaha' and name='Dompet Snack')   as snack,
  (select id from wallets where book='rumah' and name='Dompet Belanja') as belanja;

-- ── Pemasukan jahit ──────────────────────────────────────────────────────

-- Persis seperti yang ibu tulis di buku: tanggal, jenis, harga.
select record_entry(
  p_entry_id  => 'cccccccc-1111-0000-0000-000000000001',
  p_tenant_id => 'cccccccc-0000-0000-0000-000000000001',
  p_wallet_id => (select jahit from w),
  p_kind      => 'income',
  p_amount    => 30000,
  p_category  => 'jahit',
  p_label     => 'Potong'
);

select assert_eq(
  (select book from cash_entries where id = 'cccccccc-1111-0000-0000-000000000001'),
  'usaha',
  'buku disalin dari dompet, bukan dikirim klien'
);

select assert_eq(
  (select direction from cash_entries where id = 'cccccccc-1111-0000-0000-000000000001'),
  'in',
  'arah ditentukan jenisnya, bukan dikirim terpisah'
);

-- ── Pintasan tumbuh sendiri ──────────────────────────────────────────────

select assert_eq(
  (select use_count from quick_entries where label = 'Potong'), 1,
  'pintasan lahir dari pencatatan pertama, tanpa layar pengaturan'
);

select record_entry(
  p_entry_id  => 'cccccccc-1111-0000-0000-000000000002',
  p_tenant_id => 'cccccccc-0000-0000-0000-000000000001',
  p_wallet_id => (select jahit from w),
  p_kind      => 'income',
  p_amount    => 35000,
  p_category  => 'jahit',
  p_label     => 'Potong'
);

select assert_eq(
  (select use_count from quick_entries where label = 'Potong'), 2,
  'pemakaian kedua menaikkan hitungan, bukan membuat pintasan baru'
);

select assert_eq(
  (select default_amount from quick_entries where label = 'Potong'),
  35000::bigint,
  'nominal terakhir yang menang — harga naik, pintasan ikut'
);

-- ── Pemasukan snack ──────────────────────────────────────────────────────

-- Snack dicatat nominal saja, tanpa katalog produk. Ibu belum pernah
-- mencatatnya sama sekali; katalog akan jadi gerbang yang menghentikannya
-- sebelum manfaat pertama terasa.
select record_entry(
  p_entry_id  => 'cccccccc-1111-0000-0000-000000000003',
  p_tenant_id => 'cccccccc-0000-0000-0000-000000000001',
  p_wallet_id => (select snack from w),
  p_kind      => 'income',
  p_amount    => 5000,
  p_category  => 'snack'
);

select assert_eq(
  (select count(*)::int from quick_entries), 1,
  'entri tanpa keterangan tidak membuat pintasan'
);

-- ── Buku rumah ───────────────────────────────────────────────────────────

select record_entry(
  p_entry_id  => 'cccccccc-1111-0000-0000-000000000004',
  p_tenant_id => 'cccccccc-0000-0000-0000-000000000001',
  p_wallet_id => (select belanja from w),
  p_kind      => 'income',
  p_amount    => 1400000,
  p_category  => 'dari_bapak'
);

select record_entry(
  p_entry_id  => 'cccccccc-1111-0000-0000-000000000005',
  p_tenant_id => 'cccccccc-0000-0000-0000-000000000001',
  p_wallet_id => (select belanja from w),
  p_kind      => 'expense',
  p_amount    => 42000,
  p_category  => 'belanja',
  p_label     => 'syr, tahu, cabe, bensin'
);

-- Satu entri memuat beberapa barang, persis seperti di buku ibu.
-- Memaksanya memecah per barang akan lebih lambat daripada bukunya.
select assert_eq(
  (select note from cash_entries where id = 'cccccccc-1111-0000-0000-000000000005'),
  'syr, tahu, cabe, bensin',
  'keterangan bebas, tidak dipecah per barang'
);

-- ── Rekap penghasilan ibu ────────────────────────────────────────────────

-- Inilah angka yang selama ini ibu jumlah tangan tiap bulan, dan yang
-- dia sendiri tegaskan tidak termasuk uang dari bapak.
select assert_eq(
  (select coalesce(sum(amount), 0)::bigint from cash_entries
   where book = 'usaha' and kind = 'income' and deleted_at is null),
  70000::bigint,
  'rekap usaha = 30.000 + 35.000 + 5.000, tanpa uang dari bapak'
);

-- ── Kategori tidak boleh nyasar buku ─────────────────────────────────────

select assert_denied($$
  select record_entry(
    p_entry_id  => gen_random_uuid(),
    p_tenant_id => 'cccccccc-0000-0000-0000-000000000001',
    p_wallet_id => (select belanja from w),
    p_kind      => 'income',
    p_amount    => 30000,
    p_category  => 'jahit'
  )
$$, 'kategori jahit ditolak di buku rumah');

select assert_denied($$
  select record_entry(
    p_entry_id  => gen_random_uuid(),
    p_tenant_id => 'cccccccc-0000-0000-0000-000000000001',
    p_wallet_id => (select jahit from w),
    p_kind      => 'expense',
    p_amount    => 30000,
    p_category  => 'belanja'
  )
$$, 'kategori belanja ditolak di buku usaha');

select assert_denied($$
  select record_entry(
    p_entry_id  => gen_random_uuid(),
    p_tenant_id => 'cccccccc-0000-0000-0000-000000000001',
    p_wallet_id => (select jahit from w),
    p_kind      => 'transfer',
    p_amount    => 1000,
    p_category  => 'pindah'
  )
$$, 'pemindahan harus lewat record_transfer');

-- ── Idempotensi ──────────────────────────────────────────────────────────

-- Kegagalan paling merusak: peladen berhasil memproses, lalu koneksi
-- putus sebelum balasannya sampai. Klien mengira gagal dan mengirim ulang.
do $$
declare i int;
begin
  for i in 1..10 loop
    perform record_entry(
      p_entry_id  => 'cccccccc-1111-0000-0000-000000000001',
      p_tenant_id => 'cccccccc-0000-0000-0000-000000000001',
      p_wallet_id => (select jahit from w),
      p_kind      => 'income',
      p_amount    => 30000,
      p_category  => 'jahit',
      p_label     => 'Potong'
    );
  end loop;
end;
$$;

select assert_eq(
  (select count(*)::int from cash_entries
   where id = 'cccccccc-1111-0000-0000-000000000001'),
  1,
  'sepuluh pemutaran ulang tetap satu entri'
);

select assert_eq(
  (select use_count from quick_entries where label = 'Potong'), 2,
  'pemutaran ulang tidak menaikkan hitungan pintasan'
);

-- ── Pemindahan antar dompet ──────────────────────────────────────────────

-- Uang jahit dipakai belanja. Ini menyeberangi buku, dan tidak boleh
-- terhitung sebagai penghasilan rumah tangga: uangnya sama, cuma pindah.
select record_transfer(
  p_transfer_id => 'cccccccc-2222-0000-0000-000000000001',
  p_tenant_id   => 'cccccccc-0000-0000-0000-000000000001',
  p_from_wallet => (select jahit from w),
  p_to_wallet   => (select belanja from w),
  p_amount      => 50000,
  p_note        => 'Buat belanja dapur'
);

select assert_eq(
  (select count(*)::int from cash_entries
   where transfer_group_id = 'cccccccc-2222-0000-0000-000000000001'),
  2,
  'pemindahan menghasilkan dua entri berpasangan'
);

select assert_eq(
  (select coalesce(sum(amount), 0)::bigint from cash_entries
   where book = 'usaha' and kind = 'income' and deleted_at is null),
  70000::bigint,
  'pemindahan tidak menambah penghasilan usaha'
);

select assert_eq(
  (select coalesce(sum(amount), 0)::bigint from cash_entries
   where book = 'rumah' and kind = 'income' and deleted_at is null),
  1400000::bigint,
  'pemindahan tidak terhitung sebagai pemasukan rumah'
);

-- Saldo dompet tetap bergerak, karena uangnya memang berpindah.
select assert_eq(
  (select coalesce(sum(case when direction='in' then amount else -amount end), 0)::bigint
   from cash_entries
   where wallet_id = (select jahit from w) and deleted_at is null),
  15000::bigint,
  'saldo dompet jahit: 30.000 + 35.000 - 50.000'
);

select assert_denied($$
  select record_transfer(
    p_transfer_id => gen_random_uuid(),
    p_tenant_id   => 'cccccccc-0000-0000-0000-000000000001',
    p_from_wallet => (select jahit from w),
    p_to_wallet   => (select jahit from w),
    p_amount      => 1000
  )
$$, 'dompet asal dan tujuan tidak boleh sama');

-- Pemindahan juga idempoten.
select record_transfer(
  p_transfer_id => 'cccccccc-2222-0000-0000-000000000001',
  p_tenant_id   => 'cccccccc-0000-0000-0000-000000000001',
  p_from_wallet => (select jahit from w),
  p_to_wallet   => (select belanja from w),
  p_amount      => 50000
);

select assert_eq(
  (select count(*)::int from cash_entries
   where transfer_group_id = 'cccccccc-2222-0000-0000-000000000001'),
  2,
  'pemindahan ulang tidak menggandakan'
);

-- ── Pembatalan ───────────────────────────────────────────────────────────

-- Membatalkan satu sisi pemindahan akan membuat uang seolah lenyap dari
-- salah satu dompet, jadi keduanya dibatalkan sepasang.
select delete_entry(
  (select id from cash_entries
   where transfer_group_id = 'cccccccc-2222-0000-0000-000000000001'
   and direction = 'out'),
  'cccccccc-0000-0000-0000-000000000001'
);

select assert_eq(
  (select count(*)::int from cash_entries
   where transfer_group_id = 'cccccccc-2222-0000-0000-000000000001'
     and deleted_at is null),
  0,
  'membatalkan satu sisi pemindahan membatalkan keduanya'
);

select assert_eq(
  (select count(*)::int from cash_entries
   where transfer_group_id = 'cccccccc-2222-0000-0000-000000000001'),
  2,
  'pembatalan lunak: barisnya tetap ada supaya bisa tersinkron'
);

-- ── Utang & piutang ──────────────────────────────────────────────────────

select record_debt(
  p_debt_id   => 'cccccccc-3333-0000-0000-000000000001',
  p_tenant_id => 'cccccccc-0000-0000-0000-000000000001',
  p_book      => 'usaha',
  p_side      => 'receivable',
  p_person    => 'Bu Tetangga',
  p_amount    => 25000,
  p_note      => 'Ambil snack dulu'
);

-- Utang belum menyentuh buku kas: uangnya belum berpindah.
select assert_eq(
  (select coalesce(sum(amount), 0)::bigint from cash_entries
   where book = 'usaha' and kind = 'income' and deleted_at is null),
  70000::bigint,
  'utang tidak menambah penghasilan sebelum dibayar'
);

select pay_debt(
  p_payment_id => 'cccccccc-4444-0000-0000-000000000001',
  p_tenant_id  => 'cccccccc-0000-0000-0000-000000000001',
  p_debt_id    => 'cccccccc-3333-0000-0000-000000000001',
  p_amount     => 10000,
  p_wallet_id  => (select snack from w)
);

select assert_eq(
  (select paid_amount from debts where id = 'cccccccc-3333-0000-0000-000000000001'),
  10000::bigint,
  'cicilan menambah jumlah terbayar'
);

select assert_eq(
  (select settled_at is null from debts
   where id = 'cccccccc-3333-0000-0000-000000000001'),
  true,
  'belum lunas selama masih ada sisa'
);

-- Kategorinya `lain`, bukan `snack`: penghasilannya sudah terjadi saat
-- barangnya diberikan. Menghitungnya sebagai penjualan baru berarti
-- rekap bulanan menghitung uang yang sama dua kali.
select assert_eq(
  (select category from cash_entries where id = 'cccccccc-4444-0000-0000-000000000001'),
  'lain',
  'pelunasan piutang bukan penjualan baru'
);

-- Bayar melebihi sisa.
select pay_debt(
  p_payment_id => 'cccccccc-4444-0000-0000-000000000002',
  p_tenant_id  => 'cccccccc-0000-0000-0000-000000000001',
  p_debt_id    => 'cccccccc-3333-0000-0000-000000000001',
  p_amount     => 99000,
  p_wallet_id  => (select snack from w)
);

select assert_eq(
  (select paid_amount from debts where id = 'cccccccc-3333-0000-0000-000000000001'),
  25000::bigint,
  'kelebihan bayar tidak membuat terbayar melampaui utangnya'
);

select assert_eq(
  (select amount from cash_entries where id = 'cccccccc-4444-0000-0000-000000000002'),
  15000::bigint,
  'hanya sisa utang yang masuk buku kas'
);

select assert_eq(
  (select settled_at is not null from debts
   where id = 'cccccccc-3333-0000-0000-000000000001'),
  true,
  'utang ditandai lunas saat tertutup'
);

-- ── Jumlah harus masuk akal ──────────────────────────────────────────────

select assert_denied($$
  select record_entry(
    p_entry_id  => gen_random_uuid(),
    p_tenant_id => 'cccccccc-0000-0000-0000-000000000001',
    p_wallet_id => (select jahit from w),
    p_kind      => 'income',
    p_amount    => 0,
    p_category  => 'jahit'
  )
$$, 'nominal nol ditolak');

select assert_denied($$
  insert into cash_entries (id, tenant_id, wallet_id, book, direction,
                            amount, kind, category)
  select gen_random_uuid(), 'cccccccc-0000-0000-0000-000000000001',
         (select jahit from w), 'usaha', 'out', 1000, 'income', 'jahit'
$$, 'pemasukan berarah keluar ditolak constraint');

select assert_denied($$
  insert into cash_entries (id, tenant_id, wallet_id, book, direction,
                            amount, kind, category)
  select gen_random_uuid(), 'cccccccc-0000-0000-0000-000000000001',
         (select jahit from w), 'usaha', 'out', 1000, 'transfer', 'pindah'
$$, 'pemindahan tanpa pasangan ditolak constraint');

reset role;
