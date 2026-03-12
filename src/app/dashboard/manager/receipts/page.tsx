import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { requireAuthForDashboard } from '@/lib/auth'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveMonthRange, summarizeTeacherProfile, type TeacherProfileSummary } from '@/lib/work-logs'
import { RECEIPT_SELECT_FIELDS, mapReceiptRow, type ReceiptRow, type ReceiptWithTeacher } from '@/lib/receipts'
import { ReceiptReviewClient } from '@/components/dashboard/manager/receipts/ReceiptReviewClient'

const STATUS_OPTIONS = new Set(['pending', 'approved', 'rejected', 'paid', 'all'])

export default async function ManagerReceiptsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { profile } = await requireAuthForDashboard('manager')

  const searchParams = await props.searchParams
  const monthTokenParam = typeof searchParams?.month === 'string' ? searchParams.month : null
  const teacherFilterParam = typeof searchParams?.teacher === 'string' ? searchParams.teacher : null
  const statusToken = typeof searchParams?.status === 'string' ? searchParams.status : 'pending'
  const statusFilter = STATUS_OPTIONS.has(statusToken) ? statusToken : 'pending'

  const monthRange = resolveMonthRange(monthTokenParam)
  const monthToken = monthRange.startDate.slice(0, 7)

  const supabase = await createServerSupabase()

  let baseQuery = supabase
    .from('teacher_receipts')
    .select(RECEIPT_SELECT_FIELDS)
    .eq('month_token', monthToken)
    .order('used_date', { ascending: true })

  if (teacherFilterParam) {
    baseQuery = baseQuery.eq('teacher_id', teacherFilterParam)
  }

  const { data: rows, error: fetchError } = await baseQuery.returns<ReceiptRow[]>()

  if (fetchError) {
    console.error('[manager-receipts] fetch error', fetchError)
  }

  let teacherDirectory: Record<string, TeacherProfileSummary> = {}

  try {
    const admin = createAdminClient()
    const { data: teacherRows, error: teacherError } = await admin
      .from('profiles')
      .select('id, name, email, role, status')
      .in('role', ['teacher', 'manager'])
      .eq('status', 'approved')

    if (teacherError) {
      console.error('[manager-receipts] teacher directory error', teacherError)
    }

    if (teacherRows) {
      teacherDirectory = teacherRows.reduce<Record<string, TeacherProfileSummary>>((acc, t) => {
        acc[t.id] = summarizeTeacherProfile(t)
        return acc
      }, {})
    }
  } catch (error) {
    console.error('[manager-receipts] teacher directory unexpected error', error)
  }

  const receipts: ReceiptWithTeacher[] = (rows ?? []).map((row) => {
    const receipt = mapReceiptRow(row)
    const teacherInfo = teacherDirectory[receipt.teacherId] ?? null
    return { ...receipt, teacher: teacherInfo }
  })

  return (
    <section className="mx-auto flex max-w-6xl flex-col gap-6">
      <DashboardBackLink
        fallbackHref="/dashboard/manager"
        label="실장 허브로 돌아가기"
        className="self-start"
      />
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-slate-900">지출증빙 관리</h1>
        <p className="text-sm text-slate-600">교사가 제출한 영수증을 검토하고 승인 상태를 관리하세요.</p>
      </header>
      <ReceiptReviewClient
        receipts={receipts}
        monthToken={monthToken}
        monthLabel={monthRange.label}
        statusFilter={statusFilter as 'pending' | 'approved' | 'rejected' | 'paid' | 'all'}
        teacherDirectory={teacherDirectory}
        userRole={profile.role}
      />
    </section>
  )
}
