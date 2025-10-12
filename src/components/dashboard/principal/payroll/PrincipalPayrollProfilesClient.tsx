'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { savePayrollProfileAction, archivePayrollProfileAction } from '@/app/dashboard/principal/payroll/profiles/actions'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import type { TeacherPayrollProfile, TeacherContractType } from '@/lib/payroll/types'
import type { TeacherProfileSummary } from '@/lib/work-logs'

interface TeacherOption {
  id: string
  label: string
}

interface PayrollProfileEntry {
  profile: TeacherPayrollProfile
  teacher: TeacherProfileSummary
}

interface PrincipalPayrollProfilesClientProps {
  profiles: PayrollProfileEntry[]
  teacherOptions: TeacherOption[]
  teachersWithoutProfile: TeacherProfileSummary[]
}

interface FormState {
  profileId: string | null
  teacherId: string
  hourlyRate: string
  baseSalaryAmount: string
  contractType: TeacherContractType
  insuranceEnrolled: 'true' | 'false'
  effectiveFrom: string
  effectiveTo: string
  notes: string
}

interface FeedbackState {
  type: 'success' | 'error'
  message: string
}

function getTodayToken(): string {
  const now = new Date()
  const month = `${now.getMonth() + 1}`.padStart(2, '0')
  const day = `${now.getDate()}`.padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function buildInitialState(
  teacherId: string,
  profileEntry: PayrollProfileEntry | undefined
): FormState {
  if (profileEntry) {
    const { profile } = profileEntry
    return {
      profileId: profile.id,
      teacherId: profile.teacherId,
      hourlyRate: profile.hourlyRate ? String(profile.hourlyRate) : '',
      baseSalaryAmount:
        typeof profile.baseSalaryAmount === 'number' ? String(profile.baseSalaryAmount) : '',
      contractType: profile.contractType,
      insuranceEnrolled: profile.insuranceEnrolled ? 'true' : 'false',
      effectiveFrom: profile.effectiveFrom,
      effectiveTo: profile.effectiveTo ?? '',
      notes: profile.notes ?? '',
    }
  }

  return {
    profileId: null,
    teacherId,
    hourlyRate: '',
    baseSalaryAmount: '',
    contractType: 'employee',
    insuranceEnrolled: 'false',
    effectiveFrom: getTodayToken(),
    effectiveTo: '',
    notes: '',
  }
}

export function PrincipalPayrollProfilesClient({
  profiles,
  teacherOptions,
  teachersWithoutProfile,
}: PrincipalPayrollProfilesClientProps) {
  const router = useRouter()
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)
  const [isSaving, startSavingTransition] = useTransition()
  const [isArchiving, startArchivingTransition] = useTransition()

  const profilesByTeacher = useMemo(() => {
    return profiles.reduce<Record<string, PayrollProfileEntry>>((acc, entry) => {
      acc[entry.profile.teacherId] = entry
      return acc
    }, {})
  }, [profiles])

  const initialTeacherId = teacherOptions[0]?.id ?? ''
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(initialTeacherId)
  const [formState, setFormState] = useState<FormState>(() =>
    buildInitialState(initialTeacherId, profilesByTeacher[initialTeacherId])
  )

  useEffect(() => {
    if (!selectedTeacherId) {
      return
    }
    setFormState((prev) => {
      const currentProfile = profilesByTeacher[selectedTeacherId]
      const nextState = buildInitialState(selectedTeacherId, currentProfile)
      // Preserve any edits in progress if teacher matches and profile ID unchanged
      if (prev.teacherId === selectedTeacherId && prev.profileId === nextState.profileId) {
        return prev
      }
      return nextState
    })
  }, [profilesByTeacher, selectedTeacherId])

  const handleTeacherChange = (value: string) => {
    setSelectedTeacherId(value)
    const nextState = buildInitialState(value, profilesByTeacher[value])
    setFormState(nextState)
    setFeedback(null)
  }

  const handleFieldChange = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setFormState((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = (formData: FormData) => {
    startSavingTransition(() => {
      setFeedback(null)
      savePayrollProfileAction(formData)
        .then((result) => {
          if (result?.success) {
            setFeedback({ type: 'success', message: '급여 프로필을 저장했습니다.' })
            router.refresh()
          } else {
            setFeedback({ type: 'error', message: result?.error ?? '저장에 실패했습니다.' })
          }
        })
        .catch((error) => {
          console.error('[payroll] save profile client error', error)
          setFeedback({ type: 'error', message: '저장 중 오류가 발생했습니다.' })
        })
    })
  }

  const handleArchive = (formData: FormData) => {
    startArchivingTransition(() => {
      setFeedback(null)
      archivePayrollProfileAction(formData)
        .then((result) => {
          if (result?.success) {
            setFeedback({ type: 'success', message: '적용 종료 처리를 완료했습니다.' })
            router.refresh()
          } else {
            setFeedback({ type: 'error', message: result?.error ?? '적용 종료에 실패했습니다.' })
          }
        })
        .catch((error) => {
          console.error('[payroll] archive profile client error', error)
          setFeedback({ type: 'error', message: '적용 종료 중 오류가 발생했습니다.' })
        })
    })
  }

  const sortedProfiles = useMemo(() => {
    return [...profiles].sort((a, b) => {
      const nameA = a.teacher.name ?? a.teacher.email ?? ''
      const nameB = b.teacher.name ?? b.teacher.email ?? ''
      return nameA.localeCompare(nameB, 'ko')
    })
  }, [profiles])

  return (
    <div className="space-y-6">
      {teachersWithoutProfile.length > 0 && (
        <Alert>
          <AlertTitle>급여 프로필이 설정되지 않은 선생님</AlertTitle>
          <AlertDescription className="flex flex-wrap gap-2">
            {teachersWithoutProfile.map((teacher) => (
              <Badge key={teacher.id} variant="outline">
                {teacher.name ?? teacher.email ?? teacher.id}
              </Badge>
            ))}
          </AlertDescription>
        </Alert>
      )}

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl text-slate-900">급여 프로필 관리</CardTitle>
          <CardDescription>
            선생님을 선택하여 시급, 기본급, 계약 형태 등 급여 기준을 설정하거나 수정하세요.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action={handleSubmit} className="space-y-4">
            <input type="hidden" name="profileId" value={formState.profileId ?? ''} />
            <input type="hidden" name="teacherId" value={formState.teacherId} />
            <input type="hidden" name="contractType" value={formState.contractType} />
            <input type="hidden" name="insuranceEnrolled" value={formState.insuranceEnrolled} />

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="teacher-select">선생님</Label>
                <Select
                  value={formState.teacherId}
                  onValueChange={handleTeacherChange}
                  disabled={isSaving}
                >
                  <SelectTrigger id="teacher-select" className="w-full justify-between">
                    <SelectValue placeholder="선생님 선택" />
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
              <div className="space-y-2">
                <Label htmlFor="contract-type">계약 형태</Label>
                <Select
                  value={formState.contractType}
                  onValueChange={(value: TeacherContractType) =>
                    handleFieldChange('contractType', value)
                  }
                  disabled={isSaving}
                >
                  <SelectTrigger id="contract-type" className="w-full justify-between">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">근로자</SelectItem>
                    <SelectItem value="freelancer">프리랜서</SelectItem>
                    <SelectItem value="none">기타</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="hourly-rate">시급 (원)</Label>
                <Input
                  id="hourly-rate"
                  name="hourlyRate"
                  type="number"
                  min="0"
                  step="1"
                  value={formState.hourlyRate}
                  onChange={(event) => handleFieldChange('hourlyRate', event.target.value)}
                  placeholder="예: 15000"
                  required
                  disabled={isSaving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="base-salary">기본급 (선택)</Label>
                <Input
                  id="base-salary"
                  name="baseSalaryAmount"
                  type="number"
                  min="0"
                  step="1"
                  value={formState.baseSalaryAmount}
                  onChange={(event) => handleFieldChange('baseSalaryAmount', event.target.value)}
                  placeholder="없으면 비워두세요"
                  disabled={isSaving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="insurance-enrolled">4대 보험 가입 여부</Label>
                <Select
                  value={formState.insuranceEnrolled}
                  onValueChange={(value: 'true' | 'false') =>
                    handleFieldChange('insuranceEnrolled', value)
                  }
                  disabled={isSaving}
                >
                  <SelectTrigger id="insurance-enrolled" className="w-full justify-between">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">가입</SelectItem>
                    <SelectItem value="false">미가입</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="effective-from">적용 시작일</Label>
                <Input
                  id="effective-from"
                  name="effectiveFrom"
                  type="date"
                  value={formState.effectiveFrom}
                  onChange={(event) => handleFieldChange('effectiveFrom', event.target.value)}
                  disabled={isSaving}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="effective-to">적용 종료일 (선택)</Label>
                <Input
                  id="effective-to"
                  name="effectiveTo"
                  type="date"
                  value={formState.effectiveTo}
                  onChange={(event) => handleFieldChange('effectiveTo', event.target.value)}
                  disabled={isSaving}
                />
                <p className="text-xs text-slate-500">종료일을 비우면 계속 적용됩니다.</p>
              </div>
              <div className="md:col-span-2 space-y-2">
                <Label htmlFor="profile-notes">메모</Label>
                <Textarea
                  id="profile-notes"
                  name="notes"
                  value={formState.notes}
                  onChange={(event) => handleFieldChange('notes', event.target.value)}
                  placeholder="정산 시 참고할 특이사항을 입력하세요."
                  disabled={isSaving}
                  rows={3}
                />
              </div>
            </div>

            {feedback && feedback.type === 'error' && (
              <p className="text-sm text-rose-600">{feedback.message}</p>
            )}

            <div className="flex justify-end gap-2">
              <Button type="submit" disabled={isSaving || !formState.teacherId}>
                {isSaving ? '저장 중…' : '프로필 저장'}
              </Button>
            </div>
          </form>
        </CardContent>
        {feedback && feedback.type === 'success' && (
          <CardFooter>
            <p className="text-sm text-emerald-600">{feedback.message}</p>
          </CardFooter>
        )}
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">등록된 급여 프로필</CardTitle>
          <CardDescription>현재 등록된 선생님별 급여 기준과 적용 기간 요약입니다.</CardDescription>
        </CardHeader>
        <CardContent>
          {sortedProfiles.length === 0 ? (
            <p className="text-sm text-slate-500">등록된 급여 프로필이 없습니다.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>선생님</TableHead>
                  <TableHead>시급</TableHead>
                  <TableHead>기본급</TableHead>
                  <TableHead>계약 형태</TableHead>
                  <TableHead>4대 보험</TableHead>
                  <TableHead>적용 기간</TableHead>
                  <TableHead className="text-right">적용 종료</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedProfiles.map(({ profile, teacher }) => (
                  <TableRow key={profile.id}>
                    <TableCell className="font-medium text-slate-900">
                      {teacher.name ?? teacher.email ?? teacher.id}
                      <div className="text-xs text-slate-500">{teacher.email ?? ''}</div>
                    </TableCell>
                    <TableCell>{profile.hourlyRate.toLocaleString()}원</TableCell>
                    <TableCell>
                      {typeof profile.baseSalaryAmount === 'number'
                        ? `${profile.baseSalaryAmount.toLocaleString()}원`
                        : '-'}
                    </TableCell>
                    <TableCell>
                      {profile.contractType === 'employee'
                        ? '근로자'
                        : profile.contractType === 'freelancer'
                          ? '프리랜서'
                          : '기타'}
                    </TableCell>
                    <TableCell>{profile.insuranceEnrolled ? '가입' : '미가입'}</TableCell>
                    <TableCell>
                      {profile.effectiveFrom} ~ {profile.effectiveTo ?? '진행 중'}
                    </TableCell>
                    <TableCell className="text-right">
                      <form className="inline-flex items-center gap-2" action={handleArchive}>
                        <input type="hidden" name="profileId" value={profile.id} />
                        <Input
                          type="date"
                          name="effectiveTo"
                          defaultValue={profile.effectiveTo ?? ''}
                          className="h-8 w-36"
                          disabled={isArchiving}
                        />
                        <Button type="submit" variant="outline" size="sm" disabled={isArchiving}>
                          {isArchiving ? '처리 중…' : '적용 종료'}
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
