import type { Metadata } from 'next'
import Link from 'next/link'

import { requireAuthForDashboard } from '@/lib/auth'
import {
  fetchClassFormationBoard,
  fetchClassFormationPlans,
  fetchTeacherOptions,
} from '@/lib/class-formation/data'
import { weekdayPreferenceLabel } from '@/lib/university-confirmation/constants'
import type { FormationStudent } from '@/types/class-formation'
import PrintButton from '@/app/dashboard/principal/university-reports/wishlists/print/PrintButton'

export const metadata: Metadata = {
  title: '반편성 인쇄 | 지원가능대학 레포트',
}

type SearchParams = Record<string, string | string[] | undefined>

function UniversityList({ student }: { student: FormationStudent }) {
  if (student.universities.length === 0) {
    return <span className="text-xs text-slate-400">지원 대학 없음</span>
  }
  return (
    <span className="text-xs text-slate-600">
      {student.universities
        .map((u) => `${u.shortName ?? u.universityName} ${u.programName}`)
        .join(' / ')}
    </span>
  )
}

function StudentMeta({ student }: { student: FormationStudent }) {
  return (
    <span className="text-xs text-slate-500">
      {student.className ?? '현재 반 없음'}
      {student.weekdayPreferences.length > 0
        ? ` · ${student.weekdayPreferences.map(weekdayPreferenceLabel).join('·')}`
        : ''}
      {!student.isConfirmed ? ' · 미확정' : ''}
    </span>
  )
}

export default async function ClassFormationPrintPage(props: {
  searchParams?: Promise<SearchParams>
}) {
  await requireAuthForDashboard('principal')

  const searchParams = await props.searchParams
  const planParam = searchParams?.plan
  const requestedPlanId = Array.isArray(planParam) ? planParam[0] : planParam

  const [plans, teacherOptions] = await Promise.all([
    fetchClassFormationPlans(),
    fetchTeacherOptions(),
  ])

  const activePlanId =
    requestedPlanId && plans.some((plan) => plan.id === requestedPlanId)
      ? requestedPlanId
      : plans[0]?.id ?? null

  const board = activePlanId ? await fetchClassFormationBoard(activePlanId) : null

  if (!board) {
    return (
      <section className="space-y-4">
        <p className="text-sm text-slate-500">인쇄할 반편성안이 없습니다.</p>
        <Link
          href="/dashboard/principal/university-reports/wishlists"
          className="text-sm text-sky-600 underline underline-offset-2"
        >
          반편성 화면으로 돌아가기
        </Link>
      </section>
    )
  }

  const teacherNameById = new Map(
    teacherOptions.map((teacher) => [teacher.id, teacher.name ?? teacher.email ?? '이름 없음'])
  )
  const studentsById = new Map(board.students.map((student) => [student.studentId, student]))

  const unassignedStudents = board.students
    .filter((student) => !board.assignments[student.studentId])
    .sort((a, b) => a.studentName.localeCompare(b.studentName, 'ko'))

  const printedAt = new Date().toLocaleString('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  return (
    <section className="space-y-6 print:space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link
          href={`/dashboard/principal/university-reports/wishlists${activePlanId ? `?plan=${activePlanId}` : ''}`}
          className="text-sm text-sky-600 underline underline-offset-2"
        >
          ← 반편성 화면으로 돌아가기
        </Link>
        <PrintButton />
      </div>

      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-slate-900">반편성표 — {board.plan.name}</h1>
        <p className="text-xs text-slate-500">
          출력일 {printedAt} · 전체 {board.students.length}명 · 배치{' '}
          {Object.keys(board.assignments).length}명 · 미배정 {unassignedStudents.length}명
        </p>
      </header>

      {/* 편성 반별 명단 */}
      <div className="space-y-3">
        <h2 className="border-b border-slate-300 pb-1 text-sm font-semibold text-slate-800">
          편성 반 ({board.groups.length})
        </h2>
        {board.groups.length === 0 ? (
          <p className="text-xs text-slate-400">편성된 반이 없습니다.</p>
        ) : (
          board.groups.map((group) => {
            const members = group.memberIds
              .map((id) => studentsById.get(id))
              .filter((member): member is FormationStudent => Boolean(member))
            const teacherName = group.homeroomTeacherId
              ? teacherNameById.get(group.homeroomTeacherId) ?? null
              : null
            return (
              <div
                key={group.id}
                className="break-inside-avoid rounded-md border border-slate-300 p-3"
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-slate-200 pb-1.5">
                  <span className="text-sm font-semibold text-slate-900">{group.name}</span>
                  <span className="text-xs text-slate-500">
                    {group.weekday ? weekdayPreferenceLabel(group.weekday) : '요일 미지정'} · 담임{' '}
                    {teacherName ?? '미지정'} · {members.length}명
                  </span>
                  {group.note ? (
                    <span className="text-xs text-slate-400">비고: {group.note}</span>
                  ) : null}
                </div>
                {members.length === 0 ? (
                  <p className="pt-2 text-xs text-slate-400">배치된 학생이 없습니다.</p>
                ) : (
                  <ol className="divide-y divide-slate-100 pt-1">
                    {members.map((member, index) => (
                      <li key={member.studentId} className="flex gap-2 py-1.5">
                        <span className="w-5 shrink-0 text-right text-xs text-slate-400">
                          {index + 1}
                        </span>
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <span className="text-sm font-medium text-slate-900">
                              {member.studentName}
                            </span>
                            <StudentMeta student={member} />
                          </div>
                          <UniversityList student={member} />
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* 미배정 학생 명단 */}
      <div className="space-y-3">
        <h2 className="border-b border-slate-300 pb-1 text-sm font-semibold text-slate-800">
          미배정 학생 ({unassignedStudents.length})
        </h2>
        {unassignedStudents.length === 0 ? (
          <p className="text-xs text-slate-400">모든 학생이 반에 배치되었습니다.</p>
        ) : (
          <ol className="divide-y divide-slate-100">
            {unassignedStudents.map((student, index) => (
              <li key={student.studentId} className="flex break-inside-avoid gap-2 py-1.5">
                <span className="w-5 shrink-0 text-right text-xs text-slate-400">{index + 1}</span>
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-medium text-slate-900">{student.studentName}</span>
                    <StudentMeta student={student} />
                  </div>
                  <UniversityList student={student} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}
