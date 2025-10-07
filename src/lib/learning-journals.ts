import DateUtil from '@/lib/date-util'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import {
  LEARNING_JOURNAL_SUBJECTS,
  type LearningJournalAcademicEvent,
  type LearningJournalComment,
  type LearningJournalEntryDetail,
  type LearningJournalEntryLog,
  type LearningJournalEntryStatus,
  type LearningJournalGreeting,
  type LearningJournalPeriod,
  type LearningJournalPeriodWithClass,
  type LearningJournalStudentSnapshot,
  type LearningJournalWeekTemplate,
  type LearningJournalWeeklyData,
  type LearningJournalWeekAssignmentItem,
  type LearningJournalWeeklySubjectData,
  type ClassLearningJournalTemplate,
} from '@/types/learning-journal'
import type { LearningJournalSubject } from '@/types/learning-journal'
import { createAdminClient } from '@/lib/supabase/admin'

const WEEK_INDICES = [1, 2, 3, 4] as const

function isLearningJournalSubject(value: unknown): value is LearningJournalSubject {
  return typeof value === 'string' && (LEARNING_JOURNAL_SUBJECTS as readonly string[]).includes(value)
}

function toArray<T>(value: T | T[] | null | undefined): T[] {
  if (!value) {
    return []
  }
  return Array.isArray(value) ? value : [value]
}

function extractWeekIndex(label: string | null | undefined): number | null {
  if (!label) {
    return null
  }
  const match = label.match(/\d+/)
  if (!match) {
    return null
  }
  const numeric = Number.parseInt(match[0] ?? '', 10)
  if (!Number.isFinite(numeric)) {
    return null
  }
  if (numeric < 1 || numeric > 4) {
    return null
  }
  return numeric
}

function deriveWeekIndexFromDate(
  isoDate: string | null,
  ranges: Array<{ weekIndex: number; startDate: string; endDate: string }>
): number | null {
  if (!isoDate) {
    return null
  }

  const target = DateUtil.toUTCDate(isoDate)

  for (const range of ranges) {
    const start = DateUtil.toUTCDate(range.startDate)
    const end = DateUtil.toUTCDate(range.endDate)
    if (target >= start && target <= end) {
      return range.weekIndex
    }
  }

  return null
}

function normalizeAssignmentStatus(status: string | null | undefined): LearningJournalWeekAssignmentItem['status'] {
  switch (status) {
    case 'completed':
      return 'completed'
    case 'in_progress':
      return 'in_progress'
    case 'not_started':
      return 'not_started'
    case 'pending':
      return 'pending'
    default:
      return 'pending'
  }
}

interface LearningJournalPeriodRow {
  id: string
  class_id: string
  start_date: string
  end_date: string
  label: string | null
  status: string
  created_by: string
  locked_at: string | null
  created_at: string
  updated_at: string
  classes?:
    | {
        id: string
        name: string | null
      }
    | Array<{
        id: string
        name: string | null
      }>
    | null
}

interface ClassStudentRow {
  class_id: string
  student_id: string
  profiles?:
    | {
        id: string
        name: string | null
        email: string | null
      }
    | Array<{
        id: string
        name: string | null
        email: string | null
      }>
    | null
}

interface LearningJournalEntryRow {
  id: string
  period_id: string
  student_id: string
  status: LearningJournalEntryStatus
  completion_rate: number | null
  last_generated_at: string | null
  submitted_at: string | null
  published_at: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
  summary_json: unknown
  weekly_json: unknown
  student?:
    | {
        id: string
        name: string | null
        email: string | null
      }
    | Array<{
        id: string
        name: string | null
        email: string | null
      }>
    | null
}

interface StudentEntryRow extends LearningJournalEntryRow {
  period?:
    | {
        id: string
        class_id: string
        start_date: string
        end_date: string
        label: string | null
        status: string
        classes?:
          | {
              id: string
              name: string | null
            }
          | Array<{
              id: string
              name: string | null
            }>
          | null
      }
    | Array<{
        id: string
        class_id: string
        start_date: string
        end_date: string
        label: string | null
        status: string
        classes?:
          | {
              id: string
              name: string | null
            }
          | Array<{
              id: string
              name: string | null
            }>
          | null
      }>
    | null
}

interface ReviewEntryRow {
  id: string
  status: LearningJournalEntryStatus
  completion_rate: number | null
  submitted_at: string | null
  published_at: string | null
  created_at: string
  updated_at: string
  student:
    | {
        id: string
        name: string | null
        email: string | null
      }
    | Array<{
        id: string
        name: string | null
        email: string | null
      }>
    | null
  period:
    | {
        id: string
        start_date: string
        end_date: string
        label: string | null
        class_id: string | null
        classes:
          | {
              id: string
              name: string | null
            }
          | Array<{
              id: string
              name: string | null
            }>
          | null
      }
    | Array<{
        id: string
        start_date: string
        end_date: string
        label: string | null
        class_id: string | null
        classes:
          | {
              id: string
              name: string | null
            }
          | Array<{
              id: string
              name: string | null
            }>
          | null
      }>
    | null
}

export interface ReviewEntrySummary {
  id: string
  status: LearningJournalEntryStatus
  completionRate: number | null
  submittedAt: string | null
  publishedAt: string | null
  studentId: string
  studentName: string | null
  studentEmail: string | null
  classId: string | null
  className: string | null
  periodId: string
  periodLabel: string | null
  periodStartDate: string
  periodEndDate: string
  updatedAt: string
}

