import { PendingApprovalList } from '@/components/dashboard/manager/PendingApprovalList'
import { ManagerQuickLinks } from '@/components/dashboard/manager/ManagerQuickLinks'
import { ManagerStatsOverview } from '@/components/dashboard/manager/ManagerStatsOverview'
import { PrintRequestAdminPanel } from '@/components/dashboard/manager/PrintRequestAdminPanel'
import { requireAuthForDashboard } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type RawPrintRequestItemRow = {
  id: string
  student_task_id: string
  asset_filename: string | null
  media_asset_id: string | null
  media_asset?:
    | {
        id: string
        bucket: string | null
        path: string | null
      }
    | Array<{
        id: string
        bucket: string | null
        path: string | null
      }>
    | null
  student_task?:
    | {
        id: string
        profiles?: { id: string; name: string | null; email: string | null } | Array<{ id: string; name: string | null; email: string | null }> | null
      }
    | Array<{
        id: string
        profiles?: Array<{ id: string; name: string | null; email: string | null }> | null
      }>
    | null
}

type RawPrintRequestRow = {
  id: string
  status: string
  desired_date: string | null
  desired_period: string | null
  copies: number | null
  color_mode: string | null
  notes: string | null
  bundle_mode: string | null
  bundle_status: string | null
  compiled_asset_id: string | null
  bundle_ready_at: string | null
  bundle_error: string | null
  created_at: string
  updated_at: string
  teacher?: { id: string; name: string | null; email: string | null } | Array<{ id: string; name: string | null; email: string | null }> | null
  assignment?: { id: string; workbooks?: { id: string; title: string; subject: string; type: string } | Array<{ id: string; title: string; subject: string; type: string }> | null } | Array<{ id: string; workbooks?: Array<{ id: string; title: string; subject: string; type: string }> | null }> | null
  student_task?: { id: string; profiles?: { id: string; name: string | null; email: string | null } | Array<{ id: string; name: string | null; email: string | null }> | null } | Array<{ id: string; profiles?: Array<{ id: string; name: string | null; email: string | null }> | null }> | null
  print_request_items?: RawPrintRequestItemRow[] | null
}

