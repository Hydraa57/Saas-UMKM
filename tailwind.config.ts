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
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b',
        },
        // Warna semantik, bukan nama warna: "uang masuk" tetap benar
        // kalau nanti hijaunya diganti.
        masuk: { DEFAULT: '#047857', soft: '#d1fae5' },
        keluar: { DEFAULT: '#b91c1c', soft: '#fee2e2' },
        tunggu: { DEFAULT: '#b45309', soft: '#fef3c7' },
      },
      borderRadius: {
        kartu: '1.25rem',
        'kartu-lg': '1.75rem',
      },
      boxShadow: {
        // Bayangan tipis berlapis, bukan satu bayangan tebal: yang tebal
        // terlihat seperti templat lama, yang berlapis terlihat seperti
        // kertas sungguhan.
        kartu: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)',
        naik: '0 4px 6px -1px rgb(15 23 42 / 0.07), 0 2px 4px -2px rgb(15 23 42 / 0.05)',
        bilah: '0 -1px 3px 0 rgb(15 23 42 / 0.06)',
        tombol: '0 4px 14px -4px rgb(79 70 229 / 0.45)',
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
