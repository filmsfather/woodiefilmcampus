'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface PeriodNavigatorProps {
  currentKey: string
  currentLabel: string
  options: Array<{ key: string; label: string }>
}

export function PeriodNavigator({ currentKey, currentLabel, options }: PeriodNavigatorProps) {
  const router = useRouter()

  const currentIndex = options.findIndex((opt) => opt.key === currentKey)
  const hasPrev = currentIndex < options.length - 1
  const hasNext = currentIndex > 0

  const handlePrev = () => {
    if (hasPrev) {
      const prevKey = options[currentIndex + 1].key
      router.push(`/dashboard/principal/assignments?period=${prevKey}`)
    }
  }

  const handleNext = () => {
    if (hasNext) {
      const nextKey = options[currentIndex - 1].key
      router.push(`/dashboard/principal/assignments?period=${nextKey}`)
    }
  }

  const handleSelect = (key: string) => {
    router.push(`/dashboard/principal/assignments?period=${key}`)
  }

  return (
    <div className="flex items-center justify-center gap-2">
      <Button
        variant="outline"
        size="icon"
        className="h-9 w-9"
        onClick={handlePrev}
        disabled={!hasPrev}
      >
        <ChevronLeft className="h-4 w-4" />
        <span className="sr-only">이전 주기</span>
      </Button>

      <Select value={currentKey} onValueChange={handleSelect}>
        <SelectTrigger className="w-[200px] text-center">
          <SelectValue>{currentLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.key} value={opt.key}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        variant="outline"
        size="icon"
        className="h-9 w-9"
        onClick={handleNext}
        disabled={!hasNext}
      >
        <ChevronRight className="h-4 w-4" />
        <span className="sr-only">다음 주기</span>
      </Button>
    </div>
  )
}
