'use client'

import { useMemo, useState, useTransition } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertCircle, CalendarIcon, Check, Search, Users, X } from 'lucide-react'
import { useForm, type Resolver, type SubmitHandler } from 'react-hook-form'
import { z } from 'zod'

import { createAssignment } from '@/app/dashboard/assignments/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ko } from 'date-fns/locale'
import { Calendar } from '@/components/ui/calendar'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import DateUtil from '@/lib/date-util'
import type {
  AssignmentClassSummary,
  AssignmentStudentSummary,
  AssignmentWorkbookSummary,
} from '@/types/assignment'
import { WORKBOOK_TITLES } from '@/lib/validation/workbook'

const assignmentFormSchema = z
  .object({
    workbookIds: z.array(z.string()).min(1, { message: '문제집을 최소 1개 이상 선택해주세요.' }),
    targetClassIds: z.array(z.string()).default([]),
    targetStudentIds: z.array(z.string()).default([]),
    comment: z.string().max(500, { message: '코멘트는 500자 이내로 입력해주세요.' }).optional(),
    publishedAt: z.string().optional(),
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

    if (value.publishedAt) {
      const parsed = new Date(value.publishedAt)
      if (Number.isNaN(parsed.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['publishedAt'],
          message: '유효한 출제일을 입력해주세요.',
        })
      }
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

    // 출제일이 마감일보다 늦으면 안 됨
    if (value.publishedAt && value.dueAt) {
      const publishedTime = new Date(value.publishedAt).getTime()
      const dueTime = new Date(value.dueAt).getTime()
      if (!Number.isNaN(publishedTime) && !Number.isNaN(dueTime) && publishedTime >= dueTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['publishedAt'],
          message: '출제일은 마감일보다 이전이어야 합니다.',
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
  initialWorkbookIds?: string[]
}

function normalizeSearchTerm(term: string) {
  return term.trim().toLowerCase()
}

function filterWorkbooks(
  workbooks: AssignmentWorkbookSummary[],
  subject: string | '',
  type: string | 'all',
  authorId: string | 'all',
  query: string
) {
  const normalized = normalizeSearchTerm(query)

  return workbooks.filter((workbook) => {
    // 과목이 선택되지 않으면 빈 배열 반환 (필터 통과 안 함)
    if (!subject) {
      return false
    }

    if (subject !== 'all' && workbook.subject !== subject) {
      return false
    }

    if (type !== 'all' && workbook.type !== type) {
      return false
    }

    if (authorId !== 'all' && workbook.authorId !== authorId) {
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
  initialWorkbookIds = [],
}: AssignmentFormProps) {
  const defaultDueAt = toDateInputValue(serverNowIso)
  const [workbookSubjectFilter, setWorkbookSubjectFilter] = useState<'' | string>(() => {
    if (initialWorkbookIds.length > 0) {
      const wb = workbooks.find((w) => w.id === initialWorkbookIds[0])
      return wb?.subject ?? ''
    }
    return ''
  })
  const [workbookTypeFilter, setWorkbookTypeFilter] = useState<'all' | string>('all')
  const [workbookAuthorFilter, setWorkbookAuthorFilter] = useState<'all' | string>('all')
  const [workbookQuery, setWorkbookQuery] = useState('')
  const [studentClassFilter, setStudentClassFilter] = useState<string>('')
  const [targetMode, setTargetMode] = useState<'class' | 'student'>('class')
  const [submitState, setSubmitState] = useState<'idle' | 'success' | 'scheduled' | 'error'>('idle')
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const form = useForm<AssignmentFormValues>({
    resolver: zodResolver(assignmentFormSchema) as Resolver<AssignmentFormValues>,
    defaultValues: {
      workbookIds: initialWorkbookIds,
      targetClassIds: [],
      targetStudentIds: [],
      publishedAt: '',
      dueAt: defaultDueAt,
    },
    mode: 'onBlur',
  })

  const selectedClassIds = form.watch('targetClassIds')
  const selectedStudentIds = form.watch('targetStudentIds')
  const selectedWorkbookIds = form.watch('workbookIds')

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
    () => filterWorkbooks(workbooks, workbookSubjectFilter, workbookTypeFilter, workbookAuthorFilter, workbookQuery),
    [workbooks, workbookSubjectFilter, workbookTypeFilter, workbookAuthorFilter, workbookQuery]
  )

  // 작성자 목록 추출 (중복 제거)
  const authorOptions = useMemo(() => {
    const authorMap = new Map<string, string>()
    workbooks.forEach((workbook) => {
      if (workbook.authorId && workbook.authorName) {
        authorMap.set(workbook.authorId, workbook.authorName)
      }
    })
    return Array.from(authorMap.entries()).map(([id, name]) => ({ id, name }))
  }, [workbooks])

  // 선택된 반에 따른 학생 필터링 (드롭다운용)
  const studentsForSelectedClass = useMemo(() => {
    if (!studentClassFilter) {
      return []
    }
    return students.filter((student) => student.classId === studentClassFilter)
  }, [studentClassFilter, students])

  const handleToggleWorkbook = (workbookId: string) => {
    form.setValue(
      'workbookIds',
      selectedWorkbookIds.includes(workbookId)
        ? selectedWorkbookIds.filter((id) => id !== workbookId)
        : [...selectedWorkbookIds, workbookId],
      { shouldDirty: true, shouldValidate: true }
    )
  }

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

    const payloadPublishedAt = values.publishedAt ? new Date(values.publishedAt).toISOString() : null
    const payloadDueAt = values.dueAt ? new Date(values.dueAt).toISOString() : null

    startTransition(async () => {
      const results = await Promise.all(
        values.workbookIds.map((workbookId) =>
          createAssignment({
            workbookId,
            publishedAt: payloadPublishedAt,
            dueAt: payloadDueAt,
            comment: values.comment ?? null,
            targetClassIds: values.targetClassIds,
            targetStudentIds: values.targetStudentIds,
          })
        )
      )

      const failed = results.find((r) => r?.error)
      if (failed?.error) {
        setServerError(failed.error)
        setSubmitState('error')
        return
      }

      const isScheduled = payloadPublishedAt && new Date(payloadPublishedAt).getTime() > Date.now()
      setSubmitState(isScheduled ? 'scheduled' : 'success')
      form.reset({
        workbookIds: [],
        targetClassIds: [],
        targetStudentIds: [],
        comment: '',
        publishedAt: '',
        dueAt: defaultDueAt,
      })
      setWorkbookQuery('')
      setStudentClassFilter('')
      setWorkbookSubjectFilter('')
      setWorkbookTypeFilter('all')
      setWorkbookAuthorFilter('all')
    })
  }

  const selectedWorkbooks = selectedWorkbookIds
    .map((id) => workbooks.find((workbook) => workbook.id === id))
    .filter((wb): wb is AssignmentWorkbookSummary => wb !== undefined)

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

              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                <Select value={workbookSubjectFilter} onValueChange={(value) => setWorkbookSubjectFilter(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="과목 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {[...new Set(workbooks.map((workbook) => workbook.subject))].map((subject) => (
                      <SelectItem key={subject} value={subject}>
                        {subject}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={workbookAuthorFilter} onValueChange={(value) => setWorkbookAuthorFilter(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="작성자 필터" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체 작성자</SelectItem>
                    {authorOptions.map((author) => (
                      <SelectItem key={author.id} value={author.id}>
                        {author.name}
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
                        {WORKBOOK_TITLES[type as keyof typeof WORKBOOK_TITLES] ?? type}
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

              {!workbookSubjectFilter ? (
                <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                  과목을 선택하면 워크북 목록이 표시됩니다.
                </div>
              ) : (
                <FormField
                  control={form.control}
                  name="workbookIds"
                  render={() => (
                    <FormItem>
                      <FormLabel className="sr-only">워크북</FormLabel>
                      <FormControl>
                        <div className="space-y-3">
                          <Select
                            value=""
                            onValueChange={(value) => {
                              if (value && !selectedWorkbookIds.includes(value)) {
                                handleToggleWorkbook(value)
                              }
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="워크북을 선택하세요 (복수 선택 가능)" />
                            </SelectTrigger>
                            <SelectContent>
                              {filteredWorkbooks
                                .filter((workbook) => !selectedWorkbookIds.includes(workbook.id))
                                .map((workbook) => (
                                  <SelectItem key={workbook.id} value={workbook.id}>
                                    {workbook.title} ({workbook.itemCount}문항)
                                    {workbook.weekLabel && ` · ${workbook.weekLabel}`}
                                  </SelectItem>
                                ))}
                              {filteredWorkbooks.filter((wb) => !selectedWorkbookIds.includes(wb.id)).length === 0 && (
                                <div className="px-2 py-1.5 text-sm text-slate-500">
                                  {filteredWorkbooks.length === 0
                                    ? '조건에 맞는 워크북이 없습니다'
                                    : '모든 워크북이 선택되었습니다'}
                                </div>
                              )}
                            </SelectContent>
                          </Select>

                          {selectedWorkbooks.length > 0 && (
                            <div className="space-y-2">
                              {selectedWorkbooks.map((workbook) => (
                                <div
                                  key={workbook.id}
                                  className="flex items-start justify-between gap-2 rounded-lg border border-primary bg-primary/5 p-3"
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-slate-900">{workbook.title}</p>
                                    <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
                                      <Badge variant="secondary">{workbook.subject}</Badge>
                                      <Badge variant="outline">{WORKBOOK_TITLES[workbook.type as keyof typeof WORKBOOK_TITLES] ?? workbook.type}</Badge>
                                      {workbook.weekLabel && <Badge variant="outline">{workbook.weekLabel}</Badge>}
                                      {workbook.authorName && (
                                        <Badge variant="outline" className="bg-slate-100">
                                          {workbook.authorName}
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="mt-1.5 text-xs text-slate-500">
                                      문항 {workbook.itemCount}개 · 수정일{' '}
                                      {DateUtil.formatForDisplay(workbook.updatedAt, {
                                        year: 'numeric',
                                        month: 'short',
                                        day: 'numeric',
                                      })}
                                    </p>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 shrink-0 p-0 text-slate-400 hover:text-slate-600"
                                    onClick={() => handleToggleWorkbook(workbook.id)}
                                  >
                                    <X className="h-4 w-4" />
                                    <span className="sr-only">제거</span>
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}

                          {selectedWorkbooks.length === 0 && filteredWorkbooks.length > 0 && (
                            <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
                              워크북을 선택하면 상세 정보가 표시됩니다. 여러 개를 선택할 수 있습니다.
                            </p>
                          )}
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </section>

            <section className="space-y-4">
              <header className="space-y-1">
                <h2 className="text-lg font-semibold text-slate-900">2. 대상 선택</h2>
                <p className="text-sm text-slate-500">
                  반 단위로 출제하거나, 개별 학생을 선택해서 출제할 수 있습니다.
                </p>
              </header>

              {/* 탭 버튼 */}
              <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setTargetMode('class')}
                  className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                    targetMode === 'class'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  반별 출제
                  {selectedClassIds.length > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      {selectedClassIds.length}
                    </Badge>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setTargetMode('student')}
                  className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                    targetMode === 'student'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  개별 출제
                  {selectedStudentIds.length > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      {selectedStudentIds.length}
                    </Badge>
                  )}
                </button>
              </div>

              {/* 반별 출제 */}
              {targetMode === 'class' && (
                <div className="space-y-3">
                  {classes.length === 0 ? (
                    <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                      담당 중인 반이 없습니다. 관리자에게 반 배정을 요청해주세요.
                    </p>
                  ) : (
                    <>
                      <Select
                        value=""
                        onValueChange={(value) => {
                          if (value && !selectedClassIds.includes(value)) {
                            handleToggleClass(value)
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="반을 선택하세요" />
                        </SelectTrigger>
                        <SelectContent>
                          {classes
                            .filter((classItem) => !selectedClassIds.includes(classItem.id))
                            .map((classItem) => (
                              <SelectItem key={classItem.id} value={classItem.id}>
                                {classItem.name} ({classItem.studentCount}명)
                              </SelectItem>
                            ))}
                          {classes.filter((classItem) => !selectedClassIds.includes(classItem.id)).length === 0 && (
                            <div className="px-2 py-1.5 text-sm text-slate-500">
                              모든 반이 선택되었습니다
                            </div>
                          )}
                        </SelectContent>
                      </Select>

                      {selectedClassIds.length > 0 && (
                        <div className="space-y-2">
                          {selectedClassIds.map((classId) => {
                            const classItem = classesById.get(classId)
                            if (!classItem) return null
                            return (
                              <div
                                key={classId}
                                className="flex items-center justify-between rounded-lg border border-primary bg-primary/5 p-3 text-sm"
                              >
                                <div className="space-y-1">
                                  <p className="font-medium text-slate-900">{classItem.name}</p>
                                  {classItem.description && (
                                    <p className="text-xs text-slate-500">{classItem.description}</p>
                                  )}
                                  <p className="text-xs text-slate-500">학생 {classItem.studentCount}명</p>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-slate-400 hover:text-slate-600"
                                  onClick={() => handleToggleClass(classId)}
                                >
                                  <X className="h-4 w-4" />
                                  <span className="sr-only">제거</span>
                                </Button>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {selectedClassIds.length === 0 && (
                        <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
                          반을 선택하면 해당 반의 모든 학생에게 과제가 배정됩니다.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* 개별 출제 */}
              {targetMode === 'student' && (
                <div className="space-y-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Select
                      value={studentClassFilter}
                      onValueChange={setStudentClassFilter}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="반 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {classes.map((classItem) => (
                          <SelectItem key={classItem.id} value={classItem.id}>
                            {classItem.name} ({classItem.studentCount}명)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value=""
                      onValueChange={(value) => {
                        if (value && !selectedStudentIds.includes(value)) {
                          handleToggleStudent(value)
                        }
                      }}
                      disabled={!studentClassFilter}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={studentClassFilter ? "학생 선택" : "반을 먼저 선택하세요"} />
                      </SelectTrigger>
                      <SelectContent>
                        {studentsForSelectedClass
                          .filter((student) => !selectedStudentIds.includes(student.id))
                          .map((student) => (
                            <SelectItem key={student.id} value={student.id}>
                              {student.name ?? student.email ?? '이름 미등록'}
                            </SelectItem>
                          ))}
                        {studentsForSelectedClass.filter((student) => 
                          !selectedStudentIds.includes(student.id)
                        ).length === 0 && studentClassFilter && (
                          <div className="px-2 py-1.5 text-sm text-slate-500">
                            추가할 학생이 없습니다
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedStudentIds.length > 0 ? (
                    <div className="space-y-2">
                      {selectedStudentIds.map((studentId) => {
                        const student = students.find((s) => s.id === studentId)
                        if (!student) return null
                        return (
                          <div
                            key={studentId}
                            className="flex items-center justify-between rounded-lg border border-primary bg-primary/5 p-3 text-sm"
                          >
                            <div className="space-y-1">
                              <p className="font-medium text-slate-900">{student.name ?? '이름 미등록'}</p>
                              <p className="text-xs text-slate-500">
                                <Users className="mr-1 inline size-3" />
                                {student.className ?? '반 정보 없음'}
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-slate-400 hover:text-slate-600"
                              onClick={() => handleToggleStudent(studentId)}
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
                      개별 학생을 선택하여 과제를 배정할 수 있습니다.
                    </p>
                  )}
                </div>
              )}

              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                <p>
                  총 <span className="font-semibold text-slate-900">{totalSelectedStudents}</span>명의 학생에게 과제가 배정됩니다.
                </p>
              </div>
            </section>

            <section className="space-y-4">
              <header className="space-y-1">
                <h2 className="text-lg font-semibold text-slate-900">3. 과제 코멘트</h2>
                <p className="text-sm text-slate-500">학생에게 전달할 안내사항이나 참고 메시지를 작성할 수 있습니다. (선택)</p>
              </header>

              <FormField
                control={form.control}
                name="comment"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="예: 이번주 수업시간에 배운 z축 활용을 꼭 참고해주세요!"
                        className="min-h-[80px] resize-y"
                        maxLength={500}
                      />
                    </FormControl>
                    <div className="flex items-center justify-between">
                      <FormMessage />
                      <p className="text-xs text-slate-400">{field.value?.length ?? 0}/500</p>
                    </div>
                  </FormItem>
                )}
              />
            </section>

            <section className="space-y-4">
              <header className="space-y-1">
                <h2 className="text-lg font-semibold text-slate-900">4. 일정 설정</h2>
                <p className="text-sm text-slate-500">출제일을 설정하면 해당 시점에 학생에게 과제가 공개됩니다.</p>
              </header>

              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="publishedAt"
                  render={({ field }) => {
                    const dateValue = field.value ? new Date(field.value) : undefined
                    const timeValue = field.value
                      ? `${String(new Date(field.value).getHours()).padStart(2, '0')}:${String(new Date(field.value).getMinutes()).padStart(2, '0')}`
                      : '09:00'

                    const handleDateSelect = (date: Date | undefined) => {
                      if (!date) {
                        field.onChange('')
                        return
                      }
                      const [hours, minutes] = timeValue.split(':').map(Number)
                      date.setHours(hours, minutes, 0, 0)
                      field.onChange(toDateInputValue(date.toISOString()))
                    }

                    const handleTimeChange = (time: string) => {
                      if (!dateValue) return
                      const [hours, minutes] = time.split(':').map(Number)
                      const newDate = new Date(dateValue)
                      newDate.setHours(hours, minutes, 0, 0)
                      field.onChange(toDateInputValue(newDate.toISOString()))
                    }

                    return (
                      <FormItem>
                        <FormLabel>출제일 (예약)</FormLabel>
                        <div className="flex gap-2">
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className={`flex-1 justify-start text-left font-normal ${!dateValue ? 'text-muted-foreground' : ''}`}
                                >
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {dateValue
                                    ? DateUtil.formatForDisplay(dateValue.toISOString(), {
                                        year: 'numeric',
                                        month: 'short',
                                        day: 'numeric',
                                      })
                                    : '날짜 선택'}
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={dateValue}
                                onSelect={handleDateSelect}
                                locale={ko}
                              />
                              {dateValue && (
                                <div className="border-t p-3">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="w-full text-slate-500"
                                    onClick={() => field.onChange('')}
                                  >
                                    날짜 지우기
                                  </Button>
                                </div>
                              )}
                            </PopoverContent>
                          </Popover>
                          <Input
                            type="time"
                            value={dateValue ? timeValue : ''}
                            onChange={(e) => handleTimeChange(e.target.value)}
                            disabled={!dateValue}
                            className="w-28"
                          />
                        </div>
                        <FormMessage />
                        <p className="text-xs text-slate-500">
                          비워두거나 과거 시간이면 즉시 출제됩니다.
                        </p>
                      </FormItem>
                    )
                  }}
                />

                <FormField
                  control={form.control}
                  name="dueAt"
                  render={({ field }) => {
                    const dateValue = field.value ? new Date(field.value) : undefined
                    const timeValue = field.value
                      ? `${String(new Date(field.value).getHours()).padStart(2, '0')}:${String(new Date(field.value).getMinutes()).padStart(2, '0')}`
                      : '23:59'

                    const handleDateSelect = (date: Date | undefined) => {
                      if (!date) {
                        field.onChange('')
                        return
                      }
                      const [hours, minutes] = timeValue.split(':').map(Number)
                      date.setHours(hours, minutes, 0, 0)
                      field.onChange(toDateInputValue(date.toISOString()))
                    }

                    const handleTimeChange = (time: string) => {
                      if (!dateValue) return
                      const [hours, minutes] = time.split(':').map(Number)
                      const newDate = new Date(dateValue)
                      newDate.setHours(hours, minutes, 0, 0)
                      field.onChange(toDateInputValue(newDate.toISOString()))
                    }

                    return (
                      <FormItem>
                        <FormLabel>마감일</FormLabel>
                        <div className="flex gap-2">
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className={`flex-1 justify-start text-left font-normal ${!dateValue ? 'text-muted-foreground' : ''}`}
                                >
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {dateValue
                                    ? DateUtil.formatForDisplay(dateValue.toISOString(), {
                                        year: 'numeric',
                                        month: 'short',
                                        day: 'numeric',
                                      })
                                    : '날짜 선택'}
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={dateValue}
                                onSelect={handleDateSelect}
                                locale={ko}
                              />
                              {dateValue && (
                                <div className="border-t p-3">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="w-full text-slate-500"
                                    onClick={() => field.onChange('')}
                                  >
                                    날짜 지우기
                                  </Button>
                                </div>
                              )}
                            </PopoverContent>
                          </Popover>
                          <Input
                            type="time"
                            value={dateValue ? timeValue : ''}
                            onChange={(e) => handleTimeChange(e.target.value)}
                            disabled={!dateValue}
                            className="w-28"
                          />
                        </div>
                        <FormMessage />
                        <p className="text-xs text-slate-500">
                          비워두면 마감일 없이 배정됩니다.
                        </p>
                      </FormItem>
                    )
                  }}
                />
              </div>

              <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
                일정은 서버 기준 UTC 시각으로 저장되며, 학생 화면에서는 자동으로 브라우저 시간대로 표시됩니다.
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
                <span>과제 배정이 완료되었습니다. 학생들에게 즉시 공개됩니다.</span>
              </div>
            )}

            {submitState === 'scheduled' && !serverError && (
              <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                <Check className="size-4" />
                <span>예약 과제가 생성되었습니다. 출제일에 학생들에게 자동으로 공개됩니다.</span>
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
              <div>
                <p>
                  선택한 워크북:{' '}
                  {selectedWorkbooks.length > 0 ? (
                    <span className="font-semibold text-slate-900">
                      {selectedWorkbooks.length}개
                      {selectedWorkbooks.length <= 3 && (
                        <> ({selectedWorkbooks.map((wb) => wb.title).join(', ')})</>
                      )}
                    </span>
                  ) : (
                    <span className="text-slate-500">미선택</span>
                  )}
                </p>
                <p>
                  배정 대상 학생: <span className="font-semibold text-slate-900">{totalSelectedStudents}</span>명
                </p>
              </div>
              <Button type="submit" disabled={isPending}>
                {isPending ? '배정 중...' : `과제 배정하기${selectedWorkbooks.length > 1 ? ` (${selectedWorkbooks.length}건)` : ''}`}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}

export default AssignmentForm
