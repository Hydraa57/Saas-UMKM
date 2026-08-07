-- Jalur tulis: entri buku kas, pemindahan antar dompet, utang.
--
-- Yang paling penting diuji bukan "jalan atau tidak", tapi sifat-sifat
-- yang kalau rusak akan salah tanpa memunculkan pesan error apa pun.
--
-- Kasus pertama di berkas ini adalah yang paling menentukan bagi produk:
-- pengguna dengan **satu dompet** harus tetap bisa memisahkan uang usaha
-- dari uang rumah tangga. Penelitian menemukan 73% UMKM Indonesia belum
-- memisahkan keuangannya, dan mayoritas usaha mikro cuma punya satu
-- rekening — kalau kelompok itu tidak terlayani, fitur intinya tidak
-- terpakai oleh mayoritas penggunanya.

\set ON_ERROR_STOP on

insert into auth.users (id, email)
values ('33333333-3333-3333-3333-333333333333', 'tiga@example.com')
on conflict (id) do nothing;

select login_as('33333333-3333-3333-3333-333333333333');
set role authenticated;

select create_tenant(
  'cccccccc-0000-0000-0000-000000000001', 'Warung Bu Ani', 'dagang'
);

create temp table w as
select id as utama from wallets where name = 'Dompet Utama';

-- ── Satu dompet, dua buku ────────────────────────────────────────────────

-- Penghasilan usaha masuk ke dompet yang sama…
select record_entry(
  p_entry_id  => 'cccccccc-1111-0000-0000-000000000001',
  p_tenant_id => 'cccccccc-0000-0000-0000-000000000001',
  p_wallet_id => (select utama from w),
  p_book      => 'usaha',
  p_kind      => 'income',
  p_amount    => 85000,
  p_category  => 'penjualan',
  p_label     => 'Penjualan hari ini'
);

-- …dan belanja dapur dibayar dari dompet yang sama juga, tapi dicatat
-- sebagai kegiatan rumah tangga. Inilah pemisahan yang selama ini tidak
-- terjadi: bukan dengan menuntut dompet terpisah, tapi dengan menandainya
-- tepat saat uangnya keluar.
select record_entry(
  p_entry_id  => 'cccccccc-1111-0000-0000-000000000002',
  p_tenant_id => 'cccccccc-0000-0000-0000-000000000001',
  p_wallet_id => (select utama from w),
  p_book      => 'rumah',
  p_kind      => 'expense',
  p_amount    => 42000,
  p_category  => 'belanja',
  p_label     => 'sayur, tahu, cabai'
);

select assert_eq(
  (select coalesce(sum(amount), 0)::bigint from cash_entries
   where book = 'usaha' and kind = 'income' and deleted_at is null),
  85000::bigint,
  'penghasilan usaha terhitung utuh'
);

select assert_eq(
  (select coalesce(sum(amount), 0)::bigint from cash_entries
   where book = 'usaha' and kind = 'expense' and deleted_at is null),
  0::bigint,
  'belanja dapur TIDAK mengurangi untung usaha, walau uangnya dari dompet yang sama'
);

select assert_eq(
  (select coalesce(sum(amount), 0)::bigint from cash_entries
   where book = 'rumah' and kind = 'expense' and deleted_at is null),
  42000::bigint,
  'belanja dapur masuk buku rumah'
);

-- Saldo dompet tetap satu angka, karena uangnya memang di satu tempat.
select assert_eq(
  (select coalesce(sum(case when direction='in' then amount else -amount end), 0)::bigint
   from cash_entries where deleted_at is null),
  43000::bigint,
  'saldo dompet: 85.000 masuk, 42.000 keluar'
);

-- Satu entri memuat beberapa barang, seperti di buku tulis.
select assert_eq(
  (select note from cash_entries where id = 'cccccccc-1111-0000-0000-000000000002'),
  'sayur, tahu, cabai',
  'keterangan bebas, tidak dipecah per barang'
);

-- ── Pintasan tumbuh sendiri ──────────────────────────────────────────────

select assert_eq(
  (select use_count from quick_entries
   where label = 'Penjualan hari ini' and book = 'usaha'),
  1,
  'pintasan semaian ikut naik saat dipakai'
);

