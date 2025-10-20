'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import clsx from 'clsx'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import DateUtil from '@/lib/date-util'
import type { LearningJournalAnnualSchedule } from '@/types/learning-journal'

type DesiredClass = 'weekday' | 'saturday' | 'sunday' | 'regular'

type ClassSchedule = {
  label: string
  tagline: string
  sections: Array<{ title: string; lines: string[] }>
}

const CLASS_OPTIONS: Record<DesiredClass, ClassSchedule> = {
  weekday: {
    label: '평일반',
    tagline: '3월 초 개강 예정',
    sections: [
      {
        title: '수업 일정',
        lines: ['3월 초 개강 예정', '세부 시간표는 개강 안내 시 전달됩니다.'],
      },
    ],
  },
  saturday: {
    label: '토요반',
    tagline: '토요일 집중 수업',
    sections: [
      { title: '1교시', lines: ['오전 11시 30분 ~ 오후 1시 20분'] },
      { title: '점심시간', lines: ['오후 1시 20분 ~ 오후 2시 10분'] },
      { title: '2교시', lines: ['오후 2시 10분 ~ 오후 4시'] },
      { title: '3교시', lines: ['오후 4시 10분 ~ 오후 6시'] },
      { title: '4교시', lines: ['오후 6시 10분 ~ 오후 8시'] },
    ],
  },
  sunday: {
    label: '일요반',
    tagline: '3월 초 개강 예정',
    sections: [
      {
        title: '수업 일정',
        lines: ['3월 초 개강 예정', '상세 시간표는 추후 안내될 예정입니다.'],
      },
    ],
  },
  regular: {
    label: '정시반',
    tagline: '화·목 집중 저녁 수업',
    sections: [
      {
        title: '화요일',
        lines: ['1교시: 오후 6시 ~ 8시', '2교시: 오후 8시 ~ 10시'],
      },
      {
        title: '목요일',
        lines: ['1교시: 오후 6시 ~ 8시', '2교시: 오후 8시 ~ 10시'],
      },
    ],
  },
}

const detailsContent = `상담 과정에서 제공된 연간 일정표와 수강료 안내를 다시 확인해 주세요. 등록 이후 취소 시 재등록이 제한될 수 있습니다.`

const sanitizePhone = (value: string) => value.replace(/\D/g, '').slice(0, 11)
const isValidPhoneNumber = (value: string) => /^01[0-9]{8,9}$/.test(value)

interface EnrollmentApplicationFormProps {
  annualSchedules: LearningJournalAnnualSchedule[]
}

const formatRangeLabel = (start: string, end: string) =>
  `${DateUtil.formatForDisplay(start, {
    locale: 'ko-KR',
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
  })} ~ ${DateUtil.formatForDisplay(end, {
    locale: 'ko-KR',
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
  })}`

const formatTuitionLabel = (dueDate: string | null, amount: number | null) => {
  const dueLabel = dueDate
    ? `납부일 ${DateUtil.formatForDisplay(dueDate, {
        locale: 'ko-KR',
        timeZone: 'Asia/Seoul',
        month: 'numeric',
        day: 'numeric',
      })}`
    : null

  const amountLabel = typeof amount === 'number' && Number.isFinite(amount)
    ? `${amount.toLocaleString('ko-KR')}원`
    : null

  if (dueLabel && amountLabel) {
    return `${dueLabel} / ${amountLabel}`
  }

  return dueLabel ?? amountLabel ?? '-'
}

