import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { StickerBoard } from '@/components/dashboard/sticker-board/StickerBoard'
import { getAuthContext } from '@/lib/auth'
import { fetchStickerBoard } from '@/lib/sticker-board'
import { redirect } from 'next/navigation'

export default async function StickerBoardPage() {
  const { session, profile } = await getAuthContext()

  if (!session || !profile) {
    redirect('/login')
  }

  const students = await fetchStickerBoard()

  const currentStudentId = profile.role === 'student' ? profile.id : null

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink
          fallbackHref={`/dashboard/${profile.role}`}
          label="대시보드로 돌아가기"
        />
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-slate-900">
            감상일지 스티커 보드
          </h1>
          <p className="text-sm text-slate-600">
            완료된 감상일지마다 스티커가 붙어요. 스티커를 눌러 감상지를 확인해보세요.
          </p>
        </div>
      </div>

      <StickerBoard students={students} currentStudentId={currentStudentId} />
    </section>
  )
}
