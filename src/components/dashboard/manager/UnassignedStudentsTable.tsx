'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

import { updateMemberClassAssignments } from '@/app/dashboard/manager/members/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export interface UnassignedStudentSummary {
  id: string
  name: string | null
  email: string
  studentPhone: string | null
  parentPhone: string | null
  academicRecord: string | null
}

export interface ClassSummary {
  id: string
  name: string | null
}

function formatPhone(value: string | null) {
  if (!value) {
    return '미입력'
  }

  const digits = value.replace(/\D/g, '')

  if (!/^01[0-9]{8,9}$/.test(digits)) {
    return value
  }

  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
  }

  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
}

export function UnassignedStudentsTable({
  students,
  classes,
}: {
  students: UnassignedStudentSummary[]
  classes: ClassSummary[]
}) {
  const router = useRouter()
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [activeStudent, setActiveStudent] = useState<UnassignedStudentSummary | null>(null)
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const sortedStudents = useMemo(() => {
    return [...students].sort((a, b) => {
      const nameA = a.name ?? ''
      const nameB = b.name ?? ''

      if (nameA && nameB) {
        return nameA.localeCompare(nameB, 'ko')
      }

      if (nameA) {
        return -1
      }

      if (nameB) {
        return 1
      }

      return a.email.localeCompare(b.email, 'ko')
    })
  }, [students])

  const sortedClasses = useMemo(() => {
    return [...classes].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'ko'))
  }, [classes])

  const assignDisabled = sortedClasses.length === 0
  const hasStudents = sortedStudents.length > 0

  const openAssignment = (student: UnassignedStudentSummary) => {
    setFeedback(null)
    setErrorMessage(null)
    setActiveStudent(student)
    setSelectedClassId(sortedClasses[0]?.id ?? null)
  }

  const closeAssignment = () => {
    if (isPending) {
      return
    }
    setActiveStudent(null)
    setSelectedClassId(null)
    setErrorMessage(null)
  }

  const handleAssign = () => {
    if (!activeStudent) {
      return
    }

    if (!selectedClassId) {
      setErrorMessage('배정할 반을 선택해주세요.')
      return
    }

    startTransition(async () => {
      const result = await updateMemberClassAssignments({
        memberId: activeStudent.id,
        role: 'student',
        classIds: [selectedClassId],
        homeroomClassId: null,
      })

      if (result?.error) {
        setErrorMessage(result.error)
        return
      }

      setFeedback({
        type: 'success',
        text: `${activeStudent.name ?? activeStudent.email} 학생을 배정했습니다.`,
      })
      setActiveStudent(null)
      setSelectedClassId(null)
      setErrorMessage(null)
      router.refresh()
    })
  }

  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-slate-900">반 미배정 학생</CardTitle>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        {feedback ? (
          <div className="px-6 pb-3">
            <Alert variant={feedback.type === 'error' ? 'destructive' : 'default'}>
              <AlertDescription>{feedback.text}</AlertDescription>
            </Alert>
          </div>
        ) : null}
        {hasStudents ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="w-64">학생 정보</TableHead>
                  <TableHead className="w-40">학생 번호</TableHead>
                  <TableHead className="w-40">부모님 번호</TableHead>
                  <TableHead className="w-44">성적</TableHead>
                  <TableHead className="w-48 text-right">액션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedStudents.map((student) => (
                  <TableRow key={student.id}>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="font-medium text-slate-900">{student.name ?? '이름 미등록'}</span>
                        <span className="text-xs text-slate-500">{student.email}</span>
                      </div>
                    </TableCell>
                    <TableCell>{formatPhone(student.studentPhone)}</TableCell>
                    <TableCell>{formatPhone(student.parentPhone)}</TableCell>
                    <TableCell>{student.academicRecord?.trim() ? student.academicRecord : '-'}</TableCell>
                    <TableCell className="flex items-center justify-end gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/dashboard/manager/members?focus=${student.id}`}>정보 수정</Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openAssignment(student)}
                        disabled={assignDisabled}
                      >
                        반 배정
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-6 py-8 text-center text-sm text-slate-500">
            아직 반 배정이 필요한 학생이 없습니다.
          </div>
        )}
      </CardContent>

      <Sheet open={!!activeStudent} onOpenChange={(open) => (!open ? closeAssignment() : undefined)}>
        <SheetContent className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>반 배정</SheetTitle>
            {activeStudent ? (
              <SheetDescription>
                {activeStudent.name ?? activeStudent.email} · 학생
              </SheetDescription>
            ) : null}
          </SheetHeader>

          <div className="mt-4 space-y-4">
            {assignDisabled ? (
              <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                등록된 반이 없습니다. 먼저 반을 생성한 뒤 다시 시도해주세요.
              </div>
            ) : (
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {sortedClasses.map((classItem) => {
                  const checked = selectedClassId === classItem.id
                  return (
                    <label
                      key={classItem.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition ${checked ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 hover:border-indigo-300'}`}
                    >
                      <input
                        type="radio"
                        name="assignment"
                        value={classItem.id}
                        checked={checked}
                        onChange={() => {
                          setSelectedClassId(classItem.id)
                          setErrorMessage(null)
                        }}
                      />
                      <span>{classItem.name ?? '이름 미등록'}</span>
                    </label>
                  )
                })}
              </div>
            )}

            {errorMessage ? (
              <Alert variant="destructive">
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={closeAssignment} disabled={isPending}>
                닫기
              </Button>
              <Button onClick={handleAssign} disabled={isPending || assignDisabled}>
                {isPending ? (
                  <span className="flex items-center gap-2">
                    <LoadingSpinner className="size-4" /> 저장 중
                  </span>
                ) : (
                  '저장'
                )}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </Card>
  )
}