export default async function ManagerDashboardPage() {
  const { profile } = await requireAuthForDashboard('manager')
  const supabase = createClient()
  const storageAdmin = createAdminClient()

  const [pendingStudentsResult, approvedCountResult, printRequestResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, name, student_phone, parent_phone, academic_record, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true }),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'approved'),
    supabase
      .from('print_requests')
      .select(
        `id,
         status,
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
         teacher:profiles!print_requests_teacher_id_fkey(id, name, email),
         assignment:assignments!print_requests_assignment_id_fkey(id, workbooks(id, title, subject, type)),
         student_task:student_tasks(id, profiles!student_tasks_student_id_fkey(id, name, email)),
         print_request_items(
           id,
           student_task_id,
           asset_filename,
           media_asset_id,
           media_asset:media_assets!print_request_items_media_asset_id_fkey(id, bucket, path),
           student_task:student_tasks!print_request_items_student_task_id_fkey(
             id,
             profiles!student_tasks_student_id_fkey(id, name, email)
           )
         )
        `
      )
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  if (pendingStudentsResult.error) {
    console.error('[manager] pending students error', pendingStudentsResult.error)
  }

  if (printRequestResult.error) {
    console.error('[manager] print request error', printRequestResult.error)
  }

  const pendingStudents = pendingStudentsResult.data ?? []
  const pendingCount = pendingStudents.length
  const approvedCount = approvedCountResult.count ?? 0

  const rawPrintRequests = (printRequestResult.data ?? []) as RawPrintRequestRow[]

  const printRequests = await Promise.all(
    rawPrintRequests.map(async (row) => {
      const teacherRecord = Array.isArray(row.teacher) ? row.teacher[0] : row.teacher
      const assignmentRecord = Array.isArray(row.assignment) ? row.assignment[0] : row.assignment
      const workbook = assignmentRecord?.workbooks
        ? Array.isArray(assignmentRecord.workbooks)
          ? assignmentRecord.workbooks[0]
          : assignmentRecord.workbooks
        : null
      const studentTaskRecord = Array.isArray(row.student_task) ? row.student_task[0] : row.student_task
      const studentProfile = studentTaskRecord?.profiles
        ? Array.isArray(studentTaskRecord.profiles)
          ? studentTaskRecord.profiles[0]
          : studentTaskRecord.profiles
        : null

      const rawItems = row.print_request_items ?? []
      const items = await Promise.all(
        rawItems.map(async (item) => {
          const studentTask = Array.isArray(item.student_task) ? item.student_task[0] : item.student_task
          const itemProfile = studentTask?.profiles
            ? Array.isArray(studentTask.profiles)
              ? studentTask.profiles[0]
              : studentTask.profiles
            : null
          const studentId = studentTask?.id ?? item.student_task_id
          const studentName = itemProfile?.name ?? itemProfile?.email ?? '학생 미확인'

          const mediaAsset = Array.isArray(item.media_asset) ? item.media_asset[0] : item.media_asset
          let downloadUrl: string | null = null
          if (mediaAsset?.bucket && mediaAsset.path) {
            try {
              const { data: signedData, error: signedError } = await storageAdmin.storage
                .from(mediaAsset.bucket)
                .createSignedUrl(mediaAsset.path, 60 * 30)
              if (signedError) {
                console.error('[manager] signed url error', {
                  requestId: row.id,
                  itemId: item.id,
                  error: signedError,
                })
              } else {
                downloadUrl = signedData?.signedUrl ?? null
              }
            } catch (error) {
              console.error('[manager] signed url unexpected error', {
                requestId: row.id,
                itemId: item.id,
                error,
              })
            }
          }

          const fileName = item.asset_filename ?? (mediaAsset?.path ? mediaAsset.path.split('/').pop() ?? mediaAsset.path : '제출물')

          return {
            id: item.id,
            studentId,
            studentName,
            fileName,
            downloadUrl,
          }
        })
      )

      const uniqueStudents = items.length > 0
        ? Array.from(new Map(items.map((item) => [item.studentId, { id: item.studentId, name: item.studentName }])).values())
        : []

      const fallbackStudent = studentProfile
        ? [
            {
              id: studentProfile.id,
              name: studentProfile.name ?? studentProfile.email ?? '학생 미확인',
            },
          ]
        : []

      return {
        id: row.id,
        status: row.status,
        desiredDate: row.desired_date,
        desiredPeriod: row.desired_period,
        copies: row.copies ?? 1,
        colorMode: row.color_mode ?? 'bw',
        notes: row.notes ?? null,
        bundleMode: (row.bundle_mode as 'merged' | 'separate' | null) ?? 'merged',
        bundleStatus: row.bundle_status ?? 'pending',
        bundleReadyAt: row.bundle_ready_at ?? null,
        bundleError: row.bundle_error ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        teacher: {
          id: teacherRecord?.id ?? '',
          name: teacherRecord?.name ?? teacherRecord?.email ?? '교사 미확인',
        },
        assignment: workbook
          ? {
              id: assignmentRecord?.id ?? '',
              title: workbook.title,
              subject: workbook.subject,
              type: workbook.type,
            }
          : null,
        students: uniqueStudents.length > 0 ? uniqueStudents : fallbackStudent,
        itemCount: items.length,
        items,
      }
    })
  )

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">실장 대시보드</h1>
        <p className="text-slate-600">
          {profile?.name ?? profile?.email} 님, 학원생 가입 승인과 인쇄 요청 관리를 진행할 수 있습니다.
        </p>
      </div>

      <ManagerStatsOverview pendingCount={pendingCount} approvedCount={approvedCount} />

      <ManagerQuickLinks />

      <PrintRequestAdminPanel requests={printRequests} />

      <PendingApprovalList students={pendingStudents} />
    </section>
  )
}