select record_entry(
  p_entry_id  => 'cccccccc-1111-0000-0000-000000000003',
  p_tenant_id => 'cccccccc-0000-0000-0000-000000000001',
  p_wallet_id => (select utama from w),
  p_book      => 'usaha',
  p_kind      => 'income',
  p_amount    => 92000,
  p_category  => 'penjualan',
  p_label     => 'Penjualan hari ini'
);

select assert_eq(
  (select use_count from quick_entries where label = 'Penjualan hari ini'),
  2,
  'pemakaian kedua menaikkan hitungan, bukan membuat pintasan baru'
);

select assert_eq(
  (select default_amount from quick_entries where label = 'Penjualan hari ini'),
  92000::bigint,
  'nominal terakhir yang menang'
);

select record_entry(
  p_entry_id  => 'cccccccc-1111-0000-0000-000000000004',
  p_tenant_id => 'cccccccc-0000-0000-0000-000000000001',
  p_wallet_id => (select utama from w),
  p_book      => 'usaha',
  p_kind      => 'income',
  p_amount    => 5000,
  p_category  => 'penjualan'
);

select assert_eq(
  (select count(*)::int from quick_entries where label = 'Penjualan hari ini'),
  1,
  'entri tanpa keterangan tidak membuat pintasan baru'
);

-- ── Kategori tidak boleh nyasar buku ─────────────────────────────────────

select assert_denied($$
  select record_entry(
    gen_random_uuid(), 'cccccccc-0000-0000-0000-000000000001',
    (select utama from w), 'rumah', 'income', 30000, 'penjualan'
  )
$$, 'kategori penjualan ditolak di buku rumah');

select assert_denied($$
  select record_entry(
    gen_random_uuid(), 'cccccccc-0000-0000-0000-000000000001',
    (select utama from w), 'usaha', 'expense', 30000, 'belanja'
  )
$$, 'kategori belanja ditolak di buku usaha');

select assert_denied($$
  select record_entry(
    gen_random_uuid(), 'cccccccc-0000-0000-0000-000000000001',
    (select utama from w), 'usaha', 'transfer', 1000, 'pindah'
  )
$$, 'pemindahan harus lewat record_transfer');

-- `lainnya` sah di kedua buku: selalu ada hal yang tidak masuk kategori
-- mana pun, dan pengguna yang terjebak tanpa pilihan berhenti mencatat.
select record_entry(
  'cccccccc-1111-0000-0000-000000000005',
  'cccccccc-0000-0000-0000-000000000001',
  (select utama from w), 'usaha', 'income', 10000, 'lainnya'
);
select record_entry(
  'cccccccc-1111-0000-0000-000000000006',
  'cccccccc-0000-0000-0000-000000000001',
  (select utama from w), 'rumah', 'expense', 10000, 'lainnya'
);

select assert_eq(
  (select count(*)::int from cash_entries where category = 'lainnya'), 2,
  'kategori lainnya sah di kedua buku'
);

-- ── Idempotensi ──────────────────────────────────────────────────────────

-- Kegagalan paling merusak: peladen berhasil memproses, lalu koneksi
-- putus sebelum balasannya sampai. Klien mengira gagal dan mengirim ulang.
do $$
declare i int;
begin
  for i in 1..10 loop
    perform record_entry(
      'cccccccc-1111-0000-0000-000000000001',
      'cccccccc-0000-0000-0000-000000000001',
      (select utama from w), 'usaha', 'income', 85000, 'penjualan',
      now(), 'Penjualan hari ini'
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
  (select use_count from quick_entries where label = 'Penjualan hari ini'),
  2,
  'pemutaran ulang tidak menaikkan hitungan pintasan'
);

-- ── Pemindahan antar dompet ──────────────────────────────────────────────

-- Hanya berguna bagi yang punya lebih dari satu tempat menyimpan uang.
insert into wallets (id, tenant_id, name, kind, sort_order)
values ('cccccccc-9999-0000-0000-000000000001',
        'cccccccc-0000-0000-0000-000000000001', 'Rekening', 'bank', 2);

select record_transfer(
  p_transfer_id => 'cccccccc-2222-0000-0000-000000000001',
  p_tenant_id   => 'cccccccc-0000-0000-0000-000000000001',
  p_from_wallet => (select utama from w),
  p_to_wallet   => 'cccccccc-9999-0000-0000-000000000001',
  p_amount      => 50000,
  p_note        => 'Setor ke rekening'
);

