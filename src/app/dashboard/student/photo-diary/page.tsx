import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { PhotoDiaryList } from '@/components/dashboard/student/photo-diary/PhotoDiaryList'
import { requireAuthForDashboard } from '@/lib/auth'
import DateUtil from '@/lib/date-util'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type PhotoDiaryEntry = {
  id: string
  date: string
  subject: string
  prompt: string
  description: string | null // 학생이 작성한 이미지 설명
  images: Array<{
    id: string
    url: string | null
    mimeType: string | null
  }>
}

async function fetchPhotoDiaryEntries(studentId: string): Promise<PhotoDiaryEntry[]> {
  const supabase = await createServerSupabase()
  const adminSupabase = createAdminClient()

  // Fetch all image-type task submissions for this student
  const { data: submissions, error } = await supabase
    .from('task_submissions')
    .select(`
      id,
      item_id,
      content,
      created_at,
      updated_at,
      student_task:student_tasks!inner(
        id,
        student_id,
        assignment_id
      ),
      task_submission_assets(
        id,
        order_index,
        media_asset:media_assets(
          id,
          bucket,
          path,
          mime_type
        )
      )
    `)
    .eq('submission_type', 'image')
    .eq('student_task.student_id', studentId)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[photo-diary] failed to fetch submissions', error)
    return []
  }

  if (!submissions || submissions.length === 0) {
    return []
  }

  // Get the workbook item prompts
  const itemIds = submissions
    .map((s) => s.item_id)
    .filter((id): id is string => Boolean(id))

  const { data: workbookItems } = await adminSupabase
    .from('workbook_items')
    .select('id, prompt')
    .in('id', itemIds)

  const itemPromptMap = new Map(
    (workbookItems ?? []).map((item) => [item.id, item.prompt])
  )

  // adminSupabase로 assignment의 workbook 정보 조회 (RLS 우회)
  const assignmentIds = submissions
    .map((s) => {
      const st = s.student_task as { assignment_id?: string } | null
      return st?.assignment_id
    })
    .filter((id): id is string => Boolean(id))

  const { data: assignments } = await adminSupabase
    .from('assignments')
    .select('id, workbook:workbooks(id, subject, type)')
    .in('id', assignmentIds)

  const assignmentWorkbookMap = new Map(
    (assignments ?? []).map((a) => {
      const wb = Array.isArray(a.workbook) ? a.workbook[0] : a.workbook
      return [a.id, wb as { id: string; subject: string; type: string } | null]
    })
  )

  // Build entries with signed URLs
  const entries: PhotoDiaryEntry[] = []

  for (const submission of submissions) {
    const studentTask = submission.student_task as { assignment_id?: string } | null
    const assignmentId = studentTask?.assignment_id
    const workbook = assignmentId ? assignmentWorkbookMap.get(assignmentId) : null

    // Only include image type workbooks
    if (workbook?.type !== 'image') {
      continue
    }

    const assets = (submission.task_submission_assets ?? []) as Array<{
      id: string
      order_index: number | null
      media_asset: {
        id: string
        bucket: string | null
        path: string | null
        mime_type: string | null
      } | Array<{
        id: string
        bucket: string | null
        path: string | null
        mime_type: string | null
      }> | null
    }>

    const images: PhotoDiaryEntry['images'] = []

    for (const asset of assets.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))) {
      const mediaAsset = Array.isArray(asset.media_asset)
        ? asset.media_asset[0]
        : asset.media_asset

      if (!mediaAsset?.path) continue

      const bucket = mediaAsset.bucket ?? 'submissions'
      const { data: signed } = await supabase.storage
        .from(bucket)
        .createSignedUrl(mediaAsset.path, 60 * 30)

      images.push({
        id: asset.id,
        url: signed?.signedUrl ?? null,
        mimeType: mediaAsset.mime_type ?? null,
      })
    }

    if (images.length === 0) continue

    // content가 "이미지 X장 제출" 형식이면 null로 처리 (기본값이므로 표시하지 않음)
    const rawContent = submission.content
    const description = rawContent && !rawContent.match(/^이미지 \d+장 제출$/) ? rawContent : null

    entries.push({
      id: submission.id,
      date: submission.updated_at ?? submission.created_at,
      subject: workbook?.subject ?? '과목 미정',
      prompt: submission.item_id ? itemPromptMap.get(submission.item_id) ?? '' : '',
      description,
      images,
    })
  }

  return entries
}

export default async function PhotoDiaryPage() {
  const { profile } = await requireAuthForDashboard('student')

  if (!profile) {
    return null
  }

  DateUtil.clearServerClock()
  DateUtil.initServerClock()

  const entries = await fetchPhotoDiaryEntries(profile.id)

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink fallbackHref="/dashboard/student" label="학생 대시보드로 돌아가기" />
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-slate-900">사진일기</h1>
          <p className="text-sm text-slate-600">
            이미지 제출형 과제에서 제출한 사진들을 한눈에 확인하세요.
          </p>
        </div>
      </div>

      <PhotoDiaryList entries={entries} />
    </section>
  )
}
