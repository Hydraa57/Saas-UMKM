import * as M from '@/lib/money'
import type { Rupiah } from '@/lib/money'
import { daysBetween } from './dates'
import { outstanding } from './receivable'
import type { LocalDate, TailorOrder, TailorStatus } from './types'

/**
 * Order jahit.
 *
 * Bagian yang paling tidak punya padanan di aplikasi POS mana pun, dan
 * karena itu paling perlu ditulis dengan hati-hati. Jahitan bukan barang
 * yang berpindah tangan dalam sekali transaksi — ia melewati beberapa
 * hari, uang muka di depan, dan pelunasan di belakang.
 *
 * Nama status di sini masih hipotesis dan menunggu wawancara lapangan
 * (`docs/06-wawancara-lapangan.md` nomor 27). Kalau ternyata ibu bekerja
 * dengan tahapan yang berbeda, yang berubah cukup berkas ini dan satu
 * `check` di migrasi — bukan seluruh aplikasi.
 */

export const TAILOR_STATUS_LABELS: Readonly<Record<TailorStatus, string>> = {
  queued: 'Antre',
  in_progress: 'Dikerjakan',
  done: 'Sudah jadi',
  picked_up: 'Sudah diambil',
  cancelled: 'Batal',
}

/**
 * Perpindahan status yang diizinkan.
 *
 * `done → in_progress` sengaja dibuka: pelanggan datang, mencoba, minta
 * dikecilkan sedikit, dan jahitannya kembali ke mesin. Itu kejadian
 * biasa di tukang jahit, bukan kesalahan yang perlu dicegah.
 *
 * `picked_up` dan `cancelled` bersifat akhir. Kalau ternyata salah tekan,
 * yang benar adalah membatalkan lewat jalur koreksi yang tercatat —
 * bukan diam-diam mundur, karena uangnya sudah berpindah.
 */
const ALLOWED_TRANSITIONS: Readonly<Record<TailorStatus, readonly TailorStatus[]>> = {
  queued: ['in_progress', 'done', 'cancelled'],
  in_progress: ['done', 'queued', 'cancelled'],
  done: ['picked_up', 'in_progress'],
  picked_up: [],
  cancelled: [],
}

export function canTransition(from: TailorStatus, to: TailorStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to)
}

export function nextStatuses(from: TailorStatus): readonly TailorStatus[] {
  return ALLOWED_TRANSITIONS[from]
}

export function isOpen(order: TailorOrder): boolean {
  return order.status === 'queued' || order.status === 'in_progress'
}

export function isFinished(order: TailorOrder): boolean {
  return order.status === 'picked_up' || order.status === 'cancelled'
}

/** Sudah jadi tapi belum diambil — sering menumpuk dan mudah terlupakan. */
export function isAwaitingPickup(order: TailorOrder): boolean {
  return order.status === 'done'
}

export function remainingPayment(order: TailorOrder): Rupiah {
  return outstanding(order.price, order.paidAmount)
}

export function isFullyPaid(order: TailorOrder): boolean {
  return M.isZero(remainingPayment(order))
}

/**
 * Order yang belum selesai dan tanggal janjinya sudah lewat.
 *
 * Order yang sudah jadi tidak pernah dianggap telat meski lewat tanggal —
 * pekerjaannya sudah selesai, yang tersisa cuma pelanggannya belum
 * datang, dan itu masalah yang berbeda.
 */
export function isOverdue(order: TailorOrder, today: LocalDate): boolean {
  if (!order.promisedDate || !isOpen(order)) return false
  return order.promisedDate < today
}

export function isDueToday(order: TailorOrder, today: LocalDate): boolean {
  return isOpen(order) && order.promisedDate === today
}

export function isDueWithin(
  order: TailorOrder,
  today: LocalDate,
  days: number,
): boolean {
  if (!order.promisedDate || !isOpen(order)) return false
  const diff = daysBetween(today, order.promisedDate)
  return diff >= 0 && diff <= days
}

