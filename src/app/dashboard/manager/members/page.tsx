import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { ManagerMembersPageClient } from '@/components/dashboard/manager/members/ManagerMembersPageClient'
import { requireAuthForDashboard } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { UserRole } from '@/lib/supabase'

interface ClassAssignmentSummary {
  id: string
  name: string
  isHomeroom: boolean
}

interface ManagerMemberSummary {
  id: string
  name: string | null
  email: string
  role: UserRole
  studentPhone: string | null
  parentPhone: string | null
  academicRecord: string | null
  approvedAt: string
  updatedAt: string
  classAssignments: ClassAssignmentSummary[]
}

interface ManagerMembersPageData {
  classes: Array<{ id: string; name: string }>
  members: ManagerMemberSummary[]
}

function extractClass(row: unknown): { id: string; name: string } | null {
  if (!row || typeof row !== 'object') {
    return null
  }

  const candidate = row as { id?: unknown; name?: unknown }

  if (typeof candidate.id === 'string' && typeof candidate.name === 'string') {
    return { id: candidate.id, name: candidate.name }
  }

  if (Array.isArray(row)) {
    const first = row[0]
    if (first && typeof first === 'object') {
      const nested = first as { id?: unknown; name?: unknown }
      if (typeof nested.id === 'string' && typeof nested.name === 'string') {
        return { id: nested.id, name: nested.name }
      }
    }
  }

  return null
}

export default async function ManagerMembersPage() {
  await requireAuthForDashboard('manager')

  const supabase = await createClient()

  const [{ data: profileRows, error: profileError }, { data: classRows, error: classError }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, role, name, student_phone, parent_phone, academic_record, created_at, updated_at, status')
      .eq('status', 'approved')
      .order('name', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    supabase
      .from('classes')
      .select('id, name')
      .order('name', { ascending: true }),
  ])

  if (profileError) {
    console.error('[manager] members profile load error', profileError)
  }

  if (classError) {
    console.error('[manager] classes load error', classError)
  }

  const approvedProfiles = (profileRows ?? []).filter((row) => row.status === 'approved')
  const studentIds = approvedProfiles.filter((row) => row.role === 'student').map((row) => row.id)
  const teacherIds = approvedProfiles.filter((row) => row.role === 'teacher').map((row) => row.id)

  const [studentAssignmentsResult, teacherAssignmentsResult] = await Promise.all([
    studentIds.length
      ? supabase
        .from('class_students')
        .select('class_id, student_id, classes(id, name)')
        .in('student_id', studentIds)
      : Promise.resolve({ data: null, error: null }),
    teacherIds.length
      ? supabase
        .from('class_teachers')
        .select('class_id, teacher_id, is_homeroom, classes(id, name)')
        .in('teacher_id', teacherIds)
      : Promise.resolve({ data: null, error: null }),
  ])

  if (studentAssignmentsResult.error) {
    console.error('[manager] load student assignments error', studentAssignmentsResult.error)
  }

  if (teacherAssignmentsResult.error) {
    console.error('[manager] load teacher assignments error', teacherAssignmentsResult.error)
  }

  const studentAssignmentsMap = new Map<string, ClassAssignmentSummary[]>()
  const teacherAssignmentsMap = new Map<string, ClassAssignmentSummary[]>()

  for (const row of studentAssignmentsResult.data ?? []) {
    const classInfo = extractClass(row.classes)
    if (!classInfo) continue

    const list = studentAssignmentsMap.get(row.student_id) ?? []
    list.push({ id: classInfo.id, name: classInfo.name, isHomeroom: false })
    studentAssignmentsMap.set(row.student_id, list)
  }

  for (const row of teacherAssignmentsResult.data ?? []) {
    const classInfo = extractClass(row.classes)
    if (!classInfo) continue

    const list = teacherAssignmentsMap.get(row.teacher_id) ?? []
    list.push({ id: classInfo.id, name: classInfo.name, isHomeroom: !!row.is_homeroom })
    teacherAssignmentsMap.set(row.teacher_id, list)
  }

  const members: ManagerMemberSummary[] = approvedProfiles.map((row) => {
    const assignments =
      row.role === 'student'
        ? studentAssignmentsMap.get(row.id) ?? []
        : row.role === 'teacher'
          ? (teacherAssignmentsMap.get(row.id) ?? []).sort((a, b) => {
            if (a.isHomeroom === b.isHomeroom) {
              return a.name.localeCompare(b.name, 'ko')
            }
            return a.isHomeroom ? -1 : 1
          })
          : []

    return {
      id: row.id,
      name: row.name ?? null,
      email: row.email,
      role: row.role,
      studentPhone: row.student_phone ?? null,
      parentPhone: row.parent_phone ?? null,
      academicRecord: row.academic_record ?? null,
      approvedAt: row.created_at,
      updatedAt: row.updated_at,
      classAssignments: assignments,
    }
  })

  const pageData: ManagerMembersPageData = {
    classes: (classRows ?? []).map((row) => ({ id: row.id, name: row.name })).sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    members,
  }

  return (
    <section className="space-y-6">
      <DashboardBackLink fallbackHref="/dashboard/manager" label="대시보드로 돌아가기" />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">구성원 관리</h1>
        <p className="text-sm text-slate-600">승인된 구성원의 연락처와 반 배정을 관리하세요.</p>
      </div>
      <ManagerMembersPageClient initialData={pageData} />
    </section>
  )
}
