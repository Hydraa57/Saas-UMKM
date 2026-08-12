/**
 * Menerjemahkan kegagalan jadi kalimat yang bisa ditindaklanjuti.
 *
 * Dua layar sebelumnya menampilkan `e.message` apa adanya. Yang muncul
 * di sana bukan kalimat melainkan istilah teknis berbahasa Inggris —
 * *"duplicate key value violates unique constraint sales_pkey"*,
 * *"JWT expired"*, *"Failed to fetch"*. Bagi yang membacanya sambil
 * melayani pembeli, ketiganya berarti hal yang sama: **aplikasinya rusak
 * dan saya tidak tahu harus apa.**
 *
 * Aturan yang dipakai berkas ini:
 *
 * 1. **Sebutkan apa yang terjadi, lalu apa yang bisa dilakukan.** Pesan
 *    yang cuma menyatakan kegagalan menyisakan pertanyaan yang sama.
 * 2. **Jangan menakut-nakuti untuk hal yang normal.** Sinyal hilang di
 *    warung bukan kerusakan; ia keadaan sehari-hari, dan catatannya
 *    memang sudah aman di HP. Pesannya harus terdengar seperti itu.
 * 3. **Jangan mengarang jaminan.** Kalau memang ada yang tidak beres dan
 *    penyebabnya tidak dikenali, katakan begitu — jangan menyamarkannya
 *    jadi "coba lagi nanti" yang membuat orang menunggu sesuatu yang
 *    tidak akan datang.
 *
 * Pesan `raise exception` dari jalur tulis **dilewatkan apa adanya**:
 * semuanya sudah ditulis dalam bahasa Indonesia sejak awal, dan
 * masing-masing menjelaskan aturan usaha yang memang dilanggar — "Jasa
 * tidak punya stok", "Penjualan tanpa item". Menerjemahkannya ulang di
 * sini berarti dua tempat yang harus dijaga tetap sepadan.
 */

interface GalatMirip {
  code?: string | null
  message?: string | null
  status?: number | null
  name?: string | null
}

/** Kode `raise exception` dari fungsi jalur tulis. Sudah berbahasa Indonesia. */
const KODE_ATURAN_USAHA = 'P0001'

const UMUM = 'Ada yang tidak beres. Catatannya tetap aman di HP ini.'

export function pesanGalat(e: unknown): string {
  const galat = (e ?? {}) as GalatMirip
  const kode = galat.code ?? ''
  const status = galat.status ?? 0
  const pesan = galat.message ?? ''

  // Aturan usaha yang sengaja ditegakkan peladen. Kalimatnya sudah
  // dirancang untuk dibaca pemiliknya.
  if (kode === KODE_ATURAN_USAHA && pesan.trim().length > 0) return pesan

  // Jaringan. Ini yang paling sering, dan justru yang paling tidak boleh
  // terdengar seperti kerusakan.
  if (galat.name === 'TypeError' && /fetch|network/i.test(pesan)) {
    return 'Tidak ada sambungan. Catatannya sudah tersimpan di HP dan akan terkirim sendiri begitu ada sinyal.'
  }
  if (status === 408 || status === 429 || status === 0) {
    if (status !== 0 || /fetch|network|timeout/i.test(pesan)) {
      return 'Sambungannya putus di tengah jalan. Akan dicoba lagi sendiri.'
    }
  }
  if (status >= 500) {
    return 'Peladennya sedang bermasalah, bukan HP-nya. Catatannya aman dan akan terkirim sendiri nanti.'
  }

  // Sesi. 401 tidak permanen — tokennya diperbarui otomatis dan
  // percobaan berikutnya berhasil.
  if (status === 401 || /jwt|token/i.test(pesan)) {
    return 'Sesi masuknya kedaluwarsa. Buka lagi layar cadangan untuk masuk ulang; catatannya tidak ada yang hilang.'
  }
  if (status === 403 || kode === '42501') {
    return 'Akun ini tidak berhak mengubah catatan usaha tersebut. Periksa apakah akunnya sudah benar.'
  }

  // Sudah pernah masuk. Ini justru kabar baik, dan sering muncul saat
  // pengiriman diulang setelah sambungan putus di tengah.
  if (kode === '23505') {
    return 'Catatan ini sudah pernah tersimpan sebelumnya, jadi tidak ditulis dua kali.'
  }
  if (kode === '23503') {
    return 'Catatan ini menunjuk ke barang atau dompet yang belum ada di peladen. Biasanya beres sendiri setelah katalognya ikut terkirim.'
  }
  if (kode === '23502' || kode === '23514' || kode.startsWith('22')) {
    return 'Isian catatan ini tidak diterima peladen. Catatannya tetap ada di HP, tapi perlu diperiksa.'
  }

  if (kode.startsWith('PGRST')) {
    return 'Permintaannya ditolak peladen. Catatannya tetap ada di HP ini.'
  }

  const auth = pesanAuth(pesan)
  if (auth) return auth

  return UMUM
}

