'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { LayarCatat } from '@/components/LayarCatat'
import type { Book } from '@/lib/domain/types'

function Isi() {
  const params = useSearchParams()
  const buku: Book = params.get('buku') === 'rumah' ? 'rumah' : 'usaha'
  return <LayarCatat kind="income" book={buku} />
}

export default function CatatMasuk() {
  return (
    <Suspense fallback={<main className="flex-1 p-4" aria-busy="true" />}>
      <Isi />
    </Suspense>
  )
}
