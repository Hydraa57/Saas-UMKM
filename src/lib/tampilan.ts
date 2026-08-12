/**
 * Ukuran huruf pilihan pengguna.
 *
 * Aplikasi ini dipakai kasir warung, tukang jahit, penjual pulsa, dan
 * pemilik kios yang usianya berjarak empat puluh tahun satu sama lain.
 * Satu ukuran huruf tidak bisa benar untuk semuanya, dan memilih ukuran
 * yang benar untuk yang matanya paling lemah berarti membuat aplikasinya
 * terasa seperti mainan bagi semua yang lain — tiap layar cuma memuat
 * separuh isinya, dan menutup satu hari penjualan perlu tiga kali gulir.
 *
 * Jadi ukurannya dipilih sendiri, sekali, dan diingat.
 *
 * **Kenapa `localStorage`, bukan tabel `meta` seperti setelan lain.**
 * Dua alasan, dan keduanya keras:
 *
 * 1. Ini setelan **perangkat**, bukan setelan usaha. HP anak yang ikut
 *    membantu di kasir tidak seharusnya berubah ukuran hurufnya karena
 *    pemiliknya memperbesar huruf di HP-nya sendiri. Yang disimpan di
 *    `meta` ikut tersalin ke peladen dan ikut turun ke perangkat lain.
 * 2. Ia harus terbaca **sebelum gambar pertama**. IndexedDB tidak bisa
 *    dibaca serentak; artinya halaman akan tergambar sekejap dengan
 *    ukuran bawaan lalu melompat ke ukuran pilihan. Lompatan itu terjadi
 *    tiap kali aplikasi dibuka, dan justru paling mengganggu bagi orang
 *    yang memilih huruf besar karena matanya sudah kesulitan.
 */

export const UKURAN = ['normal', 'besar'] as const
export type Ukuran = (typeof UKURAN)[number]

export const KUNCI_HURUF = 'ezura:huruf'

export const LABEL_UKURAN: Readonly<Record<Ukuran, string>> = {
  normal: 'Normal',
  besar: 'Besar',
}

export function bacaUkuran(): Ukuran {
  try {
    const t = localStorage.getItem(KUNCI_HURUF)
    return t === 'besar' ? 'besar' : 'normal'
  } catch {
    // Mode penyamaran di sebagian peramban melempar saat localStorage
    // disentuh. Ukuran huruf bukan alasan yang cukup untuk membuat
    // seluruh aplikasi gagal terbuka.
    return 'normal'
  }
}

export function pakaiUkuran(u: Ukuran): void {
  // Atribut dihapus, bukan disetel ke 'normal'. CSS-nya cuma punya satu
  // aturan (`[data-huruf='besar']`), jadi tidak adanya atribut memang
  // yang berarti normal — dan itu menghindari keadaan kedua yang harus
  // dijaga tetap sepadan dengan yang pertama.
  if (u === 'besar') document.documentElement.dataset['huruf'] = 'besar'
  else delete document.documentElement.dataset['huruf']

  try {
    localStorage.setItem(KUNCI_HURUF, u)
  } catch {
    // Pilihannya tetap berlaku untuk sesi ini, cuma tidak diingat.
  }
}

/**
 * Dijalankan sebelum React, langsung di dalam `<head>`.
 *
 * Ditulis sebagai string karena memang harus jadi `<script>` sebaris:
 * apa pun yang menunggu React sudah terlambat — halaman keburu tergambar
 * dengan ukuran bawaan. Sengaja sependek mungkin, dan seluruhnya di
 * dalam `try` supaya kegagalan membacanya tidak pernah menghalangi
 * halaman tampil.
 */
export const SKRIP_HURUF = `try{if(localStorage.getItem('${KUNCI_HURUF}')==='besar')document.documentElement.dataset.huruf='besar'}catch(e){}`
