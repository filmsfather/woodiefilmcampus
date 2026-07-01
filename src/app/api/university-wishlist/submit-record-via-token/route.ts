import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

import { STUDENT_RECORDS_BUCKET } from '@/lib/storage/buckets'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchPublicationByToken } from '@/lib/university-report/publication'

export const maxDuration = 60

const MAX_RECORD_SIZE = 20 * 1024 * 1024 // 20MB

function sanitizeStorageFileName(name: string) {
  if (!name) return 'upload.dat'
  return name.replace(/[^a-zA-Z0-9_.-]/g, '_')
}

function buildRandomizedFileName(originalName: string) {
  const sanitized = sanitizeStorageFileName(originalName)
  const extIndex = sanitized.lastIndexOf('.')
  const ext = extIndex >= 0 ? sanitized.slice(extIndex) : ''
  return `${Date.now()}-${crypto.randomUUID()}${ext}`
}

/**
 * 공유 링크(/r/[token])에서 로그인하지 않은 학생·학부모가 생기부 파일을 제출한다.
 * 익명 사용자는 스토리지 RLS상 직접 업로드할 수 없으므로, 토큰 검증 후 service role로
 * student-records 버킷에 업로드하고 협의(wishlist) 메타데이터를 갱신한다.
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData().catch(() => null)
    if (!formData) {
      return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
    }

    const token = formData.get('token')
    const file = formData.get('file')

    if (typeof token !== 'string' || token.length < 16) {
      return NextResponse.json({ error: '유효하지 않은 링크입니다.' }, { status: 400 })
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '파일을 선택해 주세요.' }, { status: 400 })
    }
    if (file.size === 0) {
      return NextResponse.json({ error: '빈 파일은 업로드할 수 없습니다.' }, { status: 400 })
    }
    if (file.size > MAX_RECORD_SIZE) {
      return NextResponse.json(
        { error: '파일 크기는 최대 20MB까지 업로드할 수 있습니다.' },
        { status: 400 }
      )
    }

    const publication = await fetchPublicationByToken(token)
    if (!publication) {
      return NextResponse.json({ error: '유효하지 않거나 만료된 링크입니다.' }, { status: 404 })
    }

    const supabase = createAdminClient()
    const { data: wishlist } = await supabase
      .from('university_wishlists')
      .select('id, record_request_status')
      .eq('student_id', publication.studentId)
      .maybeSingle()

    if (!wishlist || wishlist.record_request_status === 'none') {
      return NextResponse.json(
        { error: '아직 생기부 제출 요청이 도착하지 않았습니다.' },
        { status: 400 }
      )
    }

    // 업로드 경로 첫 세그먼트는 학생 ID(스토리지 RLS와 동일 규칙).
    const path = `${publication.studentId}/${buildRandomizedFileName(file.name)}`
    const { error: uploadError } = await supabase.storage
      .from(STUDENT_RECORDS_BUCKET)
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || 'application/octet-stream',
      })

    if (uploadError) {
      console.error('[university-wishlist] token record upload error', uploadError)
      return NextResponse.json({ error: '생기부 업로드에 실패했습니다.' }, { status: 500 })
    }

    const { error: updateError } = await supabase
      .from('university_wishlists')
      .update({
        record_request_status: 'submitted',
        record_submitted_at: new Date().toISOString(),
        record_file_bucket: STUDENT_RECORDS_BUCKET,
        record_file_path: path,
        record_file_name: file.name,
        record_file_mime: file.type || null,
        record_file_size: file.size,
      })
      .eq('id', wishlist.id)

    if (updateError) {
      console.error('[university-wishlist] token record update error', updateError)
      return NextResponse.json({ error: '생기부 제출에 실패했습니다.' }, { status: 500 })
    }

    // 협의 스레드에 제출 완료 메시지를 남긴다(원장 화면 의견·질문 + 워크플로우 노출).
    await supabase.from('university_wishlist_messages').insert({
      wishlist_id: wishlist.id,
      author_id: publication.studentId,
      author_role: 'student',
      body: '생기부를 제출했습니다.',
    })

    revalidatePath(`/r/${token}`)
    revalidatePath('/dashboard/principal/university-reports/workflow')
    revalidatePath('/dashboard/principal/university-reports/wishlists')
    revalidatePath(`/dashboard/principal/university-reports/${publication.studentId}/report`)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[university-wishlist] submit-record-via-token unexpected error', error)
    return NextResponse.json({ error: '생기부 제출 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
