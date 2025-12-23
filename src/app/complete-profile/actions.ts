'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export interface CompleteProfileState {
  error?: string
  success?: boolean
}

export async function completeProfile(
  _prevState: CompleteProfileState,
  formData: FormData
): Promise<CompleteProfileState> {
  const supabase = await createClient()

  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError || !userData.user) {
    return { error: '로그인이 필요합니다.' }
  }

  const name = formData.get('name')?.toString().trim()
  const studentPhone = formData.get('student_phone')?.toString().trim()
  const parentPhone = formData.get('parent_phone')?.toString().trim() || null
  const academicRecord = formData.get('academic_record')?.toString().trim()

  // 필수 항목 검증
  if (!name || !studentPhone || !academicRecord) {
    return { error: '필수 항목을 모두 입력해주세요.' }
  }

  // 전화번호 형식 간단 검증
  const phoneRegex = /^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/
  if (!phoneRegex.test(studentPhone.replace(/-/g, ''))) {
    return { error: '올바른 핸드폰 번호를 입력해주세요.' }
  }

  if (parentPhone && !phoneRegex.test(parentPhone.replace(/-/g, ''))) {
    return { error: '올바른 부모님 번호를 입력해주세요.' }
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      name,
      student_phone: studentPhone,
      parent_phone: parentPhone,
      academic_record: academicRecord,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userData.user.id)

  if (updateError) {
    console.error('[complete-profile] update error:', updateError)
    return { error: '프로필 저장 중 오류가 발생했습니다.' }
  }

  // 프로필 완성 후 승인 대기 페이지로 이동
  redirect('/pending-approval')
}

