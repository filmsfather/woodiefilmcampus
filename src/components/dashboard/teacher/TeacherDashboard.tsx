'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  Calendar,
  FileText,
  Printer,
  Users,
} from 'lucide-react'

import DateUtil from '@/lib/date-util'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface AssignmentSummary {
  id: string
  dueAt: string | null
  createdAt: string
  targetScope: string
  title: string
  subject: string
  type: string
  weekLabel: string | null
  classes: Array<{ id: string; name: string }>
  studentTasks: Array<{
    id: string
    status: string
    completionAt: string | null
    updatedAt: string
    studentId: string
    student: {
      id: string
      name: string
      email: string | null
      classId: string | null
    }
    completedCount: number
    totalItems: number
  }>
  printRequests: Array<{
    id: string
    status: string
    studentTaskId: string | null
    desiredDate: string | null
    desiredPeriod: string | null
    copies: number
    colorMode: string
    createdAt: string
  }>
}

interface ClassSummary {
  id: string
  name: string
}

interface TeacherDashboardProps {
  teacherName: string | null
  assignments: AssignmentSummary[]
  classes: ClassSummary[]
  subjects: string[]
  workbookTypes: string[]
}

const TYPE_LABELS: Record<string, string> = {
  srs: 'SRS 반복',
  pdf: 'PDF 제출',
  writing: '서술형',
  film: '영화 감상',
  lecture: '인터넷 강의',
}

const STATUS_LABELS: Record<string, string> = {
  pending: '대기',
  not_started: '미시작',
  in_progress: '진행 중',
  completed: '완료',
  canceled: '취소',
}

