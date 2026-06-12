/**
 * 지원가능대학 리포트 발행 시 학생·학부모에게 공유 링크(/r/[token])를 문자로 발송한다.
 *
 * 발송은 best-effort로 동작하며(연락처 누락·SOLAPI 미설정 등은 조용히 건너뜀),
 * 호출자(발행/분석 액션)의 성공/실패에는 영향을 주지 않는다.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { sendUniversityReportShareLinkSMS } from '@/lib/solapi'

interface NotifyParams {
  studentId: string
  token: string
}

function resolveSiteOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (!raw) {
    console.warn('[university-report] NEXT_PUBLIC_SITE_URL이 설정되지 않아 문자 발송을 건너뜁니다.')
    return null
  }
  return raw.replace(/\/$/, '')
}

export async function notifyUniversityReportShareLink({
  studentId,
  token,
}: NotifyParams): Promise<{ sent: number }> {
  const origin = resolveSiteOrigin()
  if (!origin || !token) {
    return { sent: 0 }
  }

  const supabase = createAdminClient()
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('name, email, student_phone, parent_phone')
    .eq('id', studentId)
    .maybeSingle()

  if (error || !profile) {
    console.error('[university-report] 학생 연락처 조회 중 오류가 발생했습니다.', error)
    return { sent: 0 }
  }

  const shareUrl = `${origin}/r/${token}`
  const studentName = profile.name ?? profile.email ?? '학생'

  // 학부모·학생 번호가 동일할 수 있어 중복 발송을 막는다.
  const targets = Array.from(
    new Set(
      [profile.student_phone, profile.parent_phone].filter(
        (phone): phone is string => Boolean(phone && phone.trim())
      )
    )
  )

  if (targets.length === 0) {
    console.warn('[university-report] 학생·학부모 연락처가 없어 문자 발송을 건너뜁니다.', studentId)
    return { sent: 0 }
  }

  let sent = 0
  for (const phoneNumber of targets) {
    const ok = await sendUniversityReportShareLinkSMS({ phoneNumber, studentName, shareUrl })
    if (ok) sent += 1
  }

  return { sent }
}
