'use client'

import { useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertCircle, Check, Search, Users } from 'lucide-react'
import { useForm, type Resolver, type SubmitHandler } from 'react-hook-form'
import { z } from 'zod'

import { createAssignment } from '@/app/dashboard/assignments/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import DateUtil from '@/lib/date-util'
import type {
  AssignmentClassSummary,
  AssignmentStudentSummary,
  AssignmentWorkbookSummary,
} from '@/types/assignment'
import { useGlobalTransition } from '@/hooks/use-global-loading'

const assignmentFormSchema = z
  .object({
    workbookId: z.string().min(1, { message: '문제집을 선택해주세요.' }),
    targetClassIds: z.array(z.string()).default([]),
    targetStudentIds: z.array(z.string()).default([]),
    dueAt: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    const classCount = value.targetClassIds.length
    const studentCount = value.targetStudentIds.length

    if (classCount === 0 && studentCount === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['targetClassIds'],
        message: '반 또는 학생을 최소 한 명 이상 선택해주세요.',
      })
    }

    if (value.dueAt) {
      const parsed = new Date(value.dueAt)
      if (Number.isNaN(parsed.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['dueAt'],
          message: '유효한 마감일을 입력해주세요.',
        })
      }
    }
  })

type AssignmentFormValues = z.infer<typeof assignmentFormSchema>

interface AssignmentFormProps {
  teacherName: string | null
  workbooks: AssignmentWorkbookSummary[]
  classes: AssignmentClassSummary[]
  students: AssignmentStudentSummary[]
  serverNowIso: string
}

function normalizeSearchTerm(term: string) {
  return term.trim().toLowerCase()
}

function filterWorkbooks(
  workbooks: AssignmentWorkbookSummary[],
  subject: string | 'all',
  type: string | 'all',
  query: string
) {
  const normalized = normalizeSearchTerm(query)

  return workbooks.filter((workbook) => {
    if (subject !== 'all' && workbook.subject !== subject) {
      return false
    }

    if (type !== 'all' && workbook.type !== type) {
      return false
    }

    if (!normalized) {
      return true
    }

    const haystack = [
      workbook.title,
      workbook.subject,
      workbook.type,
      workbook.weekLabel ?? '',
      workbook.tags.join(' '),
    ]
      .join(' ')
      .toLowerCase()

    return haystack.includes(normalized)
  })
}

function toDateInputValue(isoString: string) {
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const pad = (value: number) => String(value).padStart(2, '0')
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  ].join('T')
}

