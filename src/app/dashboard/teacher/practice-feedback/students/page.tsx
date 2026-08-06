import type { Metadata } from 'next'
import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchPracticeStudentsWithBookings } from '@/lib/practice/attempts'

export const metadata: Metadata = {
  title: '학생별 모의실기 이력 | Woodie Film Campus',
  description: '학생마다 쌓인 모의실기 기록을 관리하세요.',
}

export default async function PracticeStudentsPage() {
  await requireAuthForDashboard(['teacher', 'manager'])

  const students = await fetchPracticeStudentsWithBookings()

  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-slate-900">모의실기 응시 학생 {students.length}명</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {students.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">아직 모의실기를 예약한 학생이 없습니다.</p>
        ) : (
          students.map((student) => (
            <Link
              key={student.studentId}
              href={`/dashboard/teacher/practice-feedback/students/${student.studentId}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-white p-3 transition hover:border-emerald-300 hover:bg-emerald-50/40"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-900">{student.studentName}</span>
                {student.className ? (
                  <span className="text-xs text-slate-500">{student.className}</span>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">응시 {student.totalCount}회</Badge>
                <Badge variant="secondary">피드백 {student.feedbackCount}회</Badge>
              </div>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  )
}
