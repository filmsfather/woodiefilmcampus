'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'

import {
  CalendarCell,
  CounselingSlotStatus,
  buildCalendarCells,
  getKstDate,
  toDisplayTime,
} from '@/lib/counseling'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

interface PublicDaySlot {
  id: string
  start_time: string
  status: CounselingSlotStatus
}

interface DaySummaryItem {
  date: string
  open: number
}

interface PublicQuestion {
  id: string
  field_key: string
  prompt: string
  field_type: 'text' | 'textarea' | 'select'
  is_required: boolean
  select_options: string[]
}

interface PublicCounselingReservationProps {
  today: string
  selectedDate: string
  daySlots: PublicDaySlot[]
  monthSummary: DaySummaryItem[]
  questions: PublicQuestion[]
}

interface FormState {
  studentName: string
  contactPhone: string
  academicRecord: string
  targetUniversity: string
  additionalAnswers: Record<string, string>
}

const initialFormState = (questions: PublicQuestion[]): FormState => ({
  studentName: '',
  contactPhone: '',
  academicRecord: '',
  targetUniversity: '',
  additionalAnswers: Object.fromEntries(questions.map((item) => [item.field_key, ''])),
})

const sanitizePhoneInput = (value: string) => value.replace(/\D/g, '').slice(0, 11)

const isValidPhoneNumber = (value: string) => /^01[0-9]{8,9}$/.test(value)

const SELECT_EMPTY_VALUE = '__none__'

function formatRangeLabel(date: string) {
  const weekday = WEEKDAY_LABELS[new Date(`${date}T00:00:00Z`).getUTCDay()]
  return `${date} (${weekday})`
}

