'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { SpinnerIcon } from '@/components/ui/fullscreen-spinner'
import { cn } from '@/lib/utils'
import {
  WORK_LOG_HOUR_STATUSES,
  WORK_LOG_REVIEW_STATUS_LABEL,
  WORK_LOG_STATUS_OPTIONS,
  requiresWorkHours,
  type TeacherProfileSummary,
  type WorkLogEntry,
  type WorkLogReviewStatus,
  type WorkLogStatus,
  type WorkLogSubstituteType,
} from '@/lib/work-logs'
import { deleteWorkLogEntry, saveWorkLogEntry } from '@/app/dashboard/teacher/work-journal/actions'
import { useGlobalTransition } from '@/hooks/use-global-loading'

interface WorkJournalClientProps {
  monthToken: string
  monthLabel: string
  monthStartDate: string
  entries: WorkLogEntry[]
  internalTeachers: TeacherProfileSummary[]
}

type CalendarDay = {
  date: Date
  iso: string
  isCurrentMonth: boolean
  isToday: boolean
}

type FormValues = {
  status: WorkLogStatus | ''
  workHours: string
  substituteType: WorkLogSubstituteType | ''
  substituteTeacherId: string
  externalTeacherName: string
  externalTeacherPhone: string
  externalTeacherBank: string
  externalTeacherAccount: string
  externalTeacherHours: string
  notes: string
}

type EntryMap = Record<string, WorkLogEntry>

type FeedbackState = {
  type: 'success' | 'error'
  message: string
} | null

type WeekSummary = {
  key: string
  start: Date
  end: Date
  totalHours: number
}

function toDateToken(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function buildMonthDays(monthStartDate: string): CalendarDay[] {
  const [year, month] = monthStartDate.split('-').map((token) => Number.parseInt(token, 10))
  const base = new Date(year, month - 1, 1)
  const firstDay = new Date(base.getFullYear(), base.getMonth(), 1)
  const startWeekDay = firstDay.getDay()

  const todayToken = toDateToken(new Date())
  const days: CalendarDay[] = []

  for (let offset = startWeekDay; offset > 0; offset -= 1) {
    const date = new Date(firstDay)
    date.setDate(firstDay.getDate() - offset)
    days.push({
      date,
      iso: toDateToken(date),
      isCurrentMonth: false,
      isToday: toDateToken(date) === todayToken,
    })
  }

  const lastDay = new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 0)

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    const date = new Date(firstDay.getFullYear(), firstDay.getMonth(), day)
    days.push({
      date,
      iso: toDateToken(date),
      isCurrentMonth: true,
      isToday: toDateToken(date) === todayToken,
    })
  }

  const remainder = (7 - (days.length % 7)) % 7

  for (let i = 1; i <= remainder; i += 1) {
    const date = new Date(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate() + i)
    days.push({
      date,
      iso: toDateToken(date),
      isCurrentMonth: false,
      isToday: toDateToken(date) === todayToken,
    })
  }

  return days
}

function shiftMonth(monthToken: string, offset: number): string {
  const [yearToken, monthTokenPart] = monthToken.split('-')
  const year = Number.parseInt(yearToken, 10)
  const month = Number.parseInt(monthTokenPart, 10) - 1
  const target = new Date(year, month + offset, 1)
  const nextYear = target.getFullYear()
  const nextMonth = `${target.getMonth() + 1}`.padStart(2, '0')
  return `${nextYear}-${nextMonth}`
}

function getDefaultSelection(monthStartDate: string): string {
  const todayToken = toDateToken(new Date())
  if (todayToken.startsWith(monthStartDate.slice(0, 7))) {
    return todayToken
  }
  return monthStartDate
}

function createEntryMap(entries: WorkLogEntry[]): EntryMap {
  const map: EntryMap = {}
  for (const entry of entries) {
    map[entry.workDate] = entry
  }
  return map
}

function weekStart(date: Date): Date {
  const start = new Date(date)
  const day = start.getDay()
  const diff = (day + 6) % 7 // Monday start
  start.setDate(start.getDate() - diff)
  start.setHours(0, 0, 0, 0)
  return start
}

