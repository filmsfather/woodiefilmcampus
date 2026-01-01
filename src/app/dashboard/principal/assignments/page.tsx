import { requireAuthForDashboard } from '@/lib/auth'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import DateUtil from '@/lib/date-util'
import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { PrincipalAssignmentGrid } from '@/components/dashboard/principal/assignments/PrincipalAssignmentGrid'
import { PeriodNavigator } from '@/components/dashboard/principal/assignments/PeriodNavigator'

interface RawClassRow {
  id: string
  name: string
}

interface RawAssignmentRow {
  id: string
  due_at: string | null
  published_at: string | null
  created_at: string
  target_scope: string | null
  workbooks?: {
    id: string
    title: string | null
    subject: string | null
    type: string | null
    week_label: string | null
  } | null
  assignment_targets?: Array<{
    class_id: string | null
  }>
  student_tasks?: Array<{
    id: string
    status: string
    status_override?: string | null
    class_id: string | null
    student_id: string
  }>
}

interface RawWeekTemplateRow {
  id: string
  class_id: string
  period_id: string
  week_index: number
  subject: string
  material_ids: string[] | null
  material_titles: string[] | null
  material_notes: string | null
}

interface RawPeriodRow {
  id: string
  class_id: string
  start_date: string
  end_date: string
  label: string | null
  status: string
}

interface PeriodGroup {
  key: string  // start_date를 키로 사용
  label: string
  startDate: string
  endDate: string
  periods: RawPeriodRow[]
}

function formatPeriodGroupLabel(startDate: string, endDate: string): string {
  const start = DateUtil.toUTCDate(startDate)
  const end = DateUtil.toUTCDate(endDate)
  
  const startLabel = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'short',
    day: 'numeric',
  }).format(start)
  
  const endLabel = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'short',
    day: 'numeric',
  }).format(end)
  
  return `${startLabel} ~ ${endLabel}`
}

function deriveWeekRangesFromPeriod(startDate: string, endDate: string) {
  const start = DateUtil.toUTCDate(startDate)
  const end = DateUtil.toUTCDate(endDate)

  const weeks: Array<{ weekIndex: number; startDate: string; endDate: string }> = []
  let cursor = new Date(start.getTime())

  for (let weekIndex = 1; weekIndex <= 4; weekIndex++) {
    const weekStart = new Date(cursor.getTime())
    const weekEnd = new Date(cursor.getTime())
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6)

    if (weekEnd > end) {
      weekEnd.setTime(end.getTime())
    }

    weeks.push({
      weekIndex,
      startDate: DateUtil.formatISODate(weekStart),
      endDate: DateUtil.formatISODate(weekEnd),
    })

    cursor.setUTCDate(cursor.getUTCDate() + 7)
    if (cursor > end) break
  }

  return weeks
}

function deriveWeekIndexFromDate(
  dateStr: string | null,
  weekRanges: Array<{ weekIndex: number; startDate: string; endDate: string }>
): number | null {
  if (!dateStr) return null

  const date = DateUtil.toUTCDate(dateStr)
  for (const range of weekRanges) {
    const start = DateUtil.toUTCDate(range.startDate)
    const end = DateUtil.toUTCDate(range.endDate)
    end.setUTCHours(23, 59, 59, 999)
    if (date >= start && date <= end) {
      return range.weekIndex
    }
  }
  return null
}

export interface ClassAssignmentCell {
  classId: string
  className: string
  weekIndex: number
  assignments: Array<{
    id: string
    title: string
    subject: string | null
    dueAt: string | null
    completedCount: number
    totalCount: number
    status: 'completed' | 'in_progress' | 'overdue' | 'upcoming'
  }>
  integratedTheory: {
    periodId: string | null
    hasMaterials: boolean
    materialTitles: string[]
    materialIds: string[]
    materialNotes: string | null
  }
}

export interface MaterialOption {
  id: string
  title: string
  description: string | null
  display: string
  weekLabel: string | null
}

export interface WorkbookOption {
  id: string
  title: string
  subject: string
  type: string
  weekLabel: string | null
  itemCount: number
}

export interface PrincipalAssignmentData {
  periodKey: string
  periodLabel: string
  periodOptions: Array<{ key: string; label: string }>
  classes: Array<{ id: string; name: string }>
  weekRanges: Array<{ weekIndex: number; startDate: string; endDate: string }>
  cells: ClassAssignmentCell[]
  integratedTheoryMaterials: MaterialOption[]
  integratedTheoryWorkbooks: WorkbookOption[]
}

