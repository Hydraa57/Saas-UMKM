-- Jalur tulis: katalog, kasir, stok, kulakan, piutang.
--
-- Yang paling penting diuji bukan "jalan atau tidak", tapi sifat yang
-- kalau rusak akan salah tanpa memunculkan pesan error apa pun.
--
-- Dan yang pertama diuji adalah pembeda utama aplikasi ini: **jasa tidak
-- pernah berkurang stoknya.** "Potong celana" tidak bisa habis.

\set ON_ERROR_STOP on

insert into auth.users (id, email)
values ('33333333-3333-3333-3333-333333333333', 'tiga@example.com')
on conflict (id) do nothing;

select login_as('33333333-3333-3333-3333-333333333333');
set role authenticated;

select create_tenant(
  'cccccccc-0000-0000-0000-000000000001', 'Toko & Jahit Bu Ani', 'campuran',
  'cccccccc-ffff-0000-0000-000000000001'
);

create temp table w as select 'cccccccc-ffff-0000-0000-000000000001'::uuid as kas;

-- ── Katalog: barang punya stok, jasa tidak ───────────────────────────────

select upsert_item(
  'cccccccc-1111-0000-0000-000000000001',
  'cccccccc-0000-0000-0000-000000000001',
  'barang', 'Biskuit Roma', 5000, 3500, 'pcs', 100, 10
);

select upsert_item(
  'cccccccc-1111-0000-0000-000000000002',
  'cccccccc-0000-0000-0000-000000000001',
  'jasa', 'Potong celana', 30000
);

select assert_eq(
  (select stock_qty from items where id = 'cccccccc-1111-0000-0000-000000000001'),
  100::numeric,
  'barang punya stok'
);

-- Inti pembedanya: jasa tidak punya stok, dan itu ditegakkan lapisan data.
select assert_eq(
  (select stock_qty is null from items where id = 'cccccccc-1111-0000-0000-000000000002'),
  true,
  'jasa tidak punya stok'
);

-- Bahkan kalau stok dikirim untuk jasa, tetap diabaikan.
select upsert_item(
  'cccccccc-1111-0000-0000-000000000003',
  'cccccccc-0000-0000-0000-000000000001',
  'jasa', 'Vermak Levis', 25000, 0, 'pcs', 999, 5
);

select assert_eq(
  (select stock_qty is null from items where id = 'cccccccc-1111-0000-0000-000000000003'),
  true,
  'stok yang dikirim untuk jasa diabaikan, bukan disimpan'
);

select assert_denied($$
  insert into items (id, tenant_id, kind, name, price, stock_qty)
  values (gen_random_uuid(), 'cccccccc-0000-0000-0000-000000000001',
          'jasa', 'Jasa Berstok', 1000, 50)
$$, 'jasa berstok ditolak constraint');

select assert_denied($$
  insert into items (id, tenant_id, kind, name, price)
  values (gen_random_uuid(), 'cccccccc-0000-0000-0000-000000000001',
          'barang', 'Barang Tanpa Stok', 1000)
$$, 'barang tanpa stok ditolak constraint');

-- ── Kasir: barang + jasa dalam satu struk ────────────────────────────────

select record_sale(
  p_sale_id   => 'cccccccc-2222-0000-0000-000000000001',
  p_tenant_id => 'cccccccc-0000-0000-0000-000000000001',
  p_items     => '[
    {"item_id":"cccccccc-1111-0000-0000-000000000001","item_kind":"barang",
     "item_name":"Biskuit Roma","qty":3,"unit_price":5000,"unit_cost":3500},
    {"item_id":"cccccccc-1111-0000-0000-000000000002","item_kind":"jasa",
     "item_name":"Potong celana","qty":1,"unit_price":30000,"unit_cost":0}
  ]'::jsonb,
  p_wallet_id => (select kas from w),
  p_paid      => 45000
);

select assert_eq(
  (select total from sales where id = 'cccccccc-2222-0000-0000-000000000001'),
  45000::bigint,
  'total dihitung ulang di peladen: 3x5000 + 1x30000'
);

