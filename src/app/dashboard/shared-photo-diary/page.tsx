import { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { requireAuthForDashboard } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { SharedPhotoDiaryGrid } from '@/components/dashboard/shared-photo-diary/SharedPhotoDiaryGrid'

export const metadata: Metadata = {
  title: '모두의 사진일기 | Woodie Campus',
  description: '학생들의 사진 과제를 함께 감상하세요',
}

export interface SharedPhotoEntry {
  id: string
  assetId: string
  url: string
  createdAt: string
  studentId: string
  studentName: string
  classId: string | null
  className: string | null
  subject: string | null
}

export interface FilterOptions {
  classes: Array<{ id: string; name: string }>
  students: Array<{ id: string; name: string }>
  subjects: string[]
}

async function fetchSharedPhotos(): Promise<{ photos: SharedPhotoEntry[]; filters: FilterOptions }> {
  const adminSupabase = createAdminClient()

  // task_submission_assets에서 이미지 제출물 조회 (학생, 반, 과목 정보 포함)
  const { data: submissionAssets, error } = await adminSupabase
    .from('task_submission_assets')
    .select(`
      id,
      order_index,
      created_at,
      media_asset_id,
      media_asset:media_assets(
        id,
        bucket,
        path,
        mime_type
      ),
      task_submission:task_submissions!inner(
        id,
        submission_type,
        student_task:student_tasks!inner(
          id,
          student:profiles!student_tasks_student_id_fkey(id, name, class_id),
          assignment:assignments!inner(
            id,
            workbook:workbooks(id, subject)
          )
        )
      )
    `)
    .eq('task_submission.submission_type', 'image')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    console.error('[shared-photo-diary] fetch error:', error)
    return { photos: [], filters: { classes: [], students: [], subjects: [] } }
  }

  if (!submissionAssets || submissionAssets.length === 0) {
    return { photos: [], filters: { classes: [], students: [], subjects: [] } }
  }

  // 반 정보 조회
  const { data: classesData } = await adminSupabase
    .from('classes')
    .select('id, name')
    .order('name')

  const classMap = new Map<string, string>()
  ;(classesData ?? []).forEach((c) => {
    classMap.set(c.id, c.name ?? '이름 없음')
  })

  const entries: SharedPhotoEntry[] = []
  const studentsSet = new Map<string, string>()
  const subjectsSet = new Set<string>()
  const classesSet = new Map<string, string>()

  for (const asset of submissionAssets) {
    const mediaAsset = Array.isArray(asset.media_asset)
      ? asset.media_asset[0]
      : asset.media_asset

    if (!mediaAsset?.id || !mediaAsset.path) {
      continue
    }

    // mime_type이 image로 시작하는지 확인
    if (mediaAsset.mime_type && !mediaAsset.mime_type.startsWith('image/')) {
      continue
    }

    const taskSubmission = Array.isArray(asset.task_submission)
      ? asset.task_submission[0]
      : asset.task_submission

    const studentTask = taskSubmission?.student_task
      ? (Array.isArray(taskSubmission.student_task) ? taskSubmission.student_task[0] : taskSubmission.student_task)
      : null

    const student = studentTask?.student
      ? (Array.isArray(studentTask.student) ? studentTask.student[0] : studentTask.student)
      : null

    const assignment = studentTask?.assignment
      ? (Array.isArray(studentTask.assignment) ? studentTask.assignment[0] : studentTask.assignment)
      : null

    const workbook = assignment?.workbook
      ? (Array.isArray(assignment.workbook) ? assignment.workbook[0] : assignment.workbook)
      : null

    const studentId = student?.id ?? ''
    const studentName = student?.name ?? '익명'
    const classId = student?.class_id ?? null
    const className = classId ? (classMap.get(classId) ?? null) : null
    const subject = workbook?.subject ?? null

    // 필터 옵션 수집
    if (studentId && studentName) {
      studentsSet.set(studentId, studentName)
    }
    if (subject) {
      subjectsSet.add(subject)
    }
    if (classId && className) {
      classesSet.set(classId, className)
    }

    const bucket = mediaAsset.bucket ?? 'submissions'
    const url = `/api/storage/${bucket}/${mediaAsset.path}`

    entries.push({
      id: asset.id,
      assetId: mediaAsset.id,
      url,
      createdAt: asset.created_at,
      studentId,
      studentName,
      classId,
      className,
      subject,
    })
  }

  const filters: FilterOptions = {
    classes: Array.from(classesSet.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    students: Array.from(studentsSet.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    subjects: Array.from(subjectsSet).sort(),
  }

  return { photos: entries, filters }
}

export default async function SharedPhotoDiaryPage() {
  const { profile } = await requireAuthForDashboard()

  if (!profile) {
    redirect('/login')
  }

  const { photos, filters } = await fetchSharedPhotos()

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900">모두의 사진일기</h1>
        <p className="text-sm text-slate-600">
          학생들이 사진 과제에서 올린 이미지를 함께 감상하고, 좋아요와 댓글로 소통해보세요.
        </p>
      </header>

      {photos.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-16 text-center">
          <p className="text-sm text-slate-500">아직 공유된 사진이 없습니다.</p>
          <p className="mt-1 text-xs text-slate-400">
            학생들이 이미지 과제를 제출하면 여기에 표시됩니다.
          </p>
        </div>
      ) : (
        <SharedPhotoDiaryGrid photos={photos} filters={filters} />
      )}
    </div>
  )
}