export function TeacherDashboard({
  teacherName,
  assignments,
  classes,
  subjects,
  workbookTypes,
}: TeacherDashboardProps) {
  const [classFilter, setClassFilter] = useState<string>('all')
  const [subjectFilter, setSubjectFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [query, setQuery] = useState('')

  const classLookup = useMemo(() => new Map(classes.map((item) => [item.id, item.name])), [classes])

  const normalizedQuery = query.trim().toLowerCase()

  const filteredAssignments = useMemo(() => {
    return assignments.filter((assignment) => {
      const matchesClass = (() => {
        if (classFilter === 'all') {
          return true
        }
        if (assignment.classes.some((cls) => cls.id === classFilter)) {
          return true
        }
        return assignment.studentTasks.some((task) => task.student.classId === classFilter)
      })()

      if (!matchesClass) {
        return false
      }

      if (subjectFilter !== 'all' && assignment.subject !== subjectFilter) {
        return false
      }

      if (typeFilter !== 'all' && assignment.type !== typeFilter) {
        return false
      }

      if (!normalizedQuery) {
        return true
      }

      const haystack = [
        assignment.title,
        assignment.weekLabel ?? '',
        assignment.subject,
        TYPE_LABELS[assignment.type] ?? assignment.type,
        assignment.classes.map((cls) => cls.name).join(' '),
        assignment.studentTasks.map((task) => task.student.name).join(' '),
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(normalizedQuery)
    })
  }, [assignments, classFilter, subjectFilter, typeFilter, normalizedQuery])

  const incompleteTasks = useMemo(() => {
    return filteredAssignments
      .flatMap((assignment) =>
        assignment.studentTasks
          .filter((task) => task.status !== 'completed' && task.status !== 'canceled')
          .map((task) => ({ assignment, task }))
      )
      .sort((a, b) => {
        const left = a.assignment.dueAt ? Date.parse(a.assignment.dueAt) : Number.MAX_SAFE_INTEGER
        const right = b.assignment.dueAt ? Date.parse(b.assignment.dueAt) : Number.MAX_SAFE_INTEGER
        return left - right
      })
  }, [filteredAssignments])

  const quickAssignmentCards = useMemo(() => {
    return filteredAssignments
      .map((assignment) => {
        const totalStudents = assignment.studentTasks.length
        const completedStudents = assignment.studentTasks.filter((task) => task.status === 'completed').length
        const completionRate = totalStudents === 0 ? 0 : Math.round((completedStudents / totalStudents) * 100)
        const hasPendingPrint = assignment.printRequests.some((request) => request.status === 'requested')

        return {
          id: assignment.id,
          title: assignment.title,
          dueAt: assignment.dueAt,
          subject: assignment.subject,
          type: assignment.type,
          classNames: assignment.classes.map((cls) => cls.name).join(', '),
          completionRate,
          totalStudents,
          completedStudents,
          hasPendingPrint,
        }
      })
      .sort((a, b) => {
        const left = a.dueAt ? Date.parse(a.dueAt) : Number.MAX_SAFE_INTEGER
        const right = b.dueAt ? Date.parse(b.dueAt) : Number.MAX_SAFE_INTEGER
        return left - right
      })
  }, [filteredAssignments])

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-slate-900">과제 점검 대시보드</h1>
            <p className="text-sm text-slate-600">
              {teacherName ?? '선생님'} 님, 진행 중인 과제와 학생 제출 현황을 확인하세요.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/dashboard/assignments/new">새 과제 출제</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard/workbooks">문제집 목록</Link>
            </Button>
          </div>
        </div>
      </header>

      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">필터</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1">
            <p className="text-xs text-slate-500">반</p>
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger>
                <SelectValue placeholder="반 전체" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                {classes.map((classItem) => (
                  <SelectItem key={classItem.id} value={classItem.id}>
                    {classItem.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-slate-500">과목</p>
            <Select value={subjectFilter} onValueChange={setSubjectFilter}>
              <SelectTrigger>
                <SelectValue placeholder="과목 전체" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                {subjects.map((subject) => (
                  <SelectItem key={subject} value={subject}>
                    {subject}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-slate-500">워크북 유형</p>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="유형 전체" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                {workbookTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {TYPE_LABELS[type] ?? type.toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-slate-500">검색</p>
            <Input
              placeholder="과제, 반, 학생 이름 검색"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">과제 카드</h2>
          <span className="text-xs text-slate-500">
            총 {filteredAssignments.length}개 과제 · 미완료 학생 {incompleteTasks.length}명
          </span>
        </div>
        {filteredAssignments.length === 0 ? (
          <Card className="border-dashed border-slate-200 bg-slate-50">
            <CardContent className="py-10 text-center text-sm text-slate-500">
              조건에 맞는 과제가 없습니다. 필터를 조정해보세요.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {quickAssignmentCards.map((assignment) => (
              <Card key={assignment.id} className="border-slate-200">
                <CardHeader className="space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <CardTitle className="text-base text-slate-900">{assignment.title}</CardTitle>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <Badge variant="outline">{assignment.subject}</Badge>
                        <Badge variant="secondary">
                          {TYPE_LABELS[assignment.type] ?? assignment.type.toUpperCase()}
                        </Badge>
                        {assignment.classNames && <span>{assignment.classNames}</span>}
                      </div>
                    </div>
                    <Badge variant={assignment.hasPendingPrint ? 'destructive' : 'outline'} className="whitespace-nowrap">
                      {assignment.hasPendingPrint ? '인쇄 대기' : '인쇄 완료'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-slate-600">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Calendar className="h-3 w-3" />
                    {assignment.dueAt
                      ? DateUtil.formatForDisplay(assignment.dueAt, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '마감 없음'}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Users className="h-3 w-3" /> {assignment.completedStudents}/{assignment.totalStudents}명 완료
                    <Badge variant="outline" className="ml-auto">
                      {assignment.completionRate}%
                    </Badge>
                  </div>
                  <Button asChild variant="outline" size="sm" className="w-full">
                    <Link href={`/dashboard/teacher/assignments/${assignment.id}`}>
                      점검하기 <ArrowRight className="ml-1 h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">미완료 학생 목록</h2>
          <p className="text-xs text-slate-500">과제 상태를 빠르게 확인하고 점검 페이지로 이동하세요.</p>
        </div>
        {incompleteTasks.length === 0 ? (
          <Card className="border-dashed border-slate-200 bg-slate-50">
            <CardContent className="py-10 text-center text-sm text-emerald-600">
              현재 미완료 상태의 학생이 없습니다.
            </CardContent>
          </Card>
        ) : (
          <Card className="border-slate-200">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>학생</TableHead>
                    <TableHead>반</TableHead>
                    <TableHead>과제</TableHead>
                    <TableHead>유형</TableHead>
                    <TableHead>마감일</TableHead>
                    <TableHead>진행</TableHead>
                    <TableHead className="text-right">액션</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {incompleteTasks.map(({ assignment, task }) => {
                    const className = task.student.classId
                      ? classLookup.get(task.student.classId) ?? '반 정보 없음'
                      : assignment.classes[0]?.name ?? '반 정보 없음'
                    const dueLabel = assignment.dueAt
                      ? DateUtil.formatForDisplay(assignment.dueAt, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '마감 없음'

                    const statusLabel = STATUS_LABELS[task.status] ?? task.status
                    const remaining = Math.max(task.totalItems - task.completedCount, 0)

                    const isOverdue = assignment.dueAt
                      ? Date.parse(assignment.dueAt) < DateUtil.nowUTC().getTime()
                      : false

                    return (
                      <TableRow key={`${assignment.id}-${task.id}`}>
                        <TableCell className="max-w-[160px] truncate" title={task.student.name}>
                          {task.student.name}
                          {task.student.email && (
                            <p className="text-xs text-slate-500" title={task.student.email}>
                              {task.student.email}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>{className}</TableCell>
                        <TableCell className="max-w-[200px] truncate" title={assignment.title}>
                          {assignment.title}
                        </TableCell>
                        <TableCell>{TYPE_LABELS[assignment.type] ?? assignment.type.toUpperCase()}</TableCell>
                        <TableCell className={isOverdue ? 'text-destructive' : undefined}>{dueLabel}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{statusLabel}</Badge>
                            <span className="text-xs text-slate-500">남은 문항 {remaining}개</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild variant="ghost" size="sm">
                            <Link href={`/dashboard/teacher/assignments/${assignment.id}?studentTask=${task.id}`}>
                              상세 보기
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </section>

      <Card className="border-slate-200 bg-slate-50">
        <CardContent className="flex flex-wrap items-center gap-3 py-4 text-xs text-slate-500">
          <FileText className="h-4 w-4" />
          과제 유형에 따라 평가 방식이 다릅니다. PDF/영화 감상형은 Pass/Non-pass, 서술형은 Pass/Non-pass + 피드백을
          기록하세요. 인쇄 요청은 PDF 과제 탭에서 제출할 수 있습니다.
          <Printer className="h-4 w-4" />
        </CardContent>
      </Card>
    </section>
  )
}