select assert_eq(
  (select invoice_no from sales where id = 'cccccccc-2222-0000-0000-000000000001'),
  '2026-0001',
  'nomor struk bisa diucapkan, bukan UUID'
);

-- Urutan baris struk mengikuti urutan keranjang, bukan urutan penyimpanan
-- (yang mengikuti UUID acak dan berbeda tiap kali dibaca).
select assert_eq(
  (select string_agg(item_name, ' | ' order by line_no) from sale_items
   where sale_id = 'cccccccc-2222-0000-0000-000000000001'),
  'Biskuit Roma | Potong celana',
  'urutan baris struk sama dengan urutan diketuk di kasir'
);

-- **Yang paling penting di seluruh berkas ini.**
select assert_eq(
  (select stock_qty from items where id = 'cccccccc-1111-0000-0000-000000000001'),
  97::numeric,
  'stok barang berkurang sesuai jumlah terjual'
);

select assert_eq(
  (select stock_qty is null from items where id = 'cccccccc-1111-0000-0000-000000000002'),
  true,
  'jasa tetap tanpa stok setelah terjual — tidak pernah bisa habis'
);

select assert_eq(
  (select count(*)::int from stock_movements
   where source_id = 'cccccccc-2222-0000-0000-000000000001'),
  1,
  'hanya barang yang menghasilkan mutasi stok, jasa tidak'
);

select assert_eq(
  (select amount from cash_entries
   where source_id = 'cccccccc-2222-0000-0000-000000000001'),
  45000::bigint,
  'uang masuk buku kas sebesar yang dibayar'
);

-- Rincian barang vs jasa datang dari sale_items, bukan dari kategori
-- entri kas — supaya diskon tidak perlu dibagi sembarang antar keduanya.
select assert_eq(
  (select coalesce(sum(subtotal), 0)::bigint from sale_items
   where sale_id = 'cccccccc-2222-0000-0000-000000000001' and item_kind = 'jasa'),
  30000::bigint,
  'pendapatan jasa bisa dipisahkan dari baris penjualannya'
);

select assert_eq(
  (select sold_count from items where id = 'cccccccc-1111-0000-0000-000000000001'),
  1,
  'sold_count naik satu per penjualan, bukan per jumlah barang'
);

-- ── Idempotensi ──────────────────────────────────────────────────────────

-- Kegagalan paling merusak: peladen berhasil memproses, lalu koneksi
-- putus sebelum balasannya sampai. Klien mengira gagal, mengirim ulang —
-- dan tanpa penjagaan ini, stok berkurang dua kali.
do $$
declare i int;
begin
  for i in 1..10 loop
    perform record_sale(
      'cccccccc-2222-0000-0000-000000000001',
      'cccccccc-0000-0000-0000-000000000001',
      '[{"item_id":"cccccccc-1111-0000-0000-000000000001","item_kind":"barang",
         "item_name":"Biskuit Roma","qty":3,"unit_price":5000,"unit_cost":3500}]'::jsonb,
      (select kas from w), 45000
    );
  end loop;
end;
$$;

select assert_eq(
  (select count(*)::int from sales where id = 'cccccccc-2222-0000-0000-000000000001'),
  1, 'sepuluh pemutaran ulang tetap satu penjualan'
);
select assert_eq(
  (select stock_qty from items where id = 'cccccccc-1111-0000-0000-000000000001'),
  97::numeric, 'pemutaran ulang tidak mengurangi stok dua kali'
);
select assert_eq(
  (select count(*)::int from cash_entries
   where source_id = 'cccccccc-2222-0000-0000-000000000001'),
  1, 'pemutaran ulang tidak menggandakan entri kas'
);

-- ── Penjualan berutang ───────────────────────────────────────────────────

select record_sale(
  p_sale_id       => 'cccccccc-2222-0000-0000-000000000002',
  p_tenant_id     => 'cccccccc-0000-0000-0000-000000000001',
  p_items         => '[{"item_id":"cccccccc-1111-0000-0000-000000000001",
                        "item_kind":"barang","item_name":"Biskuit Roma",
                        "qty":2,"unit_price":5000,"unit_cost":3500}]'::jsonb,
  p_wallet_id     => (select kas from w),
  p_paid          => 0,
  p_customer_name => 'Bu Tetangga'
);