/**
 * Galat dari Supabase Auth.
 *
 * Bentuknya berbeda dari galat basis data: tidak ada kode Postgres, cuma
 * kalimat berbahasa Inggris yang dicocokkan apa adanya. Rapuh secara
 * teori — kalimatnya bisa berubah sewaktu-waktu — tapi yang terjadi
 * kalau tidak dicocokkan sudah pasti: pemiliknya salah ketik sandi lalu
 * membaca *"Invalid login credentials"*, dan berhenti di situ.
 *
 * Yang gagal dicocokkan jatuh ke pesan umum, jadi kalimat baru dari
 * Supabase tidak pernah bocor ke layar.
 */
function pesanAuth(pesan: string): string | null {
  if (/invalid login credentials/i.test(pesan)) {
    return 'Email atau sandinya tidak cocok. Coba periksa lagi.'
  }
  if (/already registered|already exists/i.test(pesan)) {
    return 'Email ini sudah pernah didaftarkan. Masuk saja, jangan buat akun baru.'
  }
  if (/password should be at least (\d+)/i.test(pesan)) {
    const n = /at least (\d+)/i.exec(pesan)?.[1] ?? '6'
    return `Sandinya kependekan — paling sedikit ${n} huruf atau angka.`
  }
  if (/email not confirmed/i.test(pesan)) {
    return 'Emailnya belum dikonfirmasi. Buka email dari Ezura dulu, lalu masuk lagi di sini.'
  }
  if (/invalid format|unable to validate email/i.test(pesan)) {
    return 'Alamat emailnya belum benar. Periksa lagi ketikannya.'
  }
  if (/only request this after (\d+)/i.test(pesan)) {
    const n = /after (\d+)/i.exec(pesan)?.[1] ?? '60'
    return `Terlalu sering mencoba. Tunggu sekitar ${n} detik, lalu coba lagi.`
  }
  return null
}

/**
 * Apakah kegagalan ini sesuatu yang beres sendiri.
 *
 * Dipakai layar untuk memilih nada: yang beres sendiri ditampilkan
 * tenang, yang tidak ditampilkan sebagai hal yang perlu ditindak. Tanpa
 * pembedaan ini, sinyal yang hilang sebentar tergambar sama merahnya
 * dengan catatan yang benar-benar ditolak — dan sesudah beberapa kali,
 * yang merah berhenti dibaca.
 */
export function bisaBeresSendiri(e: unknown): boolean {
  const galat = (e ?? {}) as GalatMirip
  const status = galat.status ?? 0
  const pesan = galat.message ?? ''

  if (galat.name === 'TypeError' && /fetch|network/i.test(pesan)) return true
  if (status === 401 || status === 408 || status === 429) return true
  if (status >= 500) return true
  if ((galat.code ?? '') === '23503') return true
  return false
}
