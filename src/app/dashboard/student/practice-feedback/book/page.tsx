import type { Metadata } from 'next'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { StudentFreeBooking } from '@/components/dashboard/practice/StudentFreeBooking'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchPracticeUniversityOptions } from '@/lib/practice/problems'
import { getBookingCycle } from '@/lib/practice/shared'
import { fetchFreeBookableSlots } from '@/lib/practice/slots'
import { createAdminClient } from '@/lib/supabase/admin'

export const metadata: Metadata = {
  title: '모의실기 자유 예약 | Woodie Film Campus',
  description: '공개된 빈 슬롯에 모의실기를 예약하세요.',
}

async function fetchUsedFreeCycles(studentId: string): Promise<Set<string>> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('practice_bookings')
    .select('booking_cycle')
    .eq('student_id', studentId)
    .eq('booking_type', 'free')
    .eq('status', 'reserved')

  if (error) {
    console.error('[practice] failed to fetch free booking cycles', error)
    return new Set()
  }

  return new Set(((data ?? []) as Array<{ booking_cycle: string }>).map((row) => row.booking_cycle))
}

export default async function StudentPracticeBookPage() {
  const { profile } = await requireAuthForDashboard('student')

  const [slots, universities, usedCycles] = await Promise.all([
    fetchFreeBookableSlots(),
    fetchPracticeUniversityOptions(),
    fetchUsedFreeCycles(profile!.id),
  ])

  const bookableSlots = slots.filter((slot) => !usedCycles.has(getBookingCycle(slot.slotDate)))

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink fallbackHref="/dashboard/student/practice-feedback" label="내 예약으로 돌아가기" />
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-slate-900">모의실기 자유 예약</h1>
          <p className="text-sm text-slate-600">
            담임 선생님이 배정한 일정 외에 주 1회 빈 슬롯을 직접 예약할 수 있습니다. 대학과 유형을 고르면 아직 풀지
            않은 문제가 자동으로 배정됩니다.
          </p>
        </div>
      </div>

      <StudentFreeBooking
        slots={bookableSlots}
        universities={universities}
        usedCycleLabels={Array.from(usedCycles).sort()}
      />
    </section>
  )
}
