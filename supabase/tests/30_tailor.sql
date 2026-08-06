-- Order jahit.
--
-- Bagian yang paling tidak punya padanan di aplikasi POS mana pun, dan
-- yang paling banyak keputusannya masih hipotesis sampai wawancara
-- lapangan selesai (docs/06-wawancara-lapangan.md nomor 27). Pengujian
-- ini mengunci perilaku yang sudah diputuskan, supaya kalau nanti
-- alurnya berubah, yang berubah terlihat jelas.

\set ON_ERROR_STOP on

insert into auth.users (id, email)
values ('33333333-3333-3333-3333-333333333333', 'penjahit@example.com')
on conflict (id) do nothing;

select login_as('33333333-3333-3333-3333-333333333333');
set role authenticated;

select create_tenant(
  'dddddddd-0000-0000-0000-000000000001',
  'Jahit Ibu',
  'jasa',
  'dddddddd-0000-0000-0000-0000000f0001'
);

insert into customers (id, tenant_id, name, phone)
values (
  'dddddddd-1111-0000-0000-000000000001',
  'dddddddd-0000-0000-0000-000000000001',
  'Bu Siti', '081234567890'
);

-- ── Order dengan DP ──────────────────────────────────────────────────────

select create_tailor_order(
  p_order_id      => 'dddddddd-2222-0000-0000-000000000001',
  p_tenant_id     => 'dddddddd-0000-0000-0000-000000000001',
  p_customer_id   => 'dddddddd-1111-0000-0000-000000000001',
  p_garment_type  => 'Kebaya',
  p_price         => 350000,
  p_wallet_id     => 'dddddddd-0000-0000-0000-0000000f0001',
  p_dp_amount     => 100000,
  p_promised_date => '2026-08-20',
  p_measurement   => '{"lingkar_dada":92,"panjang_lengan":58,"panjang_baju":70}'::jsonb,
  p_occurred_at   => '2026-08-06T03:00:00Z'
);

select assert_eq(
  (select order_no from tailor_orders where id = 'dddddddd-2222-0000-0000-000000000001'),
  '2026-0001',
  'nomor order bisa diucapkan, bukan UUID'
);

select assert_eq(
  (select paid_amount from tailor_orders where id = 'dddddddd-2222-0000-0000-000000000001'),
  100000::bigint,
  'DP tercatat sebagai jumlah terbayar'
);

select assert_eq(
  (select status from tailor_orders where id = 'dddddddd-2222-0000-0000-000000000001'),
  'queued',
  'order baru masuk antrean'
);

select assert_eq(
  (select amount from cash_entries
   where source_id = 'dddddddd-2222-0000-0000-000000000001'),
  100000::bigint,
  'DP masuk buku kas'
);

select assert_eq(
  (select category from cash_entries
   where source_id = 'dddddddd-2222-0000-0000-000000000001'),
  'service',
  'DP jahit berkategori service'
);

select assert_eq(
  (select kind from payments where subject_id = 'dddddddd-2222-0000-0000-000000000001'),
  'dp',
  'pembayaran pertama ditandai sebagai DP'
);

-- Ukuran dibekukan saat order dibuat. Kalau badan pelanggan diukur ulang
-- bulan depan, jahitan yang sedang dikerjakan tidak boleh ikut berubah —
-- kainnya sudah dipotong.
select assert_eq(
  (select measurement_snapshot->>'lingkar_dada'
   from tailor_orders where id = 'dddddddd-2222-0000-0000-000000000001'),
  '92',
  'ukuran disalin ke order, bukan dirujuk'
);

-- ── Penomoran berurutan per tahun ────────────────────────────────────────

select create_tailor_order(
  p_order_id     => 'dddddddd-2222-0000-0000-000000000002',
  p_tenant_id    => 'dddddddd-0000-0000-0000-000000000001',
  p_customer_id  => 'dddddddd-1111-0000-0000-000000000001',
  p_garment_type => 'Kemeja',
  p_price        => 150000,
  p_wallet_id    => 'dddddddd-0000-0000-0000-0000000f0001',
  p_occurred_at  => '2026-08-07T03:00:00Z'
);

select assert_eq(
  (select order_no from tailor_orders where id = 'dddddddd-2222-0000-0000-000000000002'),
  '2026-0002',
  'nomor order berurutan'
);

-- Tahun berganti, hitungan mulai dari satu lagi supaya nomornya tidak
-- pernah tumbuh terlalu panjang untuk diucapkan.
select create_tailor_order(
  p_order_id     => 'dddddddd-2222-0000-0000-000000000003',
  p_tenant_id    => 'dddddddd-0000-0000-0000-000000000001',
  p_customer_id  => 'dddddddd-1111-0000-0000-000000000001',
  p_garment_type => 'Gamis',
  p_price        => 200000,
  p_wallet_id    => 'dddddddd-0000-0000-0000-0000000f0001',
  p_occurred_at  => '2027-01-03T03:00:00Z'
);

select assert_eq(
  (select order_no from tailor_orders where id = 'dddddddd-2222-0000-0000-000000000003'),
  '2027-0001',
  'penomoran diulang tiap tahun'
);

-- ── Idempotensi ──────────────────────────────────────────────────────────

select create_tailor_order(
  p_order_id     => 'dddddddd-2222-0000-0000-000000000001',
  p_tenant_id    => 'dddddddd-0000-0000-0000-000000000001',
  p_customer_id  => 'dddddddd-1111-0000-0000-000000000001',
  p_garment_type => 'Kebaya',
  p_price        => 350000,
  p_wallet_id    => 'dddddddd-0000-0000-0000-0000000f0001',
  p_dp_amount    => 100000
);

