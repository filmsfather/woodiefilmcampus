import { notFound } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { AdmissionMaterialPostForm } from '@/components/dashboard/admission-materials/AdmissionMaterialPostForm'
import { createAdmissionMaterialPost } from '@/app/dashboard/teacher/admission-materials/actions'
import { getAdmissionCategoryLabel, isAdmissionMaterialCategory } from '@/lib/admission-materials'

export default async function NewAdmissionMaterialPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params
  if (!isAdmissionMaterialCategory(category)) {
    notFound()
  }
  const title = getAdmissionCategoryLabel(category)

  return (
    <section className="space-y-6">
      <DashboardBackLink
        fallbackHref={`/dashboard/teacher/admission-materials/${category}`}
        label={`${title} 목록으로 돌아가기`}
      />
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">{title} · 자료 업로드</h1>
        <p className="text-sm text-slate-600">입시 자료와 일정을 추가해 학생들과 공유하세요.</p>
      </div>

      <AdmissionMaterialPostForm
        category={category}
        submitLabel="자료 업로드"
        onSubmit={createAdmissionMaterialPost}
      />
    </section>
  )
}
