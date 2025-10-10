import { notFound } from 'next/navigation'

import { requireAuthForDashboard } from '@/lib/auth'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import DateUtil from '@/lib/date-util'
import { AssignmentReview } from '@/components/dashboard/teacher/AssignmentReview'
import { createAssetSignedUrlMap } from '@/lib/assignment-assets'
import { applySignedAssetUrls, transformAssignmentRow, type RawAssignmentRow } from '@/lib/assignment-evaluation'

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
          class_id,
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
          media_assets(id, bucket, path, mime_type, metadata),
          shared_task_submissions(
            id,
            note,
            shared_by,
            created_at,
            updated_at,
            shared_task_submission_classes(class_id, classes(id, name))
          )
        )
      ),
       print_requests(
         id,
         status,
         student_task_id,
         desired_date,
         desired_period,
         copies,
         color_mode,
         notes,
         bundle_mode,
         bundle_status,
         compiled_asset_id,
         bundle_ready_at,
         bundle_error,
         created_at,
         updated_at,
         print_request_items(id, student_task_id, submission_id, media_asset_id, asset_filename, asset_metadata)
       )
      `
    )
    .eq('id', params.assignmentId)
    .eq('assigned_by', profile.id)
    .maybeSingle<RawAssignmentRow>()

  if (error) {
    console.error('[teacher] assignment review fetch error', error)
  }

  if (!assignmentRow) {
    notFound()
  }

  const { assignment: transformed, mediaAssets } = transformAssignmentRow(assignmentRow)
  const signedMap = mediaAssets.size > 0 ? await createAssetSignedUrlMap(mediaAssets) : new Map()
  const assignment = applySignedAssetUrls(transformed, signedMap)

  const availableClassMap = new Map<string, string>()
  assignment.classes.forEach((cls) => {
    if (!availableClassMap.has(cls.id)) {
      availableClassMap.set(cls.id, cls.name)
    }
  })

  if (profile.role === 'teacher') {
    const { data: classRows, error: classError } = await supabase
      .from('class_teachers')
      .select('class_id, classes(id, name)')
      .eq('teacher_id', profile.id)

    if (classError) {
      console.error('[teacher] assignment review class fetch error', classError)
    }

    classRows?.forEach((row) => {
      const cls = Array.isArray(row.classes) ? row.classes[0] : row.classes
      const classId = cls?.id ?? row.class_id
      if (!classId) {
        return
      }
      const name = cls?.name ?? '반 이름 미정'
      if (!availableClassMap.has(classId)) {
        availableClassMap.set(classId, name)
      }
    })
  } else {
    const { data: classRows, error: classesError } = await supabase.from('classes').select('id, name')

    if (classesError) {
      console.error('[teacher] assignment review classes fetch error', classesError)
    }

    classRows?.forEach((cls) => {
      if (cls.id && !availableClassMap.has(cls.id)) {
        availableClassMap.set(cls.id, cls.name ?? '반 이름 미정')
      }
    })
  }

  const availableClasses = Array.from(availableClassMap.entries()).map(([id, name]) => ({ id, name }))

  const focusStudentTaskId = typeof searchParams.studentTask === 'string' ? searchParams.studentTask : null
  const classIdParam = typeof searchParams.classId === 'string' ? searchParams.classId : null
  const classContext = classIdParam
    ? assignment.classes.find((cls) => cls.id === classIdParam) ?? null
    : null

  return (
    <AssignmentReview
      teacherName={profile.name ?? profile.email ?? null}
      assignment={assignment}
      generatedAt={DateUtil.nowUTC().toISOString()}
      focusStudentTaskId={focusStudentTaskId}
      classContext={classContext ? { id: classContext.id, name: classContext.name } : null}
      availableClasses={availableClasses}
    />
  )
}