function pickSingle<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null
  }
  if (Array.isArray(value)) {
    return value[0] ?? null
  }
  return value
}

function toReviewEntry(row: ReviewEntryRow): ReviewEntrySummary {
  const period = pickSingle(row.period)
  const classInfo = pickSingle(period?.classes ?? null)
  const student = pickSingle(row.student)

  return {
    id: row.id,
    status: row.status,
    completionRate: row.completion_rate ?? null,
    submittedAt: row.submitted_at ?? null,
    publishedAt: row.published_at ?? null,
    studentId: student?.id ?? '',
    studentName: student?.name ?? student?.email ?? null,
    studentEmail: student?.email ?? null,
    classId: classInfo?.id ?? period?.class_id ?? null,
    className: classInfo?.name ?? null,
    periodId: period?.id ?? '',
    periodLabel: period?.label ?? null,
    periodStartDate: period?.start_date ?? '',
    periodEndDate: period?.end_date ?? '',
    updatedAt: row.updated_at,
  }
}

export interface StudentLearningJournalSnapshot {
  entry: LearningJournalEntryDetail
  period: {
    id: string
    classId: string
    className: string
    startDate: string
    endDate: string
    label: string | null
    status: LearningJournalPeriod['status']
  }
}

export interface LearningJournalPeriodStats {
  periodId: string
  totalEntries: number
  submittedCount: number
  publishedCount: number
}

interface GreetingRow {
  month_token: string
  message: string
  principal_id: string
  published_at: string | null
  created_at: string
  updated_at: string
}

export function calculatePeriodEnd(startDateIso: string, cycleLengthDays = 28): string {
  const startDate = DateUtil.toUTCDate(startDateIso)
  const endDate = DateUtil.addDays(startDate, cycleLengthDays - 1)
  return DateUtil.formatISODate(endDate)
}

export function resolveMonthToken(value: string | Date): string {
  const date = DateUtil.toUTCDate(value)
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0')
  return `${date.getUTCFullYear()}-${month}`
}

export function deriveMonthTokensForRange(startDateIso: string, endDateIso: string): string[] {
  const result: string[] = []
  const start = DateUtil.toUTCDate(startDateIso)
  const end = DateUtil.toUTCDate(endDateIso)
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))

  while (cursor <= end) {
    result.push(resolveMonthToken(cursor))
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }

  return Array.from(new Set(result))
}

function normalizeClassName(row: LearningJournalPeriodRow): string {
  const relation = row.classes
  if (!relation) {
    return '반 미지정'
  }

  if (Array.isArray(relation)) {
    return relation[0]?.name ?? '반 미지정'
  }

  return relation.name ?? '반 미지정'
}

