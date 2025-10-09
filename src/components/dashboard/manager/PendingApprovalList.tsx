'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { approveStudent, removePendingUser } from '@/app/dashboard/manager/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import DateUtil from '@/lib/date-util'

export interface PendingStudentProfile {
  id: string
  email: string
  name?: string | null
  student_phone?: string | null
  parent_phone?: string | null
  academic_record?: string | null
  created_at: string
}

export function PendingApprovalList({ students }: { students: PendingStudentProfile[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [processing, setProcessing] = useState<{ id: string; action: 'approve' | 'remove' } | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const resetState = () => {
    setProcessing(null)
  }

  const handleApprove = (id: string) => {
    setErrorMessage(null)
    setProcessing({ id, action: 'approve' })

    startTransition(async () => {
      const result = await approveStudent(id)

      if (result?.error) {
        setErrorMessage(result.error)
        resetState()
        return
      }

      resetState()
      router.refresh()
    })
  }

  const handleRemove = (id: string) => {
    setErrorMessage(null)
    setProcessing({ id, action: 'remove' })

    startTransition(async () => {
      const result = await removePendingUser(id)

      if (result?.error) {
        setErrorMessage(result.error)
        resetState()
        return
      }

      resetState()
      router.refresh()
    })
  }

  const isProcessing = (id: string, action: 'approve' | 'remove') => {
    return isPending && processing?.id === id && processing.action === action
  }

  const disabledFor = (id: string) => {
    return isPending && processing?.id === id
  }

  const formatDateTime = (value: string) => {
    try {
      return DateUtil.formatForDisplay(value, {
        locale: 'ko-KR',
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return value
    }
  }

  return (
    <Card className="border-slate-200">
      <CardHeader className="space-y-1">
        <CardTitle className="text-xl">가입 승인 대기 명단</CardTitle>
        <p className="text-sm text-slate-500">학원생 여부를 확인한 뒤 승인하거나 삭제하세요.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {errorMessage && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}

        {students.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
            현재 승인 대기 중인 가입 요청이 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {students.map((student) => (
              <div
                key={student.id}
                className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <p className="text-base font-semibold text-slate-900">{student.name ?? '이름 미입력'}</p>
                    <Badge variant="outline" className="font-normal">{student.academic_record ?? '학적 정보 없음'}</Badge>
                  </div>
                  <p className="text-sm text-slate-600">{student.email}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                    <span>학생: {student.student_phone ?? '미입력'}</span>
                    <span>부모님: {student.parent_phone ?? '미입력'}</span>
                    <span>가입: {formatDateTime(student.created_at)}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    size="sm"
                    className="sm:w-28"
                    onClick={() => handleApprove(student.id)}
                    disabled={disabledFor(student.id)}
                  >
                    {isProcessing(student.id, 'approve') ? (
                      <span className="flex items-center justify-center gap-2">
                        <LoadingSpinner />
                        승인 중...
                      </span>
                    ) : (
                      '승인'
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="sm:w-28"
                    onClick={() => handleRemove(student.id)}
                    disabled={disabledFor(student.id)}
                  >
                    {isProcessing(student.id, 'remove') ? (
                      <span className="flex items-center justify-center gap-2">
                        <LoadingSpinner />
                        삭제 중...
                      </span>
                    ) : (
                      '삭제'
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
