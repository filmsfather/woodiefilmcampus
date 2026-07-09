import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ShieldCheck } from 'lucide-react'

import ConfirmationDeadlineBanner from '@/components/dashboard/university-confirmation/ConfirmationDeadlineBanner'
import FinalConfirmationForm, {
  type FinalConfirmationRecommendation,
} from '@/components/dashboard/university-confirmation/FinalConfirmationForm'
import { getAuthContext } from '@/lib/auth'
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

  // 원장이 로그인한 상태로 들어오면 원장 확정 모드임을 안내한다.
  const { profile } = await getAuthContext()
  const isPrincipal = profile?.role === 'principal'

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

      {isPrincipal ? (
        <div className="mt-5 flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-800">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-violet-600" />
          <p className="leading-relaxed">
            원장 권한으로 접속 중입니다. 여기서 지원 대학과 수업 희망 요일을 수정해 확정하면
            <span className="font-semibold"> 원장 확정</span>으로 기록되고, 학생·학부모에게 수정
            가능한 확정 링크 안내 문자가 발송됩니다.
          </p>
        </div>
      ) : null}

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
