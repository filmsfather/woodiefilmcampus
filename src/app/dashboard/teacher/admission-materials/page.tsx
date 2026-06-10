import Link from 'next/link'
import type { Metadata } from 'next'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import UniversityList from '@/components/dashboard/university-policy/UniversityList'
import UniversityScheduleCalendar from '@/components/dashboard/university-policy/UniversityScheduleCalendar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAuthForDashboard } from '@/lib/auth'
import { ADMISSION_MATERIAL_CATEGORIES, type AdmissionMaterialCategory } from '@/lib/admission-materials'
import {
  fetchAllProgramsWithPolicy,
  fetchUniversities,
} from '@/lib/university-policy/data'
import { buildScheduleEvents } from '@/lib/university-policy/schedule-events'

export const metadata: Metadata = {
  title: '입시 자료 아카이브 | 지원가능대학 분석',
  description: '대학별 영화과 수시 일정과 모집단위 산식·컷을 열람하고 입시 자료를 관리합니다.',
}

const TEACHER_UNIVERSITY_BASE = '/dashboard/teacher/admission-materials/universities'

const VISIBLE_CATEGORIES: AdmissionMaterialCategory[] = ['past_exam']

export default async function AdmissionMaterialsLandingPage() {
  await requireAuthForDashboard(['teacher', 'manager'])

  const universities = fetchUniversities()
  const allPrograms = fetchAllProgramsWithPolicy()
  const programCounts = allPrograms.reduce<Record<string, number>>((acc, row) => {
    acc[row.program.universityId] = (acc[row.program.universityId] ?? 0) + 1
    return acc
  }, {})

  const scheduleEvents = buildScheduleEvents()
  const universitiesWithSchedule = new Set(scheduleEvents.map((e) => e.universityId))
  const calendarUniversityOptions = universities
    .filter((u) => universitiesWithSchedule.has(u.id))
    .map((u) => ({ id: u.id, name: u.name, shortName: u.shortName }))

  const todayMonth = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })()
  const earliestEventMonth = scheduleEvents[0]?.startISO?.slice(0, 7) ?? null
  const defaultMonth =
    earliestEventMonth && earliestEventMonth > todayMonth ? earliestEventMonth : todayMonth

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink fallbackHref="/dashboard/teacher" label="교사용 허브로 돌아가기" />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">입시 자료 아카이브</h1>
          <p className="text-sm text-slate-600">
            대학별 영화과 수시 일정과 모집단위 산식·컷을 확인하고, 기출·합격 복기 자료를 관리하세요.
          </p>
        </div>
      </div>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-slate-900">대학별 영화과 수시 일정 달력</h2>
          <p className="text-xs text-slate-500">
            등록된 모집단위 일정({scheduleEvents.length}건)을 월별로 모아 보여줍니다.
            대학·일정 유형 필터로 빠르게 좁혀 볼 수 있고, 일정 카드를 클릭하면 모집단위 상세로 이동합니다.
          </p>
        </div>
        <UniversityScheduleCalendar
          events={scheduleEvents}
          universities={calendarUniversityOptions}
          defaultMonthISO={defaultMonth}
          detailBasePath={TEACHER_UNIVERSITY_BASE}
        />
      </section>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-900">
            등록된 대학 ({universities.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <UniversityList
            universities={universities}
            programCounts={programCounts}
            basePath={TEACHER_UNIVERSITY_BASE}
          />
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-slate-900">입시 자료 카테고리</h2>
          <p className="text-xs text-slate-500">카테고리를 선택해 입시 준비 자료를 업로드하고 공유하세요.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {VISIBLE_CATEGORIES.map((category) => {
            const meta = ADMISSION_MATERIAL_CATEGORIES[category]
            return (
              <Card key={category} className="border-slate-200 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
                <CardHeader className="space-y-2">
                  <CardTitle className="text-lg text-slate-900">{meta.label}</CardTitle>
                  <CardDescription className="text-sm text-slate-500">{meta.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild className="w-full">
                    <Link href={`/dashboard/teacher/admission-materials/${category}`}>카테고리 열기</Link>
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>

      <Card className="border-slate-200 bg-slate-50 shadow-sm">
        <CardHeader className="space-y-2">
          <CardTitle className="text-lg text-slate-900">합격 복기 아카이브</CardTitle>
          <CardDescription className="text-sm text-slate-500">
            카페에서 옮겨온 합격생 면접·실기·글쓰기 복기를 대학·학년도·학생 이름으로 분류해 열람합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full sm:w-auto">
            <Link href="/dashboard/teacher/admission-reviews">복기 아카이브 열기</Link>
          </Button>
        </CardContent>
      </Card>
    </section>
  )
}
