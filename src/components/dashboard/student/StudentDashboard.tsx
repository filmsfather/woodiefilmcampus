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
  weekLabel: string
}

type ActionVariant = 'default' | 'secondary' | 'outline'

interface DashboardActionItem {
  label: string
  href: string
  description: string
  variant: ActionVariant
}

const TODO_ACTIONS: DashboardActionItem[] = [
  {
    label: '이번달 학습 계획',
    href: '/dashboard/student/monthly-plan',
    description: '과목별 커리큘럼을 살펴보고 월간 학습 동선을 한눈에 정리합니다.',
    variant: 'default',
  },
  {
    label: '이번주 문제집 풀기',
    href: '/dashboard/student/tasks',
    description: '이번 주 배정된 문제집으로 바로 이동해 과제를 마무리합니다.',
    variant: 'secondary',
  },
]

const DONE_ACTIONS: DashboardActionItem[] = [
  {
    label: '지난달 학습 일지',
    href: '/dashboard/student/learning-journal',
    description: '지난달 학습 흐름과 피드백을 되돌아보며 개선 포인트를 찾습니다.',
    variant: 'default',
  },
  {
    label: '영화 감상 일지',
    href: '/dashboard/student/film-notes',
    description: '감상한 영화와 느낀 점을 차곡차곡 기록해 기억과 통찰을 정리합니다.',
    variant: 'secondary',
  },
  {
    label: '작품 아틀리에',
    href: '/dashboard/student/atelier',
    description: '다른 친구들의 과제를 둘러보고 배울 점을 발견해 자신의 작품에 반영해 보세요.',
    variant: 'outline',
  },
]

type StatusFilterKey = 'all' | 'active' | 'completed'

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

export function StudentDashboard({ profileName, tasks, serverNowIso, weekLabel }: StudentDashboardProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilterKey>('all')

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

  const filteredTasks = useMemo(() => filteredByStatus, [filteredByStatus])

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
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <DashboardCard
          title="해야할 일"
          description="이번 주 집중 과제와 월간 목표를 빠르게 파악하고 바로 실행할 수 있는 작업 공간입니다."
        >
          <div className="grid gap-4">
            {TODO_ACTIONS.map(({ label, href, description, variant }) => (
              <div key={href} className="flex flex-col gap-1">
                <Button asChild variant={variant} className="justify-start">
                  <Link href={href}>{label}</Link>
                </Button>
                <p className="text-xs text-slate-500">{description}</p>
              </div>
            ))}
          </div>
        </DashboardCard>
        <DashboardCard
          title="해냈던 일"
          description="지난 활동을 정리하며 성취를 확인하고 다음 학습에 참고할 기록 보관소입니다."
        >
          <div className="grid gap-4">
            {DONE_ACTIONS.map(({ label, href, description, variant }) => (
              <div key={href} className="flex flex-col gap-1">
                <Button asChild variant={variant} className="justify-start">
                  <Link href={href}>{label}</Link>
                </Button>
                <p className="text-xs text-slate-500">{description}</p>
              </div>
            ))}
          </div>
        </DashboardCard>
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
        <div className="text-sm text-slate-600">
          선택한 주간 과제: <span className="font-medium text-slate-900">{weekLabel}</span>
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