select assert_eq(
  (select payment_method from sales where id = 'cccccccc-2222-0000-0000-000000000002'),
  'utang', 'penjualan tanpa bayar ditandai utang'
);
select assert_eq(
  (select count(*)::int from cash_entries
   where source_id = 'cccccccc-2222-0000-0000-000000000002'),
  0, 'penjualan berutang tidak menghasilkan entri kas — uangnya belum masuk'
);
select assert_eq(
  (select stock_qty from items where id = 'cccccccc-1111-0000-0000-000000000001'),
  95::numeric, 'stok tetap berkurang walau belum dibayar — barangnya sudah keluar'
);
select assert_eq(
  (select amount from debts where sale_id = 'cccccccc-2222-0000-0000-000000000002'),
  10000::bigint, 'kekurangannya jadi piutang atas nama pembeli'
);

-- Kurang bayar tanpa nama tidak jadi piutang: piutang tanpa nama tidak
-- bisa ditagih, dan cuma membuat laporan terlihat salah.
select record_sale(
  'cccccccc-2222-0000-0000-000000000003',
  'cccccccc-0000-0000-0000-000000000001',
  '[{"item_id":"cccccccc-1111-0000-0000-000000000001","item_kind":"barang",
     "item_name":"Biskuit Roma","qty":1,"unit_price":5000,"unit_cost":3500}]'::jsonb,
  (select kas from w), 3000
);

select assert_eq(
  (select count(*)::int from debts where sale_id = 'cccccccc-2222-0000-0000-000000000003'),
  0, 'kurang bayar tanpa nama tidak jadi piutang'
);

-- ── Pembayaran piutang ───────────────────────────────────────────────────
--
-- Yang paling menentukan di sini bukan angkanya, tapi **kategorinya**.
-- Penghasilannya sudah diakui saat struknya keluar; kalau pembayaran
-- utang masuk sebagai `penjualan`, rekap bulanan menghitung uang yang
-- sama dua kali dan angkanya jadi lebih besar daripada yang benar-benar
-- diterima — salah tanpa memunculkan galat apa pun.

create temp table d as
  select id from debts where sale_id = 'cccccccc-2222-0000-0000-000000000002';

select pay_debt(
  'cccccccc-6666-0000-0000-000000000001',
  'cccccccc-0000-0000-0000-000000000001',
  (select id from d), 4000, (select kas from w)
);

select assert_eq(
  (select category from cash_entries where id = 'cccccccc-6666-0000-0000-000000000001'),
  'lainnya', 'pembayaran utang bukan penjualan baru — uangnya tidak dihitung dua kali'
);
select assert_eq(
  (select direction from cash_entries where id = 'cccccccc-6666-0000-0000-000000000001'),
  'in', 'piutang yang dibayar adalah uang masuk'
);
select assert_eq(
  (select paid_amount from debts where id = (select id from d)),
  4000::bigint, 'cicilan mengurangi sisa utang'
);
select assert_eq(
  (select settled_at is null from debts where id = (select id from d)),
  true, 'cicilan belum melunasi'
);

-- Kelebihan bayar dipotong ke sisanya. Mencatatnya utuh membuat piutang
-- terlihat lunas berlebih, dan buku kas menerima uang yang tidak ada.
select pay_debt(
  'cccccccc-6666-0000-0000-000000000002',
  'cccccccc-0000-0000-0000-000000000001',
  (select id from d), 99000, (select kas from w)
);

select assert_eq(
  (select amount from cash_entries where id = 'cccccccc-6666-0000-0000-000000000002'),
  6000::bigint, 'kelebihan bayar dipotong ke sisa utangnya'
);
select assert_eq(
  (select paid_amount from debts where id = (select id from d)),
  10000::bigint, 'utang tidak pernah terbayar melebihi jumlahnya'
);
select assert_eq(
  (select settled_at is not null from debts where id = (select id from d)),
  true, 'pelunasan menandai lunas'
);

