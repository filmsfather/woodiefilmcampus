import { PendingApprovalList } from '@/components/dashboard/manager/PendingApprovalList'
import { ManagerQuickLinks } from '@/components/dashboard/manager/ManagerQuickLinks'
import { ManagerStatsOverview } from '@/components/dashboard/manager/ManagerStatsOverview'
import { PrintRequestAdminPanel, type PrintRequestView } from '@/components/dashboard/manager/PrintRequestAdminPanel'
import { WeekNavigator } from '@/components/dashboard/WeekNavigator'
import { requireAuthForDashboard } from '@/lib/auth'
import DateUtil from '@/lib/date-util'
import { buildWeekHref, resolveWeekRange } from '@/lib/week-range'
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

export default async function ManagerDashboardPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const { profile } = await requireAuthForDashboard('manager')
  const supabase = createClient()
  const storageAdmin = createAdminClient()
  const weekRange = resolveWeekRange(searchParams.week ?? null)
  const desiredDateStart = DateUtil.formatISODate(weekRange.start)
  const desiredDateEndExclusive = DateUtil.formatISODate(weekRange.endExclusive)

  const [pendingStudentsResult, approvedCountResult, printRequestResult, classMaterialPrintRequestResult] = await Promise.all([
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
         student_task:student_tasks(id, class_id, profiles!student_tasks_student_id_fkey(id, name, email)),
         print_request_items(
           id,
           student_task_id,
           asset_filename,
           media_asset_id,
           media_asset:media_assets!print_request_items_media_asset_id_fkey(id, bucket, path),
           student_task:student_tasks!print_request_items_student_task_id_fkey(
             id,
             class_id,
             profiles!student_tasks_student_id_fkey(id, name, email)
           )
         )
        `
      )
      .gte('desired_date', desiredDateStart)
      .lt('desired_date', desiredDateEndExclusive)
      .order('desired_date', { ascending: true, nullsFirst: false })
      .order('desired_period', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
      .limit(50),
    supabase
      .from('class_material_print_requests')
      .select(
        `id,
         status,
         desired_date,
         desired_period,
         copies,
         color_mode,
         notes,
         created_at,
         updated_at,
         requested_by,
      requester:profiles!class_material_print_requests_requested_by_fkey(id, name, email),
      items:class_material_print_request_items(
        id,
        asset_type,
        asset_filename,
           media_asset:media_assets!class_material_print_request_items_media_asset_id_fkey(id, bucket, path, mime_type, metadata)
         )
        `
      )
      .gte('desired_date', desiredDateStart)
      .lt('desired_date', desiredDateEndExclusive)
      .order('desired_date', { ascending: true, nullsFirst: false })
      .order('desired_period', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
      .limit(50),
  ])

  if (pendingStudentsResult.error) {
    console.error('[manager] pending students error', pendingStudentsResult.error)
  }

  if (printRequestResult.error) {
    console.error('[manager] print request error', printRequestResult.error)
  }

  if (classMaterialPrintRequestResult.error) {
    console.error('[manager] class material print request error', classMaterialPrintRequestResult.error)
  }

  const pendingStudents = pendingStudentsResult.data ?? []
  const pendingCount = pendingStudents.length
  const approvedCount = approvedCountResult.count ?? 0

  const rawPrintRequests = ((printRequestResult.data ?? []) as RawPrintRequestRow[]).filter(
    (row) => row.status !== 'canceled'
  )

  const printRequestsUnsorted = await Promise.all(
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

  const sortedAssignmentRequests = printRequestsUnsorted.sort((a, b) => {
    const dateA = a.desiredDate ? new Date(a.desiredDate).getTime() : Number.POSITIVE_INFINITY
    const dateB = b.desiredDate ? new Date(b.desiredDate).getTime() : Number.POSITIVE_INFINITY
    if (dateA !== dateB) {
      return dateA - dateB
    }

    const extractPeriod = (value: string | null) => {
      if (!value) {
        return Number.POSITIVE_INFINITY
      }
      const match = value.match(/\d+/)
      if (!match) {
        return Number.POSITIVE_INFINITY
      }
      return parseInt(match[0] ?? '0', 10)
    }

    const periodA = extractPeriod(a.desiredPeriod ?? null)
    const periodB = extractPeriod(b.desiredPeriod ?? null)
    if (periodA !== periodB) {
      return periodA - periodB
    }

    const createdA = new Date(a.createdAt).getTime()
    const createdB = new Date(b.createdAt).getTime()
    return createdA - createdB
  })

  const assignmentRequests: PrintRequestView[] = sortedAssignmentRequests.map((request) => {
    const studentSummary = (() => {
      if (request.students.length === 0) {
        return '전체 학생'
      }
      if (request.students.length <= 2) {
        return request.students.map((student) => student.name).join(', ')
      }
      return `${request.students.slice(0, 2).map((student) => student.name).join(', ')} 외 ${request.students.length - 2}명`
    })()

    const itemLabel = request.items.length > 0 ? ` (${request.items.length}건)` : ''

    return {
      id: request.id,
      source: 'assignment',
      status: (request.status ?? 'requested') as 'requested' | 'done' | 'canceled',
      desiredDate: request.desiredDate,
      desiredPeriod: request.desiredPeriod,
      copies: request.copies,
      colorMode: request.colorMode,
      notes: request.notes,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      teacherName: request.teacher.name,
      studentLabel: `${studentSummary}${itemLabel}`,
      files: request.items.map((item) => ({
        id: item.id,
        label: `${item.studentName} · ${item.fileName}`,
        downloadUrl: item.downloadUrl,
      })),
    }
  })

  const classMaterialRequests: PrintRequestView[] = await Promise.all(
    ((classMaterialPrintRequestResult.data ?? []) as Array<{
      id: string
      status: string | null
      desired_date: string | null
      desired_period: string | null
      copies: number | null
      color_mode: string | null
      notes: string | null
      created_at: string
      updated_at: string
      requester?: { id: string; name: string | null; email: string | null } | Array<{ id: string; name: string | null; email: string | null }>
      post?: { id: string; title: string; subject: string } | Array<{ id: string; title: string; subject: string }>
      items?: Array<{
        id: string
        asset_type: string | null
        asset_filename: string | null
        media_asset?: { id: string; bucket: string | null; path: string | null } | Array<{ id: string; bucket: string | null; path: string | null }>
      }>
    }>)
      .filter((row) => row.status !== 'canceled')
      .map(async (row) => {
        const requesterRelation = Array.isArray(row.requester) ? row.requester[0] : row.requester
        const rawItems = Array.isArray(row.items) ? row.items : []

        const items = await Promise.all(
          rawItems.map(async (item) => {
            const mediaAsset = Array.isArray(item.media_asset) ? item.media_asset[0] : item.media_asset
            let downloadUrl: string | null = null

            if (mediaAsset?.bucket && mediaAsset.path) {
              try {
                const { data: signed, error: signedError } = await storageAdmin.storage
                  .from(mediaAsset.bucket)
                  .createSignedUrl(mediaAsset.path, 60 * 60)
                if (signedError) {
                  console.error('[manager] class material request signed url error', signedError)
                } else {
                  downloadUrl = signed?.signedUrl ?? null
                }
              } catch (error) {
                console.error('[manager] class material request signed url unexpected error', error)
              }
            }

            return {
              id: item.id,
              assetType: item.asset_type === 'student_handout' ? ('student_handout' as const) : ('class_material' as const),
              fileName: item.asset_filename,
              downloadUrl,
            }
          })
        )

        return {
          id: row.id,
          source: 'class_material' as const,
          status: (row.status ?? 'requested') as 'requested' | 'done' | 'canceled',
          desiredDate: row.desired_date,
          desiredPeriod: row.desired_period,
          copies: row.copies ?? 1,
          colorMode: row.color_mode ?? 'bw',
          notes: row.notes ?? null,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          teacherName: requesterRelation?.name ?? requesterRelation?.email ?? '교사 미확인',
          studentLabel: '(수업자료)',
          files: items.map((item) => ({
            id: item.id,
            label: `${item.assetType === 'class_material' ? '수업자료' : '학생 유인물'} · ${item.fileName ?? '파일'}`,
            downloadUrl: item.downloadUrl,
          })),
        }
      })
  )

  classMaterialRequests.sort((a, b) => {
    const dateA = a.desiredDate ? new Date(a.desiredDate).getTime() : Number.POSITIVE_INFINITY
    const dateB = b.desiredDate ? new Date(b.desiredDate).getTime() : Number.POSITIVE_INFINITY
    if (dateA !== dateB) {
      return dateA - dateB
    }

    const extractPeriod = (value: string | null | undefined) => {
      if (!value) {
        return Number.POSITIVE_INFINITY
      }
      const match = value.match(/\d+/)
      if (!match) {
        return Number.POSITIVE_INFINITY
      }
      return parseInt(match[0] ?? '0', 10)
    }

    const periodA = extractPeriod(a.desiredPeriod)
    const periodB = extractPeriod(b.desiredPeriod)
    if (periodA !== periodB) {
      return periodA - periodB
    }

    const createdA = new Date(a.createdAt).getTime()
    const createdB = new Date(b.createdAt).getTime()
    return createdA - createdB
  })

  const combinedRequests = [...assignmentRequests, ...classMaterialRequests].sort((a, b) => {
    const dateA = a.desiredDate ? new Date(a.desiredDate).getTime() : Number.POSITIVE_INFINITY
    const dateB = b.desiredDate ? new Date(b.desiredDate).getTime() : Number.POSITIVE_INFINITY
    if (dateA !== dateB) {
      return dateA - dateB
    }

    const extractPeriod = (value: string | null | undefined) => {
      if (!value) {
        return Number.POSITIVE_INFINITY
      }
      const match = value.match(/\d+/)
      if (!match) {
        return Number.POSITIVE_INFINITY
      }
      return parseInt(match[0] ?? '0', 10)
    }

    const periodA = extractPeriod(a.desiredPeriod)
    const periodB = extractPeriod(b.desiredPeriod)
    if (periodA !== periodB) {
      return periodA - periodB
    }

    const teacherA = (a.teacherName ?? '').toLowerCase()
    const teacherB = (b.teacherName ?? '').toLowerCase()
    if (teacherA !== teacherB) {
      return teacherA.localeCompare(teacherB)
    }

    const createdA = new Date(a.createdAt).getTime()
    const createdB = new Date(b.createdAt).getTime()
    return createdA - createdB
  })

  const previousWeekHref = buildWeekHref('/dashboard/manager', searchParams, weekRange.previousStart)
  const nextWeekHref = buildWeekHref('/dashboard/manager', searchParams, weekRange.nextStart)

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

      <div className="space-y-3">
        <WeekNavigator
          label={weekRange.label}
          previousHref={previousWeekHref}
          nextHref={nextWeekHref}
        />
        {combinedRequests.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
            선택한 주간에 표시할 인쇄 요청이 없습니다.
          </div>
        ) : (
          <PrintRequestAdminPanel requests={combinedRequests} />
        )}
      </div>

      <PendingApprovalList students={pendingStudents} />
    </section>
  )
}