function formatWeekLabel(start: Date, end: Date): string {
  const formatter = new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: '2-digit',
  })
  return `${formatter.format(start)} ~ ${formatter.format(end)}`
}

function clampDate(value: Date, min: Date, max: Date): Date {
  if (value.getTime() < min.getTime()) {
    return new Date(min.getTime())
  }
  if (value.getTime() > max.getTime()) {
    return new Date(max.getTime())
  }
  return value
}

function summarizeWeeks(entries: EntryMap, days: CalendarDay[], monthStart: Date, monthEnd: Date): WeekSummary[] {
  const result = new Map<string, WeekSummary>()
  for (const day of days) {
    if (!day.isCurrentMonth) {
      continue
    }
    const entry = entries[day.iso]
    if (!entry || !entry.workHours || !WORK_LOG_HOUR_STATUSES.includes(entry.status)) {
      continue
    }
    const start = weekStart(day.date)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    const key = toDateToken(start)
    const clampedStart = clampDate(start, monthStart, monthEnd)
    const clampedEnd = clampDate(end, monthStart, monthEnd)
    const existing = result.get(key)
    const hours = Number(entry.workHours)
    if (existing) {
      existing.totalHours += hours
    } else {
      result.set(key, {
        key,
        start: clampedStart,
        end: clampedEnd,
        totalHours: hours,
      })
    }
  }
  return Array.from(result.values()).sort((a, b) => a.start.getTime() - b.start.getTime())
}

function formatHours(value: number): string {
  return Number.isFinite(value) ? value.toFixed(1).replace(/\.0$/, '') : '0'
}

function getMonthlyTotal(entries: EntryMap): number {
  return Object.values(entries)
    .filter((entry) => entry && entry.workHours && WORK_LOG_HOUR_STATUSES.includes(entry.status))
    .reduce((sum, entry) => sum + (entry.workHours ?? 0), 0)
}