-- Pemutaran ulang antrean luring tidak boleh menerima uang dua kali.
do $$
declare i int;
begin
  for i in 1..5 loop
    perform pay_debt(
      'cccccccc-6666-0000-0000-000000000002',
      'cccccccc-0000-0000-0000-000000000001',
      (select id from d), 99000, (select kas from w)
    );
  end loop;
end;
$$;

select assert_eq(
  (select count(*)::int from cash_entries
   where id = 'cccccccc-6666-0000-0000-000000000002'),
  1, 'pemutaran ulang pembayaran tetap satu entri kas'
);
select assert_eq(
  (select paid_amount from debts where id = (select id from d)),
  10000::bigint, 'pemutaran ulang tidak menambah pembayaran'
);

-- ── Kembalian ────────────────────────────────────────────────────────────

select record_sale(
  'cccccccc-2222-0000-0000-000000000004',
  'cccccccc-0000-0000-0000-000000000001',
  '[{"item_id":"cccccccc-1111-0000-0000-000000000002","item_kind":"jasa",
     "item_name":"Potong celana","qty":1,"unit_price":30000,"unit_cost":0}]'::jsonb,
  (select kas from w), 50000
);

select assert_eq(
  (select paid from sales where id = 'cccccccc-2222-0000-0000-000000000004'),
  30000::bigint,
  'uang diterima tidak melebihi tagihan — kelebihannya kembalian, bukan uang usaha'
);

-- ── Diskon ───────────────────────────────────────────────────────────────

select record_sale(
  p_sale_id   => 'cccccccc-2222-0000-0000-000000000005',
  p_tenant_id => 'cccccccc-0000-0000-0000-000000000001',
  p_items     => '[{"item_id":"cccccccc-1111-0000-0000-000000000001",
                    "item_kind":"barang","item_name":"Biskuit Roma",
                    "qty":4,"unit_price":5000,"unit_cost":3500}]'::jsonb,
  p_wallet_id => (select kas from w),
  p_paid      => 18000,
  p_discount  => 999999
);

select assert_eq(
  (select total from sales where id = 'cccccccc-2222-0000-0000-000000000005'),
  0::bigint, 'diskon berlebih dibatasi di subtotal, total tidak negatif'
);

-- ── Barang di luar katalog ───────────────────────────────────────────────

-- Pengguna tidak boleh terjebak hanya karena katalognya belum lengkap.
select record_sale(
  'cccccccc-2222-0000-0000-000000000006',
  'cccccccc-0000-0000-0000-000000000001',
  '[{"item_kind":"barang","item_name":"Titipan tetangga",
     "qty":1,"unit_price":7000,"unit_cost":0}]'::jsonb,
  (select kas from w), 7000
);

select assert_eq(
  (select total from sales where id = 'cccccccc-2222-0000-0000-000000000006'),
  7000::bigint, 'barang di luar katalog tetap bisa dijual'
);

-- ── Kulakan ──────────────────────────────────────────────────────────────

select record_purchase(
  p_purchase_id   => 'cccccccc-3333-0000-0000-000000000001',
  p_tenant_id     => 'cccccccc-0000-0000-0000-000000000001',
  p_items         => '[{"item_id":"cccccccc-1111-0000-0000-000000000001",
                        "item_name":"Biskuit Roma","qty":100,"unit_cost":3600}]'::jsonb,
  p_wallet_id     => (select kas from w),
  p_supplier_name => 'Toko Grosir'
);

select assert_eq(
  (select total from purchases where id = 'cccccccc-3333-0000-0000-000000000001'),
  360000::bigint, 'total kulakan dihitung dari itemnya'
);
select assert_eq(
  (select stock_qty from items where id = 'cccccccc-1111-0000-0000-000000000001'),
  190::numeric, 'stok bertambah setelah kulakan'
);
select assert_eq(
  (select cost_price from items where id = 'cccccccc-1111-0000-0000-000000000001'),
  3600::bigint, 'harga modal diperbarui ke harga kulakan terakhir'
);
select assert_eq(
  (select category from cash_entries
   where source_id = 'cccccccc-3333-0000-0000-000000000001'),
  'modal', 'kulakan berkategori modal'
);

