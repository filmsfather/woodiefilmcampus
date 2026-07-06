import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import ConfirmationDeadlineBanner from '@/components/dashboard/university-confirmation/ConfirmationDeadlineBanner'
import FinalConfirmationForm, {
  type FinalConfirmationRecommendation,
} from '@/components/dashboard/university-confirmation/FinalConfirmationForm'
import { fetchFinalConfirmationByToken } from '@/lib/university-confirmation/data'
import { fetchWishlistDetailForStudent, listWishlistCatalog } from '@/lib/university-wishlist/data'

export const metadata: Metadata = {
  title: '지원 대학 최종 확정 | 우디필름캠퍼스',
  description: '컨설팅을 마친 뒤 지원할 대학과 수업 희망 요일을 최종 확정합니다.',
  robots: { index: false, follow: false },
}

// 원장의 재전송/학생 확정이 실시간으로 반영되어야 하므로 항상 최신 데이터를 렌더링한다.
export const dynamic = 'force-dynamic'

interface FinalConfirmationPageProps {
  params: Promise<{ token: string }>
}

export default async function FinalConfirmationPage({ params }: FinalConfirmationPageProps) {
  const { token } = await params

  const detail = await fetchFinalConfirmationByToken(token)
  if (!detail) {
    notFound()
  }

  const catalog = listWishlistCatalog()

  // 컨설팅(wishlist)에서 원장이 추천한 대학을 안내로 함께 보여준다.
  const wishlist = await fetchWishlistDetailForStudent(detail.confirmation.studentId)
  const recommendation: FinalConfirmationRecommendation | null = wishlist
    ? {
        general: wishlist.items
          .filter((item) => item.category === 'general' && item.programKey)
          .map((item) => ({
            programKey: item.programKey as string,
            category: 'general' as const,
            universityName: item.universityName,
            shortName: item.shortName,
            programName: item.programName,
            admissionTrack: item.admissionTrack,
          })),
        specialized: wishlist.items
          .filter((item) => item.category === 'specialized' && item.programKey)
          .map((item) => ({
            programKey: item.programKey as string,
            category: 'specialized' as const,
            universityName: item.universityName,
            shortName: item.shortName,
            programName: item.programName,
            admissionTrack: item.admissionTrack,
          })),
        karts: wishlist.items.some((item) => item.category === 'karts'),
      }
    : null

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 py-8 sm:py-12">
      <header className="space-y-1 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-sky-600">우디필름캠퍼스</p>
        <h1 className="text-2xl font-semibold text-slate-900">
          {detail.studentName} 학생 지원 대학 최종 확정
        </h1>
        <p className="text-sm text-slate-500">
          컨설팅을 마친 뒤 실제 지원할 대학과 수업 희망 요일을 확정해 주세요.
        </p>
      </header>

      <div className="mt-5">
        <ConfirmationDeadlineBanner />
      </div>

      <div className="mt-6">
        <FinalConfirmationForm
          token={token}
          detail={detail}
          catalog={catalog}
          recommendation={recommendation}
        />
      </div>
    </main>
  )
}
