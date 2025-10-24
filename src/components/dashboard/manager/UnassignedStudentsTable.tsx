import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

export function UnassignedStudentsTable({ students }: { students: UnassignedStudentSummary[] }) {
  if (students.length === 0) {
    return (
      <Card className="border-slate-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold text-slate-900">반 미배정 학생</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-6 py-8 text-center text-sm text-slate-500">
            아직 반 배정이 필요한 학생이 없습니다.
          </div>
        </CardContent>
      </Card>
    )
  }

  const sorted = [...students].sort((a, b) => {
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

  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-slate-900">반 미배정 학생</CardTitle>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="w-64">학생 정보</TableHead>
                <TableHead className="w-40">학생 번호</TableHead>
                <TableHead className="w-40">부모님 번호</TableHead>
                <TableHead className="w-44">성적</TableHead>
                <TableHead className="w-32 text-right">액션</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((student) => (
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
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/dashboard/manager/members?focus=${student.id}`}>정보 수정</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
