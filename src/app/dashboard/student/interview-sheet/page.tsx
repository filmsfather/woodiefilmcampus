import type { Metadata } from 'next'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { InterviewSheetEditor } from '@/components/dashboard/mock-practice/InterviewSheetEditor'
import { Card, CardContent } from '@/components/ui/card'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchInterviewSheetDetail, getOrCreateInterviewSheet } from '@/lib/interview-sheets'

export const metadata: Metadata = {
  title: '내 면접지 | Woodie Film Campus',
  description: '면접 질문을 만들고 답변을 준비하세요.',
}

export default async function StudentInterviewSheetPage() {
  const { profile } = await requireAuthForDashboard('student')

  if (!profile) {
    return null
  }

  const sheetId = await getOrCreateInterviewSheet(profile.id)
  const sheet = sheetId ? await fetchInterviewSheetDetail(profile.id) : null

  const answeredCount = sheet?.items.filter((item) => Boolean(item.answer?.trim())).length ?? 0

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink fallbackHref="/dashboard/student" label="대시보드로 돌아가기" />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">내 면접지</h1>
          <p className="text-sm text-slate-600">
            면접에서 받을 질문을 스스로 만들고 답변을 준비하세요. 선생님이 추가한 질문에도 답변을 작성하면
            피드백을 받을 수 있습니다.
          </p>
        </div>
      </div>

      {!sheet ? (
        <Card className="border-dashed border-slate-300 bg-slate-50">
          <CardContent className="py-12 text-center text-sm text-slate-500">
            면접지를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            질문 <span className="font-semibold text-slate-900">{sheet.items.length}</span>개 · 답변 완료{' '}
            <span className="font-semibold text-slate-900">{answeredCount}</span>개
          </p>
          <InterviewSheetEditor mode="student" sheet={sheet} viewerId={profile.id} />
        </>
      )}
    </section>
  )
}
