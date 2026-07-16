import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { InterviewSheetTemplateForm } from '@/components/dashboard/mock-practice/InterviewSheetTemplateForm'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchInterviewSheetTemplateDetail } from '@/lib/interview-sheets'

export const metadata: Metadata = {
  title: '면접지 템플릿 수정 | Woodie Film Campus',
}

export default async function EditInterviewSheetTemplatePage({
  params,
}: {
  params: Promise<{ templateId: string }>
}) {
  await requireAuthForDashboard(['teacher', 'manager'])

  const { templateId } = await params
  const template = await fetchInterviewSheetTemplateDetail(templateId)

  if (!template) {
    notFound()
  }

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink
          fallbackHref="/dashboard/teacher/mock-practice/interview-sheet/templates"
          label="템플릿 목록으로 돌아가기"
        />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">면접지 템플릿 수정</h1>
          <p className="text-sm text-slate-600">
            질문을 수정하면 앞으로 적용되는 면접지에만 반영됩니다. 이미 학생 면접지에 복사된 질문은 바뀌지
            않습니다.
          </p>
        </div>
      </div>

      <InterviewSheetTemplateForm initialTemplate={template} />
    </section>
  )
}
