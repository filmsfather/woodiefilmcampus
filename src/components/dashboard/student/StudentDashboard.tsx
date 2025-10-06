'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  ListChecks,
  Tag,
} from 'lucide-react'

import { DashboardCard } from '../DashboardCard'
import { StatsCard } from '../StatsCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import DateUtil from '@/lib/date-util'
import type { StudentTaskSummary } from '@/types/student-task'

interface StudentDashboardProps {
  profileName: string | null
  tasks: StudentTaskSummary[]
  serverNowIso: string
}

type StatusFilterKey = 'all' | 'active' | 'completed'
type TimeFilterKey = 'all' | 'this_week' | 'last_week'

function getStartOfWeek(date: Date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = start.getUTCDay()
  const diff = day === 0 ? 6 : day - 1
  start.setUTCDate(start.getUTCDate() - diff)
  start.setUTCHours(0, 0, 0, 0)
  return start
}

function isWithinRange(date: Date, start: Date, end: Date) {
  return date.getTime() >= start.getTime() && date.getTime() < end.getTime()
}

function getStatusLabel(status: StudentTaskSummary['status']) {
  switch (status) {
    case 'completed':
      return '완료'
    case 'in_progress':
      return '진행 중'
    case 'not_started':
      return '미시작'
    case 'pending':
      return '대기'
    case 'canceled':
      return '취소'
    default:
      return status
  }
}

function getStatusVariant(status: StudentTaskSummary['status']): 'default' | 'outline' | 'secondary' | 'destructive' {
  switch (status) {
    case 'completed':
      return 'secondary'
    case 'in_progress':
      return 'default'
    case 'not_started':
    case 'pending':
      return 'outline'
    case 'canceled':
      return 'destructive'
    default:
      return 'outline'
  }
}