function toPeriod(row: LearningJournalPeriodRow): LearningJournalPeriod {
  return {
    id: row.id,
    classId: row.class_id,
    startDate: row.start_date,
    endDate: row.end_date,
    label: row.label ?? null,
    status: row.status as LearningJournalPeriod['status'],
    createdBy: row.created_by,
    lockedAt: row.locked_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toPeriodWithClass(
  row: LearningJournalPeriodRow,
  studentCount: number
): LearningJournalPeriodWithClass {
  const period = toPeriod(row)
  return {
    ...period,
    className: normalizeClassName(row),
    studentCount,
  }
}

function pickProfile(row: ClassStudentRow['profiles']): {
  id: string
  name: string | null
  email: string | null
} | null {
  if (!row) {
    return null
  }

  if (Array.isArray(row)) {
    return row[0] ?? null
  }

  return row
}

interface ClassLearningJournalWeekRow {
  id: string
  class_id: string
  period_id: string
  week_index: number
  subject: LearningJournalSubject
  material_ids: string[] | null
  material_titles: string[] | null
  material_notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface UpsertClassLearningJournalWeekInput {
  classId: string
  periodId: string
  weekIndex: number
  subject: LearningJournalSubject
  materialIds: string[]
  materialTitles: string[]
  materialNotes: string | null
  actorId: string
}

export interface WeeklyRange {
  weekIndex: number
  startDate: string
  endDate: string
}

function normalizeArray<T>(value: T[] | null | undefined): T[] {
  if (!value) {
    return []
  }

  return value.filter((item): item is T => item !== null && item !== undefined)
}

function toWeekTemplate(row: ClassLearningJournalWeekRow): LearningJournalWeekTemplate {
  return {
    id: row.id,
    classId: row.class_id,
    periodId: row.period_id,
    weekIndex: row.week_index,
    subject: row.subject,
    materialIds: normalizeArray(row.material_ids ?? []),
    materialTitles: normalizeArray(row.material_titles ?? []),
    materialNotes: row.material_notes,
    updatedAt: row.updated_at,
  }
}

function resolveEntryStudent(
  relation: LearningJournalEntryRow['student']
): { id: string; name: string | null; email: string | null } | null {
  if (!relation) {
    return null
  }

  if (Array.isArray(relation)) {
    return relation[0] ?? null
  }

  return relation
}

function toStudentSnapshot(
  profile: { id: string; name: string | null; email: string | null },
  entry: LearningJournalEntryRow | null
): LearningJournalStudentSnapshot {
  const entryStudent = entry ? resolveEntryStudent(entry.student) : null
  const name = profile.name ?? entryStudent?.name ?? entryStudent?.email ?? null
  const email = profile.email ?? entryStudent?.email ?? null

  return {
    entryId: entry?.id ?? null,
    studentId: profile.id,
    name,
    email,
    completionRate: entry?.completion_rate ?? null,
    status: entry?.status ?? 'draft',
    submittedAt: entry?.submitted_at ?? null,
    publishedAt: entry?.published_at ?? null,
  }
}

export async function fetchLearningJournalPeriodsForManager(): Promise<LearningJournalPeriodWithClass[]> {
  const supabase = createServerSupabase()

  const { data: periodRows, error: periodError } = await supabase
    .from('learning_journal_periods')
    .select(
      `id,
       class_id,
       start_date,
       end_date,
       label,
       status,
       created_by,
       locked_at,
       created_at,
       updated_at,
       classes:classes!learning_journal_periods_class_id_fkey(id, name)
      `
    )
    .order('start_date', { ascending: false })

  if (periodError) {
    console.error('[learning-journal] manager period fetch error', periodError)
    return []
  }

  const rows = (periodRows ?? []) as LearningJournalPeriodRow[]
  const classIds = Array.from(new Set(rows.map((row) => row.class_id)))

  let studentCountMap = new Map<string, number>()

  if (classIds.length > 0) {
    const { data: studentRows, error: studentError } = await supabase
      .from('class_students')
      .select('class_id, student_id')
      .in('class_id', classIds)

    if (studentError) {
      console.error('[learning-journal] student count fetch error', studentError)
    }

    studentCountMap = new Map(
      classIds.map((classId) => {
        const count = (studentRows ?? []).filter((row) => row.class_id === classId).length
        return [classId, count] as const
      })
    )
  }

  return rows.map((row) =>
    toPeriodWithClass(row, studentCountMap.get(row.class_id) ?? 0)
  )
}

export async function fetchLearningJournalPeriodsForClasses(
  classIds: string[]
): Promise<LearningJournalPeriodWithClass[]> {
  if (classIds.length === 0) {
    return []
  }

  const supabase = createServerSupabase()

  const { data: periodRows, error: periodError } = await supabase
    .from('learning_journal_periods')
    .select(
      `id,
       class_id,
       start_date,
       end_date,
       label,
       status,
       created_by,
       locked_at,
       created_at,
       updated_at,
       classes:classes!learning_journal_periods_class_id_fkey(id, name)
      `
    )
    .in('class_id', classIds)
    .order('start_date', { ascending: false })

  if (periodError) {
    console.error('[learning-journal] class period fetch error', periodError)
    return []
  }

  const rows = (periodRows ?? []) as LearningJournalPeriodRow[]

  const { data: studentRows, error: studentError } = await supabase
    .from('class_students')
    .select(
      `class_id,
       student_id,
       profiles:profiles!class_students_student_id_fkey(id, name, email)
      `
    )
    .in('class_id', classIds)

  if (studentError) {
    console.error('[learning-journal] class student fetch error', studentError)
  }

  const studentMap = new Map<string, ClassStudentRow[]>()
  for (const row of (studentRows ?? []) as ClassStudentRow[]) {
    const list = studentMap.get(row.class_id) ?? []
    list.push(row)
    studentMap.set(row.class_id, list)
  }

  return rows.map((row) => {
    const studentCount = studentMap.get(row.class_id)?.length ?? 0
    return toPeriodWithClass(row, studentCount)
  })
}

function createEmptyTemplateWeek(weekIndex: number) {
  return {
    weekIndex,
    subjects: LEARNING_JOURNAL_SUBJECTS.reduce<Record<LearningJournalSubject, {
      templateId: string | null
      materialIds: string[]
      materialTitles: string[]
      materialNotes: string | null
    }>>((acc, subject) => {
      acc[subject] = {
        templateId: null,
        materialIds: [],
        materialTitles: [],
        materialNotes: null,
      }
      return acc
    }, {} as Record<LearningJournalSubject, {
      templateId: string | null
      materialIds: string[]
      materialTitles: string[]
      materialNotes: string | null
    }>)
  }
}

export async function fetchClassLearningJournalTemplate(
  classId: string,
  periodId: string
): Promise<ClassLearningJournalTemplate> {
  const supabase = createServerSupabase()

  const { data, error } = await supabase
    .from('class_learning_journal_weeks')
    .select(
      `id,
       class_id,
       period_id,
       week_index,
       subject,
       material_ids,
       material_titles,
       material_notes,
       created_by,
       created_at,
       updated_at`
    )
    .eq('class_id', classId)
    .eq('period_id', periodId)

  if (error) {
    console.error('[learning-journal] fetch class template error', error)
    return {
      classId,
      periodId,
      weeks: [1, 2, 3, 4].map(createEmptyTemplateWeek),
    }
  }

  const rows = (data ?? []) as ClassLearningJournalWeekRow[]
  const lookup = new Map<string, LearningJournalWeekTemplate>()

  for (const row of rows) {
    const template = toWeekTemplate(row)
    const key = `${template.weekIndex}:${template.subject}`
    lookup.set(key, template)
  }

  const weeks = [1, 2, 3, 4].map((weekIndex) => {
    const week = createEmptyTemplateWeek(weekIndex)
    for (const subject of LEARNING_JOURNAL_SUBJECTS) {
      const key = `${weekIndex}:${subject}`
      const template = lookup.get(key)
      if (template) {
        week.subjects[subject] = {
          templateId: template.id,
          materialIds: template.materialIds,
          materialTitles: template.materialTitles,
          materialNotes: template.materialNotes,
        }
      }
    }
    return week
  })

  return {
    classId,
    periodId,
    weeks,
  }
}

export function resolveWeeklyRanges(period: LearningJournalPeriod): WeeklyRange[] {
  const startDate = DateUtil.toUTCDate(period.startDate)
  const weeks: WeeklyRange[] = []

  for (let index = 0; index < 4; index += 1) {
    const start = new Date(startDate)
    start.setUTCDate(start.getUTCDate() + index * 7)
    const end = new Date(start)
    end.setUTCDate(end.getUTCDate() + 6)

    weeks.push({
      weekIndex: index + 1,
      startDate: DateUtil.formatISODate(start),
      endDate: DateUtil.formatISODate(end),
    })
  }

  return weeks
}

export async function upsertClassLearningJournalWeek(
  input: UpsertClassLearningJournalWeekInput
): Promise<LearningJournalWeekTemplate | null> {
  const admin = createAdminClient()

  const payload = {
    class_id: input.classId,
    period_id: input.periodId,
    week_index: input.weekIndex,
    subject: input.subject,
    material_ids: input.materialIds ?? [],
    material_titles: input.materialTitles ?? [],
    material_notes: input.materialNotes ?? null,
    created_by: input.actorId,
  }

  const { data, error } = await admin
    .from('class_learning_journal_weeks')
    .upsert(payload, { onConflict: 'class_id,period_id,week_index,subject' })
    .select(
      `id,
       class_id,
       period_id,
       week_index,
       subject,
       material_ids,
       material_titles,
       material_notes,
       created_by,
       created_at,
       updated_at`
    )
    .maybeSingle()

  if (error) {
    console.error('[learning-journal] upsert class template error', error)
    return null
  }

  if (!data) {
    return null
  }

  return toWeekTemplate(data as ClassLearningJournalWeekRow)
}

export async function deleteClassLearningJournalWeek(
  classId: string,
  periodId: string,
  weekIndex: number,
  subject: LearningJournalSubject
): Promise<boolean> {
  const admin = createAdminClient()

  const { error } = await admin
    .from('class_learning_journal_weeks')
    .delete()
    .eq('class_id', classId)
    .eq('period_id', periodId)
    .eq('week_index', weekIndex)
    .eq('subject', subject)

  if (error) {
    console.error('[learning-journal] delete class template error', error)
    return false
  }

  return true
}

export async function fetchTeacherLearningJournalOverview(
  teacherId: string,
  options?: { includeAllClasses?: boolean }
) {
  const supabase = createServerSupabase()

  let teacherClasses: Array<{
    classId: string
    className: string
    description: string | null
    isHomeroom: boolean
  }> = []

  if (options?.includeAllClasses) {
    const { data: classRows, error: classError } = await supabase
      .from('classes')
      .select('id, name, description')
      .order('name', { ascending: true })

    if (classError) {
      console.error('[learning-journal] class list fetch error', classError)
    } else {
      teacherClasses = (classRows ?? []).map((row) => ({
        classId: row.id,
        className: row.name ?? '반 미지정',
        description: row.description ?? null,
        isHomeroom: false,
      }))
    }
  } else {
    const { data: teacherClassRows, error: teacherClassError } = await supabase
      .from('class_teachers')
      .select(
        `class_id,
         is_homeroom,
         classes:classes!class_teachers_class_id_fkey(id, name, description)
        `
      )
      .eq('teacher_id', teacherId)

    if (teacherClassError) {
      console.error('[learning-journal] teacher class fetch error', teacherClassError)
      return { periods: [], classes: [] }
    }

    teacherClasses = (teacherClassRows ?? []).map((row) => {
      const classRelation = Array.isArray(row.classes) ? row.classes[0] : row.classes
      return {
        classId: row.class_id,
        className: classRelation?.name ?? '반 미지정',
        description: classRelation?.description ?? null,
        isHomeroom: Boolean(row.is_homeroom),
      }
    })
  }

  const classIds = teacherClasses.map((item) => item.classId)
  const periods = await fetchLearningJournalPeriodsForClasses(classIds)

  const periodIds = periods.map((period) => period.id)

  const { data: entryRows, error: entryError } = await supabase
    .from('learning_journal_entries')
    .select(
      `id,
       period_id,
       student_id,
       status,
       completion_rate,
       last_generated_at,
       submitted_at,
       published_at,
       archived_at,
       created_at,
       updated_at,
       summary_json,
       weekly_json,
       student:profiles!learning_journal_entries_student_id_fkey(id, name, email)
      `
    )
    .in('period_id', periodIds)

  if (entryError) {
    console.error('[learning-journal] teacher entry fetch error', entryError)
  }

  const { data: classStudentRows, error: classStudentError } = await supabase
    .from('class_students')
    .select(
      `class_id,
       student_id,
       profiles:profiles!class_students_student_id_fkey(id, name, email)
      `
    )
    .in('class_id', classIds)

  if (classStudentError) {
    console.error('[learning-journal] teacher class student fetch error', classStudentError)
  }

  const entriesByPeriod = new Map<string, LearningJournalEntryRow[]>()
  for (const row of (entryRows ?? []) as LearningJournalEntryRow[]) {
    const list = entriesByPeriod.get(row.period_id) ?? []
    list.push(row)
    entriesByPeriod.set(row.period_id, list)
  }

  const studentsByClass = new Map<string, ClassStudentRow[]>()
  for (const row of (classStudentRows ?? []) as ClassStudentRow[]) {
    const list = studentsByClass.get(row.class_id) ?? []
    list.push(row)
    studentsByClass.set(row.class_id, list)
  }

  const snapshotsByPeriod = new Map<string, LearningJournalStudentSnapshot[]>()
  const studentsMissingProfile = new Set<string>()

  for (const period of periods) {
    let classStudents = studentsByClass.get(period.classId) ?? []
    const entries = entriesByPeriod.get(period.id) ?? []
    const entryMap = new Map(entries.map((entry) => [entry.student_id, entry] as const))

    if (classStudents.length === 0 && entries.length > 0) {
      classStudents = entries.map((entry) => ({
        class_id: period.classId,
        student_id: entry.student_id,
        profiles: entry.student ?? null,
      }))
    }

    const snapshots: LearningJournalStudentSnapshot[] = classStudents.map((studentRow) => {
      const profile = pickProfile(studentRow.profiles) ?? {
        id: studentRow.student_id,
        name: null,
        email: null,
      }

      const entry = entryMap.get(profile.id) ?? null
      const snapshot = toStudentSnapshot(profile, entry ?? null)

      if (!snapshot.name) {
        studentsMissingProfile.add(snapshot.studentId)
      }

      return snapshot
    })

    snapshotsByPeriod.set(period.id, snapshots)
  }

  if (studentsMissingProfile.size > 0) {
    try {
      const { data: missingProfiles, error: missingProfileError } = await supabase
        .from('profiles')
        .select('id, name, email')
        .in('id', Array.from(studentsMissingProfile))

      if (missingProfileError) {
        console.error('[learning-journal] missing profile fetch error', missingProfileError)
      }

      const profileLookup = new Map<string, { id: string; name: string | null; email: string | null }>()
      for (const profile of missingProfiles ?? []) {
        profileLookup.set(profile.id, {
          id: profile.id,
          name: profile.name ?? null,
          email: profile.email ?? null,
        })
      }

      for (const snapshots of snapshotsByPeriod.values()) {
        for (const snapshot of snapshots) {
          if (snapshot.name) {
            continue
          }

          const profile = profileLookup.get(snapshot.studentId)
          if (profile) {
            snapshot.name = profile.name ?? snapshot.name
            snapshot.email = profile.email ?? snapshot.email
          }
        }
      }
    } catch (error) {
      console.error('[learning-journal] missing profile unexpected error', error)
    }
  }

  return {
    periods,
    classes: teacherClasses,
    studentSnapshots: snapshotsByPeriod,
  }
}

export async function fetchLearningJournalEntryDetail(entryId: string): Promise<LearningJournalEntryDetail | null> {
  if (!entryId) {
    return null
  }

  const supabase = createServerSupabase()

  const { data: row, error } = await supabase
    .from('learning_journal_entries')
    .select(
      `id,
       period_id,
       student_id,
       status,
       completion_rate,
       last_generated_at,
       submitted_at,
       published_at,
       archived_at,
       created_at,
       updated_at,
       summary_json,
       weekly_json
      `
    )
    .eq('id', entryId)
    .maybeSingle()

  if (error) {
    console.error('[learning-journal] entry detail fetch error', error)
    return null
  }

  if (!row) {
    return null
  }

  const entry = row as LearningJournalEntryRow

  return {
    id: entry.id,
    periodId: entry.period_id,
    studentId: entry.student_id,
    status: entry.status,
    completionRate: entry.completion_rate,
    lastGeneratedAt: entry.last_generated_at,
    submittedAt: entry.submitted_at,
    publishedAt: entry.published_at,
    archivedAt: entry.archived_at,
    summary: entry.summary_json,
    weekly: entry.weekly_json,
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
  }
}

interface EntryWeeklyGenerationRow {
  id: string
  student_id: string
  period_id: string
  status: string
  period?:
    | {
        id: string
        class_id: string
        start_date: string
        end_date: string
        label: string | null
        status: string
        created_by: string
        locked_at: string | null
        created_at: string
        updated_at: string
      }
    | Array<{
        id: string
        class_id: string
        start_date: string
        end_date: string
        label: string | null
        status: string
        created_by: string
        locked_at: string | null
        created_at: string
        updated_at: string
      }>
    | null
}

interface StudentTaskWeeklyRow {
  id: string
  status: string
  completion_at: string | null
  progress_meta: Record<string, unknown> | null
  assignments?:
    | {
        id: string
        due_at: string | null
        target_scope: string | null
        workbook?:
          | {
              id: string
              title: string | null
              subject: string | null
              week_label: string | null
            }
          | Array<{
              id: string
              title: string | null
              subject: string | null
              week_label: string | null
            }>
          | null
        assignment_targets?:
          | Array<{
              class_id: string | null
              student_id: string | null
            }>
          | {
              class_id: string | null
              student_id: string | null
            }
          | null
      }
    | Array<{
        id: string
        due_at: string | null
        target_scope: string | null
        workbook?:
          | {
              id: string
              title: string | null
              subject: string | null
              week_label: string | null
            }
          | Array<{
              id: string
              title: string | null
              subject: string | null
              week_label: string | null
            }>
          | null
        assignment_targets?:
          | Array<{
              class_id: string | null
              student_id: string | null
            }>
          | {
              class_id: string | null
              student_id: string | null
            }
          | null
      }>
    | null
}

function pickSingleRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null
  }
  return Array.isArray(value) ? value[0] ?? null : value
}

function initializeWeeklySubjectData(): Record<LearningJournalSubject, LearningJournalWeeklySubjectData> {
  return LEARNING_JOURNAL_SUBJECTS.reduce((acc, subject) => {
    acc[subject] = {
      materials: [],
      assignments: [],
    }
    return acc
  }, {} as Record<LearningJournalSubject, LearningJournalWeeklySubjectData>)
}

function extractScore(meta: Record<string, unknown> | null): number | null {
  if (!meta) {
    return null
  }

  const raw = meta.score ?? meta.totalScore ?? meta.finalScore

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw
  }

  if (typeof raw === 'string') {
    const parsed = Number.parseFloat(raw)
    if (!Number.isNaN(parsed)) {
      return parsed
    }
  }

  return null
}

