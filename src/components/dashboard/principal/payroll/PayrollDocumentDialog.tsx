'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { loadPayrollStatement } from '@/app/dashboard/principal/payroll/actions'
import { generateEmploymentCertificatePdf, generatePayrollStatementPdf } from '@/lib/payroll/pdf'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { PayrollCalculationBreakdown, TeacherPayrollProfile } from '@/lib/payroll/types'

export type PayrollDocumentMode = 'statement' | 'certificate'

interface TeacherOption {
  id: string
  label: string
}

interface PayrollDocumentDialogProps {
  mode: PayrollDocumentMode | null
  onClose: () => void
  teacherOptions: TeacherOption[]
  defaultTeacherId: string | null
  defaultMonthToken: string
}

interface StatementData {
  breakdown: PayrollCalculationBreakdown
  payrollProfile: TeacherPayrollProfile
  periodLabel: string
  teacherName: string | null
  paidAt: string | null
}

interface CertificateDraft {
  birthDate: string
  address: string
  position: string
  duties: string
  purpose: string
  employmentStart: string
  employmentEnd: string
  isCurrentlyEmployed: boolean
}

const CERTIFICATE_CACHE_PREFIX = 'woodie:payroll-certificate:'

const EMPTY_CERTIFICATE: CertificateDraft = {
  birthDate: '',
  address: '',
  position: '',
  duties: '',
  purpose: '',
  employmentStart: '',
  employmentEnd: '',
  isCurrentlyEmployed: true,
}

function todayInKst(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 }).format(value)
}

function toMonthInputValue(monthToken: string): string {
  return /^\d{4}-\d{2}$/u.test(monthToken) ? monthToken : todayInKst().slice(0, 7)
}

function readCertificateCache(teacherId: string): CertificateDraft | null {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    const raw = window.localStorage.getItem(`${CERTIFICATE_CACHE_PREFIX}${teacherId}`)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as Partial<CertificateDraft>
    return { ...EMPTY_CERTIFICATE, ...parsed }
  } catch {
    return null
  }
}

function writeCertificateCache(teacherId: string, draft: CertificateDraft) {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(`${CERTIFICATE_CACHE_PREFIX}${teacherId}`, JSON.stringify(draft))
  } catch {
    // 저장 실패는 발급 자체를 막지 않는다.
  }
}

