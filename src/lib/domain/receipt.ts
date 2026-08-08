import * as M from '@/lib/money'
import type { Rupiah } from '@/lib/money'
import { calculateCart, changeDue } from './cart'
import { formatLocalDate, toLocalDate } from './dates'
import { PAYMENT_LABELS, type Sale } from './types'

/**
 * Struk.
 *
 * Dibentuk sebagai **teks polos lebar tetap**, bukan HTML. Alasannya
 * sekali kerja, dua kegunaan:
 *
 *   - Dibagikan lewat WhatsApp, teks polos terbaca di HP mana pun dan
 *     bisa disalin pembeli.
 *   - Dicetak ke printer termal, lebar 32 karakter memang format
 *     bawaannya (kertas 58mm).
 *
 * Membuat dua bentuk terpisah berarti dua tempat yang harus dijaga tetap
 * sepadan, dan struk yang berbeda antara yang dibagikan dan yang
 * dicetak adalah persis jenis selisih yang membuat pembeli curiga.
 */

/** Lebar kertas termal 58mm pada font bawaan. */
export const RECEIPT_WIDTH = 32

export interface ReceiptHeader {
  readonly businessName: string
  readonly phone?: string | null
  readonly address?: string | null
}

/** Satu baris: kiri rata kiri, kanan rata kanan, diisi spasi di tengah. */
function row(left: string, right: string, width = RECEIPT_WIDTH): string {
  const gap = width - left.length - right.length
  if (gap >= 1) return left + ' '.repeat(gap) + right
  // Kalau tidak muat, nominal yang menang — itu yang dicari mata.
  const trimmed = left.slice(0, Math.max(0, width - right.length - 1))
  return trimmed + ' ' + right
}

function center(text: string, width = RECEIPT_WIDTH): string {
  const pad = Math.max(0, Math.floor((width - text.length) / 2))
  return ' '.repeat(pad) + text
}

const rule = (char = '-', width = RECEIPT_WIDTH) => char.repeat(width)

/**
 * Menyusun struk sebagai teks.
 *
 * Jumlah ditulis di baris terpisah dari nama barang kalau namanya
 * panjang, supaya nama tidak pernah terpotong — pembeli perlu mengenali
 * apa yang dia beli, dan nama yang terpotong justru sumber pertanyaan.
 */
export function renderReceipt(
  sale: Sale,
  header: ReceiptHeader,
  width = RECEIPT_WIDTH,
): string {
  const totals = calculateCart(sale.lines, sale.discount)
  const lines: string[] = []

  lines.push(center(header.businessName.toUpperCase(), width))
  if (header.address) lines.push(center(header.address, width))
  if (header.phone) lines.push(center(header.phone, width))
  lines.push(rule('=', width))

  const tanggal = toLocalDate(sale.occurredAt)
  lines.push(row(`No ${sale.invoiceNo}`, formatLocalDate(tanggal), width))
  if (sale.customerName) lines.push(`Pembeli: ${sale.customerName}`)
  lines.push(rule('-', width))

  for (const line of sale.lines) {
    lines.push(line.itemName)
    const qty = formatQty(line.qty)
    lines.push(
      row(
        `  ${qty} x ${M.format(line.unitPrice, { withPrefix: false })}`,
        M.format(M.multiplyByQty(line.unitPrice, line.qty), { withPrefix: false }),
        width,
      ),
    )
  }

  lines.push(rule('-', width))
  lines.push(row('Subtotal', M.format(totals.subtotal, { withPrefix: false }), width))
  if (M.isPositive(totals.discount)) {
    lines.push(row('Diskon', '-' + M.format(totals.discount, { withPrefix: false }), width))
  }
  lines.push(row('TOTAL', M.format(totals.total, { withPrefix: false }), width))

  const method = sale.paymentMethod ? PAYMENT_LABELS[sale.paymentMethod] : 'Tunai'
  lines.push(row(`Bayar (${method})`, M.format(sale.paid, { withPrefix: false }), width))

  const kembali = changeDue(totals.total, sale.paid)
  if (M.isPositive(kembali)) {
    lines.push(row('Kembali', M.format(kembali, { withPrefix: false }), width))
  }

  const kurang = M.clampToZero(M.subtract(totals.total, sale.paid))
  if (M.isPositive(kurang)) {
    lines.push(row('KURANG', M.format(kurang, { withPrefix: false }), width))
  }

  lines.push(rule('=', width))
  lines.push(center('Terima kasih', width))

  if (sale.note) {
    lines.push('')
    lines.push(sale.note)
  }

  return lines.join('\n')
}

/** `1` → `1`, `0.25` → `0,25`. Tanpa nol di belakang koma yang mubazir. */
export function formatQty(qty: number): string {
  if (Number.isInteger(qty)) return String(qty)
  return String(Math.round(qty * 1000) / 1000).replace('.', ',')
}

/**
 * Tautan berbagi ke WhatsApp.
 *
 * Nomor boleh kosong — tanpa nomor, WhatsApp membuka pemilih kontak, dan
 * itu justru yang dibutuhkan saat pembelinya belum tersimpan.
 *
 * Nomor lokal (`08…`) diubah ke bentuk internasional karena `wa.me`
 * hanya menerima itu; nomor yang salah bentuk membuka percakapan kosong
 * tanpa pesan galat apa pun.
 */
export function whatsappShareUrl(text: string, phone?: string | null): string {
  const encoded = encodeURIComponent(text)
  const normalized = normalizePhone(phone)
  return normalized
    ? `https://wa.me/${normalized}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`
}

export function normalizePhone(phone?: string | null): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 8) return null
  if (digits.startsWith('62')) return digits
  if (digits.startsWith('0')) return '62' + digits.slice(1)
  return digits
}

/**
 * Struk siap kirim: dibungkus blok kode supaya WhatsApp menampilkannya
 * dengan lebar huruf tetap dan kolomnya tetap lurus.
 */
export function receiptForWhatsapp(
  sale: Sale,
  header: ReceiptHeader,
): string {
  return '```\n' + renderReceipt(sale, header) + '\n```'
}

export interface ReceiptSummary {
  readonly total: Rupiah
  readonly paid: Rupiah
  readonly change: Rupiah
  readonly outstanding: Rupiah
}

export function summarizeReceipt(sale: Sale): ReceiptSummary {
  const { total } = calculateCart(sale.lines, sale.discount)
  return {
    total,
    paid: sale.paid,
    change: changeDue(total, sale.paid),
    outstanding: M.clampToZero(M.subtract(total, sale.paid)),
  }
}
