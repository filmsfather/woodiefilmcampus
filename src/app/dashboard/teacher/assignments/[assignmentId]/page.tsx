import { notFound } from 'next/navigation'

import { requireAuthForDashboard } from '@/lib/auth'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import DateUtil from '@/lib/date-util'
import { AssignmentReview } from '@/components/dashboard/teacher/AssignmentReview'

interface PageProps {
  params: {
    assignmentId: string
  }
  searchParams: Record<string, string | string[] | undefined>
}

export default async function TeacherAssignmentReviewPage({ params, searchParams }: PageProps) {
  const { profile } = await requireAuthForDashboard('teacher')
  const supabase = createServerSupabase()

  const { data: assignmentRow, error } = await supabase
    .from('assignments')
    .select(
      `id, due_at, created_at, target_scope,
       workbooks(id, title, subject, type, week_label, config),
       assignment_targets(class_id, classes(id, name)),
       student_tasks(
         id,
         status,
         completion_at,
         updated_at,
         student_id,
         profiles!student_tasks_student_id_fkey(id, name, email, class_id),
         student_task_items(
           id,
           item_id,
           streak,
           next_review_at,
           completed_at,
           last_result,
           workbook_items(
             id,
             position,
             prompt,
             answer_type,
             explanation,
             workbook_item_short_fields(id, label, answer, position),
             workbook_item_choices(id, label, content, is_correct)
           )
         ),
         task_submissions(
           id,
           item_id,
           submission_type,
           content,
           media_asset_id,
           score,
           feedback,
           created_at,
           updated_at,
           media_assets(id, bucket, path, mime_type, metadata)
         )
       ),
       print_requests(id, status, student_task_id, desired_date, desired_period, copies, color_mode, notes, created_at, updated_at)
      `
    )
    .eq('id', params.assignmentId)
    .eq('assigned_by', profile.id)
    .maybeSingle()

  if (error) {
    console.error('[teacher] assignment review fetch error', error)
  }

  if (!assignmentRow) {
    notFound()
  }

  const workbook = Array.isArray(assignmentRow.workbooks) ? assignmentRow.workbooks[0] : assignmentRow.workbooks

  if (!workbook) {
    notFound()
  }

  const classTargets = (assignmentRow.assignment_targets ?? [])
    .map((target) => {
      const cls = Array.isArray(target.classes) ? target.classes[0] : target.classes
      if (!cls?.id) {
        return null
      }
      return {
        id: cls.id,
        name: cls.name ?? '이름 미정',
      }
    })
    .filter((value): value is { id: string; name: string } => Boolean(value))

  const mediaAssetMap = new Map<string, { id: string; bucket: string; path: string; mimeType: string | null; metadata: Record<string, unknown> | null }>()

  const studentTasks = (assignmentRow.student_tasks ?? []).map((task) => {
    const studentProfile = Array.isArray(task.profiles) ? task.profiles[0] : task.profiles

    const taskItems = (task.student_task_items ?? []).map((item) => {
      const workbookItem = Array.isArray(item.workbook_items) ? item.workbook_items[0] : item.workbook_items

      return {
        id: item.id,
        itemId: item.item_id,
        streak: item.streak,
        nextReviewAt: item.next_review_at,
        completedAt: item.completed_at,
        lastResult: item.last_result,
        workbookItem: workbookItem
          ? {
              id: workbookItem.id,
              position: workbookItem.position,
              prompt: workbookItem.prompt,
              answerType: workbookItem.answer_type,
              explanation: workbookItem.explanation,
              shortFields: (workbookItem.workbook_item_short_fields ?? []).map((field) => ({
                id: field.id,
                label: field.label,
                answer: field.answer,
                position: field.position ?? 0,
              })),
              choices: (workbookItem.workbook_item_choices ?? []).map((choice) => ({
                id: choice.id,
                label: choice.label,
                content: choice.content,
                isCorrect: Boolean(choice.is_correct),
              })),
            }
          : null,
      }
    })

    const submissions = (task.task_submissions ?? []).map((submission) => {
      const asset = Array.isArray(submission.media_assets)
        ? submission.media_assets[0]
        : submission.media_assets

      if (asset?.id && asset.path) {
        const key = asset.id
        if (!mediaAssetMap.has(key)) {
          mediaAssetMap.set(key, {
            id: asset.id,
            bucket: asset.bucket ?? 'submissions',
            path: asset.path,
            mimeType: asset.mime_type ?? null,
            metadata: (asset.metadata as Record<string, unknown> | null) ?? null,
          })
        }
      }

      return {
        id: submission.id,
        itemId: submission.item_id,
        submissionType: submission.submission_type,
        content: submission.content,
        mediaAssetId: submission.media_asset_id,
        score: submission.score,
        feedback: submission.feedback,
        createdAt: submission.created_at,
        updatedAt: submission.updated_at,
      }
    })

    return {
      id: task.id,
      status: task.status,
      completionAt: task.completion_at,
      updatedAt: task.updated_at,
      studentId: task.student_id,
      student: {
        id: studentProfile?.id ?? task.student_id,
        name: studentProfile?.name ?? '이름 미정',
        email: studentProfile?.email ?? null,
        classId: studentProfile?.class_id ?? null,
      },
      items: taskItems,
      submissions,
    }
  })

  const assetSignedUrlMap = new Map<string, { url: string; filename: string; mimeType: string | null }>()

  if (mediaAssetMap.size > 0) {
    await Promise.all(
      Array.from(mediaAssetMap.values()).map(async (asset) => {
        try {
          const { data: signed } = await supabase.storage
            .from(asset.bucket)
            .createSignedUrl(asset.path, 60 * 30)

          if (signed?.signedUrl) {
            const metadata = asset.metadata ?? {}
            const originalName =
              (typeof metadata.original_name === 'string' && metadata.original_name.length > 0
                ? metadata.original_name
                : undefined) ??
              (typeof metadata.originalName === 'string' && metadata.originalName.length > 0
                ? metadata.originalName
                : undefined)

            const filename = originalName ?? asset.path.split('/').pop() ?? '첨부 파일'
            assetSignedUrlMap.set(asset.id, {
              url: signed.signedUrl,
              filename,
              mimeType: asset.mimeType,
            })
          }
        } catch (storageError) {
          console.error('[teacher] assignment review signed url error', storageError)
        }
      })
    )
  }

  const assignment = {
    id: assignmentRow.id,
    dueAt: assignmentRow.due_at,
    createdAt: assignmentRow.created_at,
    targetScope: assignmentRow.target_scope,
    title: workbook.title,
    subject: workbook.subject,
    type: workbook.type,
    weekLabel: workbook.week_label ?? null,
    config: (workbook.config as Record<string, unknown> | null) ?? null,
    classes: classTargets,
    studentTasks: studentTasks.map((task) => ({
      ...task,
      submissions: task.submissions.map((submission) => ({
        ...submission,
        asset: submission.mediaAssetId ? assetSignedUrlMap.get(submission.mediaAssetId) ?? null : null,
      })),
    })),
    printRequests: (assignmentRow.print_requests ?? []).map((request) => ({
      id: request.id,
      status: request.status,
      studentTaskId: request.student_task_id,
      desiredDate: request.desired_date,
      desiredPeriod: request.desired_period,
      copies: request.copies ?? 1,
      colorMode: request.color_mode ?? 'bw',
      notes: request.notes ?? null,
      createdAt: request.created_at,
      updatedAt: request.updated_at,
    })),
  }

  const focusStudentTaskId = typeof searchParams.studentTask === 'string' ? searchParams.studentTask : null

  return (
    <AssignmentReview
      teacherName={profile.name ?? profile.email ?? null}
      assignment={assignment}
      generatedAt={DateUtil.nowUTC().toISOString()}
      focusStudentTaskId={focusStudentTaskId}
    />
  )
}