export function PayrollDocumentDialog({
  mode,
  onClose,
  teacherOptions,
  defaultTeacherId,
  defaultMonthToken,
}: PayrollDocumentDialogProps) {
  const fallbackTeacherId = defaultTeacherId ?? teacherOptions[0]?.id ?? ''

  const [teacherId, setTeacherId] = useState(fallbackTeacherId)
  const [realName, setRealName] = useState('')
  const [issueDate, setIssueDate] = useState(todayInKst)
  const [error, setError] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)

  const [startMonth, setStartMonth] = useState(() => toMonthInputValue(defaultMonthToken))
  const [endMonth, setEndMonth] = useState(() => toMonthInputValue(defaultMonthToken))
  const [paidAt, setPaidAt] = useState(todayInKst)
  const [statementData, setStatementData] = useState<StatementData | null>(null)
  const [isLoadingStatement, setIsLoadingStatement] = useState(false)

  const [certificate, setCertificate] = useState<CertificateDraft>(EMPTY_CERTIFICATE)

  const selectedTeacherLabel = useMemo(
    () => teacherOptions.find((option) => option.id === teacherId)?.label ?? '선생님 선택',
    [teacherId, teacherOptions]
  )

  // 다이얼로그를 다시 열 때마다 현재 화면 기준으로 초기화한다.
  useEffect(() => {
    if (!mode) {
      return
    }
    setTeacherId(fallbackTeacherId)
    setIssueDate(todayInKst())
    setPaidAt(todayInKst())
    setStartMonth(toMonthInputValue(defaultMonthToken))
    setEndMonth(toMonthInputValue(defaultMonthToken))
    setStatementData(null)
    setError(null)
  }, [mode, fallbackTeacherId, defaultMonthToken])

  // 선생님이 바뀌면 실명을 프로필 이름으로 채우고, 재직증명서는 캐시된 입력값을 되살린다.
  useEffect(() => {
    if (!mode || !teacherId) {
      return
    }
    setRealName(teacherOptions.find((option) => option.id === teacherId)?.label ?? '')
    if (mode === 'certificate') {
      setCertificate(readCertificateCache(teacherId) ?? EMPTY_CERTIFICATE)
    }
  }, [mode, teacherId, teacherOptions])

  // 급여명세서는 기간이 정해지는 즉시 금액을 불러와 미리 확인할 수 있게 한다.
  useEffect(() => {
    if (mode !== 'statement' || !teacherId || !startMonth || !endMonth) {
      return
    }

    let cancelled = false
    setIsLoadingStatement(true)
    setError(null)

    loadPayrollStatement({ teacherId, startMonth, endMonth })
      .then((result) => {
        if (cancelled) {
          return
        }
        if (!result.success) {
          setStatementData(null)
          setError(result.error)
          return
        }
        setStatementData({
          breakdown: result.breakdown,
          payrollProfile: result.payrollProfile,
          periodLabel: result.periodLabel,
          teacherName: result.teacherName,
          paidAt: result.paidAt,
        })
        if (result.paidAt) {
          setPaidAt(result.paidAt.slice(0, 10))
        }
      })
      .catch((cause) => {
        if (cancelled) {
          return
        }
        console.error('[payroll] load statement error', cause)
        setStatementData(null)
        setError('급여 정보를 불러오지 못했습니다.')
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingStatement(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [mode, teacherId, startMonth, endMonth])

  const updateCertificate = useCallback(<K extends keyof CertificateDraft>(key: K, value: CertificateDraft[K]) => {
    setCertificate((previous) => ({ ...previous, [key]: value }))
  }, [])

  const handleDownloadStatement = async () => {
    if (!statementData) {
      setError('급여 정보를 먼저 불러와주세요.')
      return
    }
    const trimmedName = realName.trim()
    if (!trimmedName) {
      setError('명세서에 기재할 실명을 입력해주세요.')
      return
    }

    setIsGenerating(true)
    setError(null)
    try {
      await generatePayrollStatementPdf({
        teacherName: trimmedName,
        periodLabel: statementData.periodLabel,
        payrollProfile: statementData.payrollProfile,
        breakdown: statementData.breakdown,
        paidAt,
        issueDate,
      })
      onClose()
    } catch (cause) {
      console.error('[payroll] statement pdf error', cause)
      setError('PDF를 생성하지 못했습니다.')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleDownloadCertificate = async () => {
    const trimmedName = realName.trim()
    if (!trimmedName) {
      setError('증명서에 기재할 실명을 입력해주세요.')
      return
    }
    if (!certificate.birthDate) {
      setError('생년월일을 입력해주세요.')
      return
    }
    if (!certificate.employmentStart) {
      setError('재직 시작일을 입력해주세요.')
      return
    }
    if (!certificate.isCurrentlyEmployed && !certificate.employmentEnd) {
      setError('퇴사일을 입력하거나 재직 중을 선택해주세요.')
      return
    }
    if (
      !certificate.isCurrentlyEmployed &&
      certificate.employmentEnd < certificate.employmentStart
    ) {
      setError('퇴사일은 재직 시작일보다 앞설 수 없습니다.')
      return
    }

    setIsGenerating(true)
    setError(null)
    try {
      await generateEmploymentCertificatePdf({
        teacherName: trimmedName,
        birthDate: certificate.birthDate,
        address: certificate.address.trim(),
        position: certificate.position.trim(),
        employmentStart: certificate.employmentStart,
        employmentEnd: certificate.isCurrentlyEmployed ? null : certificate.employmentEnd,
        duties: certificate.duties.trim(),
        purpose: certificate.purpose.trim(),
        issueDate,
      })
      writeCertificateCache(teacherId, certificate)
      onClose()
    } catch (cause) {
      console.error('[payroll] certificate pdf error', cause)
      setError('PDF를 생성하지 못했습니다.')
    } finally {
      setIsGenerating(false)
    }
  }

  const teacherField = (
    <div className="space-y-1.5">
      <Label htmlFor="document-teacher">대상 선생님</Label>
      <Select value={teacherId} onValueChange={setTeacherId}>
        <SelectTrigger id="document-teacher">
          <SelectValue>{selectedTeacherLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {teacherOptions.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

  const nameField = (
    <div className="space-y-1.5">
      <Label htmlFor="document-name">실명</Label>
      <Input
        id="document-name"
        value={realName}
        placeholder="서류에 기재할 실명"
        onChange={(event) => setRealName(event.target.value)}
      />
    </div>
  )

  const issueDateField = (
    <div className="space-y-1.5">
      <Label htmlFor="document-issue-date">발행일</Label>
      <Input
        id="document-issue-date"
        type="date"
        value={issueDate}
        onChange={(event) => setIssueDate(event.target.value)}
      />
    </div>
  )

  return (
    <Dialog open={mode !== null} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === 'certificate' ? '재직증명서 발급' : '급여명세서 발급'}</DialogTitle>
          <DialogDescription>
            {mode === 'certificate'
              ? '증명서에 기재할 내용을 입력해주세요. 입력값은 이 브라우저에만 저장되어 다음 발급 때 자동으로 채워집니다.'
              : '대상 선생님과 정산 기간을 선택하면 금액을 불러옵니다.'}
          </DialogDescription>
        </DialogHeader>

        {teacherOptions.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">급여 프로필이 등록된 선생님이 없습니다.</p>
        ) : mode === 'statement' ? (
          <div className="space-y-4">
            {teacherField}
            {nameField}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="statement-start-month">시작 월</Label>
                <Input
                  id="statement-start-month"
                  type="month"
                  value={startMonth}
                  onChange={(event) => setStartMonth(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="statement-end-month">종료 월</Label>
                <Input
                  id="statement-end-month"
                  type="month"
                  value={endMonth}
                  onChange={(event) => setEndMonth(event.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="statement-paid-at">지급일</Label>
                <Input
                  id="statement-paid-at"
                  type="date"
                  value={paidAt}
                  onChange={(event) => setPaidAt(event.target.value)}
                />
              </div>
              {issueDateField}
            </div>

            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
              {isLoadingStatement ? (
                <p className="text-slate-500">급여 정보를 불러오는 중…</p>
              ) : statementData ? (
                <div className="space-y-1">
                  <p className="text-slate-600">{statementData.periodLabel}</p>
                  <p className="font-semibold text-slate-900">
                    실지급액 {formatCurrency(statementData.breakdown.netPay)}
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      총지급 {formatCurrency(statementData.breakdown.grossPay)}
                    </span>
                  </p>
                  {!statementData.paidAt && (
                    <p className="text-xs text-amber-700">
                      선택한 기간에 지급 완료된 정산 내역이 없습니다. 지급일을 직접 확인해주세요.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-slate-500">기간을 선택하면 금액이 표시됩니다.</p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {teacherField}
            {nameField}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="certificate-birth-date">생년월일</Label>
                <Input
                  id="certificate-birth-date"
                  type="date"
                  value={certificate.birthDate}
                  onChange={(event) => updateCertificate('birthDate', event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="certificate-position">직위</Label>
                <Input
                  id="certificate-position"
                  value={certificate.position}
                  placeholder="예: 강사"
                  onChange={(event) => updateCertificate('position', event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="certificate-address">주소</Label>
              <Input
                id="certificate-address"
                value={certificate.address}
                placeholder="주민등록상 주소"
                onChange={(event) => updateCertificate('address', event.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="certificate-start">재직 시작일</Label>
                <Input
                  id="certificate-start"
                  type="date"
                  value={certificate.employmentStart}
                  onChange={(event) => updateCertificate('employmentStart', event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="certificate-end">퇴사일</Label>
                <Input
                  id="certificate-end"
                  type="date"
                  value={certificate.employmentEnd}
                  disabled={certificate.isCurrentlyEmployed}
                  onChange={(event) => updateCertificate('employmentEnd', event.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="certificate-current"
                checked={certificate.isCurrentlyEmployed}
                onChange={(event) => updateCertificate('isCurrentlyEmployed', event.target.checked)}
              />
              <Label htmlFor="certificate-current" className="text-sm font-normal text-slate-700">
                현재 재직 중
              </Label>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="certificate-duties">담당업무</Label>
              <Input
                id="certificate-duties"
                value={certificate.duties}
                placeholder="예: 영화 연출 강의"
                onChange={(event) => updateCertificate('duties', event.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="certificate-purpose">용도</Label>
                <Input
                  id="certificate-purpose"
                  value={certificate.purpose}
                  placeholder="예: 은행 제출용"
                  onChange={(event) => updateCertificate('purpose', event.target.value)}
                />
              </div>
              {issueDateField}
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isGenerating}>
            취소
          </Button>
          <Button
            onClick={mode === 'certificate' ? handleDownloadCertificate : handleDownloadStatement}
            disabled={
              isGenerating ||
              teacherOptions.length === 0 ||
              (mode === 'statement' && (isLoadingStatement || !statementData))
            }
          >
            {isGenerating ? '생성 중…' : '다운로드'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
