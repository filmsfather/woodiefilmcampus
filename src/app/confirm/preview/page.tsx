import type { Metadata } from 'next'

import ConfirmationDeadlineBanner from '@/components/dashboard/university-confirmation/ConfirmationDeadlineBanner'
import FinalConfirmationForm, {
  type FinalConfirmationRecommendation,
} from '@/components/dashboard/university-confirmation/FinalConfirmationForm'
import type { FinalConfirmationDetail } from '@/lib/university-confirmation/data'
import { listWishlistCatalog, type WishlistCatalogEntry } from '@/lib/university-wishlist/data'

export const metadata: Metadata = {
  title: '[미리보기] 지원 대학 최종 확정 폼',
  robots: { index: false, follow: false },
}

// 개발용 미리보기 전용 라우트. DB/토큰 없이 실제 폼 컴포넌트를 목업 데이터로 렌더링한다.
// 제출 버튼은 유효하지 않은 토큰이라 저장되지 않는다(레이아웃/동작 확인용).
export const dynamic = 'force-dynamic'

export default function FinalConfirmationPreviewPage() {
  const catalog = listWishlistCatalog()

  const generalSamples = catalog.filter((c) => c.category === 'general').slice(0, 3)
  const specializedSamples = catalog.filter((c) => c.category === 'specialized').slice(0, 1)

  const toRec = (entry: WishlistCatalogEntry, category: 'general' | 'specialized') => ({
    programKey: entry.programKey,
    category,
    universityName: entry.universityName,
    shortName: entry.shortName,
    programName: entry.programName,
    admissionTrack: entry.admissionTrack,
  })

  const recommendation: FinalConfirmationRecommendation = {
    general: generalSamples.map((entry) => toRec(entry, 'general')),
    specialized: specializedSamples.map((entry) => toRec(entry, 'specialized')),
    karts: true,
  }

  // 슬롯은 비운 상태로 시작해 "빈 6칸 + 추천 안내"를 함께 볼 수 있게 한다.
  const detail: FinalConfirmationDetail = {
    confirmation: {
      id: 'preview',
      studentId: 'preview',
      shareToken: 'preview',
      status: 'pending',
      kartsApply: false,
      weekdayPreferences: [],
      confirmedAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    studentName: '홍길동',
    items: [],
    generalItems: [],
    specializedItems: [],
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 py-8 sm:py-12">
      <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        미리보기 화면입니다. 목업 데이터로 렌더링되며 제출은 저장되지 않습니다.
      </div>

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
          token="preview"
          detail={detail}
          catalog={catalog}
          recommendation={recommendation}
        />
      </div>
    </main>
  )
}