export async function generateLearningJournalWeeklyData(entryId: string): Promise<LearningJournalWeeklyData[] | null> {
  if (!entryId) {
    return null
  }

  const supabase = createServerSupabase()

  const { data: entryRow, error: entryError } = await supabase
    .from('learning_journal_entries')
    .select(
      `id,
       student_id,
       period_id,
       status,
       period:learning_journal_periods!inner(
         id,
         class_id,
         start_date,
         end_date,
         label,
         status,
         created_by,
         locked_at,
         created_at,
         updated_at
       )
      `
    )
    .eq('id', entryId)
    .maybeSingle<EntryWeeklyGenerationRow>()

  if (entryError) {
    console.error('[learning-journal] weekly entry fetch error', entryError)
    return null
  }

  if (!entryRow) {
    return null
  }

  const periodRelation = pickSingleRelation(entryRow.period)

  if (!periodRelation) {
    return null
  }

  const period: LearningJournalPeriod = {
    id: periodRelation.id,
    classId: periodRelation.class_id,
    startDate: periodRelation.start_date,
    endDate: periodRelation.end_date,
    label: periodRelation.label ?? null,
    status: (periodRelation.status ?? 'draft') as LearningJournalPeriod['status'],
    createdBy: periodRelation.created_by,
    lockedAt: periodRelation.locked_at,
    createdAt: periodRelation.created_at,
    updatedAt: periodRelation.updated_at,
  }

  const template = await fetchClassLearningJournalTemplate(period.classId, period.id)
  const weeklyRanges = resolveWeeklyRanges(period)

  const { data: taskRows, error: taskError } = await supabase
    .from('student_tasks')
    .select(
      `id,
       status,
       completion_at,
       progress_meta,
       assignments:assignments!student_tasks_assignment_id_fkey(
         id,
         due_at,
         target_scope,
         workbook:workbooks!assignments_workbook_id_fkey(
           id,
           title,
           subject,
           week_label
         ),
         assignment_targets:assignment_targets!assignment_targets_assignment_id_fkey(
           class_id,
           student_id
         )
       )
      `
    )
    .eq('student_id', entryRow.student_id)

  if (taskError) {
    console.error('[learning-journal] weekly student task fetch error', taskError)
  }

  const assignmentMap = new Map<number, Map<LearningJournalSubject, LearningJournalWeekAssignmentItem[]>>()

  for (const row of (taskRows ?? []) as StudentTaskWeeklyRow[]) {
    const assignmentRelation = pickSingleRelation(row.assignments)
    if (!assignmentRelation) {
      continue
    }

    const workbook = pickSingleRelation(assignmentRelation.workbook)
    const subjectRaw = workbook?.subject ?? null

    if (!isLearningJournalSubject(subjectRaw)) {
      continue
    }

    const targets = toArray(assignmentRelation.assignment_targets)
    const hasMatchingTarget =
      targets.length === 0 ||
      targets.some((target) => {
        const classMatch = target?.class_id ? target.class_id === period.classId : false
        const studentMatch = target?.student_id ? target.student_id === entryRow.student_id : false
        return classMatch || studentMatch
      })

    if (!hasMatchingTarget) {
      continue
    }

    const weekIndexFromLabel = extractWeekIndex(workbook?.week_label ?? null)
    const weekIndexFromDate = deriveWeekIndexFromDate(assignmentRelation.due_at, weeklyRanges)
    const weekIndex = weekIndexFromLabel ?? weekIndexFromDate

    if (!weekIndex || weekIndex < 1 || weekIndex > 4) {
      continue
    }

    const subjectAssignments = (() => {
      if (!assignmentMap.has(weekIndex)) {
        assignmentMap.set(weekIndex, new Map())
      }
      const weekBucket = assignmentMap.get(weekIndex) as Map<LearningJournalSubject, LearningJournalWeekAssignmentItem[]>
      if (!weekBucket.has(subjectRaw)) {
        weekBucket.set(subjectRaw, [])
      }
      return weekBucket.get(subjectRaw) as LearningJournalWeekAssignmentItem[]
    })()

    const progressMeta = (row.progress_meta ?? null) as Record<string, unknown> | null

    subjectAssignments.push({
      id: row.id,
      title: workbook?.title ?? '과제',
      status: normalizeAssignmentStatus(row.status),
      dueDate: assignmentRelation.due_at,
      submittedAt: row.completion_at,
      score: extractScore(progressMeta),
      note: null,
    })
  }

  const weeks: LearningJournalWeeklyData[] = WEEK_INDICES.map((weekIndex) => {
    const range = weeklyRanges.find((item) => item.weekIndex === weekIndex)
    const templateWeek = template.weeks.find((item) => item.weekIndex === weekIndex)
    const subjects = initializeWeeklySubjectData()
    const assignmentBucket = assignmentMap.get(weekIndex)

    for (const subject of LEARNING_JOURNAL_SUBJECTS) {
      const config = templateWeek?.subjects[subject]
      const assignments = assignmentBucket?.get(subject) ?? []
      assignments.sort((a, b) => {
        const aTime = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY
        const bTime = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY
        return aTime - bTime
      })

      if (config) {
        const materials: LearningJournalWeeklySubjectData['materials'] = []
        const maxLength = Math.max(config.materialIds.length, config.materialTitles.length)

        for (let index = 0; index < maxLength; index += 1) {
          const materialTitle = config.materialTitles[index] ?? ''
          if (!materialTitle) {
            continue
          }

          const materialId = config.materialIds[index] ?? null

          materials.push({
            templateId: config.templateId,
            title: materialTitle,
            note: config.materialNotes ?? null,
            sourceType: materialId ? 'class_material' : 'custom',
            sourceId: materialId,
          })
        }

        subjects[subject] = {
          materials,
          assignments,
          summaryNote: config.materialNotes ?? null,
        }
      } else {
        subjects[subject] = {
          materials: [],
          assignments,
        }
      }
    }

    return {
      weekIndex,
      startDate: range?.startDate ?? period.startDate,
      endDate: range?.endDate ?? period.endDate,
      subjects,
    }
  })

  return weeks
}

