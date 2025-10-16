'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'

import { loadExternalSubstitutes, updateExternalSubstitutePayStatus } from '@/app/dashboard/principal/payroll/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { ExternalTeacherPayStatus, TeacherProfileSummary } from '@/lib/work-logs'

interface ExternalSubstituteEntry {
  id: string
  teacher: TeacherProfileSummary | null
  workDate: string
  workHours: number | null
  notes: string | null
  externalTeacherName: string | null
  externalTeacherPhone: string | null
  externalTeacherBank: string | null
  externalTeacherAccount: string | null
  externalTeacherHours: number | null
  payStatus: ExternalTeacherPayStatus
}

interface ExternalSubstituteSummary {
  totalCount: number
  totalHours: number
  teacherCount: number
  monthLabel: string
}

interface ExternalSubstituteModalProps {
  open: boolean
  onOpenChange: (value: boolean) => void
  monthToken: string
}

interface GroupedEntries {
  teacher: TeacherProfileSummary | null
  entries: ExternalSubstituteEntry[]
}

const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
  month: 'long',
  day: 'numeric',
  weekday: 'short',
})

function formatHours(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '0시간'
  }
  const rounded = Math.round(value * 10) / 10
  return `${rounded % 1 === 0 ? Math.round(rounded) : rounded}시간`
}


function calculateEntryAmount(entry: ExternalSubstituteEntry): number {
  return entry.externalTeacherHours ?? entry.workHours ?? 0
}

const STATUS_LABEL: Record<ExternalTeacherPayStatus, string> = {
  pending: '미완료',
  completed: '완료',
}

const STATUS_BADGE: Record<ExternalTeacherPayStatus, 'outline' | 'secondary'> = {
  pending: 'outline',
  completed: 'secondary',
}

type StatusFilter = 'all' | ExternalTeacherPayStatus

