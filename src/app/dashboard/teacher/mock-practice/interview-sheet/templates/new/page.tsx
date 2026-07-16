import type { Metadata } from 'next'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { InterviewSheetTemplateForm } from '@/components/dashboard/mock-practice/InterviewSheetTemplateForm'
import { requireAuthForDashboard } from '@/lib/auth'

export const metadata: Metadata = {
  title: '면접지 템플릿 만들기 | Woodie Film Campus',
}

export default async function NewInterviewSheetTemplatePage() {
  await requireAuthForDashboard(['teacher', 'manager'])

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink
          fallbackHref="/dashboard/teacher/mock-practice/interview-sheet/templates"
          label="템플릿 목록으로 돌아가기"
        />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">면접지 템플릿 만들기</h1>
          <p className="text-sm text-slate-600">
            면접지에 기본으로 들어갈 질문 목록을 만듭니다. 기본 템플릿으로 지정하면 학생이 처음 면접지를 열 때
            자동으로 채워집니다.
          </p>
        </div>
      </div>

      <InterviewSheetTemplateForm />
    </section>
  )
}
