'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, X } from 'lucide-react'

import { createInterviewSessionAction } from '@/app/dashboard/teacher/mock-practice/interview/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export interface InterviewClassOption {
  id: string
  name: string
  students: Array<{ id: string; name: string }>
}

interface InterviewSessionCreateFormProps {
  setId: string
  classOptions: InterviewClassOption[]
}

export function InterviewSessionCreateForm({ setId, classOptions }: InterviewSessionCreateFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [targetMode, setTargetMode] = useState<'class' | 'student'>('class')
  const [selectedClassIds, setSelectedClassIds] = useState<Set<string>>(new Set())
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set())
  const [studentClassFilter, setStudentClassFilter] = useState<string>('')

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
      setError('반 또는 학생을 최소 1개 이상 선택해주세요.')
      return
    }

    startTransition(async () => {
      const result = await createInterviewSessionAction({
        setId,
        targetClassIds: Array.from(selectedClassIds),
        targetStudentIds: Array.from(selectedStudentIds),
      })

      if (result.success) {
        router.push(`/dashboard/teacher/mock-practice/interview/sessions/${result.id}`)
        router.refresh()
      } else {
        setError(result.error ?? '출제에 실패했습니다.')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
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
            <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              담당 중인 반이 없습니다. 관리자에게 반 배정을 요청해주세요.
            </p>
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

      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        총 <span className="font-semibold text-slate-900">{totalStudents}</span>명의 학생에게 출제됩니다. 출제 즉시
        학생 화면에 면접 문제가 공개됩니다.
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending || classOptions.length === 0}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          모의 면접 출제하기
        </Button>
      </div>
    </form>
  )
}
