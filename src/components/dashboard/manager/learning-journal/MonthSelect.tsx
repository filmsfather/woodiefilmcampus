'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useGlobalAsyncTask } from '@/hooks/use-global-loading'

interface MonthSelectProps {
  options: string[]
  selected: string
}

function formatMonthLabel(token: string) {
  const [year, month] = token.split('-')
  return `${year}년 ${Number(month)}월`
}

export function MonthSelect({ options, selected }: MonthSelectProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { runWithLoading, isLoading: isPending } = useGlobalAsyncTask()

  const handleChange = (value: string) => {
    const params = new URLSearchParams(searchParams ?? undefined)
    params.set('month', value)
    void runWithLoading(async () => {
      router.push(`${pathname}?${params.toString()}`)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }

  return (
    <Select value={selected} onValueChange={handleChange} disabled={isPending}>
      <SelectTrigger className="w-44">
        <SelectValue placeholder="월 선택" />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {formatMonthLabel(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
