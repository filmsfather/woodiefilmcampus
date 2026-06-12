/**
 * 지원가능대학 리포트 발행 시 학생·학부모에게 공유 링크(/r/[token])를 문자로 발송한다.
 *
 * 발송은 best-effort로 동작하며(연락처 누락·SOLAPI 미설정 등은 조용히 건너뜀),
 * 호출자(발행/분석 액션)의 성공/실패에는 영향을 주지 않는다.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import {
  sendUniversityRecommendationReplySMS,
  sendUniversityRecommendationSMS,
  sendUniversityReportShareLinkSMS,
} from '@/lib/solapi'
import { fetchPublicationForStudent } from '@/lib/university-report/publication'

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

/** 학생·학부모 발송 대상(이름·연락처)을 조회한다. 학부모·학생 번호가 같으면 중복을 제거한다. */
async function fetchNotifyTargets(
  studentId: string
): Promise<{ studentName: string; phones: string[] } | null> {
  const supabase = createAdminClient()
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('name, email, student_phone, parent_phone')
    .eq('id', studentId)
    .maybeSingle()

  if (error || !profile) {
    console.error('[university-report] 학생 연락처 조회 중 오류가 발생했습니다.', error)
    return null
  }

  const phones = Array.from(
    new Set(
      [profile.student_phone, profile.parent_phone].filter(
        (phone): phone is string => Boolean(phone && phone.trim())
      )
    )
  )

  return { studentName: profile.name ?? profile.email ?? '학생', phones }
}

export async function notifyUniversityReportShareLink({
  studentId,
  token,
}: NotifyParams): Promise<{ sent: number }> {
  const origin = resolveSiteOrigin()
  if (!origin || !token) {
    return { sent: 0 }
  }

  const targets = await fetchNotifyTargets(studentId)
  if (!targets || targets.phones.length === 0) {
    if (targets) {
      console.warn('[university-report] 학생·학부모 연락처가 없어 문자 발송을 건너뜁니다.', studentId)
    }
    return { sent: 0 }
  }

  const shareUrl = `${origin}/r/${token}`

  let sent = 0
  for (const phoneNumber of targets.phones) {
    const ok = await sendUniversityReportShareLinkSMS({
      phoneNumber,
      studentName: targets.studentName,
      shareUrl,
    })
    if (ok) sent += 1
  }

  return { sent }
}

/**
 * 원장이 추천 대학을 학생에게 전송했을 때, 발행된 공유 링크로 학생·학부모에게 알림 문자를 보낸다.
 * 발행된 리포트(공유 토큰)가 없으면 발송을 건너뛴다(best-effort).
 */
export async function notifyUniversityRecommendationReady({
  studentId,
}: {
  studentId: string
}): Promise<{ sent: number }> {
  const origin = resolveSiteOrigin()
  if (!origin) {
    return { sent: 0 }
  }

  const publication = await fetchPublicationForStudent(studentId)
  if (!publication) {
    console.warn('[university-report] 발행된 리포트가 없어 추천 문자 발송을 건너뜁니다.', studentId)
    return { sent: 0 }
  }

  const targets = await fetchNotifyTargets(studentId)
  if (!targets || targets.phones.length === 0) {
    if (targets) {
      console.warn('[university-report] 학생·학부모 연락처가 없어 추천 문자 발송을 건너뜁니다.', studentId)
    }
    return { sent: 0 }
  }

  const shareUrl = `${origin}/r/${publication.shareToken}`

  let sent = 0
  for (const phoneNumber of targets.phones) {
    const ok = await sendUniversityRecommendationSMS({
      phoneNumber,
      studentName: targets.studentName,
      shareUrl,
    })
    if (ok) sent += 1
  }

  return { sent }
}

/**
 * 원장이 학생 의견·질문에 답변(추천 재전송 포함)했을 때, 공유 링크로 답변 도착 알림 문자를 보낸다.
 * 발행된 리포트(공유 토큰)가 없으면 발송을 건너뛴다(best-effort).
 */
export async function notifyUniversityRecommendationReply({
  studentId,
}: {
  studentId: string
}): Promise<{ sent: number }> {
  const origin = resolveSiteOrigin()
  if (!origin) {
    return { sent: 0 }
  }

  const publication = await fetchPublicationForStudent(studentId)
  if (!publication) {
    console.warn('[university-report] 발행된 리포트가 없어 답변 문자 발송을 건너뜁니다.', studentId)
    return { sent: 0 }
  }

  const targets = await fetchNotifyTargets(studentId)
  if (!targets || targets.phones.length === 0) {
    if (targets) {
      console.warn('[university-report] 학생·학부모 연락처가 없어 답변 문자 발송을 건너뜁니다.', studentId)
    }
    return { sent: 0 }
  }

  const shareUrl = `${origin}/r/${publication.shareToken}`

  let sent = 0
  for (const phoneNumber of targets.phones) {
    const ok = await sendUniversityRecommendationReplySMS({
      phoneNumber,
      studentName: targets.studentName,
      shareUrl,
    })
    if (ok) sent += 1
  }

  return { sent }
}
