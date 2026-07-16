import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus } from 'lucide-react'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import {
  InterviewSheetTemplateDeleteButton,
  InterviewSheetTemplateSetDefaultButton,
} from '@/components/dashboard/mock-practice/InterviewSheetTemplateActions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import DateUtil from '@/lib/date-util'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchInterviewSheetTemplates } from '@/lib/interview-sheets'

export const metadata: Metadata = {
  title: '면접지 템플릿 | Woodie Film Campus',
  description: '면접지 기본 질문 템플릿을 관리하세요.',
}

function formatDate(value: string) {
  return DateUtil.formatForDisplay(value, {
    locale: 'ko-KR',
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default async function InterviewSheetTemplatesPage() {
  await requireAuthForDashboard(['teacher', 'manager'])

  const templates = await fetchInterviewSheetTemplates()

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-3">
          <DashboardBackLink
            fallbackHref="/dashboard/teacher/mock-practice/interview-sheet"
            label="면접지 관리로 돌아가기"
          />
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-slate-900">면접지 템플릿</h1>
            <p className="text-sm text-slate-600">
              기본 템플릿은 학생이 처음 면접지를 열 때 자동으로 적용됩니다. 다른 템플릿은 학생 면접지에서
              직접 적용할 수 있습니다.
            </p>
          </div>
        </div>
        <Button asChild>
          <Link href="/dashboard/teacher/mock-practice/interview-sheet/templates/new">
            <Plus className="mr-1 h-4 w-4" /> 템플릿 만들기
          </Link>
        </Button>
      </div>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">템플릿 목록</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {templates.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
              아직 만든 템플릿이 없습니다. 템플릿 만들기로 시작하세요.
            </p>
          ) : (
            templates.map((template) => (
              <div
                key={template.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-4"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">{template.title}</p>
                    {template.isDefault && <Badge>기본 템플릿</Badge>}
                  </div>
                  {template.description && (
                    <p className="truncate text-xs text-slate-500">{template.description}</p>
                  )}
                  <p className="text-xs text-slate-500">
                    질문 {template.itemCount}개
                    {template.createdByName ? ` · ${template.createdByName}` : ''} ·{' '}
                    {formatDate(template.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!template.isDefault && (
                    <InterviewSheetTemplateSetDefaultButton templateId={template.id} />
                  )}
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/dashboard/teacher/mock-practice/interview-sheet/templates/${template.id}/edit`}>
                      수정
                    </Link>
                  </Button>
                  <InterviewSheetTemplateDeleteButton templateId={template.id} />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </section>
  )
}