export function EnrollmentApplicationForm({ annualSchedules }: EnrollmentApplicationFormProps) {
  const [studentName, setStudentName] = useState('')
  const [parentPhone, setParentPhone] = useState('')
  const [alternatePhone, setAlternatePhone] = useState('')
  const [desiredClass, setDesiredClass] = useState<DesiredClass | null>(null)
  const [saturdayBriefing, setSaturdayBriefing] = useState<'yes' | 'no' | null>(null)
  const [scheduleFeeConfirmed, setScheduleFeeConfirmed] = useState<'confirmed' | 'unconfirmed' | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const selectedClassInfo = desiredClass ? CLASS_OPTIONS[desiredClass] : null
  const hasAnnualSchedules = annualSchedules.length > 0

  const canSubmit = useMemo(() => {
    if (!studentName.trim()) {
      return false
    }
    if (!isValidPhoneNumber(parentPhone)) {
      return false
    }
    if (alternatePhone && !isValidPhoneNumber(alternatePhone)) {
      return false
    }
    if (!desiredClass) {
      return false
    }
    if (desiredClass === 'saturday' && !saturdayBriefing) {
      return false
    }
    if (!scheduleFeeConfirmed) {
      return false
    }
    return true
  }, [alternatePhone, desiredClass, parentPhone, saturdayBriefing, scheduleFeeConfirmed, studentName])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit || !desiredClass || !scheduleFeeConfirmed) {
      setErrorMessage('입력값을 다시 확인해주세요.')
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const response = await fetch('/api/enrollment/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName,
          parentPhone,
          studentPhone: alternatePhone ? alternatePhone : undefined,
          desiredClass,
          saturdayBriefing: desiredClass === 'saturday' ? saturdayBriefing ?? undefined : undefined,
          scheduleFeeConfirmed,
        }),
      })

      const payload = (await response.json().catch(() => null)) as { error?: string; success?: boolean } | null

      if (!response.ok) {
        setErrorMessage(payload?.error ?? '등록에 실패했습니다. 잠시 후 다시 시도해주세요.')
        return
      }

      setSuccessMessage('등록원서가 접수되었습니다. 확정 안내는 개별 연락으로 전달됩니다.')
      setStudentName('')
      setParentPhone('')
      setAlternatePhone('')
      setDesiredClass(null)
      setSaturdayBriefing(null)
      setScheduleFeeConfirmed(null)
    } catch (error) {
      console.error('[enrollment] submit error', error)
      setErrorMessage('등록 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col items-center gap-4 text-center">
        <Image
          src="/enrollment-logo.png"
          alt="Woodie Film Campus"
          width={220}
          height={194}
          priority
        />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">등록원서</h1>
          <p className="text-sm text-muted-foreground">아래 내용을 작성하면 가장 빠른 개강 일정으로 안내해 드립니다.</p>
        </div>
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-foreground">기본 정보</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <span className="text-sm font-medium text-foreground">학생 이름</span>
            <Input
              value={studentName}
              onChange={(event) => setStudentName(event.target.value)}
              placeholder="예: 홍길동"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="student-phone">학생 번호</Label>
            <Input
              id="student-phone"
              inputMode="numeric"
              value={alternatePhone}
              onChange={(event) => setAlternatePhone(sanitizePhone(event.target.value))}
              placeholder="예: 01012345678"
            />
            <p className="mt-1 text-xs text-muted-foreground">수업 안내 문자가 발송됩니다. 정확히 기입해주세요.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="parent-phone">부모님 번호</Label>
            <Input
              id="parent-phone"
              inputMode="numeric"
              value={parentPhone}
              onChange={(event) => setParentPhone(sanitizePhone(event.target.value))}
              placeholder="예: 01012345678"
            />
            <p className="mt-1 text-xs text-muted-foreground">숫자만 입력해주세요. (010으로 시작, {parentPhone.length}/11자리)</p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border shadow-sm">
        <CardHeader className="space-y-2">
          <CardTitle className="text-base font-semibold text-foreground">희망 반</CardTitle>
          <p className="text-sm text-muted-foreground">원하는 반을 선택하면 시간표가 펼쳐집니다.</p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2">
            {(Object.keys(CLASS_OPTIONS) as DesiredClass[]).map((key) => {
              const option = CLASS_OPTIONS[key]
              const selected = desiredClass === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setDesiredClass(key)
                    setErrorMessage(null)
                    setSuccessMessage(null)
                    if (key !== 'saturday') {
                      setSaturdayBriefing(null)
                    }
                  }}
                  className={clsx(
                    'flex flex-col gap-2 rounded-lg border px-4 py-3 text-left transition',
                    selected
                      ? 'border-primary bg-primary/10 text-primary shadow-sm'
                      : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:bg-primary/10'
                  )}
                >
                  <span className="text-sm font-semibold">{option.label}</span>
                  <span className="text-xs text-muted-foreground">{option.tagline}</span>
                </button>
              )
            })}
          </div>

          {selectedClassInfo ? (
            <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/10 p-4 text-foreground">
              <div className="flex flex-wrap items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">
                  {selectedClassInfo.label}을 선택하셨습니다. 가장 빠른 개강일에 배정됩니다.
                </span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {selectedClassInfo.sections.map((section) => (
                  <div key={section.title} className="rounded-md border border-border bg-card p-3 text-sm">
                    <p className="font-semibold text-primary">{section.title}</p>
                    <ul className="mt-2 space-y-1 text-muted-foreground">
                      {section.lines.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {desiredClass === 'saturday' ? (
            <div className="rounded-lg border border-border bg-muted p-4">
              <p className="text-sm font-medium text-foreground">토요반 상담 및 수업 안내를 받으셨나요?</p>
              <div className="mt-3 flex flex-wrap gap-3">
                {[
                  { value: 'yes', label: '네' },
                  { value: 'no', label: '아니요' },
                ].map((option) => (
                  <label
                    key={option.value}
                    className={clsx(
                      'flex items-center gap-2 rounded-md border px-3 py-2 text-sm shadow-sm transition',
                      saturdayBriefing === option.value
                        ? 'border-primary bg-card text-primary'
                        : 'border-border bg-card text-muted-foreground hover:border-primary/40'
                    )}
                  >
                    <input
                      type="radio"
                      name="saturday-briefing"
                      value={option.value}
                      checked={saturdayBriefing === option.value}
                      onChange={() => setSaturdayBriefing(option.value as 'yes' | 'no')}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          <details className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground">연간 일정 및 수강료 안내 확인하기</summary>
            <div className="mt-3 space-y-4 leading-relaxed">
              <p>{detailsContent}</p>
              {hasAnnualSchedules ? (
                <div className="space-y-3">
                  {annualSchedules.map((item) => (
                    <div
                      key={item.id}
                      className="space-y-3 rounded-md border border-border bg-muted p-3 text-sm text-foreground"
                    >
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-muted-foreground">기간명</span>
                        <span className="text-base font-semibold text-foreground">{item.periodLabel}</span>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">기간</p>
                          <p>{formatRangeLabel(item.startDate, item.endDate)}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">수강료</p>
                          <p>{formatTuitionLabel(item.tuitionDueDate, item.tuitionAmount)}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">비고</p>
                          <p className="text-muted-foreground">{item.memo ?? '-'}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-md border border-dashed border-border bg-muted p-3 text-sm text-muted-foreground">
                  연간 일정 정보가 준비 중입니다. 상담 팀에 문의해 주세요.
                </p>
              )}
            </div>
          </details>

          <div className="rounded-lg border border-secondary/40 bg-secondary/10 p-4 text-sm text-secondary">
            등록 후 취소 시 재등록에 제한이 있을 수 있습니다.
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">수업 일정 및 수강료를 확인하셨나요?</p>
            <div className="flex flex-wrap gap-3">
              {[
                { value: 'confirmed', label: '확인' },
                { value: 'unconfirmed', label: '미확인' },
              ].map((option) => (
                <label
                  key={option.value}
                  className={clsx(
                    'flex items-center gap-2 rounded-md border px-3 py-2 text-sm shadow-sm transition',
                    scheduleFeeConfirmed === option.value
                      ? 'border-primary bg-card text-primary'
                      : 'border-border bg-card text-muted-foreground hover:border-primary/40'
                  )}
                >
                  <input
                    type="radio"
                    name="schedule-fee"
                    value={option.value}
                    checked={scheduleFeeConfirmed === option.value}
                    onChange={() => setScheduleFeeConfirmed(option.value as 'confirmed' | 'unconfirmed')}
                  />
                  {option.label}
                </label>
              ))}
            </div>
            <Badge variant="secondary" className="bg-muted text-xs text-muted-foreground">
              확인을 선택하시면 개강 및 안내 메시지가 우선 발송됩니다.
            </Badge>
          </div>
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMessage ? (
          <Alert variant="destructive" className="border-destructive/40 bg-destructive/10 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}
        {successMessage ? (
          <Alert className="border-primary/40 bg-primary/10 text-primary">
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>{successMessage}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" size="lg" disabled={!canSubmit || isSubmitting} className="w-full">
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> 접수 중...
            </span>
          ) : (
            '등록원서 제출하기'
          )}
        </Button>
      </form>
    </div>
  )
}
