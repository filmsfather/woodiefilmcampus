import type { Metadata } from 'next'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { StudentFreeBooking } from '@/components/dashboard/practice/StudentFreeBooking'
import { requireAuthForDashboard } from '@/lib/auth'
import { getTodayISOInKst } from '@/lib/counseling'
import { fetchPracticeUniversityOptions } from '@/lib/practice/problems'
import {
  PRACTICE_PHASE1_DAILY_LIMIT,
  PRACTICE_PHASE2_DAILY_LIMIT,
} from '@/lib/practice/shared'
import { fetchFreeBookableSlots } from '@/lib/practice/slots'
import { createAdminClient } from '@/lib/supabase/admin'

export const metadata: Metadata = {
  title: '모의실기 자유 예약 | Woodie Film Campus',
  description: '공개된 빈 슬롯에 모의실기를 예약하세요.',
}

/**
 * 날짜(KST)별로 이미 확보한 예약 수. 일일 한도는 담임 배정까지 합산하므로
 * booking_type을 구분하지 않고, 취소분만 제외한다.
 */
async function fetchDailyBookingCounts(studentId: string, fromDate: string): Promise<Record<string, number>> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('practice_bookings')
    .select('id, practice_slots!inner(slot_date)')
    .eq('student_id', studentId)
    .neq('status', 'canceled')
    .gte('practice_slots.slot_date', fromDate)

  if (error) {
    console.error('[practice] failed to fetch daily booking counts', error)
    return {}
  }

  const counts: Record<string, number> = {}
  for (const row of (data ?? []) as unknown as Array<{
    practice_slots: { slot_date: string } | { slot_date: string }[] | null
  }>) {
    const slot = Array.isArray(row.practice_slots) ? row.practice_slots[0] : row.practice_slots
    if (!slot?.slot_date) continue
    counts[slot.slot_date] = (counts[slot.slot_date] ?? 0) + 1
  }

  return counts
}

export default async function StudentPracticeBookPage() {
  const { profile } = await requireAuthForDashboard('student')
  const today = getTodayISOInKst()

  const [slots, universities, dailyCounts] = await Promise.all([
    fetchFreeBookableSlots(),
    fetchPracticeUniversityOptions(),
    fetchDailyBookingCounts(profile!.id, today),
  ])

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink fallbackHref="/dashboard/student/practice-feedback" label="내 예약으로 돌아가기" />
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-slate-900">모의실기 자유 예약</h1>
          <p className="text-sm text-slate-600">
            1차 예약은 2주 전 금요일 저녁 8시에, 2차 예약은 직전주 금요일 저녁 8시에 열립니다. 1차에는 하루{' '}
            {PRACTICE_PHASE1_DAILY_LIMIT}타임, 2차부터는 하루 {PRACTICE_PHASE2_DAILY_LIMIT}타임까지 선착순으로
            예약할 수 있습니다. 대학과 유형을 고르면 아직 풀지 않은 문제가 자동으로 배정됩니다.
          </p>
        </div>
      </div>

      <StudentFreeBooking
        slots={slots}
        universities={universities}
        dailyCounts={dailyCounts}
        nowIso={new Date().toISOString()}
      />
    </section>
  )
}