export async function refreshLearningJournalWeeklyData(entryId: string): Promise<LearningJournalWeeklyData[] | null> {
  const weeklyData = await generateLearningJournalWeeklyData(entryId)

  if (!weeklyData) {
    return null
  }

  const supabase = createServerSupabase()
  const nowIso = DateUtil.toISOString(new Date())

  const { error } = await supabase
    .from('learning_journal_entries')
    .update({
      weekly_json: weeklyData,
      last_generated_at: nowIso,
    })
    .eq('id', entryId)

  if (error) {
    console.error('[learning-journal] weekly update error', error)
    return null
  }

  return weeklyData
}


function pickPeriod(row: StudentEntryRow['period']) {
  if (!row) {
    return null
  }

  if (Array.isArray(row)) {
    return row[0] ?? null
  }

  return row
}

function pickClassFromPeriod(period: NonNullable<ReturnType<typeof pickPeriod>>) {
  const relation = period.classes
  if (!relation) {
    return null
  }

  if (Array.isArray(relation)) {
    return relation[0] ?? null
  }

  return relation
}

export async function fetchLatestPublishedLearningJournalEntry(
  studentId: string
): Promise<StudentLearningJournalSnapshot | null> {
  if (!studentId) {
    return null
  }

  const supabase = createServerSupabase()

  const { data, error } = await supabase
    .from('learning_journal_entries')
    .select(
      `id,
       period_id,
       student_id,
       status,
       completion_rate,
       last_generated_at,
       submitted_at,
       published_at,
       archived_at,
       created_at,
       updated_at,
       summary_json,
       weekly_json,
       period:learning_journal_periods!learning_journal_entries_period_id_fkey(
         id,
         class_id,
         start_date,
         end_date,
         label,
         status,
         classes:classes!learning_journal_periods_class_id_fkey(id, name)
       )
      `
    )
    .eq('student_id', studentId)
    .eq('status', 'published')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[learning-journal] student latest entry error', error)
    return null
  }

  if (!data) {
    return null
  }

  const row = data as StudentEntryRow
  const pickedPeriod = pickPeriod(row.period)

  if (!pickedPeriod) {
    return null
  }

  const classInfo = pickClassFromPeriod(pickedPeriod)

  const entryDetail: LearningJournalEntryDetail = {
    id: row.id,
    periodId: row.period_id,
    studentId: row.student_id,
    status: row.status,
    completionRate: row.completion_rate,
    lastGeneratedAt: row.last_generated_at,
    submittedAt: row.submitted_at,
    publishedAt: row.published_at,
    archivedAt: row.archived_at,
    summary: row.summary_json,
    weekly: row.weekly_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }

  return {
    entry: entryDetail,
    period: {
      id: pickedPeriod.id,
      classId: pickedPeriod.class_id,
      className: classInfo?.name ?? '반 미지정',
      startDate: pickedPeriod.start_date,
      endDate: pickedPeriod.end_date,
      label: pickedPeriod.label ?? null,
      status: pickedPeriod.status as LearningJournalPeriod['status'],
    },
  }
}