export function ExternalSubstituteModal({ open, onOpenChange, monthToken }: ExternalSubstituteModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [entries, setEntries] = useState<ExternalSubstituteEntry[]>([])
  const [summary, setSummary] = useState<ExternalSubstituteSummary | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [updateState, startUpdate] = useTransition()
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    setIsLoading(true)
    setError(null)
    loadExternalSubstitutes(monthToken)
      .then((result) => {
        if (!result?.success || !Array.isArray(result.entries)) {
          setError(result?.error ?? '외부 대타 현황을 불러오지 못했습니다.')
          setEntries([])
          setSummary(null)
          return
        }
        setEntries(result.entries)
        setSummary(result.summary ?? null)
      })
      .catch((err) => {
        console.error('[payroll] load external substitutes error', err)
        setError('외부 대타 현황을 불러오지 못했습니다.')
        setEntries([])
        setSummary(null)
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [open, monthToken])

  const filteredEntries = useMemo(() => {
    if (statusFilter === 'all') {
      return entries
    }
    return entries.filter((entry) => entry.payStatus === statusFilter)
  }, [entries, statusFilter])

  const grouped = useMemo(() => {
    const map = new Map<string, GroupedEntries>()
    for (const entry of filteredEntries) {
      const key = entry.teacher?.id ?? entry.teacher?.email ?? `unknown-${entry.id}`
      const existing = map.get(key)
      if (existing) {
        existing.entries.push(entry)
      } else {
        map.set(key, {
          teacher: entry.teacher,
          entries: [entry],
        })
      }
    }
    return Array.from(map.values()).map((group) => ({
      teacher: group.teacher,
      entries: group.entries.sort((a, b) => a.workDate.localeCompare(b.workDate)),
    }))
  }, [filteredEntries])

  const filteredSummary = useMemo(() => {
    const totalHours = filteredEntries.reduce((sum, entry) => sum + calculateEntryAmount(entry), 0)
    const teacherCount = new Set(filteredEntries.map((entry) => entry.teacher?.id).filter(Boolean)).size
    return {
      totalCount: filteredEntries.length,
      totalHours,
      teacherCount,
    }
  }, [filteredEntries])

  const handleStatusToggle = (entry: ExternalSubstituteEntry) => {
    const nextStatus: ExternalTeacherPayStatus = entry.payStatus === 'completed' ? 'pending' : 'completed'
    setUpdatingId(entry.id)
    startUpdate(() => {
      updateExternalSubstitutePayStatus({ entryId: entry.id, status: nextStatus })
        .then((result) => {
          if (!result?.success) {
            setError(result?.error ?? '지급 상태를 업데이트하지 못했습니다.')
            return
          }
          setEntries((prev) =>
            prev.map((item) => (item.id === entry.id ? { ...item, payStatus: nextStatus } : item))
          )
        })
        .catch((err) => {
          console.error('[payroll] update external substitute status error', err)
          setError('지급 상태를 업데이트하지 못했습니다.')
        })
        .finally(() => {
          setUpdatingId(null)
        })
    })
  }

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex h-40 items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      )
    }

    if (error) {
      return <p className="text-sm text-rose-600">{error}</p>
    }

    if (filteredEntries.length === 0) {
      return <p className="text-sm text-slate-500">선택한 조건에 해당하는 외부 대타 기록이 없습니다.</p>
    }

    return (
      <div className="space-y-4">
        {grouped.map((group) => {
          const teacherLabel = group.teacher?.name ?? group.teacher?.email ?? '교직원 미지정'
          const teacherDescription = group.teacher?.email ?? '등록된 이메일이 없습니다.'
          return (
            <Card key={`${group.teacher?.id ?? teacherLabel}`} className="border-slate-200">
              <CardHeader>
                <CardTitle className="text-lg text-slate-900">{teacherLabel}</CardTitle>
                <CardDescription>{teacherDescription}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {group.entries.map((entry) => {
                  const amountHours = calculateEntryAmount(entry)
                  const paymentInProgress = updateState && updatingId === entry.id
                  return (
                    <div key={entry.id} className="rounded-lg border border-slate-200 bg-white p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {entry.externalTeacherName ?? '외부 선생님'}
                          </p>
                          {entry.externalTeacherPhone ? (
                            <p className="text-xs text-slate-500">{entry.externalTeacherPhone}</p>
                          ) : null}
                        </div>
                        <Badge variant={STATUS_BADGE[entry.payStatus]}>{STATUS_LABEL[entry.payStatus]}</Badge>
                      </div>
                      <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                        <div>
                          <span className="text-xs uppercase text-slate-500">근무일</span>
                          <p>{dateFormatter.format(new Date(entry.workDate))}</p>
                        </div>
                        <div>
                          <span className="text-xs uppercase text-slate-500">근무 시간</span>
                          <p>{formatHours(amountHours)}</p>
                        </div>
                        {entry.externalTeacherBank || entry.externalTeacherAccount ? (
                          <div>
                            <span className="text-xs uppercase text-slate-500">계좌</span>
                            <p>
                              {entry.externalTeacherBank ?? '-'} {entry.externalTeacherAccount ?? ''}
                            </p>
                          </div>
                        ) : null}
                        {entry.notes ? (
                          <div className="sm:col-span-2">
                            <span className="text-xs uppercase text-slate-500">메모</span>
                            <p className="whitespace-pre-wrap">{entry.notes}</p>
                          </div>
                        ) : null}
                      </div>
                      <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                        <span>지급 표시만 업데이트되며 실제 이체 여부는 별도 확인이 필요합니다.</span>
                        <Button
                          type="button"
                          size="sm"
                          variant={entry.payStatus === 'completed' ? 'outline' : 'default'}
                          onClick={() => handleStatusToggle(entry)}
                          disabled={paymentInProgress}
                        >
                          {paymentInProgress ? '저장 중…' : entry.payStatus === 'completed' ? '미완료로 변경' : '지급 완료로 표시'}
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )
        })}
      </div>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto flex h-[90vh] max-w-5xl flex-col gap-6 rounded-t-2xl border-t border-slate-200 bg-white p-6">
        <SheetHeader className="space-y-1">
          <SheetTitle className="text-xl text-slate-900">외부 대타 현황</SheetTitle>
          <SheetDescription>
            {summary
              ? `${summary.monthLabel} 외부 대타 ${summary.totalCount}건 · 총 근무 ${formatHours(summary.totalHours)} · 교직원 ${summary.teacherCount}명`
              : '해당 월 외부 대타 현황을 확인합니다.'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={statusFilter === 'all' ? 'default' : 'outline'}
            onClick={() => setStatusFilter('all')}
          >
            전체
          </Button>
          <Button
            type="button"
            size="sm"
            variant={statusFilter === 'pending' ? 'default' : 'outline'}
            onClick={() => setStatusFilter('pending')}
          >
            지급 미완료
          </Button>
          <Button
            type="button"
            size="sm"
            variant={statusFilter === 'completed' ? 'default' : 'outline'}
            onClick={() => setStatusFilter('completed')}
          >
            지급 완료
          </Button>
          <div className="ml-auto text-right text-xs text-slate-500">
            현재 {filteredSummary.totalCount}건 · {formatHours(filteredSummary.totalHours)} · 교직원 {filteredSummary.teacherCount}명
            <br />필터는 모달이 열려 있는 동안에만 적용됩니다.
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-2">
          {renderContent()}
        </div>

        <div className="text-right text-xs text-slate-400">
          외부 대타 정보는 근무일지 입력값을 기반으로 하며, 지급 상태는 내부 관리용입니다.
        </div>
      </SheetContent>
    </Sheet>
  )
}