export default async function PrincipalAssignmentsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireAuthForDashboard('principal')
  const supabase = await createServerSupabase()

  const resolvedParams = await searchParams
  const periodParam = typeof resolvedParams?.period === 'string' ? resolvedParams.period : null
  const now = DateUtil.nowUTC()
  const todayStr = DateUtil.formatISODate(now)

  // 1. 모든 학습일지 주기 조회
  const { data: allPeriodRows } = await supabase
    .from('learning_journal_periods')
    .select('id, class_id, start_date, end_date, label, status')
    .order('start_date', { ascending: false })
    .limit(200)

  const allPeriods = (allPeriodRows as RawPeriodRow[] | null) ?? []

  // 주기를 시작일(start_date) 기준으로 그룹화 (같은 시작일 = 같은 주기 그룹)
  const periodGroups = new Map<string, PeriodGroup>()
  for (const period of allPeriods) {
    const key = period.start_date  // 시작일을 키로 사용
    if (!periodGroups.has(key)) {
      periodGroups.set(key, {
        key,
        label: formatPeriodGroupLabel(period.start_date, period.end_date),
        startDate: period.start_date,
        endDate: period.end_date,
        periods: [],
      })
    }
    const group = periodGroups.get(key)!
    group.periods.push(period)
    // 그룹의 종료일 확장 (혹시 다른 반이 더 긴 주기를 가지는 경우)
    if (period.end_date > group.endDate) {
      group.endDate = period.end_date
      group.label = formatPeriodGroupLabel(group.startDate, group.endDate)
    }
  }

  // 정렬된 주기 키 목록 (최신순)
  const sortedKeys = Array.from(periodGroups.keys()).sort((a, b) => b.localeCompare(a))
  const periodOptions = sortedKeys.map((key) => ({
    key,
    label: periodGroups.get(key)!.label,
  }))

  // 현재 선택된 주기 결정
  let selectedKey = periodParam
  if (!selectedKey || !periodGroups.has(selectedKey)) {
    // 현재 날짜가 포함된 주기 찾기
    selectedKey = sortedKeys.find((key) => {
      const group = periodGroups.get(key)!
      return todayStr >= group.startDate && todayStr <= group.endDate
    }) ?? sortedKeys[0] ?? null
  }

  if (!selectedKey) {
    // 주기가 없는 경우
    return (
      <section className="space-y-6">
        <DashboardBackLink fallbackHref="/dashboard/principal" label="원장 대시보드로" />
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold text-slate-900">과제 관리</h1>
          <p className="text-slate-600">전체 반의 과제 현황과 통합이론 수업 내용을 한눈에 확인하세요.</p>
        </header>
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          생성된 학습일지 주기가 없습니다. 먼저 학습일지 주기를 생성해주세요.
        </div>
      </section>
    )
  }

  const selectedGroup = periodGroups.get(selectedKey)!
  const periods = selectedGroup.periods
  const periodIds = periods.map((p) => p.id)
  const weekRanges = deriveWeekRangesFromPeriod(selectedGroup.startDate, selectedGroup.endDate)

  // 해당 주기에 속한 반 ID 집합
  const periodClassIds = new Set(periods.map((p) => p.class_id))

  // 2. 해당 주기가 생성된 반만 조회
  const { data: classRows } = await supabase
    .from('classes')
    .select('id, name')
    .in('id', Array.from(periodClassIds))
    .order('name', { ascending: true })

  const classes = ((classRows as RawClassRow[] | null) ?? [])
    .map((cls) => ({ id: cls.id, name: cls.name }))

  // 3. 해당 주기의 과제 조회 (생성일 기준으로 범위 조회 후 필터링)
  const { data: assignmentRows } = await supabase
    .from('assignments')
    .select(`
      id, due_at, published_at, created_at, target_scope,
      workbooks(id, title, subject, type, week_label),
      assignment_targets(class_id),
      student_tasks(id, status, status_override, class_id, student_id)
    `)
    .gte('created_at', selectedGroup.startDate)
    .lte('created_at', selectedGroup.endDate + 'T23:59:59Z')
    .order('created_at', { ascending: true })

  const assignments = (assignmentRows as RawAssignmentRow[] | null) ?? []

  // 4. 해당 period들의 통합이론 week_templates 조회
  let weekTemplates: RawWeekTemplateRow[] = []
  if (periodIds.length > 0) {
    const { data: templateRows } = await supabase
      .from('class_learning_journal_weeks')
      .select('id, class_id, period_id, week_index, subject, material_ids, material_titles, material_notes')
      .in('period_id', periodIds)
      .eq('subject', 'integrated_theory')

    weekTemplates = (templateRows as RawWeekTemplateRow[] | null) ?? []
  }

  // 5. 통합이론 수업 자료 목록 조회 (편집 다이얼로그용)
  const { data: materialRows } = await supabase
    .from('class_material_posts')
    .select('id, title, description, week_label')
    .eq('subject', 'integrated_theory')
    .order('created_at', { ascending: false })
    .limit(100)

  const integratedTheoryMaterials: MaterialOption[] = (materialRows ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    display: row.description?.trim() ? `${row.title} - ${row.description}` : row.title,
    weekLabel: row.week_label ? String(row.week_label) : null,
  }))

  // 5-1. 통합이론 문제집 목록 조회 (과제 출제용)
  const { data: workbookRows } = await supabase
    .from('workbooks')
    .select('id, title, subject, type, week_label, workbook_items(count)')
    .eq('subject', '통합')
    .order('updated_at', { ascending: false })
    .limit(100)

  const integratedTheoryWorkbooks: WorkbookOption[] = (workbookRows ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    subject: row.subject,
    type: row.type,
    weekLabel: row.week_label ?? null,
    itemCount: (row.workbook_items as Array<{ count: number }> | null)?.[0]?.count ?? 0,
  }))

  // 6. 셀 데이터 구축
  const cells: ClassAssignmentCell[] = []

  for (const cls of classes) {
    // 해당 반의 period 찾기
    const classPeriod = periods.find((p) => p.class_id === cls.id) ?? null

    for (const week of weekRanges) {
      // 해당 반+주차의 과제 필터 (출제일 또는 생성일 기준)
      const cellAssignments = assignments
        .filter((assignment) => {
          const effectiveDate = assignment.published_at ?? assignment.created_at
          const weekIndex = deriveWeekIndexFromDate(effectiveDate, weekRanges)
          if (weekIndex !== week.weekIndex) return false

          // 해당 반에 출제된 과제인지 확인
          const targetClassIds = (assignment.assignment_targets ?? [])
            .map((t) => t.class_id)
            .filter((id): id is string => Boolean(id))

          const hasClassTarget = targetClassIds.includes(cls.id)
          const hasStudentInClass = (assignment.student_tasks ?? []).some(
            (task) => task.class_id === cls.id
          )

          return hasClassTarget || hasStudentInClass
        })
        .map((assignment) => {
          const workbook = assignment.workbooks
          const classTasks = (assignment.student_tasks ?? []).filter(
            (task) => task.class_id === cls.id
          )
          const completedCount = classTasks.filter((task) => {
            const status = task.status_override ?? task.status
            return status === 'completed'
          }).length
          const totalCount = classTasks.length

          const dueDate = assignment.due_at ? new Date(assignment.due_at) : null
          let status: 'completed' | 'in_progress' | 'overdue' | 'upcoming' = 'upcoming'

          if (totalCount > 0 && completedCount === totalCount) {
            status = 'completed'
          } else if (dueDate && dueDate < now) {
            status = 'overdue'
          } else if (completedCount > 0) {
            status = 'in_progress'
          }

          return {
            id: assignment.id,
            title: workbook?.title ?? '제목 없음',
            subject: workbook?.subject ?? null,
            dueAt: assignment.due_at,
            completedCount,
            totalCount,
            status,
          }
        })

      // 통합이론 수업 템플릿 찾기
      const template = classPeriod
        ? weekTemplates.find(
            (t) => t.period_id === classPeriod.id && t.week_index === week.weekIndex
          )
        : null

      const hasMaterials =
        template &&
        ((template.material_ids?.length ?? 0) > 0 || (template.material_titles?.length ?? 0) > 0)

      cells.push({
        classId: cls.id,
        className: cls.name,
        weekIndex: week.weekIndex,
        assignments: cellAssignments,
        integratedTheory: {
          periodId: classPeriod?.id ?? null,
          hasMaterials: Boolean(hasMaterials),
          materialTitles: template?.material_titles ?? [],
          materialIds: template?.material_ids ?? [],
          materialNotes: template?.material_notes ?? null,
        },
      })
    }
  }

  const data: PrincipalAssignmentData = {
    periodKey: selectedKey,
    periodLabel: selectedGroup.label,
    periodOptions,
    classes,
    weekRanges,
    cells,
    integratedTheoryMaterials,
    integratedTheoryWorkbooks,
  }

  return (
    <section className="space-y-6">
      <DashboardBackLink fallbackHref="/dashboard/principal" label="원장 대시보드로" />

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">과제 관리</h1>
        <p className="text-slate-600">전체 반의 과제 현황과 통합이론 수업 내용을 한눈에 확인하세요.</p>
      </header>

      <PeriodNavigator
        currentKey={data.periodKey}
        currentLabel={data.periodLabel}
        options={data.periodOptions}
      />

      <PrincipalAssignmentGrid data={data} />
    </section>
  )
}
