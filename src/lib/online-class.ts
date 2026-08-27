import { createAdminClient } from '@/lib/supabase/admin'

/**
 * 학생이 온라인반(classes.is_online) 소속인지 판정한다.
 * 온라인반 학생은 온라인 전용 모의실기 슬롯만 자유 예약할 수 있고,
 * 사이드바 메뉴도 "온라인 모의실기 1:1"로 표시된다.
 */
export async function isOnlineStudent(studentId: string): Promise<boolean> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('class_students')
    .select('class_id, classes!inner(is_online)')
    .eq('student_id', studentId)
    .eq('classes.is_online', true)
    .limit(1)

  if (error) {
    console.error('[online-class] failed to check online membership', error)
    return false
  }

  return (data ?? []).length > 0
}
