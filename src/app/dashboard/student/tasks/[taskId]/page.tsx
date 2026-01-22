import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, Calendar, CheckCircle2, Clock, ListChecks } from 'lucide-react'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { ImageTaskRunner } from '@/components/dashboard/student/tasks/ImageTaskRunner'
import { PdfTaskPanel } from '@/components/dashboard/student/tasks/PdfTaskPanel'
import { SrsTaskRunner } from '@/components/dashboard/student/tasks/SrsTaskRunner'
import { TextTaskRunner } from '@/components/dashboard/student/tasks/TextTaskRunner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import DateUtil from '@/lib/date-util'
import { requireAuthForDashboard } from '@/lib/auth'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchStudentTaskDetail } from '@/lib/student-tasks'
import { WORKBOOK_TITLES, WORKBOOK_TYPE_DESCRIPTIONS } from '@/lib/validation/workbook'
import { submitSrsAnswer } from '@/app/dashboard/student/tasks/actions'
import { FilmTaskRunner } from '@/components/dashboard/student/tasks/FilmTaskRunner'

interface StudentTaskDetailPageProps {
  params: {
    taskId: string
  }
}

function formatDate(value: string | null) {
  if (!value) {
    return '정보 없음'
  }

  return DateUtil.formatForDisplay(value, {
    locale: 'ko-KR',
    timeZone: 'Asia/Seoul',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function StudentTaskDetailPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { profile } = await requireAuthForDashboard('student')

  if (!profile) {
    return null
  }

  DateUtil.clearServerClock()
  DateUtil.initServerClock()

  const { taskId } = await params
  const supabase = await createServerSupabase()
  const adminSupabase = createAdminClient()
  const task = await fetchStudentTaskDetail(taskId, profile.id)

  if (!task) {
    notFound()
  }

  const workbook = task.assignment?.workbook
  const workbookType = (workbook?.type ?? 'unknown') as keyof typeof WORKBOOK_TITLES | 'unknown'
  const workbookTitle = workbook ? WORKBOOK_TITLES[workbook.type as keyof typeof WORKBOOK_TITLES] ?? workbook.type : '알 수 없는 유형'
  const workbookDescription = workbook ? WORKBOOK_TYPE_DESCRIPTIONS[workbook.type as keyof typeof WORKBOOK_TYPE_DESCRIPTIONS] ?? '' : ''
  const workbookConfig = (workbook?.config ?? {}) as {
    pdf?: { instructions?: string | null }
    writing?: { instructions?: string | null; maxCharacters?: number | null }
    film?: { noteCount?: number | null }
    lecture?: { instructions?: string | null; youtubeUrl?: string | null }
  }

  const dueLabel = formatDate(task.due.dueAt)
  const totalItems = task.summary.totalItems
  const progressLabel = totalItems > 0 ? `${task.summary.completedItems}/${totalItems}` : '-'

  const statusLabel = getStatusLabel(task.status)
  const isCompleted = task.status === 'completed'

  const pdfSubmission = task.submissions.find((submission) => submission.itemId === null && submission.submissionType === 'pdf')

  const pdfSubmissionAssets = await Promise.all(
    (pdfSubmission?.assets ?? []).map(async (asset) => {
      if (!asset.path) {
        return null
      }

      const bucketId = asset.bucket ?? 'submissions'
      const { data: signed, error: signedError } = await supabase.storage
        .from(bucketId)
        .createSignedUrl(asset.path, 60 * 30)

      if (signedError) {
        console.error('[student-task] failed to sign pdf submission asset', signedError)
        return null
      }

      const metadata = (asset.metadata as { originalName?: string } | null) ?? null
      const filename = metadata?.originalName ?? asset.path.split('/').pop() ?? '제출 파일'

      return {
        id: asset.id,
        filename,
        url: signed?.signedUrl ?? null,
      }
    })
  )

  const pdfSignedAssets = (pdfSubmissionAssets.filter(Boolean) as Array<{ id: string; filename: string; url: string | null }>)

  type AttachmentEntry = {
    id: string
    filename: string
    url: string
    mimeType: string | null
  }

  // 모든 미디어의 signed URL을 한 번에 병렬로 생성
  const allMediaItems = task.items.flatMap((item) =>
    (item.workbookItem.media ?? [])
      .filter((media) => media.asset.path)
      .map((media) => ({
        itemId: item.id,
        mediaId: media.id,
        bucket: media.asset.bucket ?? 'workbook-assets',
        path: media.asset.path,
        mimeType: media.asset.mimeType ?? null,
        metadata: media.asset.metadata as { originalName?: string; original_name?: string } | null,
      }))
  )

  const signedUrls = await Promise.all(
    allMediaItems.map(async (media) => {
      const { data: signed } = await adminSupabase.storage
        .from(media.bucket)
        .createSignedUrl(media.path, 60 * 30)
      return { ...media, signedUrl: signed?.signedUrl ?? null }
    })
  )

  // itemId별로 attachments 그룹화
  const attachmentsByItemTemp = new Map<string, AttachmentEntry[]>()
  for (const media of signedUrls) {
    if (!media.signedUrl) continue

    const filename =
      media.metadata?.originalName ?? media.metadata?.original_name ?? media.path.split('/').pop() ?? '첨부 파일'

    const entry: AttachmentEntry = {
      id: media.mediaId,
      filename,
      url: media.signedUrl,
      mimeType: media.mimeType,
    }

    const list = attachmentsByItemTemp.get(media.itemId) ?? []
    list.push(entry)
    attachmentsByItemTemp.set(media.itemId, list)
  }

  const attachmentPairs = task.items
    .filter((item) => attachmentsByItemTemp.has(item.id))
    .map((item) => [item.id, attachmentsByItemTemp.get(item.id)!] as const)

  const attachmentsByItem = Object.fromEntries(
    attachmentPairs.filter((entry): entry is [string, AttachmentEntry[]] => Boolean(entry))
  )

  const pdfItems = task.items.map((item, index) => ({
    id: item.id,
    index: index + 1,
    prompt: item.workbookItem.prompt,
    attachments: attachmentsByItem[item.id] ?? [],
  }))

  let taskContent: React.ReactNode

  switch (workbookType) {
    case 'srs':
      taskContent = <SrsTaskRunner task={task} onSubmitAnswer={submitSrsAnswer} />
      break
    case 'pdf':
      taskContent = (
        <PdfTaskPanel
          studentTaskId={task.id}
          existingSubmission={pdfSubmission ?? null}
          existingAssets={pdfSignedAssets}
          instructions={workbookConfig.pdf?.instructions ?? null}
          items={pdfItems}
        />
      )
      break
    case 'writing':
      taskContent = (
        <TextTaskRunner
          task={task}
          submissionType="writing"
          instructions={workbookConfig.writing?.instructions ?? null}
          maxCharacters={typeof workbookConfig.writing?.maxCharacters === 'number' ? workbookConfig.writing?.maxCharacters ?? null : null}
          attachments={attachmentsByItem}
        />
      )
      break
    case 'film':
      taskContent = (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button asChild size="sm" variant="outline">
              <Link href={`/dashboard/student/tasks/${task.id}/history`}>감상지 히스토리 보기</Link>
            </Button>
          </div>
          <FilmTaskRunner task={task} />
        </div>
      )
      break
    case 'lecture':
      taskContent = (
        <div className="space-y-6">
          {workbookConfig.lecture?.youtubeUrl && (
            <Card className="border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-slate-800">강의 링크</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-600">
                <a
                  href={workbookConfig.lecture.youtubeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline"
                >
                  {workbookConfig.lecture.youtubeUrl}
                </a>
              </CardContent>
            </Card>
          )}
          <TextTaskRunner
            task={task}
            submissionType="lecture"
            instructions={workbookConfig.lecture?.instructions ?? null}
            attachments={attachmentsByItem}
          />
        </div>
      )
      break
    case 'image':
      taskContent = (
        <ImageTaskRunner
          task={task}
          instructions={(workbookConfig as { image?: { instructions?: string | null } }).image?.instructions ?? null}
        />
      )
      break
    default:
      taskContent = (
        <Card className="border-dashed border-slate-300 bg-slate-50">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-sm text-slate-500">
            <AlertTriangle className="h-6 w-6 text-slate-400" />
            <p>
              {workbookTitle} 유형의 과제 제출 화면은 준비 중입니다.
              <br />
              잠시 후 다시 시도해주세요.
            </p>
          </CardContent>
        </Card>
      )
      break
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-2">
        <DashboardBackLink fallbackHref="/dashboard/student" label="대시보드로 돌아가기" className="self-start" />
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-900">{workbook?.title ?? '문제집 정보 없음'}</h1>
            {workbook && <Badge variant="secondary">{workbookTitle}</Badge>}
            {task.due.isOverdue && <Badge variant="destructive">마감 지남</Badge>}
            {!task.due.isOverdue && task.due.isDueSoon && <Badge variant="outline">마감 임박</Badge>}
            {isCompleted && <Badge variant="default">완료</Badge>}
          </div>
          <p className="text-sm text-slate-600">
            {workbookDescription || '과제 상세를 확인하고 학습을 진행하세요.'}
          </p>
        </div>
      </div>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base text-slate-700">과제 요약</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Calendar className="h-4 w-4 text-slate-500" />
            <div>
              <p className="font-medium text-slate-800">마감</p>
              <p>{dueLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Clock className="h-4 w-4 text-slate-500" />
            <div>
              <p className="font-medium text-slate-800">진행 상태</p>
              <p>{statusLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <ListChecks className="h-4 w-4 text-slate-500" />
            <div>
              <p className="font-medium text-slate-800">완료 문항</p>
              <p>{progressLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <CheckCircle2 className="h-4 w-4 text-slate-500" />
            <div>
              <p className="font-medium text-slate-800">완료 처리</p>
              <p>{isCompleted ? '제출 완료' : '진행 중'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {taskContent}
    </section>
  )
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'completed':
      return '완료'
    case 'in_progress':
      return '진행 중'
    case 'not_started':
    case 'pending':
      return '대기'
    case 'canceled':
      return '취소됨'
    default:
      return status
  }
}
