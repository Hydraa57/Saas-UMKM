-- `anon` tidak boleh membaca tabel apa pun.
--
-- Setelah hak fungsi ditutup, pemeriksaan di basis data sungguhan
-- menunjukkan `anon` masih punya `select` pada seluruh 12 tabel — lagi-lagi
-- dari default privileges Supabase. Hari ini tidak ada yang bocor, karena
-- RLS aktif di semuanya dan tidak satu pun policy menyebut `anon`.
--
-- Tapi itu menyisakan sifat yang buruk: **satu tabel baru yang lupa
-- `enable row level security` langsung bisa dibaca siapa saja lewat
-- `/rest/v1/<tabel>`, tanpa login.** Satu baris terlupa, seluruh isinya
-- terbuka.
--
-- Dengan haknya dicabut di sini, tabel yang lupa RLS gagal tertutup —
-- ditolak karena tidak berhak, bukan terbuka. Aplikasi ini tidak punya
-- satu pun pembacaan publik, jadi tidak ada yang hilang.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- `authenticated` tidak disentuh; hak-haknya tetap seperti di migrasi RLS.
