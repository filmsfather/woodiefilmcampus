'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

import { createExamSessionAction } from '@/app/dashboard/principal/exams/actions'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function toLocalInputValue(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

interface ExamSessionCreateFormProps {
  examId: string
  classOptions: Array<{ id: string; name: string; studentCount: number }>
}

export function ExamSessionCreateForm({ examId, classOptions }: ExamSessionCreateFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [selectedClassIds, setSelectedClassIds] = useState<Set<string>>(new Set())
  const [durationMinutes, setDurationMinutes] = useState('60')
  const [opensAt, setOpensAt] = useState(() => toLocalInputValue(new Date()))
  const [closesAt, setClosesAt] = useState(() =>
    toLocalInputValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
  )

  const toggleClass = (classId: string) => {
    setSelectedClassIds((prev) => {
      const next = new Set(prev)
      if (next.has(classId)) {
        next.delete(classId)
      } else {
        next.add(classId)
      }
      return next
    })
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (selectedClassIds.size === 0) {
      setError('대상 반을 1개 이상 선택해주세요.')
      return
    }

    const duration = Number(durationMinutes)
    if (!Number.isInteger(duration) || duration <= 0) {
      setError('제한시간을 올바르게 입력해주세요.')
      return
    }

    if (!opensAt || !closesAt) {
      setError('응시 기간을 입력해주세요.')
      return
    }

    startTransition(async () => {
      const result = await createExamSessionAction({
        examId,
        classIds: Array.from(selectedClassIds),
        durationMinutes: duration,
        opensAt: new Date(opensAt).toISOString(),
        closesAt: new Date(closesAt).toISOString(),
      })

      if (result.success) {
        router.push(`/dashboard/principal/exams/sessions/${result.id}`)
        router.refresh()
      } else {
        setError(result.error ?? '출제에 실패했습니다.')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="space-y-2">
        <Label>대상 반 *</Label>
        {classOptions.length === 0 ? (
          <p className="text-sm text-slate-500">등록된 반이 없습니다.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {classOptions.map((classOption) => (
              <label
                key={classOption.id}
                className="flex items-center gap-2 rounded-md border border-slate-200 p-2 text-sm text-slate-700"
              >
                <Checkbox
                  checked={selectedClassIds.has(classOption.id)}
                  disabled={isPending}
                  onChange={() => toggleClass(classOption.id)}
                />
                <span className="flex-1 truncate">{classOption.name}</span>
                <span className="text-xs text-slate-400">{classOption.studentCount}명</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="session-duration">제한시간(분) *</Label>
          <Input
            id="session-duration"
            type="number"
            min={1}
            max={1440}
            value={durationMinutes}
            onChange={(event) => setDurationMinutes(event.target.value)}
            disabled={isPending}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="session-opens">응시 시작 *</Label>
          <Input
            id="session-opens"
            type="datetime-local"
            value={opensAt}
            onChange={(event) => setOpensAt(event.target.value)}
            disabled={isPending}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="session-closes">응시 마감 *</Label>
          <Input
            id="session-closes"
            type="datetime-local"
            value={closesAt}
            onChange={(event) => setClosesAt(event.target.value)}
            disabled={isPending}
            required
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending || classOptions.length === 0}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          이 시험으로 출제하기
        </Button>
      </div>
    </form>
  )
}
