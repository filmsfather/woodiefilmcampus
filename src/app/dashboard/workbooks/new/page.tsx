import type { Metadata } from 'next'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import WorkbookWizard from '@/components/dashboard/workbooks/WorkbookWizard'
import { requireAuthForDashboard } from '@/lib/auth'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: '문제집 생성 | Woodie Film Campus',
  description: '교사용 워크북 작성 마법사를 통해 다양한 유형의 문제집을 생성하세요.',
}

export interface TeacherOption {
  id: string
  name: string
}

export default async function WorkbookCreatePage() {
  const { profile } = await requireAuthForDashboard(['teacher', 'manager'])
  const supabase = await createServerSupabase()

  // Fetch teachers and principals for author selection
  const { data: teacherData } = await supabase
    .from('profiles')
    .select('id, name')
    .in('role', ['teacher', 'principal'])
    .order('name', { ascending: true })

  const teachers: TeacherOption[] = (teacherData ?? [])
    .filter((t): t is { id: string; name: string } => !!t.name)
    .map((t) => ({ id: t.id, name: t.name }))

  return (
    <section className="space-y-6">
      <DashboardBackLink fallbackHref="/dashboard/workbooks" label="문제집 목록으로 돌아가기" />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">문제집 생성</h1>
        <p className="text-sm text-slate-600">
          {profile?.name ?? profile?.email} 님, 문제집 기본 정보와 문항을 차례대로 입력한 뒤 검토 페이지에서 저장하세요.
        </p>
      </div>

      <WorkbookWizard teacherId={profile?.id ?? ''} teachers={teachers} />
    </section>
  )
}
