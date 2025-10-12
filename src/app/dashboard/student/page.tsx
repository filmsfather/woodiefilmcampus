import Link from 'next/link'

import { DashboardCard } from '@/components/dashboard/DashboardCard'
import { Button } from '@/components/ui/button'
import { requireAuthForDashboard } from '@/lib/auth'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

type ActionVariant = 'default' | 'secondary' | 'outline'

interface DashboardActionItem {
  label: string
  href: string
  description: string
  variant: ActionVariant
}

const TODO_ACTIONS: DashboardActionItem[] = [
  {
    label: '이번달 학습 계획',
    href: '/dashboard/student/monthly-plan',
    description: '과목별 커리큘럼을 살펴보고 월간 학습 동선을 한눈에 정리합니다.',
    variant: 'default',
  },
  {
    label: '이번주 문제집 풀기',
    href: '/dashboard/student/tasks',
    description: '이번 주 배정된 문제집으로 바로 이동해 과제를 마무리합니다.',
    variant: 'secondary',
  },
]

const DONE_ACTIONS: DashboardActionItem[] = [
  {
    label: '지난달 학습 일지',
    href: '/dashboard/student/learning-journal',
    description: '지난달 학습 흐름과 피드백을 되돌아보며 개선 포인트를 찾습니다.',
    variant: 'default',
  },
  {
    label: '영화 감상 일지',
    href: '/dashboard/student/film-notes',
    description: '감상한 영화와 느낀 점을 차곡차곡 기록해 기억과 통찰을 정리합니다.',
    variant: 'secondary',
  },
  {
    label: '작품 아틀리에',
    href: '/dashboard/student/atelier',
    description: '다른 친구들의 과제를 둘러보고 배울 점을 발견해 자신의 작품에 반영해 보세요.',
    variant: 'outline',
  },
]

