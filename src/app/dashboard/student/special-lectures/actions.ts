'use server'

import { revalidatePath } from 'next/cache'

import { getAuthContext } from '@/lib/auth'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

const STUDENT_PATH = '/dashboard/student/special-lectures'
const MANAGER_REQUESTS_PATH = '/dashboard/manager/special-lectures/requests'

type RequestActionResult = {
  success?: boolean
  error?: string
  requestId?: string
}

async function getStudentProfile() {
  const { profile } = await getAuthContext()
  if (!profile || profile.role !== 'student') {
    return null
  }
  return profile
}

function revalidateAll(lectureId?: string) {
  revalidatePath(STUDENT_PATH)
  revalidatePath(MANAGER_REQUESTS_PATH)
  revalidatePath('/dashboard/manager/special-lectures')
  if (lectureId) {
    revalidatePath(`${STUDENT_PATH}/${lectureId}`)
  }
}

export async function requestSpecialLectureAction(lectureId: string): Promise<RequestActionResult> {
  const profile = await getStudentProfile()
  if (!profile) {
    return { error: '학생 계정만 특강을 신청할 수 있습니다.' }
  }
  if (!lectureId) {
    return { error: '특강 정보를 확인할 수 없습니다.' }
  }

  const supabase = await createServerSupabase()

  const { data: lecture, error: lectureError } = await supabase
    .from('special_lectures')
    .select('id, applications_open')
    .eq('id', lectureId)
    .maybeSingle()

  if (lectureError) {
    console.error('[special-lectures] failed to load lecture for request', lectureError)
    return { error: '특강 정보를 불러오지 못했습니다.' }
  }

  if (!lecture) {
    return { error: '특강 정보를 찾을 수 없습니다.' }
  }

  if (!lecture.applications_open) {
    return { error: '현재 신청을 받고 있지 않은 특강입니다.' }
  }

  const { data: inserted, error: insertError } = await supabase
    .from('special_lecture_requests')
    .insert({
      special_lecture_id: lectureId,
      student_id: profile.id,
      status: 'requested',
    })
    .select('id')
    .single()

  if (insertError) {
    // 대기 중이거나 이미 승인된 신청이 있으면 unique index에 걸린다.
    if (insertError.code === '23505') {
      return { error: '이미 신청한 특강입니다.' }
    }
    console.error('[special-lectures] failed to insert request', insertError)
    return { error: '특강을 신청하지 못했습니다.' }
  }

  revalidateAll(lectureId)
  return { success: true, requestId: inserted?.id ? String(inserted.id) : undefined }
}

export async function cancelSpecialLectureRequestAction(
  requestId: string
): Promise<RequestActionResult> {
  const profile = await getStudentProfile()
  if (!profile) {
    return { error: '학생 계정만 신청을 취소할 수 있습니다.' }
  }
  if (!requestId) {
    return { error: '신청 정보를 확인할 수 없습니다.' }
  }

  const supabase = await createServerSupabase()

  const { data: request, error: fetchError } = await supabase
    .from('special_lecture_requests')
    .select('id, special_lecture_id, status')
    .eq('id', requestId)
    .eq('student_id', profile.id)
    .maybeSingle()

  if (fetchError) {
    console.error('[special-lectures] failed to load request for cancel', fetchError)
    return { error: '신청 정보를 불러오지 못했습니다.' }
  }

  if (!request) {
    return { error: '신청 정보를 찾을 수 없습니다.' }
  }

  if (request.status !== 'requested') {
    return { error: '이미 처리된 신청은 취소할 수 없습니다.' }
  }

  const { error: updateError } = await supabase
    .from('special_lecture_requests')
    .update({ status: 'cancelled' })
    .eq('id', requestId)
    .eq('status', 'requested')

  if (updateError) {
    console.error('[special-lectures] failed to cancel request', updateError)
    return { error: '신청을 취소하지 못했습니다.' }
  }

  revalidateAll(String(request.special_lecture_id))
  return { success: true, requestId }
}