select assert_eq(
  (select count(*)::int from cash_entries
   where transfer_group_id = 'cccccccc-2222-0000-0000-000000000001'),
  2,
  'pemindahan menghasilkan dua entri berpasangan'
);

-- Pemindahan tidak punya buku sama sekali, jadi tidak mungkin bocor ke
-- laporan mana pun.
select assert_eq(
  (select count(*)::int from cash_entries
   where transfer_group_id = 'cccccccc-2222-0000-0000-000000000001'
     and book is not null),
  0,
  'pemindahan tidak berbuku — tidak bisa bocor ke laporan'
);

select assert_eq(
  (select coalesce(sum(amount), 0)::bigint from cash_entries
   where book = 'usaha' and kind = 'income' and deleted_at is null),
  192000::bigint,
  'pemindahan tidak menambah penghasilan usaha'
);

select assert_eq(
  (select coalesce(sum(case when direction='in' then amount else -amount end), 0)::bigint
   from cash_entries
   where wallet_id = 'cccccccc-9999-0000-0000-000000000001' and deleted_at is null),
  50000::bigint,
  'saldo rekening bertambah — uangnya memang berpindah'
);

select assert_denied($$
  insert into cash_entries (id, tenant_id, wallet_id, book, direction,
                            amount, kind, category, transfer_group_id)
  select gen_random_uuid(), 'cccccccc-0000-0000-0000-000000000001',
         (select utama from w), 'usaha', 'out', 1000, 'transfer', 'pindah',
         gen_random_uuid()
$$, 'pemindahan berbuku ditolak constraint');

select assert_denied($$
  insert into cash_entries (id, tenant_id, wallet_id, book, direction,
                            amount, kind, category)
  select gen_random_uuid(), 'cccccccc-0000-0000-0000-000000000001',
         (select utama from w), null, 'in', 1000, 'income', 'penjualan'
$$, 'pemasukan tanpa buku ditolak constraint');

select assert_denied($$
  select record_transfer(
    gen_random_uuid(), 'cccccccc-0000-0000-0000-000000000001',
    (select utama from w), (select utama from w), 1000
  )
$$, 'dompet asal dan tujuan tidak boleh sama');

-- ── Pembatalan ───────────────────────────────────────────────────────────

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
  p_amount    => 25000
);

select assert_eq(
  (select coalesce(sum(amount), 0)::bigint from cash_entries
   where book = 'usaha' and kind = 'income' and deleted_at is null),
  192000::bigint,
  'utang tidak menambah penghasilan sebelum dibayar'
);

select pay_debt(
  'cccccccc-4444-0000-0000-000000000001',
  'cccccccc-0000-0000-0000-000000000001',
  'cccccccc-3333-0000-0000-000000000001',
  10000,
  (select utama from w)
);

select assert_eq(
  (select paid_amount from debts where id = 'cccccccc-3333-0000-0000-000000000001'),
  10000::bigint,
  'cicilan menambah jumlah terbayar'
);

-- Kategorinya `lainnya`, bukan `penjualan`: penghasilannya sudah terjadi
-- saat barangnya diberikan.
select assert_eq(
  (select category from cash_entries where id = 'cccccccc-4444-0000-0000-000000000001'),
  'lainnya',
  'pelunasan piutang bukan penjualan baru'
);

select pay_debt(
  'cccccccc-4444-0000-0000-000000000002',
  'cccccccc-0000-0000-0000-000000000001',
  'cccccccc-3333-0000-0000-000000000001',
  99000,
  (select utama from w)
);

select assert_eq(
  (select paid_amount from debts where id = 'cccccccc-3333-0000-0000-000000000001'),
  25000::bigint,
  'kelebihan bayar tidak melampaui utangnya'
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
    gen_random_uuid(), 'cccccccc-0000-0000-0000-000000000001',
    (select utama from w), 'usaha', 'income', 0, 'penjualan'
  )
$$, 'nominal nol ditolak');

select assert_denied($$
  insert into cash_entries (id, tenant_id, wallet_id, book, direction,
                            amount, kind, category)
  select gen_random_uuid(), 'cccccccc-0000-0000-0000-000000000001',
         (select utama from w), 'usaha', 'out', 1000, 'income', 'penjualan'
$$, 'pemasukan berarah keluar ditolak constraint');

reset role;
