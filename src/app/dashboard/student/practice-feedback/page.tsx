import type { Metadata } from 'next'
import Link from 'next/link'
import { CalendarPlus, History } from 'lucide-react'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { StudentPracticeBookingList } from '@/components/dashboard/practice/StudentPracticeBookingList'
import { Button } from '@/components/ui/button'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchStudentPracticeBookings } from '@/lib/practice/attempts'

export const metadata: Metadata = {
  title: '모의실기 1:1 피드백 | Woodie Film Campus',
  description: '예약한 모의실기 일정과 응시 상태를 확인하세요.',
}

export default async function StudentPracticeFeedbackPage() {
  const { profile } = await requireAuthForDashboard('student')

  const rows = await fetchStudentPracticeBookings(profile!.id)
  const now = Date.now()

  const upcoming = rows
    .filter((row) => row.startsAt && Date.parse(row.startsAt) >= now - 60 * 60 * 1000)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const past = rows.filter((row) => !upcoming.includes(row))

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink fallbackHref="/dashboard/student" label="학생용 허브로 돌아가기" />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-slate-900">모의실기 1:1 피드백</h1>
            <p className="text-sm text-slate-600">
              예약한 시간이 되기 전에 문제가 공개됩니다. 제한시간 안에 답안을 제출하면 바로 선생님과 1:1 피드백을
              진행합니다.
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild>
              <Link href="/dashboard/student/practice-feedback/book">
                <CalendarPlus className="mr-1 h-4 w-4" /> 자유 예약
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard/student/practice-feedback/archive">
                <History className="mr-1 h-4 w-4" /> 지난 기록
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <StudentPracticeBookingList title="예정된 모의실기" rows={upcoming} emptyMessage="예정된 모의실기가 없습니다." />
      {past.length > 0 ? (
        <StudentPracticeBookingList title="최근 진행" rows={past.slice(0, 5)} emptyMessage="기록이 없습니다." />
      ) : null}
    </section>
  )
}