-- ── Koreksi stok ─────────────────────────────────────────────────────────

select adjust_stock(
  'cccccccc-4444-0000-0000-000000000001',
  'cccccccc-0000-0000-0000-000000000001',
  'cccccccc-1111-0000-0000-000000000001',
  185, 'Hitung fisik'
);

select assert_eq(
  (select stock_qty from items where id = 'cccccccc-1111-0000-0000-000000000001'),
  185::numeric, 'stok disetel ke hasil hitung fisik'
);
select assert_eq(
  (select qty_change from stock_movements where id = 'cccccccc-4444-0000-0000-000000000001'),
  -5::numeric, 'yang dicatat selisihnya, bukan angka akhirnya'
);

select assert_denied($$
  select adjust_stock(gen_random_uuid(), 'cccccccc-0000-0000-0000-000000000001',
                      'cccccccc-1111-0000-0000-000000000002', 10)
$$, 'jasa tidak bisa dikoreksi stoknya');

-- Stok bisa dihitung ulang dari mutasinya — kalau rollup-nya melenceng,
-- kebenarannya ada di sini.
--
-- Dulu penegasan ini berbunyi `sum(qty_change) + 100`, dan angka 100 itu
-- adalah stok awal yang tidak punya mutasi. Penegasan yang menambahkan
-- selisihnya sendiri tidak menguji apa pun — ia mengkodekan bugnya
-- sebagai bagian dari harapan. Sekarang kesetaraannya utuh.
select assert_eq(
  (select coalesce(sum(qty_change), 0) from stock_movements
   where item_id = 'cccccccc-1111-0000-0000-000000000001'),
  (select stock_qty from items where id = 'cccccccc-1111-0000-0000-000000000001'),
  'stok tersimpan sama dengan penjumlahan seluruh mutasinya'
);

-- ── Pembatalan struk ─────────────────────────────────────────────────────

select void_sale(
  'cccccccc-2222-0000-0000-000000000002',
  'cccccccc-0000-0000-0000-000000000001',
  'Salah input'
);

select assert_eq(
  (select stock_qty from items where id = 'cccccccc-1111-0000-0000-000000000001'),
  187::numeric, 'pembatalan mengembalikan stok'
);
select assert_eq(
  (select deleted_at is not null from debts
   where sale_id = 'cccccccc-2222-0000-0000-000000000002'),
  true, 'piutang dari struk yang dibatalkan ikut batal'
);
select assert_eq(
  (select voided_at is not null from sales
   where id = 'cccccccc-2222-0000-0000-000000000002'),
  true, 'penjualan ditandai batal, bukan dihapus'
);

-- ── Biaya lain ───────────────────────────────────────────────────────────

select record_expense(
  'cccccccc-5555-0000-0000-000000000001',
  'cccccccc-0000-0000-0000-000000000001',
  (select kas from w), 25000, 'operasional', now(), 'Plastik & label'
);

select assert_eq(
  (select category from cash_entries where id = 'cccccccc-5555-0000-0000-000000000001'),
  'operasional', 'biaya jalan tercatat'
);

select assert_denied($$
  select record_expense(gen_random_uuid(), 'cccccccc-0000-0000-0000-000000000001',
                        (select kas from w), 1000, 'modal')
$$, 'kategori modal harus lewat kulakan, bukan biaya manual');

-- ── Stok selalu bisa disusun ulang dari mutasinya ────────────────────────
--
-- Invarian yang membuat angka stok bisa diperiksa, dan satu-satunya
-- alasan `stock_movements` ada. Diuji setelah satu hari kerja penuh:
-- didaftarkan, terjual, dikulak, dikoreksi.
--
-- Bocornya ditemukan uji asap: `upsert_item` menulis stok awal langsung
-- tanpa mutasi pasangannya, jadi penjumlahannya meleset selamanya sebesar
-- stok awal barang itu.

select assert_eq(
  (select count(*)::bigint from stock_movements
   where item_id = 'cccccccc-1111-0000-0000-000000000001' and reason = 'awal'),
  1::bigint, 'stok awal punya mutasinya sendiri'
);

