import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, ArrowLeft, Calendar, CheckCircle2, Clock, ListChecks } from 'lucide-react'

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

export default async function StudentTaskDetailPage({ params }: StudentTaskDetailPageProps) {
  const { profile } = await requireAuthForDashboard('student')

  if (!profile) {
    return null
  }

  DateUtil.clearServerClock()
  DateUtil.initServerClock()

  const supabase = createServerSupabase()
  const adminSupabase = createAdminClient()
  const task = await fetchStudentTaskDetail(params.taskId, profile.id)

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

  const pdfSubmission = task.submissions.find((submission) => submission.itemId === null && submission.mediaAssetId)
  let pdfSignedUrl: { url: string; filename: string } | null = null

  if (pdfSubmission?.mediaAssetId) {
    const { data: asset } = await supabase
      .from('media_assets')
      .select('bucket, path, metadata')
      .eq('id', pdfSubmission.mediaAssetId)
      .maybeSingle()

    if (asset?.path) {
      const bucketId = asset.bucket ?? 'submissions'
      const { data: signed } = await supabase.storage.from(bucketId).createSignedUrl(asset.path, 60 * 30)

      if (signed?.signedUrl) {
        const originalName = (asset.metadata as { originalName?: string } | null)?.originalName
        const filename = originalName ?? asset.path.split('/').pop() ?? '제출 파일'
        pdfSignedUrl = { url: signed.signedUrl, filename }
      }
    }
  }

  type AttachmentEntry = {
    id: string
    filename: string
    url: string
    mimeType: string | null
  }

  const attachmentPairs = await Promise.all(
    task.items.map(async (item) => {
      if (!item.workbookItem.media || item.workbookItem.media.length === 0) {
        return null
      }

      const attachments: AttachmentEntry[] = []

      for (const media of item.workbookItem.media) {
        if (!media.asset.path) {
          continue
        }

        const bucket = media.asset.bucket ?? 'workbook-assets'
        const { data: signed } = await adminSupabase.storage.from(bucket).createSignedUrl(media.asset.path, 60 * 30)

        if (!signed?.signedUrl) {
          continue
        }

        const metadata = (media.asset.metadata as { originalName?: string; original_name?: string } | null) ?? null
        const filename =
          metadata?.originalName ?? metadata?.original_name ?? media.asset.path.split('/').pop() ?? '첨부 파일'

        attachments.push({
          id: media.id,
          filename,
          url: signed.signedUrl,
          mimeType: media.asset.mimeType ?? null,
        })
      }

      if (attachments.length === 0) {
        return null
      }

      return [item.id, attachments] as const
    })
  )

  const attachmentsByItem = Object.fromEntries(
    attachmentPairs.filter((entry): entry is [string, AttachmentEntry[]] => Boolean(entry))
  )

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
          signedUrl={pdfSignedUrl}
          instructions={workbookConfig.pdf?.instructions ?? null}
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
      taskContent = <FilmTaskRunner task={task} />
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
        <Button asChild variant="ghost" size="sm" className="w-fit px-0 text-slate-500">
          <Link href="/dashboard/student" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            대시보드로 돌아가기
          </Link>
        </Button>
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
