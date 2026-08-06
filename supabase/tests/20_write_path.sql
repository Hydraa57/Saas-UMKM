-- Jalur tulis: penjualan, kulakan, pembayaran, entri kas manual.
--
-- Yang paling penting diuji di sini bukan "jalan atau tidak", tapi dua
-- sifat yang kalau rusak akan merusak kepercayaan pengguna tanpa pernah
-- memunculkan pesan error:
--
--   1. Idempotensi — pemutaran ulang antrean offline tidak boleh
--      menghasilkan penjualan kedua.
--   2. Kesesuaian buku kas — jumlah entri kas harus selalu bisa
--      dicocokkan dengan uang yang benar-benar berpindah.

\set ON_ERROR_STOP on

-- Berkas uji berbagi satu database, jadi pengguna yang sama bisa sudah
-- dibuat oleh berkas sebelumnya.
insert into auth.users (id, email)
values ('11111111-1111-1111-1111-111111111111', 'ibu@example.com')
on conflict (id) do nothing;

select login_as('11111111-1111-1111-1111-111111111111');
set role authenticated;

select create_tenant(
  'cccccccc-0000-0000-0000-000000000001',
  'Warung Ibu',
  'toko_jasa',
  'cccccccc-0000-0000-0000-0000000f0001'
);

insert into products (id, tenant_id, name, sell_price, cost_price, stock_qty, min_stock)
values
  ('cccccccc-1111-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
   'Biskuit Roma', 5000, 3500, 100, 10),
  ('cccccccc-1111-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001',
   'Oreo', 12000, 9000, 50, 5);

-- ── Penjualan tunai ──────────────────────────────────────────────────────

select record_sale(
  p_sale_id     => 'cccccccc-2222-0000-0000-000000000001',
  p_tenant_id   => 'cccccccc-0000-0000-0000-000000000001',
  p_items       => '[
    {"product_id":"cccccccc-1111-0000-0000-000000000001",
     "item_name":"Biskuit Roma","qty":3,"unit_price":5000,"unit_cost":3500},
    {"product_id":"cccccccc-1111-0000-0000-000000000002",
     "item_name":"Oreo","qty":1,"unit_price":12000,"unit_cost":9000}
  ]'::jsonb,
  p_wallet_id   => 'cccccccc-0000-0000-0000-0000000f0001',
  p_paid_amount => 27000
);

select assert_eq(
  (select total_amount from sales where id = 'cccccccc-2222-0000-0000-000000000001'),
  27000::bigint,
  'total dihitung ulang di peladen: 3x5000 + 1x12000'
);

select assert_eq(
  (select stock_qty from products where id = 'cccccccc-1111-0000-0000-000000000001'),
  97::numeric,
  'stok berkurang sesuai jumlah terjual'
);

select assert_eq(
  (select sold_count from products where id = 'cccccccc-1111-0000-0000-000000000001'),
  1,
  'sold_count naik satu per penjualan, bukan per jumlah barang'
);

select assert_eq(
  (select count(*)::int from stock_movements
   where source_id = 'cccccccc-2222-0000-0000-000000000001'),
  2,
  'setiap baris berproduk menghasilkan satu mutasi stok'
);

select assert_eq(
  (select amount from cash_entries
   where source_id = 'cccccccc-2222-0000-0000-000000000001' and direction = 'in'),
  27000::bigint,
  'uang masuk buku kas sebesar yang dibayar'
);

select assert_eq(
  (select category from cash_entries
   where source_id = 'cccccccc-2222-0000-0000-000000000001'),
  'sale',
  'entri kas penjualan berkategori sale'
);

-- ── Idempotensi ──────────────────────────────────────────────────────────

-- Inilah yang terjadi saat jaringan putus sesudah peladen memproses tapi
-- sebelum balasannya sampai: klien mengirim ulang panggilan yang sama.
select record_sale(
  p_sale_id     => 'cccccccc-2222-0000-0000-000000000001',
  p_tenant_id   => 'cccccccc-0000-0000-0000-000000000001',
  p_items       => '[
    {"product_id":"cccccccc-1111-0000-0000-000000000001",
     "item_name":"Biskuit Roma","qty":3,"unit_price":5000,"unit_cost":3500}
  ]'::jsonb,
  p_wallet_id   => 'cccccccc-0000-0000-0000-0000000f0001',
  p_paid_amount => 27000
);

