import type { Metadata } from 'next'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import StudentWishlistPanel from '@/components/dashboard/university-wishlist/StudentWishlistPanel'
import { requireAuthForDashboard } from '@/lib/auth'
import {
  fetchWishlistDetailForStudent,
  listWishlistCatalog,
} from '@/lib/university-wishlist/data'

export const metadata: Metadata = {
  title: '희망대학 선정 | 학생 대시보드',
  description: '원장 선생님이 추천한 대학을 확인하고 희망대학을 함께 확정합니다.',
}

export default async function StudentWishlistPage() {
  const { profile } = await requireAuthForDashboard('student')
  if (!profile) return null

  const detail = await fetchWishlistDetailForStudent(profile.id)
  const catalog = listWishlistCatalog()

  return (
    <section className="space-y-6">
      <DashboardBackLink
        fallbackHref="/dashboard/student/university-report"
        label="내 성적 등록으로 돌아가기"
      />

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">희망대학 선정</h1>
        <p className="text-sm text-slate-600">
          원장 선생님이 추천한 대학을 확인하고, 같으면 동의해 확정하거나 희망 대학을 직접 추가하고 의견을
          남겨 주세요.
        </p>
      </div>

      <StudentWishlistPanel studentId={profile.id} detail={detail} catalog={catalog} />
    </section>
  )
}
