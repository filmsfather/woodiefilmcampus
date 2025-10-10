import { Download } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createAssetSignedUrlMap } from '@/lib/assignment-assets'
import type { MediaAssetRecord } from '@/lib/assignment-evaluation'
import { requireAuthForDashboard } from '@/lib/auth'
import DateUtil from '@/lib/date-util'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

interface SharedResourceItem {
  id: string
  sharedAt: string
  teacher: {
    id: string | null
    name: string
  }
  classes: Array<{ id: string; name: string }>
  owner: {
    id: string | null
    name: string
  }
  assignment: {
    id: string | null
    title: string
  }
  workbookTitle: string | null
  fileName: string
  asset: { url: string; filename: string; mimeType: string | null } | null
}

export default async function StudentSharedResourcesPage() {
  const { profile } = await requireAuthForDashboard('student')

  if (!profile) {
    return null
  }

  DateUtil.clearServerClock()
  DateUtil.initServerClock()

  const supabase = createServerSupabase()

  if (!profile.class_id) {
    return (
      <section className="space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">자료실</h1>
          <p className="text-sm text-slate-600">선생님이 공유한 과제 제출물을 확인할 수 있는 공간입니다.</p>
        </header>
        <div className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-600">
          소속 반 정보가 없어 자료실을 이용할 수 없습니다. 담당 선생님께 문의해주세요.
        </div>
      </section>
    )
  }

  const { data: shareRows, error } = await supabase
    .from('shared_task_submission_classes')
    .select(
      `class_id,
       shared_submission_id,
       shared_task_submissions:shared_submission_id(
         id,
         created_at,
         updated_at,
         shared_by,
         note,
         profiles:profiles!shared_task_submissions_shared_by_fkey(id, name),
         shared_task_submission_classes(class_id, classes(id, name)),
         task_submissions(
           id,
           submission_type,
           content,
           media_asset_id,
           student_task_id,
           media_assets(id, bucket, path, mime_type, metadata),
           student_tasks(
             id,
             student_id,
             profiles:profiles!student_tasks_student_id_fkey(id, name),
             assignments:assignments!student_tasks_assignment_id_fkey(id, title, workbooks(id, title))
           )
         )
       )`
    )
    .eq('class_id', profile.class_id)
    .order('created_at', { ascending: false, foreignTable: 'shared_task_submissions' })

  if (error) {
    console.error('[student] shared resources fetch error', error)
  }

  const toRecord = (value: unknown): Record<string, unknown> | null => {
    if (!value || typeof value !== 'object') {
      return null
    }
    return value as Record<string, unknown>
  }

  const shareMap = new Map<string, Record<string, unknown>>()

  ;(shareRows ?? []).forEach((row) => {
    const rawShare = (row as { shared_task_submissions?: unknown }).shared_task_submissions
    const normalizedShare = Array.isArray(rawShare) ? rawShare[0] : rawShare
    const share = toRecord(normalizedShare)
    if (!share) {
      return
    }
    const shareIdValue = share.id
    const shareId = typeof shareIdValue === 'string' ? shareIdValue : null
    if (!shareId || shareMap.has(shareId)) {
      return
    }
    shareMap.set(shareId, share)
  })

  const assetRecords = new Map<string, MediaAssetRecord>()

  shareMap.forEach((share) => {
    const submission = toRecord(share.task_submissions)
    if (!submission) {
      return
    }
    const media = submission.media_assets as
      | { id?: string | null; bucket?: string | null; path?: string; mime_type?: string | null; metadata?: Record<string, unknown> | null }
      | Array<{ id?: string | null; bucket?: string | null; path?: string; mime_type?: string | null; metadata?: Record<string, unknown> | null }>
      | null

    const mediaAsset = Array.isArray(media) ? media[0] : media

    if (mediaAsset?.id && mediaAsset.path) {
      assetRecords.set(mediaAsset.id, {
        bucket: mediaAsset.bucket ?? 'submissions',
        path: mediaAsset.path,
        mimeType: mediaAsset.mime_type ?? null,
        metadata: (mediaAsset.metadata as Record<string, unknown> | null) ?? null,
      })
    }
  })

  const signedMap = assetRecords.size > 0 ? await createAssetSignedUrlMap(assetRecords) : new Map()

  const resources: SharedResourceItem[] = []

  shareMap.forEach((share) => {
    const submission = toRecord(share.task_submissions)
    if (!submission || submission.submission_type !== 'pdf') {
      return
    }

    const mediaAssetId = submission.media_asset_id as string | null
    const asset = mediaAssetId ? signedMap.get(mediaAssetId) ?? null : null
    const studentTaskRelation = submission.student_tasks as Record<string, unknown> | Array<Record<string, unknown>> | null
    const studentTask = Array.isArray(studentTaskRelation)
      ? toRecord(studentTaskRelation[0])
      : toRecord(studentTaskRelation)
    const ownerProfileRelation = studentTask?.profiles as Record<string, unknown> | Array<Record<string, unknown>> | null
    const ownerProfile = Array.isArray(ownerProfileRelation)
      ? toRecord(ownerProfileRelation[0])
      : toRecord(ownerProfileRelation)
    const assignmentRelation = studentTask?.assignments as Record<string, unknown> | Array<Record<string, unknown>> | null
    const assignment = Array.isArray(assignmentRelation)
      ? toRecord(assignmentRelation[0])
      : toRecord(assignmentRelation)
    const workbookRelation = assignment?.workbooks as Record<string, unknown> | Array<Record<string, unknown>> | null
    const workbook = Array.isArray(workbookRelation)
      ? toRecord(workbookRelation[0])
      : toRecord(workbookRelation)
    const teacherProfileRelation = share.profiles as Record<string, unknown> | Array<Record<string, unknown>> | null
    const teacherProfile = Array.isArray(teacherProfileRelation)
      ? toRecord(teacherProfileRelation[0])
      : toRecord(teacherProfileRelation)

    const classesRelation = share.shared_task_submission_classes as
      | Array<{ class_id?: string | null; classes?: Record<string, unknown> | Array<Record<string, unknown>> | null }>
      | null

    const classes = (classesRelation ?? [])
      .map((entry) => {
        const classDataRaw = entry.classes
        const classData = Array.isArray(classDataRaw) ? toRecord(classDataRaw[0]) : toRecord(classDataRaw)
        const classId = (classData?.id as string | undefined) ?? entry.class_id ?? null
        if (!classId) {
          return null
        }
        const name = (classData?.name as string | undefined) ?? '반 이름 미정'
        return { id: classId, name }
      })
      .filter((value): value is { id: string; name: string } => Boolean(value))

    resources.push({
      id: share.id as string,
      sharedAt: (share.created_at as string) ?? new Date().toISOString(),
      teacher: {
        id: (teacherProfile?.id as string | undefined) ?? null,
        name: (teacherProfile?.name as string | undefined) ?? '담당 교사',
      },
      classes,
      owner: {
        id: (ownerProfile?.id as string | undefined) ?? null,
        name: (ownerProfile?.name as string | undefined) ?? '학생',
      },
      assignment: {
        id: (assignment?.id as string | undefined) ?? null,
        title: (assignment?.title as string | undefined) ?? '과제',
      },
      workbookTitle: (workbook?.title as string | undefined) ?? null,
      fileName:
        (submission.content as string | undefined) ?? asset?.filename ?? '제출 파일',
      asset,
    })
  })

  resources.sort((a, b) => Date.parse(b.sharedAt) - Date.parse(a.sharedAt))

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">자료실</h1>
        <p className="text-sm text-slate-600">선생님이 추천한 반별 과제 제출물을 확인하고 다운로드할 수 있습니다.</p>
      </header>

      {resources.length === 0 ? (
        <div className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-600">
          아직 공유된 과제가 없습니다. 과제를 제출하고 선생님께 추천을 요청해보세요.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {resources.map((resource) => (
            <Card key={resource.id} className="border-slate-200">
              <CardHeader className="space-y-1">
                <CardTitle className="text-base text-slate-900">{resource.assignment.title}</CardTitle>
                <CardDescription className="text-sm text-slate-600">
                  {resource.workbookTitle ? `${resource.workbookTitle} · ` : ''}
                  {resource.owner.name} 학생 제출물
                </CardDescription>
                <p className="text-xs text-slate-500">
                  공유 교사 {resource.teacher.name} · {DateUtil.formatForDisplay(resource.sharedAt, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {resource.classes.map((cls) => (
                    <Badge
                      key={`${resource.id}-${cls.id}`}
                      variant={cls.id === profile.class_id ? 'secondary' : 'outline'}
                      className="text-xs"
                    >
                      {cls.name}
                    </Badge>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900" title={resource.fileName}>
                      {resource.fileName}
                    </p>
                    <p className="text-xs text-slate-500">PDF 다운로드 후 내용을 확인하세요.</p>
                  </div>
                  {resource.asset ? (
                    <Button asChild size="sm" variant="outline">
                      <a href={resource.asset.url} target="_blank" rel="noreferrer">
                        <Download className="mr-1 h-4 w-4" /> 다운로드
                      </a>
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" disabled>
                      준비 중
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  )
}