export function PublicCounselingReservation({ today, selectedDate, daySlots, monthSummary, questions }: PublicCounselingReservationProps) {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(() => initialFormState(questions))
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null)
  const [selectedSlotLabel, setSelectedSlotLabel] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const [yearStr, monthStr] = selectedDate.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const summaryMap = useMemo(() => new Map(monthSummary.map((item) => [item.date, item])), [monthSummary])
  const calendarCells: CalendarCell[] = useMemo(() => buildCalendarCells(year, month), [year, month])
  const sortedDaySlots = useMemo(
    () => [...daySlots].sort((a, b) => (a.start_time < b.start_time ? -1 : 1)),
    [daySlots]
  )
  const upcomingSlots = useMemo(() => {
    const now = getKstDate()
    return sortedDaySlots.filter((slot) => {
      if (slot.status === 'booked') {
        return true
      }
      const slotDateTime = new Date(`${selectedDate}T${slot.start_time}+09:00`)
      return slotDateTime.getTime() >= now.getTime()
    })
  }, [sortedDaySlots, selectedDate])
  const hasOpenSlots = useMemo(() => upcomingSlots.some((slot) => slot.status === 'open'), [upcomingSlots])

  const todayDate = new Date(`${today}T00:00:00Z`)
  const selectedMonthDate = new Date(Date.UTC(year, month - 1, 1))
  const minMonthDate = new Date(Date.UTC(todayDate.getUTCFullYear(), todayDate.getUTCMonth(), 1))
  const canGoPrev = selectedMonthDate > minMonthDate

  const handleSelectDate = (date: string) => {
    setSelectedSlotId(null)
    setSelectedSlotLabel(null)
    setErrorMessage(null)
    setSuccessMessage(null)
    router.push(`/counseling/reserve?date=${date}`)
  }

  const handleMonthChange = (delta: number) => {
    if (delta < 0 && !canGoPrev) {
      return
    }
    const base = new Date(Date.UTC(year, month - 1, 1))
    base.setUTCMonth(base.getUTCMonth() + delta)
    const targetYear = base.getUTCFullYear()
    const targetMonth = base.getUTCMonth() + 1
    const targetDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`
    handleSelectDate(targetDate)
  }

  const handleTimeSelect = (slotId: string, timeLabel: string, status: CounselingSlotStatus) => {
    if (status !== 'open') {
      return
    }
    setSelectedSlotId(slotId)
    setSelectedSlotLabel(timeLabel)
    setErrorMessage(null)
    setSuccessMessage(null)
  }

  const handleFormChange = (key: keyof FormState, value: string) => {
    setForm((prev) => ({
      ...prev,
      [key]: key === 'contactPhone' ? sanitizePhoneInput(value) : value,
    }))
  }

  const handleAdditionalChange = (fieldKey: string, value: string) => {
    const normalizedValue = value === SELECT_EMPTY_VALUE ? '' : value
    setForm((prev) => ({
      ...prev,
      additionalAnswers: {
        ...prev.additionalAnswers,
        [fieldKey]: normalizedValue,
      },
    }))
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedSlotId) {
      setErrorMessage('예약 시간을 먼저 선택해주세요.')
      return
    }
    const cleanPhone = sanitizePhoneInput(form.contactPhone)

    if (!form.studentName.trim() || !cleanPhone) {
      setErrorMessage('학생 이름과 연락처를 입력해주세요.')
      return
    }

    if (!isValidPhoneNumber(cleanPhone)) {
      setErrorMessage('휴대폰 번호는 010으로 시작하는 숫자만 입력해주세요.')
      return
    }

    for (const question of questions) {
      if (!question.is_required) {
        continue
      }
      const answer = form.additionalAnswers[question.field_key] ?? ''
      if (question.field_type === 'select') {
        if (typeof answer !== 'string' || !question.select_options.includes(answer)) {
          setErrorMessage('필수 질문을 모두 입력해주세요.')
          return
        }
      } else if (typeof answer !== 'string' || answer.trim().length === 0) {
        setErrorMessage('필수 질문을 모두 입력해주세요.')
        return
      }
    }

    setIsSubmitting(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    const normalizedAnswers = Object.entries(form.additionalAnswers).reduce<Record<string, string>>((acc, [key, raw]) => {
      const value = typeof raw === 'string' ? raw.trim() : ''
      if (value.length > 0) {
        acc[key] = value
      }
      return acc
    }, {})

    const payload = {
      slotId: selectedSlotId,
      studentName: form.studentName.trim(),
      contactPhone: cleanPhone,
      academicRecord: form.academicRecord.trim() || null,
      targetUniversity: form.targetUniversity.trim() || null,
      additionalAnswers: normalizedAnswers,
    }

    try {
      const response = await fetch('/api/counseling/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: '예약 신청에 실패했습니다.' }))
        setErrorMessage(data.error ?? '예약 신청에 실패했습니다.')
      } else {
        setSuccessMessage('상담 예약 신청이 접수되었습니다. 담당자가 확인 후 안내드립니다.')
        setForm(initialFormState(questions))
        setSelectedSlotId(null)
        setSelectedSlotLabel(null)
        router.refresh()
      }
    } catch (error) {
      console.error('[counseling] public reservation submit error', error)
      setErrorMessage('예약 신청 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10">
      <div className="space-y-3 text-center">
        <h1 className="text-3xl font-semibold text-slate-900">상담 예약</h1>
        <p className="text-sm text-slate-600">
          원하는 날짜와 시간을 선택하고 상담 요청 정보를 입력해주세요. 담당자가 예약 내용을 확인한 뒤 연락드립니다.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="space-y-3">
            <CardTitle className="flex items-center justify-between">
              <Button variant="ghost" size="icon" onClick={() => handleMonthChange(-1)} disabled={!canGoPrev} aria-label="이전 달">
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <span className="text-base font-semibold text-slate-900">
                {year}년 {month.toString().padStart(2, '0')}월
              </span>
              <Button variant="ghost" size="icon" onClick={() => handleMonthChange(1)} aria-label="다음 달">
                <ChevronRight className="h-5 w-5" />
              </Button>
            </CardTitle>
            <div className="grid grid-cols-7 text-center text-xs font-medium text-slate-500">
              {WEEKDAY_LABELS.map((weekday) => (
                <span key={weekday}>{weekday}</span>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1 text-sm">
              {calendarCells.map((cell) => {
                const summary = summaryMap.get(cell.date)
                const isSelected = cell.date === selectedDate
                const isToday = cell.date === today
                const hasAvailableSlots = (summary?.open ?? 0) > 0
                const buttonClasses = [
                  'relative flex h-16 flex-col items-center justify-center rounded-lg p-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2',
                ]

                if (!cell.inCurrentMonth) {
                  buttonClasses.push('bg-transparent text-slate-300 hover:bg-transparent')
                } else if (isSelected) {
                  buttonClasses.push('bg-primary text-primary-foreground shadow-sm')
                } else if (hasAvailableSlots) {
                  buttonClasses.push('bg-primary/15 text-primary hover:bg-primary/25')
                } else {
                  buttonClasses.push('bg-white text-slate-900 hover:bg-slate-50')
                }

                return (
                  <button
                    key={cell.date}
                    type="button"
                    onClick={() => handleSelectDate(cell.date)}
                    className={buttonClasses.join(' ')}
                  >
                    <span className="absolute right-2 top-2 flex h-2 w-2 items-center justify-center">
                      {isToday ? (
                        <span
                          className={
                            isSelected
                              ? 'h-2 w-2 rounded-full bg-primary-foreground/90'
                              : hasAvailableSlots
                                ? 'h-2 w-2 rounded-full bg-primary/70'
                                : 'h-2 w-2 rounded-full bg-primary'
                          }
                        />
                      ) : null}
                    </span>
                    <span className="text-sm">{cell.label}</span>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="space-y-1">
              <CardTitle className="text-base font-semibold text-slate-900">
                {formatRangeLabel(selectedDate)} 상담 가능 시간
              </CardTitle>
              <p className="text-sm text-slate-600">예약 가능한 시간을 선택하면 상담 신청 폼이 열립니다.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {upcomingSlots.length === 0 ? (
                  <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                    선택한 날짜에는 표시할 상담 시간이 없습니다.
                  </div>
                ) : (
                  upcomingSlots.map((slot) => {
                    const label = toDisplayTime(slot.start_time)
                    const isActive = selectedSlotId === slot.id
                    const isBooked = slot.status === 'booked'
                    const isOpen = slot.status === 'open'
                    const buttonVariant = isActive ? 'default' : isBooked ? 'secondary' : 'outline'
                    return (
                      <div key={slot.id} className="flex flex-col items-start gap-1">
                        <Button
                          type="button"
                          variant={buttonVariant}
                          onClick={() => handleTimeSelect(slot.id, label, slot.status)}
                          disabled={!isOpen}
                          className={!isOpen ? 'cursor-not-allowed opacity-70' : undefined}
                        >
                          {label}
                        </Button>
                        {!isOpen ? (
                          <span className="text-xs text-slate-500">예약 마감</span>
                        ) : null}
                      </div>
                    )
                  })
                )}
                {upcomingSlots.length > 0 && !hasOpenSlots ? (
                  <span className="text-xs text-slate-500">현재 선택한 날짜의 상담 시간이 모두 예약되었습니다.</span>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="space-y-1">
              <CardTitle className="text-base font-semibold text-slate-900">상담 신청 정보</CardTitle>
              <p className="text-sm text-slate-600">
                학생 기본 정보와 상담 시 다루고 싶은 내용을 작성해주세요. 예약 확정 후 담당자가 문자로 안내드립니다.
              </p>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleSubmit}>
                {selectedSlotLabel ? (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                    선택한 시간: {formatRangeLabel(selectedDate)} {selectedSlotLabel}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                    예약할 시간을 먼저 선택해주세요.
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="student-name">학생 이름 *</Label>
                    <Input
                      id="student-name"
                      value={form.studentName}
                      onChange={(event) => handleFormChange('studentName', event.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contact-phone">연락처 *</Label>
                    <Input
                      id="contact-phone"
                      value={form.contactPhone}
                      onChange={(event) => handleFormChange('contactPhone', event.target.value)}
                      placeholder="숫자만 입력해주세요 (예: 01012345678)"
                      inputMode="numeric"
                      pattern="\d*"
                      maxLength={11}
                      autoComplete="tel"
                      required
                    />
                    <p className="text-xs text-slate-500">휴대폰 번호는 하이픈 없이 숫자만 입력해주세요.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="academic-record">내신 성적</Label>
                    <Input
                      id="academic-record"
                      value={form.academicRecord}
                      onChange={(event) => handleFormChange('academicRecord', event.target.value)}
                      placeholder="예: 내신 2.3등급"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="target-university">희망 대학 (모두 입력)</Label>
                    <Input
                      id="target-university"
                      value={form.targetUniversity}
                      onChange={(event) => handleFormChange('targetUniversity', event.target.value)}
                      placeholder="예: 한국예술종합학교 영상원, 중앙대학교 영화학과"
                    />
                  </div>
                </div>

                {questions.length > 0 ? (
                  <div className="space-y-4">
                    {questions.map((question) => (
                      <div key={question.id} className="space-y-2">
                        <Label htmlFor={`additional-${question.id}`}>
                          {question.prompt}
                          {question.is_required ? <Badge className="ml-2 bg-emerald-100 text-emerald-700">필수</Badge> : null}
                        </Label>
                        {question.field_type === 'textarea' ? (
                          <Textarea
                            id={`additional-${question.id}`}
                            value={form.additionalAnswers[question.field_key] ?? ''}
                            onChange={(event) => handleAdditionalChange(question.field_key, event.target.value)}
                            rows={3}
                            required={question.is_required}
                          />
                        ) : question.field_type === 'select' ? (
                          <div className="space-y-1">
                            <Select
                              value={(form.additionalAnswers[question.field_key] ?? '') || SELECT_EMPTY_VALUE}
                              onValueChange={(value) => handleAdditionalChange(question.field_key, value)}
                              disabled={question.select_options.length === 0}
                            >
                              <SelectTrigger id={`additional-${question.id}`} aria-label={question.prompt}>
                                <SelectValue placeholder={question.select_options.length === 0 ? '선택지가 없습니다' : '선택해주세요'} />
                              </SelectTrigger>
                              <SelectContent>
                                {!question.is_required ? <SelectItem value={SELECT_EMPTY_VALUE}>선택 안 함</SelectItem> : null}
                                {question.select_options.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {question.select_options.length === 0 ? (
                              <p className="text-xs text-red-500">선택지가 준비되지 않았습니다. 관리자에게 문의해주세요.</p>
                            ) : null}
                          </div>
                        ) : (
                          <Input
                            id={`additional-${question.id}`}
                            value={form.additionalAnswers[question.field_key] ?? ''}
                            onChange={(event) => handleAdditionalChange(question.field_key, event.target.value)}
                            required={question.is_required}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}

                {errorMessage ? (
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{errorMessage}</div>
                ) : null}
                {successMessage ? (
                  <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                    <CheckCircle2 className="mt-0.5 h-4 w-4" />
                    <span>{successMessage}</span>
                  </div>
                ) : null}

                <div className="flex justify-end">
                  <Button type="submit" disabled={isSubmitting || !selectedSlotId}>
                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    상담 예약 신청하기
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  )
}