function formatDueDate(value: string | null) {
  if (!value) {
    return '마감 없음'
  }

  return DateUtil.formatForDisplay(value, {
    locale: 'ko-KR',
    timeZone: 'Asia/Seoul',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDateTime(value: string | null, fallback = '정보 없음') {
  if (!value) {
    return fallback
  }

  return DateUtil.formatForDisplay(value, {
    locale: 'ko-KR',
    timeZone: 'Asia/Seoul',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function StudentDashboard({ profileName, tasks, serverNowIso }: StudentDashboardProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilterKey>('all')
  const [timeFilter, setTimeFilter] = useState<TimeFilterKey>('all')

  const nowMs = useMemo(() => {
    const parsed = Date.parse(serverNowIso)
    if (Number.isNaN(parsed)) {
      return DateUtil.nowUTC().getTime()
    }
    return parsed
  }, [serverNowIso])
  const weekBoundaries = useMemo(() => {
    const now = new Date(nowMs)
    const startOfThisWeek = getStartOfWeek(now)
    const startOfNextWeek = new Date(startOfThisWeek)
    startOfNextWeek.setUTCDate(startOfNextWeek.getUTCDate() + 7)

    const startOfLastWeek = new Date(startOfThisWeek)
    startOfLastWeek.setUTCDate(startOfLastWeek.getUTCDate() - 7)

    return {
      startOfThisWeek,
      startOfNextWeek,
      startOfLastWeek,
    }
  }, [nowMs])

  const summary = useMemo(() => {
    const total = tasks.length
    const completed = tasks.filter((task) => task.status === 'completed')
    const active = tasks.filter((task) => task.status !== 'completed')
    const overdue = active.filter((task) => task.due.isOverdue)
    const dueSoon = active.filter((task) => !task.due.isOverdue && task.due.isDueSoon)
    const remainingItems = active.reduce((acc, task) => acc + task.summary.remainingItems, 0)

    const completionRate = total === 0 ? 0 : Math.round((completed.length / total) * 100)

    return {
      total,
      completed: completed.length,
      active: active.length,
      overdue: overdue.length,
      dueSoon: dueSoon.length,
      completionRate,
      remainingItems,
    }
  }, [tasks])

  const filteredByStatus = useMemo(() => {
    switch (statusFilter) {
      case 'active':
        return tasks.filter((task) => task.status !== 'completed')
      case 'completed':
        return tasks.filter((task) => task.status === 'completed')
      case 'all':
      default:
        return tasks
    }
  }, [tasks, statusFilter])

  const filteredTasks = useMemo(() => {
    if (timeFilter === 'all') {
      return filteredByStatus
    }

    return filteredByStatus.filter((task) => {
      if (!task.due.dueAt) {
        return false
      }

      const dueDate = new Date(task.due.dueAt)

      if (Number.isNaN(dueDate.getTime())) {
        return false
      }

      if (timeFilter === 'this_week') {
        return isWithinRange(dueDate, weekBoundaries.startOfThisWeek, weekBoundaries.startOfNextWeek)
      }

      if (timeFilter === 'last_week') {
        return isWithinRange(dueDate, weekBoundaries.startOfLastWeek, weekBoundaries.startOfThisWeek)
      }

      return true
    })
  }, [filteredByStatus, timeFilter, weekBoundaries])

  const sortedTasks = useMemo(() => {
    return [...filteredTasks].sort((a, b) => {
      const aDue = a.due.dueAt ? new Date(a.due.dueAt).getTime() : Number.MAX_SAFE_INTEGER
      const bDue = b.due.dueAt ? new Date(b.due.dueAt).getTime() : Number.MAX_SAFE_INTEGER

      if (a.due.isOverdue !== b.due.isOverdue) {
        return a.due.isOverdue ? -1 : 1
      }

      return aDue - bDue
    })
  }, [filteredTasks])

  const nowLabel = useMemo(
    () => DateUtil.formatForDisplay(serverNowIso, { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' }),
    [serverNowIso]
  )

  const renderTaskCard = (task: StudentTaskSummary) => {
    const workbook = task.assignment?.workbook
    const tags = workbook?.tags ?? []
    const dueBadge = task.due.dueAt ? formatDueDate(task.due.dueAt) : '마감 없음'

    return (
      <DashboardCard
        key={task.id}
        title={workbook?.title ?? '삭제된 문제집'}
        description={workbook?.subject ?? '과목 미정'}
        className="bg-white"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={getStatusVariant(task.status)}>{getStatusLabel(task.status)}</Badge>
            {task.due.isOverdue && (
              <Badge variant="destructive" className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                마감 지남
              </Badge>
            )}
            {!task.due.isOverdue && task.due.isDueSoon && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                마감 임박
              </Badge>
            )}
            {workbook?.weekLabel && (
              <Badge variant="outline">{workbook.weekLabel}</Badge>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Calendar className="h-4 w-4 text-slate-500" />
              <span>{dueBadge}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <ListChecks className="h-4 w-4 text-slate-500" />
              <span>
                진행 {task.summary.completedItems}/{task.summary.totalItems}
              </span>
            </div>
          </div>

          {tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <Tag className="h-3 w-3" />
              {tags.map((tag) => (
                <span key={tag} className="rounded-md bg-slate-100 px-2 py-1">
                  #{tag}
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-slate-500 space-y-1">
              <p>배정일: {formatDateTime(task.assignment?.createdAt ?? null)}</p>
              <p>최근 업데이트: {formatDateTime(task.updatedAt, '정보 없음')}</p>
            </div>
            <Button asChild size="sm">
              <Link href={`/dashboard/student/tasks/${task.id}`} className="w-full sm:w-auto">
                과제 열기
              </Link>
            </Button>
          </div>
        </div>
      </DashboardCard>
    )
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-slate-900">학생 대시보드</h1>
          <p className="text-sm text-slate-600">
            {profileName ?? '학생'}님, 현재 시각 {nowLabel} 기준 학습 현황입니다.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/student/film-notes" className="flex items-center gap-1">
            감상지 기록 보기
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatsCard
          title="남은 과제"
          value={summary.active}
          description={`총 ${summary.total}개 중`}
          icon={ListChecks}
        />
        <StatsCard
          title="완료율"
          value={`${summary.completionRate}%`}
          description={`${summary.completed}개 완료`}
          icon={CheckCircle2}
        />
        <StatsCard
          title="마감 임박"
          value={summary.dueSoon}
          description={summary.overdue > 0 ? `지연 ${summary.overdue}개` : '지연 과제 없음'}
          icon={AlertTriangle}
        />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {(
            [
              { key: 'all', label: '전체 기간' },
              { key: 'this_week', label: '이번주 마감' },
              { key: 'last_week', label: '지난주 마감' },
            ] as Array<{ key: TimeFilterKey; label: string }>
          ).map(({ key, label }) => (
            <Button
              key={key}
              variant={timeFilter === key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTimeFilter(key)}
              className={cn('rounded-full')}
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { key: 'all', label: `전체 (${summary.total})` },
              { key: 'active', label: `진행 중 (${summary.active})` },
              { key: 'completed', label: `완료 (${summary.completed})` },
            ] as Array<{ key: StatusFilterKey; label: string }>
          ).map(({ key, label }) => (
            <Button
              key={key}
              variant={statusFilter === key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(key)}
              className={cn('rounded-full')}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {sortedTasks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
          표시할 과제가 없습니다. 새로운 과제가 배정되면 이곳에 나타납니다.
        </div>
      ) : (
        <div className="grid gap-4">
          {sortedTasks.map(renderTaskCard)}
        </div>
      )}
    </section>
  )
}