export function AssignmentForm({
  teacherName,
  workbooks,
  classes,
  students,
  serverNowIso,
}: AssignmentFormProps) {
  const defaultDueAt = toDateInputValue(serverNowIso)
  const [workbookSubjectFilter, setWorkbookSubjectFilter] = useState<'all' | string>('all')
  const [workbookTypeFilter, setWorkbookTypeFilter] = useState<'all' | string>('all')
  const [workbookQuery, setWorkbookQuery] = useState('')
  const [studentQuery, setStudentQuery] = useState('')
  const [submitState, setSubmitState] = useState<'idle' | 'success' | 'error'>('idle')
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useGlobalTransition()

  const form = useForm<AssignmentFormValues>({
    resolver: zodResolver(assignmentFormSchema) as Resolver<AssignmentFormValues>,
    defaultValues: {
      workbookId: '',
      targetClassIds: [],
      targetStudentIds: [],
      dueAt: defaultDueAt,
    },
    mode: 'onBlur',
  })

  const selectedClassIds = form.watch('targetClassIds')
  const selectedStudentIds = form.watch('targetStudentIds')
  const selectedWorkbookId = form.watch('workbookId')

  const classesById = useMemo(() => new Map(classes.map((classItem) => [classItem.id, classItem])), [classes])

  const studentsFromSelectedClasses = useMemo(() => {
    const collected = new Set<string>()
    selectedClassIds.forEach((classId) => {
      const classInfo = classesById.get(classId)
      classInfo?.students.forEach((student) => collected.add(student.id))
    })
    return collected
  }, [selectedClassIds, classesById])

  const aggregatedStudentIds = useMemo(() => {
    const aggregated = new Set<string>()
    studentsFromSelectedClasses.forEach((studentId) => aggregated.add(studentId))
    selectedStudentIds.forEach((studentId) => aggregated.add(studentId))
    return aggregated
  }, [studentsFromSelectedClasses, selectedStudentIds])

  const filteredWorkbooks = useMemo(
    () => filterWorkbooks(workbooks, workbookSubjectFilter, workbookTypeFilter, workbookQuery),
    [workbooks, workbookSubjectFilter, workbookTypeFilter, workbookQuery]
  )

  const filteredStudents = useMemo(() => {
    const normalized = normalizeSearchTerm(studentQuery)

    if (!normalized) {
      return students
    }

    return students.filter((student) => {
      const haystack = [student.name ?? '', student.email ?? '', student.className ?? '']
        .join(' ')
        .toLowerCase()
      return haystack.includes(normalized)
    })
  }, [studentQuery, students])

  const handleToggleClass = (classId: string) => {
    form.setValue(
      'targetClassIds',
      selectedClassIds.includes(classId)
        ? selectedClassIds.filter((id) => id !== classId)
        : [...selectedClassIds, classId],
      { shouldDirty: true }
    )
  }

  const handleToggleStudent = (studentId: string) => {
    form.setValue(
      'targetStudentIds',
      selectedStudentIds.includes(studentId)
        ? selectedStudentIds.filter((id) => id !== studentId)
        : [...selectedStudentIds, studentId],
      { shouldDirty: true }
    )
  }

  const onSubmit: SubmitHandler<AssignmentFormValues> = (values) => {
    setServerError(null)
    setSubmitState('idle')

    const payloadDueAt = values.dueAt ? new Date(values.dueAt).toISOString() : null

    startTransition(async () => {
      const result = await createAssignment({
        workbookId: values.workbookId,
        dueAt: payloadDueAt,
        targetClassIds: values.targetClassIds,
        targetStudentIds: values.targetStudentIds,
      })

      if (result?.error) {
        setServerError(result.error)
        setSubmitState('error')
        return
      }

      setSubmitState('success')
      form.reset({
        workbookId: '',
        targetClassIds: [],
        targetStudentIds: [],
        dueAt: defaultDueAt,
      })
      setWorkbookQuery('')
      setStudentQuery('')
      setWorkbookSubjectFilter('all')
      setWorkbookTypeFilter('all')
    })
  }

  const selectedWorkbook = selectedWorkbookId
    ? workbooks.find((workbook) => workbook.id === selectedWorkbookId)
    : null

  const totalSelectedStudents = aggregatedStudentIds.size

  return (
    <Card className="border-slate-200">
      <CardHeader>
        <CardTitle>과제 출제</CardTitle>
        <p className="text-sm text-slate-500">
          {teacherName ?? '선생님'} 님, 워크북을 선택하고 대상 반 또는 학생에게 과제를 배정하세요.
        </p>
      </CardHeader>
      <CardContent className="space-y-8">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <section className="space-y-4">
              <header className="space-y-1">
                <h2 className="text-lg font-semibold text-slate-900">1. 워크북 선택</h2>
                <p className="text-sm text-slate-500">과목, 유형, 검색어로 원하는 워크북을 골라주세요.</p>
              </header>

              <div className="grid gap-3 md:grid-cols-3">
                <Select value={workbookSubjectFilter} onValueChange={(value) => setWorkbookSubjectFilter(value as typeof workbookSubjectFilter)}>
                  <SelectTrigger>
                    <SelectValue placeholder="과목 필터" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체 과목</SelectItem>
                    {[...new Set(workbooks.map((workbook) => workbook.subject))].map((subject) => (
                      <SelectItem key={subject} value={subject}>
                        {subject}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={workbookTypeFilter} onValueChange={(value) => setWorkbookTypeFilter(value as typeof workbookTypeFilter)}>
                  <SelectTrigger>
                    <SelectValue placeholder="유형 필터" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체 유형</SelectItem>
                    {[...new Set(workbooks.map((workbook) => workbook.type))].map((type) => (
                      <SelectItem key={type} value={type}>
                        {type.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="제목, 태그, 주차로 검색"
                    value={workbookQuery}
                    onChange={(event) => setWorkbookQuery(event.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              <FormField
                control={form.control}
                name="workbookId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="sr-only">워크북</FormLabel>
                    <FormControl>
                      <div className="grid gap-3 md:grid-cols-2">
                        {filteredWorkbooks.map((workbook) => {
                          const isActive = field.value === workbook.id
                          return (
                            <button
                              type="button"
                              key={workbook.id}
                              onClick={() => field.onChange(workbook.id)}
                              className={`rounded-lg border p-4 text-left transition ${
                                isActive
                                  ? 'border-primary bg-primary/5 shadow-sm'
                                  : 'border-slate-200 hover:border-primary/50 hover:bg-slate-50'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-base font-semibold text-slate-900">{workbook.title}</p>
                                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                                    <Badge variant="secondary">{workbook.subject}</Badge>
                                    <Badge variant="outline">{workbook.type.toUpperCase()}</Badge>
                                    {workbook.weekLabel && <Badge variant="outline">{workbook.weekLabel}</Badge>}
                                  </div>
                                </div>
                                {isActive && <Check className="size-5 text-primary" />}
                              </div>
                              <p className="mt-3 text-xs text-slate-500">
                                문항 {workbook.itemCount}개 · 수정일{' '}
                                {DateUtil.formatForDisplay(workbook.updatedAt, {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </p>
                            </button>
                          )
                        })}
                        {filteredWorkbooks.length === 0 && (
                          <p className="col-span-full rounded-md border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                            조건에 맞는 워크북이 없습니다. 필터를 변경해보세요.
                          </p>
                        )}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </section>

            <section className="space-y-4">
              <header className="space-y-1">
                <h2 className="text-lg font-semibold text-slate-900">2. 대상 선택</h2>
                <p className="text-sm text-slate-500">
                  반을 선택하면 소속 학생 전원이 포함되고, 개별 학생을 추가로 지정할 수도 있습니다.
                </p>
              </header>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-slate-800">반 목록</h3>
                    <span className="text-xs text-slate-500">선택 {selectedClassIds.length}개</span>
                  </div>
                  <div className="grid gap-2">
                    {classes.length === 0 && (
                      <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                        담당 중인 반이 없습니다. 관리자에게 반 배정을 요청해주세요.
                      </p>
                    )}
                    {classes.map((classItem) => {
                      const checked = selectedClassIds.includes(classItem.id)
                      return (
                        <label
                          key={classItem.id}
                          className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition ${
                            checked ? 'border-primary bg-primary/5' : 'border-slate-200 hover:border-primary/50'
                          }`}
                        >
                          <Checkbox
                            checked={checked}
                            onChange={() => handleToggleClass(classItem.id)}
                          />
                          <div className="space-y-1">
                            <p className="font-medium text-slate-900">{classItem.name}</p>
                            {classItem.description && <p className="text-xs text-slate-500">{classItem.description}</p>}
                            <p className="text-xs text-slate-500">학생 {classItem.studentCount}명</p>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-slate-800">개별 학생</h3>
                    <span className="text-xs text-slate-500">선택 {selectedStudentIds.length}명</span>
                  </div>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      placeholder="이름, 이메일, 반 이름으로 검색"
                      value={studentQuery}
                      onChange={(event) => setStudentQuery(event.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <div className="max-h-60 space-y-2 overflow-y-auto rounded-md border border-slate-200 bg-white p-2">
                    {filteredStudents.length === 0 ? (
                      <p className="p-3 text-sm text-slate-500">검색 조건에 맞는 학생이 없습니다.</p>
                    ) : (
                      filteredStudents.map((student) => {
                        const checked = selectedStudentIds.includes(student.id)
                        const includedByClass = studentsFromSelectedClasses.has(student.id)
                        return (
                          <label
                            key={student.id}
                            className={`flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 text-sm transition ${
                              checked
                                ? 'bg-primary/5 text-slate-900'
                                : includedByClass
                                  ? 'bg-slate-100 text-slate-600'
                                  : 'hover:bg-slate-100'
                            }`}
                          >
                            <Checkbox
                              checked={checked || includedByClass}
                              onChange={() => handleToggleStudent(student.id)}
                              disabled={includedByClass}
                            />
                            <div className="space-y-1">
                              <p className="font-medium text-slate-900">{student.name ?? '이름 미등록'}</p>
                              <p className="text-xs text-slate-500">{student.email ?? '이메일 미등록'}</p>
                              <p className="text-xs text-slate-400">
                                <Users className="mr-1 inline size-3" />
                                {student.className ?? '반 정보 없음'}
                                {includedByClass && ' · 반 선택으로 포함'}
                              </p>
                            </div>
                          </label>
                        )
                      })
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                <p>
                  총 <span className="font-semibold text-slate-900">{totalSelectedStudents}</span>명의 학생에게 과제가 배정됩니다.
                </p>
              </div>
            </section>

            <section className="space-y-4">
              <header className="space-y-1">
                <h2 className="text-lg font-semibold text-slate-900">3. 마감일 설정</h2>
                <p className="text-sm text-slate-500">선택하지 않으면 마감일 없이 배정됩니다.</p>
              </header>

              <div className="grid gap-4 md:grid-cols-[minmax(0,220px)_1fr]">
                <FormField
                  control={form.control}
                  name="dueAt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>마감일</FormLabel>
                      <FormControl>
                        <Input
                          type="datetime-local"
                          value={field.value ?? ''}
                          min={defaultDueAt}
                          onChange={(event) => field.onChange(event.target.value)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
                  마감일은 서버 기준 UTC 시각으로 저장되며, 학생 화면에서는 자동으로 브라우저 시간대로 표시됩니다.
                </div>
              </div>
            </section>

            {serverError && (
              <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertCircle className="size-4" />
                <span>{serverError}</span>
              </div>
            )}

            {submitState === 'success' && !serverError && (
              <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                <Check className="size-4" />
                <span>과제 배정이 완료되었습니다.</span>
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
              <div>
                <p>
                  선택한 워크북:{' '}
                  {selectedWorkbook ? (
                    <span className="font-semibold text-slate-900">{selectedWorkbook.title}</span>
                  ) : (
                    <span className="text-slate-500">미선택</span>
                  )}
                </p>
                <p>
                  배정 대상 학생: <span className="font-semibold text-slate-900">{totalSelectedStudents}</span>명
                </p>
              </div>
              <Button type="submit" disabled={isPending}>
                {isPending ? '배정 중...' : '과제 배정하기'}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}

export default AssignmentForm
