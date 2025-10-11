import Link from 'next/link'

import { Button } from '@/components/ui/button'

interface AtelierPaginationProps {
  basePath: string
  page: number
  totalPages: number
  searchParams: Record<string, string | string[] | undefined>
}

export function AtelierPagination({ basePath, page, totalPages, searchParams }: AtelierPaginationProps) {
  if (totalPages <= 1) {
    return null
  }

  const createHref = (targetPage: number) => {
    const params = new URLSearchParams()

    Object.entries(searchParams).forEach(([key, value]) => {
      if (key === 'page') {
        return
      }

      if (Array.isArray(value)) {
        value.forEach((entry) => {
          if (entry !== undefined) {
            params.append(key, entry)
          }
        })
      } else if (typeof value === 'string' && value.length > 0) {
        params.set(key, value)
      }
    })

    if (targetPage > 1) {
      params.set('page', targetPage.toString())
    }

    const query = params.toString()
    return query.length > 0 ? `${basePath}?${query}` : basePath
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <Button asChild size="sm" variant="outline" disabled={page <= 1}>
        <Link href={createHref(Math.max(1, page - 1))}>이전</Link>
      </Button>
      <p className="text-sm text-slate-600">
        페이지 {page} / {totalPages}
      </p>
      <Button asChild size="sm" variant="outline" disabled={page >= totalPages}>
        <Link href={createHref(Math.min(totalPages, page + 1))}>다음</Link>
      </Button>
    </div>
  )
}
