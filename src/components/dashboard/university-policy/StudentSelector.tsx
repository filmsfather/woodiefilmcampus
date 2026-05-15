'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface StudentOption {
  id: string
  label: string
  hint?: string
}

interface StudentSelectorProps {
  options: StudentOption[]
  selectedId: string | null
  paramName?: string
}

export default function StudentSelector({
  options,
  selectedId,
  paramName = 'studentId',
}: StudentSelectorProps) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const handleChange = (value: string) => {
    const next = new URLSearchParams(params?.toString() ?? '')
    if (value === '__none__') next.delete(paramName)
    else next.set(paramName, value)
    router.push(`${pathname}?${next.toString()}`)
  }

  return (
    <Select
      value={selectedId ?? '__none__'}
      onValueChange={handleChange}
    >
      <SelectTrigger className="w-[280px]">
        <SelectValue placeholder="학생을 선택하세요" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">학생 선택…</SelectItem>
        {options.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.label}
            {s.hint ? <span className="ml-2 text-xs text-slate-400">{s.hint}</span> : null}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
