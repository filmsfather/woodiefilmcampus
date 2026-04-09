import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { StickerBoard } from '@/components/dashboard/sticker-board/StickerBoard'
import { getAuthContext } from '@/lib/auth'
import {
  fetchStickerBoard,
  fetchAllPeriods,
  fetchActivePeriod,
  fetchPeriodById,
  fetchHallOfFame,
} from '@/lib/sticker-board'
import { redirect } from 'next/navigation'

export default async function StickerBoardPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { session, profile } = await getAuthContext()

  if (!session || !profile) {
    redirect('/login')
  }

  const searchParams = await props.searchParams
  const periodParam = typeof searchParams?.period === 'string' ? searchParams.period : null

  const allPeriods = await fetchAllPeriods()

  let currentPeriod = periodParam
    ? await fetchPeriodById(periodParam)
    : await fetchActivePeriod()

  if (!currentPeriod && allPeriods.length > 0) {
    currentPeriod = allPeriods[0]
  }

  const students = currentPeriod ? await fetchStickerBoard(currentPeriod) : []

  const currentIdx = currentPeriod
    ? allPeriods.findIndex((p) => p.id === currentPeriod!.id)
    : -1
  const previousPeriod = currentIdx >= 0 && currentIdx < allPeriods.length - 1
    ? allPeriods[currentIdx + 1]
    : null

  const [hallOfFame, previousPeriodStudents] = previousPeriod
    ? await Promise.all([
        fetchHallOfFame(previousPeriod.id, previousPeriod),
        fetchStickerBoard(previousPeriod),
      ])
    : [[], []]

  const currentStudentId = profile.role === 'student' ? profile.id : null
  const isStaff = ['principal', 'manager', 'teacher'].includes(profile.role)

  const hallOfFameForCurrent = currentPeriod
    ? await fetchHallOfFame(currentPeriod.id, previousPeriod ?? currentPeriod)
    : []

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink
          fallbackHref={`/dashboard/${profile.role}`}
          label="대시보드로 돌아가기"
        />
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-slate-900">
            시네필 챌린지 보드
          </h1>
          <p className="text-sm text-slate-600">
            완료된 감상일지마다 스티커가 붙어요. 스티커를 눌러 감상지를 확인해보세요.
          </p>
        </div>
      </div>

      <StickerBoard
        students={students}
        currentStudentId={currentStudentId}
        periods={allPeriods}
        currentPeriod={currentPeriod}
        previousPeriodHallOfFame={hallOfFame}
        previousPeriodLabel={previousPeriod?.label ?? null}
        previousPeriodStudents={previousPeriodStudents}
        isStaff={isStaff}
        currentPeriodHallOfFame={hallOfFameForCurrent}
        currentPeriodHallOfFameIds={hallOfFameForCurrent.map((h) => h.studentId)}
      />
    </section>
  )
}