select assert_eq(
  (select count(*)::bigint from stock_movements
   where item_id = 'cccccccc-1111-0000-0000-000000000002'),
  0::bigint, 'jasa tidak punya mutasi apa pun, termasuk mutasi awal'
);

select assert_eq(
  (select coalesce(sum(qty_change), 0) from stock_movements
   where item_id = 'cccccccc-1111-0000-0000-000000000001'),
  (select stock_qty from items where id = 'cccccccc-1111-0000-0000-000000000001'),
  'stok tersimpan sama dengan penjumlahan seluruh mutasinya'
);

-- Menyunting katalog tidak melahirkan mutasi kedua.
select upsert_item(
  'cccccccc-1111-0000-0000-000000000001',
  'cccccccc-0000-0000-0000-000000000001',
  'barang', 'Biskuit Roma', 5500, 3500, 'pcs', 999, 10
);

select assert_eq(
  (select count(*)::bigint from stock_movements
   where item_id = 'cccccccc-1111-0000-0000-000000000001' and reason = 'awal'),
  1::bigint, 'menyunting katalog tidak melahirkan mutasi awal kedua'
);

select assert_eq(
  (select coalesce(sum(qty_change), 0) from stock_movements
   where item_id = 'cccccccc-1111-0000-0000-000000000001'),
  (select stock_qty from items where id = 'cccccccc-1111-0000-0000-000000000001'),
  'stok tetap cocok dengan mutasinya setelah katalog disunting'
);

-- ── Arsip katalog ────────────────────────────────────────────────────────
--
-- Barang yang sudah pernah terjual tidak boleh hilang dari basis data:
-- struk lama dan laporan bulan lalu menunjuk ke sana. Yang diarsipkan
-- hanya berhenti muncul di kasir dan katalog.

select archive_item('cccccccc-1111-0000-0000-000000000003');

select assert_eq(
  (select archived_at is not null from items
   where id = 'cccccccc-1111-0000-0000-000000000003'),
  true, 'yang diarsipkan ditandai, bukan dihapus'
);

select assert_eq(
  (select count(*)::bigint from items
   where id = 'cccccccc-1111-0000-0000-000000000003'),
  1::bigint, 'barisnya tetap ada supaya struk lama tetap punya asal-usul'
);

-- Baris penjualan menyimpan salinan nama dan harganya sendiri, jadi
-- struk lama tetap terbaca utuh walau katalognya sudah diarsipkan.
select assert_eq(
  (select count(*)::bigint from sale_items
   where item_id = 'cccccccc-1111-0000-0000-000000000001'
     and item_name is not null),
  (select count(*)::bigint from sale_items
   where item_id = 'cccccccc-1111-0000-0000-000000000001'),
  'baris struk lama tetap punya nama barangnya'
);

select archive_item('cccccccc-1111-0000-0000-000000000003', false);

select assert_eq(
  (select archived_at is null from items
   where id = 'cccccccc-1111-0000-0000-000000000003'),
  true, 'arsip bisa dibatalkan'
);

reset role;

-- Tenant lain tidak bisa mengarsipkan katalog orang. `archive_item`
-- berjalan sebagai pemanggil, jadi RLS yang menghentikannya — perintah
-- update-nya tidak menemukan baris apa pun, bukan menolak dengan galat.
insert into auth.users (id, email)
values ('44444444-4444-4444-4444-444444444444', 'empat@example.com')
on conflict (id) do nothing;

select login_as('44444444-4444-4444-4444-444444444444');
set role authenticated;

select create_tenant(
  'dddddddd-0000-0000-0000-000000000001', 'Warung Sebelah', 'dagang',
  'dddddddd-ffff-0000-0000-000000000001'
);

select archive_item('cccccccc-1111-0000-0000-000000000003');

reset role;
select login_as('33333333-3333-3333-3333-333333333333');
set role authenticated;

select assert_eq(
  (select archived_at is null from items
   where id = 'cccccccc-1111-0000-0000-000000000003'),
  true, 'tenant lain tidak bisa mengarsipkan katalog orang'
);

reset role;