/**
 * Seberapa mendesak sebuah order. Dipakai untuk mengurutkan daftar dan
 * memilih warna penanda.
 */
export type Urgency = 'overdue' | 'today' | 'soon' | 'later' | 'none'

export function urgencyOf(order: TailorOrder, today: LocalDate): Urgency {
  if (!isOpen(order) || !order.promisedDate) return 'none'
  const diff = daysBetween(today, order.promisedDate)
  if (diff < 0) return 'overdue'
  if (diff === 0) return 'today'
  if (diff <= 3) return 'soon'
  return 'later'
}

const URGENCY_RANK: Readonly<Record<Urgency, number>> = {
  overdue: 0,
  today: 1,
  soon: 2,
  later: 3,
  none: 4,
}

/**
 * Urutan tampil: paling mendesak di atas, lalu tanggal janji paling awal.
 * Order tanpa tanggal janji turun ke bawah, tapi tidak hilang.
 */
export function sortByUrgency(
  orders: readonly TailorOrder[],
  today: LocalDate,
): TailorOrder[] {
  return [...orders].sort((a, b) => {
    const rank = URGENCY_RANK[urgencyOf(a, today)] - URGENCY_RANK[urgencyOf(b, today)]
    if (rank !== 0) return rank

    const dateA = a.promisedDate ?? '9999-12-31'
    const dateB = b.promisedDate ?? '9999-12-31'
    if (dateA !== dateB) return dateA < dateB ? -1 : 1

    return a.orderNo < b.orderNo ? -1 : a.orderNo > b.orderNo ? 1 : 0
  })
}

export interface TailorBoard {
  readonly overdue: readonly TailorOrder[]
  readonly dueToday: readonly TailorOrder[]
  readonly dueSoon: readonly TailorOrder[]
  readonly awaitingPickup: readonly TailorOrder[]
  readonly openCount: number
  /** Nilai pekerjaan yang sedang berjalan — belum jadi uang. */
  readonly openValue: Rupiah
  /** Sisa tagihan seluruh order yang belum lunas dan belum dibatalkan. */
  readonly unpaidTotal: Rupiah
}

/** Ringkasan untuk beranda dan layar jahit. */
export function buildBoard(
  orders: readonly TailorOrder[],
  today: LocalDate,
  soonWithinDays = 3,
): TailorBoard {
  const open = orders.filter(isOpen)

  return {
    overdue: sortByUrgency(
      open.filter((order) => isOverdue(order, today)),
      today,
    ),
    dueToday: open.filter((order) => isDueToday(order, today)),
    dueSoon: sortByUrgency(
      open.filter(
        (order) =>
          isDueWithin(order, today, soonWithinDays) && !isDueToday(order, today),
      ),
      today,
    ),
    awaitingPickup: orders.filter(isAwaitingPickup),
    openCount: open.length,
    openValue: M.sum(open.map((order) => order.price)),
    unpaidTotal: M.sum(
      orders
        .filter((order) => order.status !== 'cancelled')
        .map(remainingPayment),
    ),
  }
}

/**
 * Nomor order yang bisa diucapkan: `2026-0041`.
 *
 * Pelanggan menyebut nomor ini saat datang mengambil, jadi bentuknya
 * harus pendek dan mudah dibaca dari kertas — bukan UUID. Penomorannya
 * diulang tiap tahun supaya tidak pernah tumbuh terlalu panjang.
 */
export function formatOrderNo(year: number, sequence: number): string {
  return `${year}-${String(sequence).padStart(4, '0')}`
}

export function parseOrderNo(
  orderNo: string,
): { readonly year: number; readonly sequence: number } | null {
  const match = /^(\d{4})-(\d{1,6})$/.exec(orderNo)
  if (!match) return null
  return { year: Number(match[1]), sequence: Number(match[2]) }
}
