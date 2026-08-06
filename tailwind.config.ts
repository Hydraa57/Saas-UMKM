import type { Config } from 'tailwindcss'

/**
 * Token desain.
 *
 * Angkanya berasal dari keputusan UX di docs/02-prd.md §5.4, bukan dari
 * selera: pengguna satu-satunya adalah ibu, memakai HP Android, sering
 * sambil melayani pembeli, di ruangan yang terangnya tidak menentu.
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
      },
      fontSize: {
        // Ukuran dasar dinaikkan dari 16px. Pengguna sasarannya bukan
        // orang berumur dua puluhan dengan mata sempurna.
        base: ['1.125rem', { lineHeight: '1.6' }],
        lg: ['1.25rem', { lineHeight: '1.5' }],
        xl: ['1.5rem', { lineHeight: '1.4' }],
        // Angka uang di beranda: harus terbaca dari jarak sekilas.
        money: ['2.5rem', { lineHeight: '1.1', fontWeight: '700' }],
        'money-lg': ['3.25rem', { lineHeight: '1.05', fontWeight: '700' }],
      },
      colors: {
        // Warna semantik, bukan nama warna: "uang masuk" tetap benar
        // kalau nanti hijaunya diganti.
        masuk: { DEFAULT: '#047857', soft: '#d1fae5' },
        keluar: { DEFAULT: '#b91c1c', soft: '#fee2e2' },
        tunggu: { DEFAULT: '#b45309', soft: '#fef3c7' },
      },
    },
  },
} satisfies Config
