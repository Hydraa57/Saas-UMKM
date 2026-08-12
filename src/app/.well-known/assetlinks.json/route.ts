/**
 * Digital Asset Links.
 *
 * Berkas inilah yang membuat `.apk` hasil TWA membuka Ezura **tanpa
 * bilah alamat**. Android memeriksanya saat aplikasi dibuka: kalau
 * sidik jari sertifikat penanda tangan `.apk` tidak tercantum di sini,
 * aplikasinya tetap jalan tapi menampilkan bilah alamat Chrome di atas
 * layar — dan seluruh alasan membuat `.apk` hilang.
 *
 * Isinya dibaca dari env, bukan ditulis mati di repo. Sebabnya: sidik
 * jarinya lahir dari kunci penanda tangan yang dibuat saat `.apk`
 * pertama dibangun, jadi ia belum ada saat berkas ini ditulis. Menulis
 * nilai contoh justru berbahaya — Android akan membaca berkas yang
 * "ada tapi salah", lalu gagal dengan diam.
 *
 * Karena itu: **selama env-nya belum diisi, berkas ini sengaja 404.**
 * Tidak ada lebih jujur daripada salah, dan 404 adalah keadaan yang
 * dicari orang saat memeriksa kenapa bilah alamatnya masih muncul.
 *
 * Cara mengisinya ada di docs/09-pasang-di-hp.md.
 */

export const dynamic = 'force-dynamic'

export function GET() {
  const paket = process.env.ANDROID_PACKAGE_NAME
  const sidik = process.env.ANDROID_CERT_FINGERPRINT

  if (!paket || !sidik) {
    return new Response(
      'Belum disetel. Isi ANDROID_PACKAGE_NAME dan ANDROID_CERT_FINGERPRINT.',
      { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } },
    )
  }

  // Boleh lebih dari satu sidik jari, dipisah koma: satu untuk kunci
  // unggahan sendiri, satu lagi untuk kunci yang dipakai Play Store
  // kalau nanti penandatanganannya diserahkan ke sana. Melewatkan yang
  // kedua adalah cara paling umum bilah alamat muncul kembali justru
  // setelah aplikasinya terbit.
  const daftar = sidik
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length > 0)

  return Response.json(
    [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: paket,
          sha256_cert_fingerprints: daftar,
        },
      },
    ],
    {
      headers: {
        'content-type': 'application/json',
        // Dibaca Android sesekali, bukan tiap kali. Satu jam cukup untuk
        // menghemat permintaan tanpa membuat perbaikan sidik jari yang
        // salah tertahan berhari-hari.
        'cache-control': 'public, max-age=3600',
      },
    },
  )
}
