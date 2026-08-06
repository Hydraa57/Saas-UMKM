#!/usr/bin/env bash
#
# Menjalankan migrasi dan pengujian database di PostgreSQL lokal.
#
# Dibuat karena Supabase CLI membutuhkan Docker, dan menunda pengujian
# skema sampai Docker tersedia berarti migrasi pertama yang benar-benar
# dijalankan adalah yang berjalan di produksi.
#
# Menyiapkan cluster uji sekali saja:
#
#   export PATH=/usr/lib/postgresql/16/bin:$PATH
#   initdb -D ~/pgdata -U postgres --auth=trust
#   pg_ctl -D ~/pgdata -l ~/pg.log -o '-p 55432 -k /tmp' start
#
# Lalu:
#   npm run db:test
#
# Variabel lingkungan:
#   PGPORT   port cluster uji (bawaan 55432)
#   PGHOST   soket atau host (bawaan /tmp)

set -uo pipefail

PGPORT="${PGPORT:-55432}"
PGHOST="${PGHOST:-/tmp}"
PGUSER="${PGUSER:-postgres}"
DB="nexausaha_test"

export PGPORT PGHOST PGUSER

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

psql -q -c "drop database if exists $DB" postgres >/dev/null 2>&1
psql -q -c "create database $DB" postgres >/dev/null

# ON_ERROR_STOP membuat psql keluar dengan kode bukan-nol pada error
# pertama, jadi kegagalan terdeteksi dari kode keluar — bukan dari
# mencocokkan kata di keluaran, yang mudah salah tebak.
apply() {
  if ! psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$1" >/dev/null 2>"$tmp"; then
    echo "  GAGAL  $(basename "$1")"
    sed 's/^/         /' "$tmp" | head -20
    return 1
  fi
  echo "  ok  $(basename "$1")"
}

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
status=0

echo "harness"
apply "$root/supabase/tests/00_harness.sql" || status=1

echo "migrasi"
for migration in "$root"/supabase/migrations/*.sql; do
  apply "$migration" || status=1
done

[ $status -ne 0 ] && exit $status

echo "pengujian"
for test_file in "$root"/supabase/tests/[1-9]*.sql; do
  [ -e "$test_file" ] || continue
  if psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$test_file" >/dev/null 2>"$tmp"; then
    count=$(grep -c '  ok  ' "$tmp" || true)
    echo "  ok  $(basename "$test_file")  ($count penegasan)"
  else
    echo "  GAGAL  $(basename "$test_file")"
    grep -A2 'GAGAL\|ERROR' "$tmp" | head -20 | sed 's/^/         /'
    status=1
  fi
done

exit $status