export function WorkJournalClient({ monthToken, monthLabel, monthStartDate, entries, internalTeachers }: WorkJournalClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [entryMap, setEntryMap] = useState<EntryMap>(() => createEntryMap(entries))
  const [selectedDate, setSelectedDate] = useState<string>(() => getDefaultSelection(monthStartDate))
  const [feedback, setFeedback] = useState<FeedbackState>(null)
  const [isPending, startTransition] = useGlobalTransition()
  const [pendingAction, setPendingAction] = useState<'save' | 'delete' | null>(null)

  const days = useMemo(() => buildMonthDays(monthStartDate), [monthStartDate])

  const activeEntry = entryMap[selectedDate] ?? null
  const isLocked = activeEntry?.reviewStatus === 'approved'

  const monthBounds = useMemo(() => {
    const [yearToken, monthTokenPart] = monthStartDate.split('-')
    const year = Number.parseInt(yearToken, 10)
    const monthIndex = Number.parseInt(monthTokenPart, 10) - 1
    const start = new Date(year, monthIndex, 1)
    start.setHours(0, 0, 0, 0)
    const end = new Date(year, monthIndex + 1, 0)
    end.setHours(23, 59, 59, 999)
    return { start, end }
  }, [monthStartDate])

  const monthStartBound = monthBounds.start
  const monthEndBound = monthBounds.end

  const weeklySummaries = useMemo(
    () => summarizeWeeks(entryMap, days, monthStartBound, monthEndBound),
    [entryMap, days, monthStartBound, monthEndBound]
  )
  const monthlyTotal = useMemo(() => getMonthlyTotal(entryMap), [entryMap])

  const form = useForm<FormValues>({
    defaultValues: {
      status: activeEntry?.status ?? '',
      workHours: activeEntry?.workHours ? String(activeEntry.workHours) : '',
      substituteType: activeEntry?.substituteType ?? '',
      substituteTeacherId: activeEntry?.substituteTeacherId ?? '',
      externalTeacherName: activeEntry?.externalTeacherName ?? '',
      externalTeacherPhone: activeEntry?.externalTeacherPhone ?? '',
      externalTeacherBank: activeEntry?.externalTeacherBank ?? '',
      externalTeacherAccount: activeEntry?.externalTeacherAccount ?? '',
      externalTeacherHours: activeEntry?.externalTeacherHours ? String(activeEntry.externalTeacherHours) : '',
      notes: activeEntry?.notes ?? '',
    },
  })

  const watchStatus = form.watch('status')
  const watchSubstituteType = form.watch('substituteType')

  useEffect(() => {
    const nextMap = createEntryMap(entries)
    setEntryMap(nextMap)
    const nextSelected = getDefaultSelection(monthStartDate)
    setSelectedDate(nextSelected)
    const nextEntry = nextMap[nextSelected] ?? null
    form.reset({
      status: nextEntry?.status ?? '',
      workHours: nextEntry?.workHours ? String(nextEntry.workHours) : '',
      substituteType: nextEntry?.substituteType ?? '',
      substituteTeacherId: nextEntry?.substituteTeacherId ?? '',
      externalTeacherName: nextEntry?.externalTeacherName ?? '',
      externalTeacherPhone: nextEntry?.externalTeacherPhone ?? '',
      externalTeacherBank: nextEntry?.externalTeacherBank ?? '',
      externalTeacherAccount: nextEntry?.externalTeacherAccount ?? '',
      externalTeacherHours: nextEntry?.externalTeacherHours ? String(nextEntry.externalTeacherHours) : '',
      notes: nextEntry?.notes ?? '',
    })
    setFeedback(null)
  }, [entries, monthStartDate, form])

  const navigateToMonth = (token: string) => {
    const params = new URLSearchParams(searchParams?.toString())
    params.set('month', token)
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }

  const selectDate = (iso: string) => {
    setSelectedDate(iso)
    const entry = entryMap[iso]
    form.reset({
      status: entry?.status ?? '',
      workHours: entry?.workHours ? String(entry.workHours) : '',
      substituteType: entry?.substituteType ?? '',
      substituteTeacherId: entry?.substituteTeacherId ?? '',
      externalTeacherName: entry?.externalTeacherName ?? '',
      externalTeacherPhone: entry?.externalTeacherPhone ?? '',
      externalTeacherBank: entry?.externalTeacherBank ?? '',
      externalTeacherAccount: entry?.externalTeacherAccount ?? '',
      externalTeacherHours: entry?.externalTeacherHours ? String(entry.externalTeacherHours) : '',
      notes: entry?.notes ?? '',
    })
    setFeedback(null)
  }

  const handleSave = form.handleSubmit((values) => {
    if (!values.status) {
      setFeedback({ type: 'error', message: '근무 유형을 선택해주세요.' })
      return
    }

    const formData = new FormData()
    formData.append('workDate', selectedDate)
    formData.append('status', values.status)
    if (values.workHours) {
      formData.append('workHours', values.workHours)
    }
    if (values.substituteType) {
      formData.append('substituteType', values.substituteType)
    }
    if (values.substituteTeacherId) {
      formData.append('substituteTeacherId', values.substituteTeacherId)
    }
    if (values.externalTeacherName) {
      formData.append('externalTeacherName', values.externalTeacherName)
    }
    if (values.externalTeacherPhone) {
      formData.append('externalTeacherPhone', values.externalTeacherPhone)
    }
    if (values.externalTeacherBank) {
      formData.append('externalTeacherBank', values.externalTeacherBank)
    }
    if (values.externalTeacherAccount) {
      formData.append('externalTeacherAccount', values.externalTeacherAccount)
    }
    if (values.externalTeacherHours) {
      formData.append('externalTeacherHours', values.externalTeacherHours)
    }
    if (values.notes) {
      formData.append('notes', values.notes)
    }

    setPendingAction('save')
    startTransition(async () => {
      try {
        const result = await saveWorkLogEntry(formData)
        if (!result?.success || !result.entry) {
          setFeedback({ type: 'error', message: result?.error ?? '근무일지 저장 중 문제가 발생했습니다.' })
          return
        }
        const updatedEntry = result.entry
        setEntryMap((prev) => ({
          ...prev,
          [updatedEntry.workDate]: updatedEntry,
        }))
        form.reset({
          status: updatedEntry.status,
          workHours: updatedEntry.workHours ? String(updatedEntry.workHours) : '',
          substituteType: updatedEntry.substituteType ?? '',
          substituteTeacherId: updatedEntry.substituteTeacherId ?? '',
          externalTeacherName: updatedEntry.externalTeacherName ?? '',
          externalTeacherPhone: updatedEntry.externalTeacherPhone ?? '',
          externalTeacherBank: updatedEntry.externalTeacherBank ?? '',
          externalTeacherAccount: updatedEntry.externalTeacherAccount ?? '',
          externalTeacherHours: updatedEntry.externalTeacherHours ? String(updatedEntry.externalTeacherHours) : '',
          notes: updatedEntry.notes ?? '',
        })
        setFeedback({ type: 'success', message: '근무일지가 저장되었습니다. 원장 승인 대기 상태로 전환됩니다.' })
      } finally {
        setPendingAction(null)
      }
    })
  })

  const handleDelete = () => {
    setPendingAction('delete')
    startTransition(async () => {
      try {
        const formData = new FormData()
        formData.append('workDate', selectedDate)
        const result = await deleteWorkLogEntry(formData)
        if (!result?.success) {
          setFeedback({ type: 'error', message: result?.error ?? '근무일지 삭제에 실패했습니다.' })
          return
        }
        setEntryMap((prev) => {
          const next = { ...prev }
          delete next[selectedDate]
          return next
        })
        form.reset({
          status: '',
          workHours: '',
          substituteType: '',
          substituteTeacherId: '',
          externalTeacherName: '',
          externalTeacherPhone: '',
          externalTeacherBank: '',
          externalTeacherAccount: '',
          externalTeacherHours: '',
          notes: '',
        })
        setFeedback({ type: 'success', message: '근무일지가 삭제되었습니다.' })
      } finally {
        setPendingAction(null)
      }
    })
  }

  const currentStatusMeta = WORK_LOG_STATUS_OPTIONS.find((option) => option.value === watchStatus)
  const reviewStatus: WorkLogReviewStatus | null = activeEntry ? activeEntry.reviewStatus : null
  const reviewNote = activeEntry?.reviewNote ?? null

  return (
    <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
      <section className="space-y-4">
        <Card className="border-slate-200">
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-xl text-slate-900">{monthLabel} 근무일지</CardTitle>
              <CardDescription>달력에서 날짜를 선택해 근무 현황을 기록하세요.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => navigateToMonth(shiftMonth(monthToken, -1))} disabled={isPending}>
                이전 달
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => navigateToMonth(shiftMonth(monthToken, 1))} disabled={isPending}>
                다음 달
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-7 gap-px rounded-md border border-slate-200 bg-slate-200 text-xs">
              {['일', '월', '화', '수', '목', '금', '토'].map((label) => (
                <div key={label} className="bg-slate-100 py-2 text-center font-medium text-slate-600">
                  {label}
                </div>
              ))}
              {days.map((day) => {
                const entry = entryMap[day.iso]
                const isSelected = selectedDate === day.iso
                const statusLabel = entry ? WORK_LOG_STATUS_OPTIONS.find((option) => option.value === entry.status)?.label : null
                const isDisabled = !day.isCurrentMonth
                const reviewChip = entry ? WORK_LOG_REVIEW_STATUS_LABEL[entry.reviewStatus] : null
                return (
                  <button
                    key={day.iso}
                    type="button"
                    onClick={() => selectDate(day.iso)}
                    disabled={isDisabled}
                    className={cn(
                      'flex min-h-[112px] flex-col gap-2 border border-slate-100 bg-white p-2 text-left text-xs transition focus:outline-none focus:ring-2 focus:ring-slate-400',
                      !day.isCurrentMonth && 'bg-slate-50 text-slate-400',
                      day.isToday && 'border-slate-400',
                      isSelected && 'ring-2 ring-slate-500'
                    )}
                  >
                    <div className="flex items-center justify-between text-[11px] font-medium">
                      <span>{day.date.getDate()}</span>
                      {day.isToday ? <span className="text-slate-500">오늘</span> : null}
                    </div>
                    {entry ? (
                      <div className="flex flex-col gap-1 text-[11px] text-slate-600">
                        {statusLabel ? <span className="font-semibold text-slate-700">{statusLabel}</span> : null}
                        {requiresWorkHours(entry.status) && entry.workHours ? (
                          <span>{`근무 ${formatHours(entry.workHours)}시간`}</span>
                        ) : null}
                        {entry.status === 'substitute' ? (
                          <span>
                            대타 ·{' '}
                            {entry.substituteType === 'internal'
                              ? '학원 선생님'
                              : `외부 선생님${
                                  entry.externalTeacherHours
                                    ? ` · ${formatHours(entry.externalTeacherHours)}시간`
                                    : ''
                                }`}
                          </span>
                        ) : null}
                        {reviewChip ? (
                          <span className="inline-flex w-fit rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-700">
                            {reviewChip}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-400">기록 없음</span>
                    )}
                  </button>
                )
              })}
            </div>
            <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-xs text-slate-600">
              날짜를 선택하면 아래에서 상세 근무 정보를 입력할 수 있습니다. 저장 후에는 원장 승인 절차를 거치며, 승인 완료된 기록은 수정할 수 없습니다.
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm">
              <p className="text-slate-600">이번 달 총 근무 시간 (근무/지각 기준)</p>
              <p className="text-2xl font-semibold text-slate-900">{formatHours(monthlyTotal)}시간</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-lg text-slate-900">{selectedDate} 근무 기록</CardTitle>
            <CardDescription>
              {currentStatusMeta ? currentStatusMeta.description : '근무 유형을 선택하면 필요한 정보를 입력할 수 있습니다.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {reviewStatus ? (
              <div className="flex flex-col gap-1 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
                <span className="font-medium text-slate-700">승인 상태: {WORK_LOG_REVIEW_STATUS_LABEL[reviewStatus]}</span>
                {reviewStatus === 'approved' ? (
                  <span className="text-slate-500">원장 승인 완료된 기록은 수정하거나 삭제할 수 없습니다.</span>
                ) : null}
                {reviewStatus === 'rejected' ? (
                  <span className="text-slate-500">수정 후 다시 저장하면 승인 대기 상태로 변경됩니다.</span>
                ) : null}
                {reviewNote ? (
                  <span className="text-slate-500">메모: {reviewNote}</span>
                ) : null}
              </div>
            ) : null}

            <Form {...form}>
              <form className="space-y-4" onSubmit={handleSave}>
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>근무 유형</FormLabel>
                        <Select
                          disabled={isLocked || isPending}
                          value={field.value}
                          onValueChange={(value) => field.onChange(value as WorkLogStatus)}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="근무 유형 선택" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {WORK_LOG_STATUS_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>근무, 대타, 결근, 지각 중 하나를 선택하세요.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {requiresWorkHours(watchStatus as WorkLogStatus) ? (
                    <FormField
                      control={form.control}
                      name="workHours"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>근무 시간 (시간 단위)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.5"
                              min="0"
                              max="24"
                              placeholder="예: 4.5"
                              disabled={isLocked || isPending}
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>숫자만 입력합니다. 예: 4 또는 4.5</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : null}
                </div>

                {watchStatus === 'substitute' ? (
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="substituteType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>대타 구분</FormLabel>
                          <Select
                            disabled={isLocked || isPending}
                            value={field.value}
                            onValueChange={(value) => field.onChange(value as WorkLogSubstituteType)}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="대타 유형 선택" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="internal">학원 선생님</SelectItem>
                              <SelectItem value="external">외부 선생님</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription>학원 내부 선생님인지 외부 선생님인지 선택하세요.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {watchSubstituteType === 'internal' ? (
                      <FormField
                        control={form.control}
                        name="substituteTeacherId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>대타 선생님</FormLabel>
                            <Select
                              disabled={isLocked || isPending}
                              value={field.value}
                              onValueChange={field.onChange}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="선생님 선택" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {internalTeachers.map((teacher) => (
                                  <SelectItem key={teacher.id} value={teacher.id}>
                                    {teacher.name ?? teacher.email ?? '이름 미기재'}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormDescription>학원 소속 대타 선생님을 선택합니다.</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ) : null}

                    {watchSubstituteType === 'external' ? (
                      <div className="grid gap-4 md:grid-cols-2">
                        <FormField
                          control={form.control}
                          name="externalTeacherName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>외부 선생님 성함</FormLabel>
                              <FormControl>
                                <Input disabled={isLocked || isPending} placeholder="성함" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="externalTeacherPhone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>연락처</FormLabel>
                              <FormControl>
                                <Input disabled={isLocked || isPending} placeholder="예: 010-0000-0000" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="externalTeacherBank"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>은행</FormLabel>
                              <FormControl>
                                <Input disabled={isLocked || isPending} placeholder="은행명" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="externalTeacherAccount"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>계좌번호</FormLabel>
                              <FormControl>
                                <Input disabled={isLocked || isPending} placeholder="계좌번호" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="externalTeacherHours"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>외부 선생님 근무 시간</FormLabel>
                              <FormControl>
                                <Input
                                  disabled={isLocked || isPending}
                                  type="number"
                                  min="0"
                                  max="24"
                                  step="0.5"
                                  placeholder="예: 3 또는 3.5"
                                  {...field}
                                />
                              </FormControl>
                              <FormDescription>외부 선생님 지급 기준 시간이며, 본인 근무 시간 합계에는 포함되지 않습니다.</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>메모</FormLabel>
                      <FormControl>
                        <Textarea
                          disabled={isLocked || isPending}
                          rows={3}
                          placeholder="필요 시 근무 관련 메모를 남겨주세요."
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>최대 1000자까지 입력할 수 있습니다.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="flex gap-2">
                    <Button type="submit" disabled={isLocked || isPending}>
                      {pendingAction === 'save' ? (
                        <span className="flex items-center justify-center gap-2">
                          <SpinnerIcon />
                          저장 중...
                        </span>
                      ) : (
                        '근무일지 저장'
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isLocked || isPending || !entryMap[selectedDate]}
                      onClick={handleDelete}
                    >
                      {pendingAction === 'delete' ? (
                        <span className="flex items-center justify-center gap-2">
                          <SpinnerIcon />
                          삭제 중...
                        </span>
                      ) : (
                        '기록 삭제'
                      )}
                    </Button>
                  </div>
                  {feedback ? (
                    <span
                      className={cn(
                        'text-sm',
                        feedback.type === 'success' ? 'text-emerald-600' : 'text-red-600'
                      )}
                    >
                      {feedback.message}
                    </span>
                  ) : null}
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </section>

      <aside className="space-y-4">
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-lg text-slate-900">주차별 근무 시간</CardTitle>
            <CardDescription>근무/지각으로 기록한 시간을 주차별로 합산합니다.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {weeklySummaries.length === 0 ? (
              <p className="text-slate-500">이번 달에 기록된 근무 시간이 없습니다.</p>
            ) : (
              weeklySummaries.map((week) => (
                <div key={week.key} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">
                  <div className="text-slate-600">{formatWeekLabel(week.start, week.end)}</div>
                  <div className="font-semibold text-slate-900">{formatHours(week.totalHours)}시간</div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-lg text-slate-900">대타 기록 안내</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-slate-600">
            <p>· 학원 선생님 대타의 경우, 선생님 이름을 선택하면 됩니다. 근무 시간 입력은 필요하지 않습니다.</p>
            <p>· 외부 선생님 대타는 이름·연락처·계좌 정보를 정확히 입력해주세요.</p>
            <p>· 저장 후에는 원장 승인 대기 상태로 변경되며, 승인 결과는 달력에서 바로 확인할 수 있습니다.</p>
          </CardContent>
        </Card>
      </aside>
    </div>
  )
}
