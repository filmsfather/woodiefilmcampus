'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, X } from 'lucide-react'

import { createExamSessionAction } from '@/app/dashboard/principal/exams/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

function toLocalInputValue(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

export interface ExamClassOption {
  id: string
  name: string
  students: Array<{ id: string; name: string }>
}

interface ExamSessionCreateFormProps {
  examId: string
  classOptions: ExamClassOption[]
}

export function ExamSessionCreateForm({ examId, classOptions }: ExamSessionCreateFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [targetMode, setTargetMode] = useState<'class' | 'student'>('class')
  const [selectedClassIds, setSelectedClassIds] = useState<Set<string>>(new Set())
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set())
  const [studentClassFilter, setStudentClassFilter] = useState<string>('')
  const [durationMinutes, setDurationMinutes] = useState('60')
  const [opensAt, setOpensAt] = useState(() => toLocalInputValue(new Date()))
  const [closesAt, setClosesAt] = useState(() =>
    toLocalInputValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
  )

  const classesById = useMemo(() => new Map(classOptions.map((option) => [option.id, option])), [classOptions])

  const studentsById = useMemo(() => {
    const map = new Map<string, { id: string; name: string; className: string }>()
    for (const option of classOptions) {
      for (const student of option.students) {
        if (!map.has(student.id)) {
          map.set(student.id, { ...student, className: option.name })
        }
      }
    }
    return map
  }, [classOptions])

  const studentsForFilter = useMemo(() => {
    if (!studentClassFilter) return []
    return classesById.get(studentClassFilter)?.students ?? []
  }, [studentClassFilter, classesById])

  const totalStudents = useMemo(() => {
    const set = new Set<string>()
    selectedClassIds.forEach((classId) => {
      classesById.get(classId)?.students.forEach((student) => set.add(student.id))
    })
    selectedStudentIds.forEach((studentId) => set.add(studentId))
    return set.size
  }, [selectedClassIds, selectedStudentIds, classesById])

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

  const toggleStudent = (studentId: string) => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev)
      if (next.has(studentId)) {
        next.delete(studentId)
      } else {
        next.add(studentId)
      }
      return next
    })
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (selectedClassIds.size === 0 && selectedStudentIds.size === 0) {
      setError('대상 반 또는 학생을 1개 이상 선택해주세요.')
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
        studentIds: Array.from(selectedStudentIds),
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

      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => setTargetMode('class')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            targetMode === 'class' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          반별 출제
          {selectedClassIds.size > 0 && (
            <Badge variant="secondary" className="ml-2">
              {selectedClassIds.size}
            </Badge>
          )}
        </button>
        <button
          type="button"
          onClick={() => setTargetMode('student')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            targetMode === 'student' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          개별 출제
          {selectedStudentIds.size > 0 && (
            <Badge variant="secondary" className="ml-2">
              {selectedStudentIds.size}
            </Badge>
          )}
        </button>
      </div>

      {targetMode === 'class' && (
        <div className="space-y-2">
          <Label>대상 반</Label>
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
                  <span className="text-xs text-slate-400">{classOption.students.length}명</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {targetMode === 'student' && (
        <div className="space-y-3">
          <Label>개별 학생</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            <Select value={studentClassFilter} onValueChange={setStudentClassFilter}>
              <SelectTrigger>
                <SelectValue placeholder="반 선택" />
              </SelectTrigger>
              <SelectContent>
                {classOptions.map((classOption) => (
                  <SelectItem key={classOption.id} value={classOption.id}>
                    {classOption.name} ({classOption.students.length}명)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value=""
              onValueChange={(value) => {
                if (value && !selectedStudentIds.has(value)) {
                  toggleStudent(value)
                }
              }}
              disabled={!studentClassFilter}
            >
              <SelectTrigger>
                <SelectValue placeholder={studentClassFilter ? '학생 선택' : '반을 먼저 선택하세요'} />
              </SelectTrigger>
              <SelectContent>
                {studentsForFilter
                  .filter((student) => !selectedStudentIds.has(student.id))
                  .map((student) => (
                    <SelectItem key={student.id} value={student.id}>
                      {student.name}
                    </SelectItem>
                  ))}
                {studentClassFilter &&
                  studentsForFilter.filter((student) => !selectedStudentIds.has(student.id)).length === 0 && (
                    <div className="px-2 py-1.5 text-sm text-slate-500">추가할 학생이 없습니다</div>
                  )}
              </SelectContent>
            </Select>
          </div>

          {selectedStudentIds.size > 0 ? (
            <div className="space-y-2">
              {Array.from(selectedStudentIds).map((studentId) => {
                const student = studentsById.get(studentId)
                if (!student) return null
                return (
                  <div
                    key={studentId}
                    className="flex items-center justify-between rounded-lg border border-primary bg-primary/5 p-3 text-sm"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{student.name}</p>
                      <p className="text-xs text-slate-500">{student.className}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-slate-400 hover:text-slate-600"
                      disabled={isPending}
                      onClick={() => toggleStudent(studentId)}
                    >
                      <X className="h-4 w-4" />
                      <span className="sr-only">제거</span>
                    </Button>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
              개별 학생을 선택하여 출제할 수 있습니다.
            </p>
          )}
        </div>
      )}

      {totalStudents > 0 && (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          총 <span className="font-semibold text-slate-900">{totalStudents}</span>명의 학생에게 출제됩니다.
        </div>
      )}

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