export default async function StudentDashboardPage() {
  const { profile } = await requireAuthForDashboard('student')

  if (!profile) {
    return null
  }

  const displayName = profile.name ?? profile.email ?? '학생'

  const supabase = createServerSupabase()

  const { data: membershipRows, error: membershipError } = await supabase
    .from('class_students')
    .select('class_id')
    .eq('student_id', profile.id)

  if (membershipError) {
    console.error('[student-dashboard] failed to fetch student class memberships', membershipError)
  }

  const classIdSet = new Set<string>()
  if (profile.class_id) {
    classIdSet.add(profile.class_id)
  }

  for (const row of membershipRows ?? []) {
    if (row.class_id) {
      classIdSet.add(row.class_id)
    }
  }

  type RawClassRow = {
    id: string
    name: string | null
    description: string | null
    homeroom_teacher_id: string | null
    class_teachers: Array<{
      teacher_id: string | null
      is_homeroom: boolean | null
      profiles:
        | {
            id: string | null
            name: string | null
            email: string | null
          }
        | Array<{
            id: string | null
            name: string | null
            email: string | null
          }>
          | null
    }> | null
  }

  let classInfos: Array<{
    id: string
    name: string
    description: string | null
    homeroomTeacher: {
      id: string
      name: string | null
      email: string | null
    } | null
    otherTeachers: Array<{
      id: string
      name: string | null
      email: string | null
    }>
  }> = []

  const classIds = Array.from(classIdSet)

  if (classIds.length > 0) {
    const { data: classRows, error: classError } = await supabase
      .from('classes')
      .select(
        `id, name, description, homeroom_teacher_id,
         class_teachers(
           teacher_id,
           is_homeroom,
           profiles(id, name, email)
         )`
      )
      .in('id', classIds)

    if (classError) {
      console.error('[student-dashboard] failed to fetch class info', classError)
    }

    classInfos = (classRows as RawClassRow[] | null)?.map((row) => {
      const teacherSummaries: Array<{
        id: string
        name: string | null
        email: string | null
        isHomeroom: boolean
      }> = []

      for (const assignment of row.class_teachers ?? []) {
        const teacherProfile = Array.isArray(assignment.profiles)
          ? assignment.profiles[0]
          : assignment.profiles

        const teacherId = assignment.teacher_id ?? teacherProfile?.id ?? null

        if (!teacherId) {
          continue
        }

        teacherSummaries.push({
          id: teacherId,
          name: teacherProfile?.name ?? null,
          email: teacherProfile?.email ?? null,
          isHomeroom: assignment.is_homeroom ?? teacherId === row.homeroom_teacher_id,
        })
      }

      if (
        row.homeroom_teacher_id &&
        !teacherSummaries.some((teacher) => teacher.id === row.homeroom_teacher_id)
      ) {
        teacherSummaries.unshift({
          id: row.homeroom_teacher_id,
          name: null,
          email: null,
          isHomeroom: true,
        })
      }

      const byLabel = (value: { name: string | null; email: string | null }) =>
        (value.name ?? value.email ?? '').toLowerCase()

      const homeroomTeacher = teacherSummaries.find((teacher) => teacher.isHomeroom) ?? null
      const otherTeachers = teacherSummaries
        .filter((teacher) => !teacher.isHomeroom)
        .sort((left, right) => byLabel(left).localeCompare(byLabel(right), 'ko'))

      return {
        id: row.id,
        name: row.name ?? '이름 미정',
        description: row.description ?? null,
        homeroomTeacher,
        otherTeachers,
      }
    })?.sort((a, b) => a.name.localeCompare(b.name, 'ko')) ?? []
  }

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">학생 대시보드</h1>
        <p className="text-sm text-slate-600">{displayName}님, 필요한 학습 메뉴를 선택해 다음 단계를 준비해 보세요.</p>
      </div>

      <DashboardCard
        title="반 정보"
        description="현재 소속된 반과 담당 교사 정보를 확인할 수 있습니다."
      >
        {classInfos.length === 0 ? (
          <p className="text-sm text-slate-600">
            소속 반 정보가 확인되지 않습니다. 담임 선생님께 반 등록을 요청해주세요.
          </p>
        ) : (
          <div className="space-y-4">
            {classInfos.map((classInfo) => (
              <div key={classInfo.id} className="rounded-md border border-slate-200 p-4">
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-slate-900">{classInfo.name}</h3>
                  {classInfo.description && (
                    <p className="text-sm text-slate-600">{classInfo.description}</p>
                  )}
                </div>

                <dl className="mt-3 grid gap-2 text-sm text-slate-700">
                  <div className="flex flex-wrap gap-1">
                    <dt className="font-medium text-slate-800">담임교사</dt>
                    <dd className="flex-none">:</dd>
                    <dd className="flex-1 text-slate-600">
                      {classInfo.homeroomTeacher
                        ? classInfo.homeroomTeacher.name ?? classInfo.homeroomTeacher.email ?? '이름 미정'
                        : '미지정'}
                    </dd>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <dt className="font-medium text-slate-800">담당교사</dt>
                    <dd className="flex-none">:</dd>
                    <dd className="flex-1 text-slate-600">
                      {classInfo.otherTeachers.length > 0 ? (
                        classInfo.otherTeachers
                          .map((teacher) => teacher.name ?? teacher.email ?? '이름 미정')
                          .join(' · ')
                      ) : (
                        '미지정'
                      )}
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        )}
      </DashboardCard>

      <div className="grid gap-4 md:grid-cols-2">
        <DashboardCard
          title="해야할 일"
          description="이번 주 집중 과제와 월간 목표를 빠르게 파악하고 바로 실행할 수 있는 작업 공간입니다."
        >
          <div className="grid gap-4">
            {TODO_ACTIONS.map(({ label, href, description, variant }) => (
              <div key={href} className="flex flex-col gap-1">
                <Button asChild variant={variant} className="justify-start">
                  <Link href={href}>{label}</Link>
                </Button>
                <p className="text-xs text-slate-500">{description}</p>
              </div>
            ))}
          </div>
        </DashboardCard>
        <DashboardCard
          title="해냈던 일"
          description="지난 활동을 정리하며 성취를 확인하고 다음 학습에 참고할 기록 보관소입니다."
        >
          <div className="grid gap-4">
            {DONE_ACTIONS.map(({ label, href, description, variant }) => (
              <div key={href} className="flex flex-col gap-1">
                <Button asChild variant={variant} className="justify-start">
                  <Link href={href}>{label}</Link>
                </Button>
                <p className="text-xs text-slate-500">{description}</p>
              </div>
            ))}
          </div>
        </DashboardCard>
      </div>
    </section>
  )
}