export async function fetchLearningJournalEntriesForReview(params: {
  status?: 'submitted' | 'published' | 'draft' | 'all'
  classId?: string | null
  periodId?: string | null
}): Promise<ReviewEntrySummary[]> {
  const supabase = createServerSupabase()

  let query = supabase
    .from('learning_journal_entries')
    .select(
      `id,
       status,
       completion_rate,
       submitted_at,
       published_at,
       created_at,
       updated_at,
       student:profiles!learning_journal_entries_student_id_fkey(id, name, email),
       period:learning_journal_periods!learning_journal_entries_period_id_fkey(
         id,
         start_date,
         end_date,
         label,
         class_id,
         classes:classes!learning_journal_periods_class_id_fkey(id, name)
       )`
    )

  const statusFilter = params.status ?? 'submitted'

  if (statusFilter !== 'all') {
    query = query.eq('status', statusFilter)
  }

  if (params.periodId) {
    query = query.eq('period_id', params.periodId)
  } else if (params.classId) {
    const { data: periodRows, error: periodError } = await supabase
      .from('learning_journal_periods')
      .select('id')
      .eq('class_id', params.classId)

    if (periodError) {
      console.error('[learning-journal] review period fetch error', periodError)
    } else if (periodRows && periodRows.length > 0) {
      query = query.in('period_id', periodRows.map((period) => period.id))
    }
  }

  const { data, error } = await query.order('submitted_at', { ascending: false, nullsFirst: false })

  if (error) {
    console.error('[learning-journal] fetch review entries error', error)
    return []
  }

  return (data ?? []).map((row) => toReviewEntry(row as ReviewEntryRow))
}

