'use client'

import { ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface DashboardBackLinkProps {
  fallbackHref: string
  label?: string
  className?: string
  hideIcon?: boolean
}

export default function DashboardBackLink({
  fallbackHref,
  label = '이전 페이지로 돌아가기',
  className,
  hideIcon = false,
}: DashboardBackLinkProps) {
  const router = useRouter()
  const [canGoBack, setCanGoBack] = useState(false)

  useEffect(() => {
    if (window.history.length > 1) {
      setCanGoBack(true)
    }
  }, [])

  const handleClick = () => {
    if (canGoBack) {
      router.back()
      return
    }
    router.push(fallbackHref)
  }

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={handleClick}
      className={cn(
        'group inline-flex w-fit items-center gap-2 px-0 text-sm font-medium text-slate-600 hover:text-slate-900',
        className
      )}
    >
      {hideIcon ? null : <ArrowLeft className="size-4 transition group-hover:-translate-x-0.5" aria-hidden="true" />}
      <span>{label}</span>
    </Button>
  )
}
