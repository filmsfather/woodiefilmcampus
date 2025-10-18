'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'

interface CounselingNavItem {
  label: string
  description?: string
  href: string
}

interface CounselingNavProps {
  items: readonly CounselingNavItem[]
}

export function CounselingNav({ items }: CounselingNavProps) {
  const pathname = usePathname()

  return (
    <div className="flex flex-wrap gap-3">
      {items.map((item) => {
        const isActive = pathname?.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              'flex min-w-[180px] flex-col gap-1 rounded-lg border px-4 py-3 text-left transition hover:border-emerald-300 hover:bg-emerald-50/50',
              isActive
                ? 'border-emerald-400 bg-emerald-50 text-emerald-900 shadow-sm'
                : 'border-slate-200 bg-white text-slate-700'
            )}
          >
            <span className="text-sm font-semibold">{item.label}</span>
            {item.description ? (
              <span className="text-xs text-slate-500">{item.description}</span>
            ) : null}
          </Link>
        )
      })}
    </div>
  )
}