export async function fetchLearningJournalPeriodStats(
  periodIds: string[]
): Promise<Map<string, LearningJournalPeriodStats>> {
  if (periodIds.length === 0) {
    return new Map()
  }

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('learning_journal_entries')
    .select('period_id, status')
    .in('period_id', periodIds)

  if (error) {
    console.error('[learning-journal] period stats fetch error', error)
    return new Map()
  }

  const stats = new Map<string, LearningJournalPeriodStats>()

  for (const row of (data ?? []) as { period_id: string; status: LearningJournalEntryStatus }[]) {
    const existing = stats.get(row.period_id) ?? {
      periodId: row.period_id,
      totalEntries: 0,
      submittedCount: 0,
      publishedCount: 0,
    }

    existing.totalEntries += 1
    if (row.status === 'submitted') {
      existing.submittedCount += 1
    }
    if (row.status === 'published') {
      existing.publishedCount += 1
    }

    stats.set(row.period_id, existing)
  }

  return stats
}

export async function fetchLearningJournalComments(entryId: string): Promise<LearningJournalComment[]> {
  if (!entryId) {
    return []
  }

  const supabase = createServerSupabase()

  const { data, error } = await supabase
    .from('learning_journal_comments')
    .select('id, entry_id, role_scope, subject, teacher_id, body, created_at, updated_at')
    .eq('entry_id', entryId)
    .order('role_scope', { ascending: true })

  if (error) {
    console.error('[learning-journal] comment fetch error', error)
    return []
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    entryId: row.entry_id,
    roleScope: row.role_scope,
    subject: (row.subject ?? null) as LearningJournalComment['subject'],
    teacherId: row.teacher_id ?? null,
    body: row.body ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

export async function fetchLearningJournalEntryLogs(entryId: string): Promise<LearningJournalEntryLog[]> {
  if (!entryId) {
    return []
  }

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('learning_journal_entry_logs')
    .select('id, entry_id, previous_status, next_status, changed_by, note, created_at')
    .eq('entry_id', entryId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[learning-journal] entry log fetch error', error)
    return []
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    entryId: row.entry_id,
    previousStatus: row.previous_status,
    nextStatus: row.next_status,
    changedBy: row.changed_by ?? null,
    note: row.note ?? null,
    createdAt: row.created_at,
  }))
}