select assert_eq(
  (select count(*)::int from tailor_orders
   where tenant_id = 'dddddddd-0000-0000-0000-000000000001'),
  3,
  'pemutaran ulang tidak membuat order kedua'
);

select assert_eq(
  (select count(*)::int from cash_entries
   where source_id = 'dddddddd-2222-0000-0000-000000000001'),
  1,
  'pemutaran ulang tidak menggandakan DP di buku kas'
);

-- ── Perpindahan status ───────────────────────────────────────────────────

select set_tailor_status(
  'dddddddd-2222-0000-0000-000000000001',
  'dddddddd-0000-0000-0000-000000000001',
  'in_progress'
);

select assert_eq(
  (select started_at is not null from tailor_orders
   where id = 'dddddddd-2222-0000-0000-000000000001'),
  true,
  'waktu mulai dikerjakan tercatat'
);

select set_tailor_status(
  'dddddddd-2222-0000-0000-000000000001',
  'dddddddd-0000-0000-0000-000000000001',
  'done'
);

select assert_eq(
  (select completed_at is not null from tailor_orders
   where id = 'dddddddd-2222-0000-0000-000000000001'),
  true,
  'waktu selesai tercatat'
);

-- Pelanggan mencoba, minta dikecilkan, jahitan kembali ke mesin.
-- Kejadian biasa di tukang jahit, bukan kesalahan yang perlu dicegah.
select set_tailor_status(
  'dddddddd-2222-0000-0000-000000000001',
  'dddddddd-0000-0000-0000-000000000001',
  'in_progress'
);

select assert_eq(
  (select status from tailor_orders where id = 'dddddddd-2222-0000-0000-000000000001'),
  'in_progress',
  'jahitan yang sudah jadi bisa kembali dikerjakan'
);

-- Lompatan yang tidak masuk akal ditahan di peladen, bukan cuma di
-- aplikasi — satu perangkat dengan versi lama sudah cukup untuk membuat
-- order melompat dari antre langsung ke sudah diambil.
select assert_denied($$
  select set_tailor_status(
    'dddddddd-2222-0000-0000-000000000002',
    'dddddddd-0000-0000-0000-000000000001',
    'picked_up'
  )
$$, 'tidak bisa melompat dari antre ke sudah diambil');

-- ── Pelunasan ────────────────────────────────────────────────────────────

select record_payment(
  p_payment_id   => 'dddddddd-3333-0000-0000-000000000001',
  p_tenant_id    => 'dddddddd-0000-0000-0000-000000000001',
  p_subject_type => 'tailor_order',
  p_subject_id   => 'dddddddd-2222-0000-0000-000000000001',
  p_amount       => 250000,
  p_wallet_id    => 'dddddddd-0000-0000-0000-0000000f0001'
);

select assert_eq(
  (select paid_amount from tailor_orders where id = 'dddddddd-2222-0000-0000-000000000001'),
  350000::bigint,
  'pelunasan menutup sisa tagihan'
);

select assert_eq(
  (select kind from payments where id = 'dddddddd-3333-0000-0000-000000000001'),
  'settlement',
  'pembayaran yang menutup tagihan ditandai pelunasan'
);

select set_tailor_status(
  'dddddddd-2222-0000-0000-000000000001',
  'dddddddd-0000-0000-0000-000000000001',
  'done'
);
select set_tailor_status(
  'dddddddd-2222-0000-0000-000000000001',
  'dddddddd-0000-0000-0000-000000000001',
  'picked_up'
);

select assert_eq(
  (select picked_up_at is not null from tailor_orders
   where id = 'dddddddd-2222-0000-0000-000000000001'),
  true,
  'waktu pengambilan tercatat'
);

-- Status akhir tidak bisa mundur. Uangnya sudah berpindah; koreksi harus
-- lewat jalur yang tercatat, bukan diam-diam.
select assert_denied($$
  select set_tailor_status(
    'dddddddd-2222-0000-0000-000000000001',
    'dddddddd-0000-0000-0000-000000000001',
    'in_progress'
  )
$$, 'order yang sudah diambil tidak bisa mundur');

-- ── DP melebihi harga ────────────────────────────────────────────────────

select create_tailor_order(
  p_order_id     => 'dddddddd-2222-0000-0000-000000000004',
  p_tenant_id    => 'dddddddd-0000-0000-0000-000000000001',
  p_customer_id  => 'dddddddd-1111-0000-0000-000000000001',
  p_garment_type => 'Permak celana',
  p_price        => 25000,
  p_wallet_id    => 'dddddddd-0000-0000-0000-0000000f0001',
  p_dp_amount    => 50000,
  p_occurred_at  => '2026-08-08T03:00:00Z'
);

select assert_eq(
  (select paid_amount from tailor_orders where id = 'dddddddd-2222-0000-0000-000000000004'),
  25000::bigint,
  'DP dibatasi tidak melebihi harga — sisanya kembalian, bukan utang aplikasi'
);

select assert_eq(
  (select kind from payments where subject_id = 'dddddddd-2222-0000-0000-000000000004'),
  'full',
  'DP yang menutup seluruh harga langsung dianggap lunas'
);

-- ── Pelanggan tidak bisa dihapus kalau punya order ───────────────────────

select assert_denied($$
  delete from customers where id = 'dddddddd-1111-0000-0000-000000000001'
$$, 'pelanggan dengan order berjalan tidak bisa dihapus');

reset role;