select assert_eq(
  (select count(*)::int from sales where id = 'cccccccc-2222-0000-0000-000000000001'),
  1,
  'pemutaran ulang tidak membuat penjualan kedua'
);

select assert_eq(
  (select stock_qty from products where id = 'cccccccc-1111-0000-0000-000000000001'),
  97::numeric,
  'pemutaran ulang tidak mengurangi stok dua kali'
);

select assert_eq(
  (select count(*)::int from cash_entries
   where source_id = 'cccccccc-2222-0000-0000-000000000001'),
  1,
  'pemutaran ulang tidak menggandakan entri kas'
);

-- Sepuluh kali sekalipun.
do $$
declare i int;
begin
  for i in 1..10 loop
    perform record_sale(
      p_sale_id     => 'cccccccc-2222-0000-0000-000000000001',
      p_tenant_id   => 'cccccccc-0000-0000-0000-000000000001',
      p_items       => '[{"product_id":"cccccccc-1111-0000-0000-000000000001",
                          "item_name":"Biskuit Roma","qty":3,
                          "unit_price":5000,"unit_cost":3500}]'::jsonb,
      p_wallet_id   => 'cccccccc-0000-0000-0000-0000000f0001',
      p_paid_amount => 27000
    );
  end loop;
end;
$$;

select assert_eq(
  (select count(*)::int from sales where id = 'cccccccc-2222-0000-0000-000000000001'),
  1,
  'sepuluh pemutaran ulang tetap satu penjualan'
);

-- ── Penjualan diutang ────────────────────────────────────────────────────

select record_sale(
  p_sale_id     => 'cccccccc-2222-0000-0000-000000000002',
  p_tenant_id   => 'cccccccc-0000-0000-0000-000000000001',
  p_items       => '[{"product_id":"cccccccc-1111-0000-0000-000000000002",
                      "item_name":"Oreo","qty":2,
                      "unit_price":12000,"unit_cost":9000}]'::jsonb,
  p_wallet_id   => 'cccccccc-0000-0000-0000-0000000f0001',
  p_paid_amount => 0
);

select assert_eq(
  (select payment_method from sales where id = 'cccccccc-2222-0000-0000-000000000002'),
  'unpaid',
  'penjualan tanpa bayar ditandai unpaid'
);

select assert_eq(
  (select count(*)::int from cash_entries
   where source_id = 'cccccccc-2222-0000-0000-000000000002'),
  0,
  'penjualan diutang tidak menghasilkan entri kas — uangnya memang belum masuk'
);

select assert_eq(
  (select stock_qty from products where id = 'cccccccc-1111-0000-0000-000000000002'),
  47::numeric,
  'stok tetap berkurang walau belum dibayar — barangnya sudah keluar'
);

-- ── Pelunasan piutang ────────────────────────────────────────────────────

select record_payment(
  p_payment_id   => 'cccccccc-3333-0000-0000-000000000001',
  p_tenant_id    => 'cccccccc-0000-0000-0000-000000000001',
  p_subject_type => 'sale',
  p_subject_id   => 'cccccccc-2222-0000-0000-000000000002',
  p_amount       => 10000,
  p_wallet_id    => 'cccccccc-0000-0000-0000-0000000f0001'
);

select assert_eq(
  (select paid_amount from sales where id = 'cccccccc-2222-0000-0000-000000000002'),
  10000::bigint,
  'cicilan menambah jumlah terbayar'
);

select assert_eq(
  (select category from cash_entries
   where source_id = 'cccccccc-2222-0000-0000-000000000002'),
  'receivable',
  'pelunasan piutang berkategori receivable, bukan sale — pendapatannya sudah diakui'
);

-- Bayar lebih dari sisanya.
select record_payment(
  p_payment_id   => 'cccccccc-3333-0000-0000-000000000002',
  p_tenant_id    => 'cccccccc-0000-0000-0000-000000000001',
  p_subject_type => 'sale',
  p_subject_id   => 'cccccccc-2222-0000-0000-000000000002',
  p_amount       => 50000,
  p_wallet_id    => 'cccccccc-0000-0000-0000-0000000f0001'
);

select assert_eq(
  (select paid_amount from sales where id = 'cccccccc-2222-0000-0000-000000000002'),
  24000::bigint,
  'kelebihan bayar tidak membuat paid_amount melampaui total'
);

