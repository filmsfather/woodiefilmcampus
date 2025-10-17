import { ensureLearningJournalShareToken } from '@/lib/learning-journals'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendLearningJournalShareLinkSMS } from '@/lib/solapi'

interface LearningJournalEntryWithParent {
  student?:
    | {
        id: string
        name: string | null
        email: string | null
        parent_phone: string | null
      }
    | Array<{
        id: string
        name: string | null
        email: string | null
        parent_phone: string | null
      }>
    | null
}

function pickStudent(relation: LearningJournalEntryWithParent['student']) {
  if (!relation) {
    return null
  }

  return Array.isArray(relation) ? relation[0] ?? null : relation
}

function resolveSiteOrigin() {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (!raw) {
    console.warn('[learning-journal] NEXT_PUBLIC_SITE_URL이 설정되지 않아 문자 발송을 건너뜁니다.')
    return null
  }

  return raw.replace(/\/$/, '')
}

export async function notifyParentOfLearningJournalPublish(entryId: string) {
  if (!entryId) {
    return
  }

  const siteOrigin = resolveSiteOrigin()
  if (!siteOrigin) {
    return
  }

  const token = await ensureLearningJournalShareToken(entryId)

  if (!token) {
    console.warn('[learning-journal] 공유 토큰을 생성하지 못해 문자 발송을 건너뜁니다.')
    return
  }

  const admin = createAdminClient()

  const { data, error } = await admin
    .from('learning_journal_entries')
    .select(
      `id,
       student:profiles!learning_journal_entries_student_id_fkey(
         id,
         name,
         email,
         parent_phone
       )
      `
    )
    .eq('id', entryId)
    .maybeSingle<LearningJournalEntryWithParent>()

  if (error || !data) {
    console.error('[learning-journal] 학부모 연락처 조회 중 오류가 발생했습니다.', error)
    return
  }

  const student = pickStudent(data.student)

  if (!student) {
    console.warn('[learning-journal] 학부모 연락처 정보가 없어 문자 발송을 건너뜁니다.')
    return
  }

  const parentPhone = student.parent_phone

  if (!parentPhone) {
    console.warn('[learning-journal] 학부모 연락처가 비어 있어 문자 발송을 건너뜁니다.')
    return
  }

  const shareUrl = `${siteOrigin}/learning-journal/share/${token}`

  await sendLearningJournalShareLinkSMS({
    parentPhone,
    studentName: student.name ?? student.email,
    shareUrl,
  })
}
