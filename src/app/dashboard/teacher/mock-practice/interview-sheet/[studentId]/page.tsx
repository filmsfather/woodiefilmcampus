import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { InterviewSheetEditor } from '@/components/dashboard/mock-practice/InterviewSheetEditor'
import { requireAuthForDashboard } from '@/lib/auth'
import {
  fetchInterviewSheetDetail,
  fetchInterviewSheetTemplates,
  getOrCreateInterviewSheet,
} from '@/lib/interview-sheets'
import { createAdminClient } from '@/lib/supabase/admin'

export const metadata: Metadata = {
  title: '학생 면접지 | Woodie Film Campus',
}

export default async function InterviewSheetStudentPage({
  params,
}: {
  params: Promise<{ studentId: string }>
}) {
  const { profile } = await requireAuthForDashboard(['teacher', 'manager'])

  if (!profile) {
    return null
  }

  const { studentId } = await params

  const admin = createAdminClient()
  const { data: studentProfile } = await admin
    .from('profiles')
    .select('id, name, email, role')
    .eq('id', studentId)
    .eq('role', 'student')
    .maybeSingle()

  if (!studentProfile) {
    notFound()
  }

  const sheetId = await getOrCreateInterviewSheet(studentId)
  if (!sheetId) {
    notFound()
  }

  const [sheet, templates] = await Promise.all([
    fetchInterviewSheetDetail(studentId),
    fetchInterviewSheetTemplates(),
  ])

  if (!sheet) {
    notFound()
  }

  const answeredCount = sheet.items.filter((item) => Boolean(item.answer?.trim())).length

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink
          fallbackHref="/dashboard/teacher/mock-practice/interview-sheet"
          label="면접지 관리로 돌아가기"
        />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">{sheet.studentName} 학생의 면접지</h1>
          <p className="text-sm text-slate-600">
            질문 {sheet.items.length}개 · 답변 완료 {answeredCount}개 — 질문을 추가하거나 답변에 피드백을
            남기세요.
          </p>
        </div>
      </div>

      <InterviewSheetEditor mode="teacher" sheet={sheet} viewerId={profile.id} templates={templates} />
    </section>
  )
}