select assert_eq(
  (select amount from payments where id = 'cccccccc-3333-0000-0000-000000000002'),
  14000::bigint,
  'hanya sisa tagihan yang tercatat sebagai pembayaran'
);

-- ── Diskon ───────────────────────────────────────────────────────────────

select record_sale(
  p_sale_id     => 'cccccccc-2222-0000-0000-000000000003',
  p_tenant_id   => 'cccccccc-0000-0000-0000-000000000001',
  p_items       => '[{"product_id":"cccccccc-1111-0000-0000-000000000001",
                      "item_name":"Biskuit Roma","qty":4,
                      "unit_price":5000,"unit_cost":3500}]'::jsonb,
  p_wallet_id   => 'cccccccc-0000-0000-0000-0000000f0001',
  p_paid_amount => 18000,
  p_discount    => 2000
);

select assert_eq(
  (select total_amount from sales where id = 'cccccccc-2222-0000-0000-000000000003'),
  18000::bigint,
  'diskon mengurangi total'
);

-- Diskon berlebih: total tidak boleh negatif, karena itu akan membuat
-- penjualan mencatat uang keluar.
select record_sale(
  p_sale_id     => 'cccccccc-2222-0000-0000-000000000004',
  p_tenant_id   => 'cccccccc-0000-0000-0000-000000000001',
  p_items       => '[{"product_id":"cccccccc-1111-0000-0000-000000000001",
                      "item_name":"Biskuit Roma","qty":1,
                      "unit_price":5000,"unit_cost":3500}]'::jsonb,
  p_wallet_id   => 'cccccccc-0000-0000-0000-0000000f0001',
  p_paid_amount => 0,
  p_discount    => 999999
);

select assert_eq(
  (select total_amount from sales where id = 'cccccccc-2222-0000-0000-000000000004'),
  0::bigint,
  'diskon berlebih dibatasi di subtotal, total tidak negatif'
);

-- ── Jumlah pecahan ───────────────────────────────────────────────────────

select record_sale(
  p_sale_id     => 'cccccccc-2222-0000-0000-000000000005',
  p_tenant_id   => 'cccccccc-0000-0000-0000-000000000001',
  p_items       => '[{"product_id":"cccccccc-1111-0000-0000-000000000001",
                      "item_name":"Snack timbang","qty":0.25,
                      "unit_price":30000,"unit_cost":22000}]'::jsonb,
  p_wallet_id   => 'cccccccc-0000-0000-0000-0000000f0001',
  p_paid_amount => 7500
);

select assert_eq(
  (select total_amount from sales where id = 'cccccccc-2222-0000-0000-000000000005'),
  7500::bigint,
  'barang timbang: 0,25 kg x Rp30.000'
);

-- Pembulatan harus sepadan dengan multiplyByQty() di sisi klien.
select assert_eq(
  money_round(10000 * 0.3335::numeric), 3335::bigint,
  'pembulatan peladen sepadan dengan pembulatan klien'
);
select assert_eq(
  money_round(1001 * 0.5::numeric), 501::bigint,
  'setengah dibulatkan menjauh dari nol'
);
select assert_eq(
  money_round(-1001 * 0.5::numeric), -501::bigint,
  'pembulatan simetris untuk nilai negatif — retur membatalkan penjualan dengan persis'
);

-- ── Kulakan ──────────────────────────────────────────────────────────────

select record_purchase(
  p_purchase_id   => 'cccccccc-4444-0000-0000-000000000001',
  p_tenant_id     => 'cccccccc-0000-0000-0000-000000000001',
  p_items         => '[{"product_id":"cccccccc-1111-0000-0000-000000000001",
                        "item_name":"Biskuit Roma","qty":100,"unit_cost":3600}]'::jsonb,
  p_wallet_id     => 'cccccccc-0000-0000-0000-0000000f0001',
  p_supplier_name => 'Toko Grosir Pak Har'
);

select assert_eq(
  (select total_amount from purchases where id = 'cccccccc-4444-0000-0000-000000000001'),
  360000::bigint,
  'total kulakan dihitung dari itemnya'
);

select assert_eq(
  (select cost_price from products where id = 'cccccccc-1111-0000-0000-000000000001'),
  3600::bigint,
  'harga modal diperbarui ke harga kulakan terakhir'
);

