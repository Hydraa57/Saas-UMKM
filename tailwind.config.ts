import type { Config } from 'tailwindcss'

/**
 * Token desain.
 *
 * Angkanya berasal dari keputusan UX di docs/02-prd.md §5, bukan dari
 * selera: penggunanya memakai HP Android, sering sambil melayani
 * pembeli, di ruangan yang terangnya tidak menentu.
 *
 * Satu ketegangan yang harus diselesaikan di berkas ini: aplikasinya
 * harus **terlihat modern** supaya orang percaya ini produk sungguhan,
 * sekaligus **terbaca dan bisa ditekan** oleh orang yang matanya tidak
 * lagi sempurna dan tangannya sedang memegang barang. Yang dikorbankan
 * kalau keduanya bertabrakan selalu yang pertama.
 */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      spacing: {
        // Target sentuh minimum. Jari, bukan kursor — dan jari yang
        // sedang buru-buru.
        touch: '3.5rem', // 56px
        'touch-lg': '5rem', // 80px
        // Tinggi bilah navigasi bawah + ruang aman iPhone.
        bilah: '4.75rem',
      },
      fontSize: {
        // Ukuran dasar dinaikkan dari 16px.
        base: ['1.0625rem', { lineHeight: '1.6' }],
        lg: ['1.1875rem', { lineHeight: '1.5' }],
        xl: ['1.375rem', { lineHeight: '1.35', letterSpacing: '-0.01em' }],
        '2xl': ['1.75rem', { lineHeight: '1.25', letterSpacing: '-0.02em' }],
        // Angka uang: harus terbaca dari jarak sekilas. Huruf dirapatkan
        // karena angka besar yang renggang terlihat seperti dua angka.
        money: ['2.5rem', { lineHeight: '1.05', fontWeight: '700', letterSpacing: '-0.03em' }],
        'money-lg': ['3.25rem', { lineHeight: '1', fontWeight: '700', letterSpacing: '-0.035em' }],
      },
      colors: {
        /**
         * Warna merek. Dipakai untuk yang bisa ditekan dan untuk
         * penanda posisi — **tidak pernah** untuk uang.
         *
         * Nila dipilih justru karena ia bukan hijau maupun merah: kalau
         * warna merek ikut memakai hijau, "tombol utama" dan "uang
         * masuk" jadi warna yang sama, dan pengguna berhenti bisa
         * membedakan mana yang informasi dan mana yang tindakan.
         */
        merek: {
          50: '#eef1ff',
          100: '#e0e5ff',
          200: '#c6cfff',
          300: '#a3b0fd',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#372fae',
          900: '#2e2a86',
          950: '#1b184f',
        },

        /**
         * Warna semantik, bukan nama warna: "uang masuk" tetap benar
         * kalau nanti hijaunya diganti.
         *
         * Ketiganya **datar**, dengan satu nada isian muda di baliknya.
         * Sebelumnya nadanya diambil dari ujung gelap skala Tailwind
         * (`emerald-700`, `red-700`) dan hasilnya kusam — angka uang masuk
         * terlihat seperti teks abu kehijauan, bukan seperti kabar baik.
         *
         * Percobaan berikutnya justru terlalu jauh ke arah sebaliknya, dan
         * itu ketahuan dari hitungan, bukan dari selera: `#d98407` cuma
         * mencapai **2,89** berbanding putih — gagal WCAG AA bahkan untuk
         * teks besar — padahal warna itulah yang dipakai kartu peringatan
         * di beranda. Warna peringatan yang tidak terbaca adalah cacat,
         * bukan pilihan gaya.
         *
         * Yang dipakai sekarang dipilih dengan menghitung rasio kontrasnya
         * satu per satu, termasuk **di atas nada mudanya sendiri** —
         * tempat label "MASUK" dan "KELUAR" berdiri. Semuanya ≥ 4,5.
         */
        masuk: { DEFAULT: '#0b8050', soft: '#eafaf3', kuat: '#076741' },
        keluar: { DEFAULT: '#d02b24', soft: '#fdecea', kuat: '#a81f19' },
        tunggu: { DEFAULT: '#a86200', soft: '#fef8ee', kuat: '#7d4900' },

        /**
         * Permukaan.
         *
         * Kartu dipisahkan dari latarnya oleh **beda warna**, bukan oleh
         * bayangan dan bukan pula oleh garis. Bayangan lembut di atas abu
         * muda adalah bacaan "templat": ia melunakkan tepi justru di layar
         * yang paling sering dipakai sambil silau. Garis satu piksel
         * sempat dicoba sebagai gantinya dan ternyata sama lemahnya —
         * garis samar di atas abu samar membuat sepuluh kartu berturut-
         * turut terlihat mengambang tanpa susunan.
         *
         * Yang dipakai sekarang: latar yang **cukup gelap** sehingga putih
         * penuh berdiri sendiri tanpa bantuan apa pun. Nol tinta tambahan,
         * dan tepinya tetap tegas di bawah matahari.
         *
         * `garis` tinggal untuk hal yang memang duduk di atas putih —
         * kolom isian, tombol sekunder, bilah bawah — tempat beda warna
         * tidak bisa dipakai.
         */
        latar: '#e7ebf3',
        garis: { DEFAULT: '#dce2ed', kuat: '#c3cbdb' },
        gelap: '#111726',
      },
      borderRadius: {
        // Dua nilai saja. Sebelumnya tiap komponen memilih sendiri
        // antara `rounded-2xl`, `rounded-kartu`, dan `rounded-kartu-lg`,
        // dan tepian yang tidak sepadan di satu layar terbaca sebagai
        // rakitan potongan — bukan sebagai satu produk.
        kartu: '1.125rem',
        'kartu-lg': '1.5rem',
      },
      boxShadow: {
        /**
         * Satu-satunya bayangan yang tersisa, dan cuma untuk yang
         * benar-benar melayang di atas isi halaman: tombol kasir di
         * tengah bilah bawah. Sisanya memakai garis.
         *
         * Bayangan dipakai untuk menyatakan "ini di lapisan lain".
         * Kalau setiap kartu memakainya, pernyataan itu tidak berarti
         * apa-apa lagi — dan yang tersisa cuma kekaburan di tepi.
         */
        melayang: '0 6px 16px -6px rgb(17 23 38 / 0.3)',
      },
      keyframes: {
        naik: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'none' },
        },
      },
      animation: {
        naik: 'naik 220ms cubic-bezier(0.16, 1, 0.3, 1) both',
      },
    },
  },
} satisfies Config
