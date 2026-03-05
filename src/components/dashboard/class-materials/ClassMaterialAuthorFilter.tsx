'use client'

import { useRouter, useSearchParams } from 'next/navigation'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface TeacherOption {
  id: string
  name: string | null
  email: string | null
}

interface ClassMaterialAuthorFilterProps {
  teachers: TeacherOption[]
  currentValue: string
  subject: string
}

export function ClassMaterialAuthorFilter({
  teachers,
  currentValue,
  subject,
}: ClassMaterialAuthorFilterProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value === '__all__') {
      params.delete('author')
    } else {
      params.set('author', value)
    }
    const qs = params.toString()
    router.push(`/dashboard/teacher/class-materials/${subject}${qs ? `?${qs}` : ''}`)
  }

  return (
    <Select value={currentValue || '__all__'} onValueChange={handleChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="전체" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">전체</SelectItem>
        {teachers.map((teacher) => (
          <SelectItem key={teacher.id} value={teacher.id}>
            {teacher.name ?? teacher.email ?? '이름 없음'}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
