import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { PrincipalPayrollProfilesClient } from '@/components/dashboard/principal/payroll/PrincipalPayrollProfilesClient'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchTeacherDirectory } from '@/lib/payroll/queries'
import { fetchPayrollProfilesWithTeachers } from '@/lib/payroll/profile-service'
import type { TeacherProfileSummary } from '@/lib/work-logs'

function toOption(teacher: TeacherProfileSummary): { id: string; label: string } {
  const label = teacher.name ?? teacher.email ?? '이름 미등록'
  return { id: teacher.id, label }
}

export default async function PrincipalPayrollProfilesPage() {
  await requireAuthForDashboard('principal')

  const [teacherDirectory, profilesWithTeachers] = await Promise.all([
    fetchTeacherDirectory(),
    fetchPayrollProfilesWithTeachers(),
  ])

  const teacherList = Object.values(teacherDirectory).sort((a, b) => {
    const nameA = a.name ?? a.email ?? ''
    const nameB = b.name ?? b.email ?? ''
    return nameA.localeCompare(nameB, 'ko')
  })

  const profiles = profilesWithTeachers.map(({ profile, teacher }) => {
    const teacherSummary = teacher ?? teacherDirectory[profile.teacherId] ?? {
      id: profile.teacherId,
      name: null,
      email: null,
    }
    return { profile, teacher: teacherSummary }
  })

  const teacherIdsWithProfile = new Set(profiles.map((entry) => entry.profile.teacherId))

  const teachersWithoutProfile = teacherList.filter((teacher) => !teacherIdsWithProfile.has(teacher.id))

  const teacherOptions = teacherList.map(toOption)

  return (
    <section className="mx-auto flex max-w-6xl flex-col gap-6">
      <DashboardBackLink
        fallbackHref="/dashboard/principal/payroll"
        label="임금관리로 돌아가기"
        className="self-start"
      />
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-slate-900">급여 프로필 설정</h1>
        <p className="text-sm text-slate-600">
          선생님별 급여 기준을 등록하거나 수정하고 적용 기간을 관리하세요.
        </p>
      </header>
      <PrincipalPayrollProfilesClient
        profiles={profiles}
        teacherOptions={teacherOptions}
        teachersWithoutProfile={teachersWithoutProfile}
      />
    </section>
  )
}
