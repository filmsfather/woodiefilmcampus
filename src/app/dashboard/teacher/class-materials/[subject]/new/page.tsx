import { notFound } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { ClassMaterialPostForm } from '@/components/dashboard/class-materials/ClassMaterialPostForm'
import { createClassMaterialPost } from '@/app/dashboard/teacher/class-materials/actions'
import { getClassMaterialSubjectLabel, isClassMaterialSubject } from '@/lib/class-materials'
import { requireAuthForDashboard } from '@/lib/auth'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

export default async function NewClassMaterialPage({ params }: { params: Promise<{ subject: string }> }) {
  const { profile } = await requireAuthForDashboard(['teacher', 'manager'])
  const { subject } = await params
  if (!isClassMaterialSubject(subject)) {
    notFound()
  }
  const title = getClassMaterialSubjectLabel(subject)

  const supabase = await createServerSupabase()
  const { data: teacherRows } = await supabase
    .from('profiles')
    .select('id, name, email')
    .eq('role', 'teacher')
    .order('name', { ascending: true })
  const teachers = (teacherRows ?? []).map((row) => ({
    id: String(row.id),
    name: (row.name ?? null) as string | null,
    email: (row.email ?? null) as string | null,
  }))

  return (
    <section className="space-y-6">
      <DashboardBackLink
        fallbackHref={`/dashboard/teacher/class-materials/${subject}`}
        label={`${title} 목록으로 돌아가기`}
      />
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">{title} · 자료 업로드</h1>
        <p className="text-sm text-slate-600">수업자료와 학생 유인물을 업로드해 아카이브를 구성하세요.</p>
      </div>

      <ClassMaterialPostForm
        subject={subject}
        submitLabel="자료 업로드"
        onSubmit={createClassMaterialPost}
        currentUserId={profile.id}
        teachers={teachers}
      />
    </section>
  )
}
