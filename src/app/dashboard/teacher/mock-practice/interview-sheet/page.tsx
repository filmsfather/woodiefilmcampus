import type { Metadata } from 'next'
import Link from 'next/link'
import { FileText, Users } from 'lucide-react'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { InterviewSheetStudentList } from '@/components/dashboard/mock-practice/InterviewSheetStudentList'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchInterviewSheetStudentRows } from '@/lib/interview-sheets'

export const metadata: Metadata = {
  title: '면접지 관리 | Woodie Film Campus',
  description: '학생별 면접지를 확인하고 질문과 피드백을 관리하세요.',
}

export default async function InterviewSheetListPage() {
  const { profile } = await requireAuthForDashboard(['teacher', 'manager'])

  if (!profile) {
    return null
  }

  const rows = await fetchInterviewSheetStudentRows(profile.id, profile.role)

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-3">
          <DashboardBackLink fallbackHref="/dashboard/teacher/mock-practice" label="모의실기로 돌아가기" />
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-slate-900">면접지 관리</h1>
            <p className="text-sm text-slate-600">
              학생마다 면접지 1장이 제공됩니다. 학생 면접지를 열어 질문을 추가하고 답변에 피드백을 남기세요.
            </p>
          </div>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard/teacher/mock-practice/interview-sheet/templates">
            <FileText className="mr-1 h-4 w-4" /> 템플릿 관리
          </Link>
        </Button>
      </div>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-slate-900">
            <Users className="h-4 w-4" /> 학생 목록
          </CardTitle>
        </CardHeader>
        <CardContent>
          <InterviewSheetStudentList rows={rows} />
        </CardContent>
      </Card>
    </section>
  )
}