select assert_eq(
  (select direction from cash_entries
   where source_id = 'cccccccc-4444-0000-0000-000000000001'),
  'out',
  'kulakan mencatat uang keluar'
);

select assert_eq(
  (select category from cash_entries
   where source_id = 'cccccccc-4444-0000-0000-000000000001'),
  'purchase',
  'kulakan berkategori purchase — persediaan, bukan biaya'
);

-- ── Entri kas manual ─────────────────────────────────────────────────────

select record_cash(
  p_entry_id    => 'cccccccc-5555-0000-0000-000000000001',
  p_tenant_id   => 'cccccccc-0000-0000-0000-000000000001',
  p_direction   => 'out',
  p_amount      => 300000,
  p_category    => 'owner_draw',
  p_wallet_id   => 'cccccccc-0000-0000-0000-0000000f0001',
  p_note        => 'Belanja dapur'
);

select assert_eq(
  (select category from cash_entries where id = 'cccccccc-5555-0000-0000-000000000001'),
  'owner_draw',
  'ambil buat rumah tercatat sebagai owner_draw'
);

-- Kategori bersumber tidak boleh dibuat manual: buku kas tidak boleh
-- punya baris penjualan yang tidak berpasangan dengan penjualan mana pun.
select assert_denied($$
  select record_cash(
    p_entry_id  => gen_random_uuid(),
    p_tenant_id => 'cccccccc-0000-0000-0000-000000000001',
    p_direction => 'in',
    p_amount    => 1000,
    p_category  => 'sale',
    p_wallet_id => 'cccccccc-0000-0000-0000-0000000f0001'
  )
$$, 'kategori sale ditolak di jalur manual');

-- Arah dan kategori yang bertentangan ditahan constraint tabel.
select assert_denied($$
  insert into cash_entries (id, tenant_id, wallet_id, direction, amount, category)
  values (gen_random_uuid(), 'cccccccc-0000-0000-0000-000000000001',
          'cccccccc-0000-0000-0000-0000000f0001', 'out', 1000, 'sale')
$$, 'entri keluar berkategori sale ditolak constraint');

-- ── Pembatalan penjualan ─────────────────────────────────────────────────

select void_sale(
  'cccccccc-2222-0000-0000-000000000001',
  'cccccccc-0000-0000-0000-000000000001',
  'Salah input'
);

select assert_eq(
  (select stock_qty from products where id = 'cccccccc-1111-0000-0000-000000000002'),
  48::numeric,
  'pembatalan mengembalikan stok'
);

select assert_eq(
  (select count(*)::int from cash_entries
   where source_id = 'cccccccc-2222-0000-0000-000000000001' and direction = 'out'),
  1,
  'uang yang sudah diterima dikembalikan sebagai entri keluar, bukan dengan menghapus barisnya'
);

select assert_eq(
  (select voided_at is not null from sales
   where id = 'cccccccc-2222-0000-0000-000000000001'),
  true,
  'penjualan ditandai batal, bukan dihapus'
);

-- Pembatalan juga idempoten.
select void_sale(
  'cccccccc-2222-0000-0000-000000000001',
  'cccccccc-0000-0000-0000-000000000001'
);

select assert_eq(
  (select count(*)::int from cash_entries
   where source_id = 'cccccccc-2222-0000-0000-000000000001' and direction = 'out'),
  1,
  'pembatalan ulang tidak mengembalikan uang dua kali'
);

-- ── Buku kas cocok dengan uang yang berpindah ────────────────────────────

-- Pemeriksaan menyeluruh: saldo dompet menurut buku kas harus sama dengan
-- penjumlahan manual seluruh uang yang benar-benar berpindah di atas.
--
--   masuk  : 27.000 (tunai) + 10.000 + 14.000 (piutang)
--            + 18.000 (diskon) + 7.500 (timbang)
--   keluar : 360.000 (kulakan) + 300.000 (ambil rumah) + 27.000 (batal)
select assert_eq(
  (select coalesce(sum(case when direction = 'in' then amount else -amount end), 0)::bigint
   from cash_entries
   where tenant_id = 'cccccccc-0000-0000-0000-000000000001'),
  (27000 + 10000 + 14000 + 18000 + 7500 - 360000 - 300000 - 27000)::bigint,
  'saldo buku kas sama dengan jumlah seluruh uang yang berpindah'
);

reset role;
