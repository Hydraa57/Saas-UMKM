/**
 * Service worker.
 *
 * Tugasnya satu: membuat aplikasi terbuka tanpa menunggu jaringan.
 *
 * Data tidak disinggahkan di sini. Data ada di IndexedDB dan diurus
 * lapisan sinkronisasi (src/lib/sync/). Memisahkan keduanya penting —
 * singgahan jaringan yang menyimpan jawaban API akan menampilkan angka
 * lama tanpa cara mengetahui angka itu sudah usang, dan angka lama pada
 * aplikasi keuangan lebih buruk daripada tidak ada angka sama sekali.
 */

const VERSION = 'v1'
const SHELL_CACHE = `shell-${VERSION}`

// Hanya kerangka aplikasi. Halaman dan aset lain menyusul saat dikunjungi.
const SHELL = ['/', '/manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      // Pemasangan tidak boleh gagal hanya karena satu berkas belum ada;
      // aplikasi tetap harus jalan.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Panggilan ke Supabase tidak pernah disinggahkan — lihat catatan di
  // atas soal angka lama.
  if (url.pathname.startsWith('/api/')) return

  // Navigasi: coba jaringan dulu supaya pembaruan aplikasi cepat sampai,
  // tapi jatuh ke singgahan begitu jaringan tidak menjawab. Inilah yang
  // membuat aplikasi tetap terbuka di tempat tanpa sinyal.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy))
          return response
        })
        .catch(() =>
          caches.match(request).then((cached) => cached ?? caches.match('/')),
        ),
    )
    return
  }

  // Aset ber-hash: singgahan dulu, karena isinya tidak pernah berubah
  // untuk URL yang sama.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone()
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        }),
    ),
  )
})