export async function fetchLearningJournalGreeting(monthToken: string): Promise<LearningJournalGreeting | null> {
  if (!monthToken) {
    return null
  }

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('learning_journal_greetings')
    .select('month_token, message, principal_id, published_at, created_at, updated_at')
    .eq('month_token', monthToken)
    .maybeSingle()

  if (error) {
    console.error('[learning-journal] greeting fetch error', error)
    return null
  }

  if (!data) {
    return null
  }

  const row = data as GreetingRow

  const greeting: LearningJournalGreeting = {
    monthToken: row.month_token,
    message: row.message,
    principalId: row.principal_id,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }

  return greeting
}

export async function fetchLearningJournalAcademicEvents(monthTokens: string[]): Promise<LearningJournalAcademicEvent[]> {
  if (monthTokens.length === 0) {
    return []
  }

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('learning_journal_academic_events')
    .select('id, month_token, title, start_date, end_date, memo, created_by, created_at, updated_at')
    .in('month_token', monthTokens)
    .order('start_date', { ascending: true })

  if (error) {
    console.error('[learning-journal] academic events fetch error', error)
    return []
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    monthToken: row.month_token,
    title: row.title,
    startDate: row.start_date,
    endDate: row.end_date ?? null,
    memo: row.memo ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

export const LEARNING_JOURNAL_SUBJECT_OPTIONS = LEARNING_JOURNAL_SUBJECTS.map((subject) => ({
  value: subject,
  label:
    subject === 'directing'
      ? '연출론'
      : subject === 'screenwriting'
        ? '작법론'
        : '영화연구',
}))
