import { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { requireAuthForDashboard } from '@/lib/auth'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ImageDetailView } from '@/components/dashboard/shared-photo-diary/ImageDetailView'

export const metadata: Metadata = {
  title: '사진 상세 | 모두의 사진일기',
}

interface Comment {
  id: string
  content: string
  createdAt: string
  user: {
    id: string
    name: string
  }
}

interface SubmissionInfo {
  studentName: string
  submittedAt: string
  prompt: string | null
  subject: string | null
  description: string | null // 학생이 작성한 이미지 설명
}

interface ImageDetail {
  assetId: string
  url: string
  likeCount: number
  isLiked: boolean
  comments: Comment[]
  submission: SubmissionInfo | null
}

async function fetchImageDetail(assetId: string, userId: string): Promise<ImageDetail | null> {
  const supabase = await createServerSupabase()
  const adminSupabase = createAdminClient()

  // media_asset 조회
  const { data: asset, error: assetError } = await adminSupabase
    .from('media_assets')
    .select('id, bucket, path, mime_type')
    .eq('id', assetId)
    .single()

  if (assetError || !asset) {
    console.error('[image-detail] asset fetch error:', assetError)
    return null
  }

  // 이미지인지 확인
  if (asset.mime_type && !asset.mime_type.startsWith('image/')) {
    return null
  }

  const bucket = asset.bucket ?? 'submissions'
  const url = `/api/storage/${bucket}/${asset.path}`

  // 제출 정보 조회 (task_submission_assets → task_submissions → student_tasks → profiles)
  let submission: SubmissionInfo | null = null

  const { data: submissionAsset } = await adminSupabase
    .from('task_submission_assets')
    .select(`
      id,
      created_at,
      task_submission:task_submissions!inner(
        id,
        item_id,
        content,
        created_at,
        student_task:student_tasks!inner(
          id,
          student:profiles!student_tasks_student_id_fkey(id, name),
          assignment:assignments!inner(
            id,
            workbook:workbooks(id, subject)
          )
        )
      )
    `)
    .eq('media_asset_id', assetId)
    .single()

  if (submissionAsset) {
    const taskSubmission = Array.isArray(submissionAsset.task_submission)
      ? submissionAsset.task_submission[0]
      : submissionAsset.task_submission

    if (taskSubmission) {
      const studentTask = Array.isArray(taskSubmission.student_task)
        ? taskSubmission.student_task[0]
        : taskSubmission.student_task

      const student = studentTask?.student
        ? (Array.isArray(studentTask.student) ? studentTask.student[0] : studentTask.student)
        : null

      const assignment = studentTask?.assignment
        ? (Array.isArray(studentTask.assignment) ? studentTask.assignment[0] : studentTask.assignment)
        : null

      const workbook = assignment?.workbook
        ? (Array.isArray(assignment.workbook) ? assignment.workbook[0] : assignment.workbook)
        : null

      // 문제 내용 조회 (item_id가 있는 경우)
      let prompt: string | null = null
      if (taskSubmission.item_id) {
        const { data: workbookItem } = await adminSupabase
          .from('workbook_items')
          .select('prompt')
          .eq('id', taskSubmission.item_id)
          .single()

        prompt = workbookItem?.prompt ?? null
      }

      // content가 "이미지 X장 제출" 형식이면 null로 처리 (기본값이므로 표시하지 않음)
      const rawContent = (taskSubmission as { content?: string | null }).content
      const description = rawContent && !rawContent.match(/^이미지 \d+장 제출$/) ? rawContent : null

      submission = {
        studentName: student?.name ?? '익명',
        submittedAt: taskSubmission.created_at ?? submissionAsset.created_at,
        prompt,
        subject: workbook?.subject ?? null,
        description,
      }
    }
  }

  // 좋아요 수 조회
  const { count: likeCount } = await supabase
    .from('photo_diary_likes')
    .select('*', { count: 'exact', head: true })
    .eq('media_asset_id', assetId)

  // 내가 좋아요 했는지 확인
  const { data: myLike } = await supabase
    .from('photo_diary_likes')
    .select('id')
    .eq('media_asset_id', assetId)
    .eq('user_id', userId)
    .single()

  // 댓글 조회
  const { data: commentsData, error: commentsError } = await supabase
    .from('photo_diary_comments')
    .select(`
      id,
      content,
      created_at,
      user_id,
      user:profiles!photo_diary_comments_user_id_fkey(id, name)
    `)
    .eq('media_asset_id', assetId)
    .order('created_at', { ascending: true })

  if (commentsError) {
    console.error('[image-detail] comments fetch error:', commentsError)
  }

  const comments: Comment[] = (commentsData ?? []).map((c) => {
    const user = Array.isArray(c.user) ? c.user[0] : c.user
    return {
      id: c.id,
      content: c.content,
      createdAt: c.created_at,
      user: {
        id: user?.id ?? c.user_id,
        name: user?.name ?? '익명',
      },
    }
  })

  return {
    assetId,
    url,
    likeCount: likeCount ?? 0,
    isLiked: Boolean(myLike),
    comments,
    submission,
  }
}

export default async function SharedPhotoDiaryDetailPage({
  params,
}: {
  params: Promise<{ assetId: string }>
}) {
  const { profile } = await requireAuthForDashboard()

  if (!profile) {
    redirect('/login')
  }

  const { assetId } = await params
  const imageDetail = await fetchImageDetail(assetId, profile.id)

  if (!imageDetail) {
    notFound()
  }

  return (
    <div className="space-y-4">
      <DashboardBackLink
        fallbackHref="/dashboard/shared-photo-diary"
        label="목록으로 돌아가기"
      />
      <ImageDetailView
        assetId={imageDetail.assetId}
        url={imageDetail.url}
        likeCount={imageDetail.likeCount}
        isLiked={imageDetail.isLiked}
        comments={imageDetail.comments}
        currentUserId={profile.id}
        submission={imageDetail.submission}
      />
    </div>
  )
}

