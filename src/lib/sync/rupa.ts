import type { OutboxItem } from '@/lib/db/local'
import * as M from '@/lib/money'

/**
 * Menyebut isi antrean dengan kata-kata pemiliknya.
 *
 * Sebuah baris antrean bentuknya `{ rpc: 'record_sale', args: { p_paid:
 * 45000, … } }`. Layar yang menampilkannya apa adanya menuntut
 * pemiliknya menebak: apakah `record_sale` yang tertolak itu penjualan
 * Bu Sri kemarin sore, atau yang barusan?
 *
 * Pertanyaan itu bukan main-main. Yang harus diputuskan di layar catatan
 * tertolak adalah **buang atau coba lagi**, dan keputusan itu tidak bisa
 * diambil tanpa tahu catatannya yang mana. Jadi tiap baris disebut
 * dengan hal yang paling menandainya di ingatan: jenisnya, nominalnya,
 * dan nama orangnya kalau ada.
 *
 * Nominal diambil dari argumen yang **sudah dikirim**, bukan dihitung
 * ulang dari tabel lokal. Alasannya: yang ditampilkan harus persis yang
 * ditolak peladen. Kalau barisnya sempat berubah di perangkat sesudah
 * masuk antrean, menghitung ulang akan menampilkan angka yang tidak
 * pernah dikirim ke mana-mana.
 */

export interface RupaAntrean {
  readonly judul: string
  /** Baris kedua, boleh kosong. */
  readonly rincian: string | null
}

function angka(nilai: unknown): number | null {
  return typeof nilai === 'number' && Number.isFinite(nilai) ? nilai : null
}

function teks(nilai: unknown): string | null {
  return typeof nilai === 'string' && nilai.trim().length > 0 ? nilai.trim() : null
}

function rupiah(nilai: unknown): string | null {
  const n = angka(nilai)
  return n === null ? null : M.format(M.rupiah(n))
}

export function rupaAntrean(item: OutboxItem): RupaAntrean {
  const a = item.args as Record<string, unknown>

  switch (item.rpc) {
    case 'record_sale': {
      const barang = Array.isArray(a['p_items']) ? a['p_items'] : []
      const nama = teks(a['p_customer_name'])
      // Totalnya tidak ada di argumen — peladen yang menghitungnya, dan
      // itu memang disengaja. Yang tersedia di sini `p_paid`, dan untuk
      // mengenali catatannya itu sudah cukup.
      const dibayar = rupiah(a['p_paid'])
      return {
        judul: dibayar ? `Penjualan · dibayar ${dibayar}` : 'Penjualan',
        rincian: [
          barang.length > 0 ? `${barang.length} baris` : null,
          nama ? `atas nama ${nama}` : null,
        ]
          .filter(Boolean)
          .join(' · ') || null,
      }
    }

    case 'record_purchase': {
      const barang = Array.isArray(a['p_items']) ? a['p_items'] : []
      const pemasok = teks(a['p_supplier_name'])
      return {
        judul: 'Kulakan',
        rincian: [
          barang.length > 0 ? `${barang.length} barang` : null,
          pemasok ? `dari ${pemasok}` : null,
        ]
          .filter(Boolean)
          .join(' · ') || null,
      }
    }

    case 'record_expense': {
      const jumlah = rupiah(a['p_amount'])
      return {
        judul: jumlah ? `Uang keluar ${jumlah}` : 'Uang keluar',
        rincian: teks(a['p_category']) ?? teks(a['p_note']),
      }
    }

    case 'pay_debt': {
      const jumlah = rupiah(a['p_amount'])
      return {
        judul: jumlah ? `Terima pembayaran utang ${jumlah}` : 'Terima pembayaran utang',
        rincian: null,
      }
    }

    case 'adjust_stock': {
      const hitung = angka(a['p_counted_qty'])
      return {
        judul: 'Koreksi stok',
        rincian: hitung === null ? null : `hasil hitung fisik: ${hitung}`,
      }
    }

    case 'void_sale':
      return { judul: 'Pembatalan struk', rincian: teks(a['p_reason']) }

    case 'upsert_item':
      return {
        judul: teks(a['p_name']) ?? 'Barang atau jasa',
        rincian: 'perubahan katalog',
      }

    case 'archive_item':
      return { judul: 'Arsipkan barang', rincian: null }

    case 'set_item_photo':
      return { judul: 'Foto barang', rincian: null }

    case 'create_tenant':
      return { judul: 'Pembuatan usaha', rincian: teks(a['p_name']) }

    case 'update_tenant':
      return { judul: 'Perubahan identitas usaha', rincian: teks(a['p_name']) }

    default:
      // Sengaja menyebut namanya apa adanya, bukan "Catatan lain".
      // Kalau suatu saat ada RPC baru yang lupa didaftarkan di sini,
      // yang muncul di layar adalah petunjuk yang bisa dicari di kode —
      // bukan kalimat halus yang menyembunyikan kelalaiannya.
      return { judul: item.rpc, rincian: null }
  }
}
