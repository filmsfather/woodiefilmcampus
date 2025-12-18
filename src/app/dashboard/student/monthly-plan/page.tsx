import Link from 'next/link'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import DateUtil from '@/lib/date-util'
import { requireAuthForDashboard } from '@/lib/auth'
import {
  fetchClassLearningJournalTemplate,
  fetchLearningJournalPeriodsForClasses,
  resolveWeeklyRanges,
} from '@/lib/learning-journals'
import { fetchClassMaterialSummaries } from '@/lib/class-materials'
import { createAssetSignedUrlMap } from '@/lib/assignment-assets'
import { LEARNING_JOURNAL_SUBJECTS, type LearningJournalSubject, LEARNING_JOURNAL_SUBJECT_INFO } from '@/types/learning-journal'
import type { MediaAssetRecord } from '@/lib/assignment-evaluation'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

interface SubjectMaterial {
  title: string
  description: string | null
  handout:
  | {
    url: string
    filename: string
  }
  | null
}

interface WeekPlan {
  weekIndex: number
  label: string
  subjects: Record<LearningJournalSubject, {
    materials: SubjectMaterial[]
    note: string | null
  }>
}

function formatWeekLabel(start: string, end: string) {
  return `${DateUtil.formatForDisplay(start, {
    locale: 'ko-KR',
    timeZone: 'Asia/Seoul',
    month: 'short',
    day: 'numeric',
  })} ~ ${DateUtil.formatForDisplay(end, {
    locale: 'ko-KR',
    timeZone: 'Asia/Seoul',
    month: 'short',
    day: 'numeric',
  })}`
}

export default async function StudentMonthlyPlanPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>
}) {
  const { profile } = await requireAuthForDashboard('student')

  if (!profile) {
    return null
  }

  const supabase = await createServerSupabase()

  const { data: classRows, error: classError } = await supabase
    .from('class_students')
    .select('class_id')
    .eq('student_id', profile.id)

  if (classError) {
    console.error('[student-monthly-plan] failed to fetch class memberships', classError)
  }

  const classIds = new Set<string>()
  if (profile.class_id) {
    classIds.add(profile.class_id)
  }
  for (const row of classRows ?? []) {
    if (row.class_id) {
      classIds.add(row.class_id)
    }
  }

  if (classIds.size === 0) {
    return (
      <section className="space-y-6">
        <DashboardBackLink fallbackHref="/dashboard/student" label="학생 대시보드로 돌아가기" />
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold text-slate-900">이번달 학습 계획</h1>
          <p className="text-sm text-slate-600">소속 반 정보가 확인되지 않습니다. 담임 선생님에게 반 등록을 요청해주세요.</p>
        </header>
        <Button asChild variant="outline">
          <Link href="/dashboard/student">학생 대시보드</Link>
        </Button>
      </section>
    )
  }

  const periods = await fetchLearningJournalPeriodsForClasses(Array.from(classIds))

  if (periods.length === 0) {
    return (
      <section className="space-y-6">
        <DashboardBackLink fallbackHref="/dashboard/student" label="학생 대시보드로 돌아가기" />
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold text-slate-900">이번달 학습 계획</h1>
          <p className="text-sm text-slate-600">아직 생성된 학습 주기가 없습니다. 선생님이 주기를 등록하면 월간 계획이 표시됩니다.</p>
        </header>
      </section>
    )
  }

  const periodParam = typeof searchParams?.period === 'string' ? searchParams.period : null
  const sortedPeriods = [...periods].sort(
    (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
  )
  const activePeriod = sortedPeriods.find((period) => period.id === periodParam) ?? sortedPeriods[0]

  const template = await fetchClassLearningJournalTemplate(activePeriod.classId, activePeriod.id)

  const ranges = resolveWeeklyRanges(activePeriod)
  const materialIdSet = new Set<string>()

  for (const week of template.weeks) {
    for (const subject of LEARNING_JOURNAL_SUBJECTS) {
      const config = week.subjects[subject]
      for (const materialId of config.materialIds) {
        if (materialId) {
          materialIdSet.add(materialId)
        }
      }
    }
  }

  const materialMap = await fetchClassMaterialSummaries(Array.from(materialIdSet))

  const assetRecords = new Map<string, MediaAssetRecord>()
  materialMap.forEach((summary) => {
    if (summary.studentHandoutAsset) {
      assetRecords.set(summary.studentHandoutAsset.id, {
        bucket: summary.studentHandoutAsset.bucket,
        path: summary.studentHandoutAsset.path,
        mimeType: summary.studentHandoutAsset.mimeType,
        metadata: summary.studentHandoutAsset.metadata,
      })
    }
  })

  const signedAssets = assetRecords.size > 0 ? await createAssetSignedUrlMap(assetRecords) : new Map()

  const weeks: WeekPlan[] = template.weeks.map((week) => {
    const range = ranges.find((item) => item.weekIndex === week.weekIndex)
    const weekLabel = range ? formatWeekLabel(range.startDate, range.endDate) : `${week.weekIndex}주차`
    const subjects: WeekPlan['subjects'] = LEARNING_JOURNAL_SUBJECTS.reduce((acc, subject) => {
      const config = week.subjects[subject]
      const materials: SubjectMaterial[] = []
      const itemCount = Math.max(config.materialTitles.length, config.materialIds.length)

      for (let index = 0; index < itemCount; index += 1) {
        const materialId = config.materialIds[index] ?? null
        const title = config.materialTitles[index]?.trim() ?? ''
        const hasContent = Boolean(title) || Boolean(materialId)

        if (!hasContent) {
          continue
        }

        const summary = materialId ? materialMap.get(materialId) ?? null : null
        const studentAssetId = summary?.studentHandoutAsset?.id ?? null
        const handout = studentAssetId ? signedAssets.get(studentAssetId) ?? null : null

        materials.push({
          title: title || summary?.title || '자료 제목 미정',
          description: summary?.description ?? null,
          handout: handout
            ? {
              url: handout.url,
              filename: handout.filename,
            }
            : null,
        })
      }

      acc[subject] = {
        materials,
        note: config.materialNotes,
      }
      return acc
    }, {} as WeekPlan['subjects'])

    return {
      weekIndex: week.weekIndex,
      label: `${week.weekIndex}주차 · ${weekLabel}`,
      subjects,
    }
  })

  const hasAnyContent = weeks.some((week) =>
    LEARNING_JOURNAL_SUBJECTS.some((subject) => {
      const subjectConfig = week.subjects[subject]
      return subjectConfig.materials.length > 0 || Boolean(subjectConfig.note)
    })
  )

  return (
    <section className="space-y-6">
      <DashboardBackLink fallbackHref="/dashboard/student" label="학생 대시보드로 돌아가기" />

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">이번달 학습 계획</h1>
        <p className="text-sm text-slate-600">
          {activePeriod.className} 기준 {DateUtil.formatForDisplay(activePeriod.startDate, {
            locale: 'ko-KR',
            timeZone: 'Asia/Seoul',
            month: 'short',
            day: 'numeric',
          })}
          부터 {DateUtil.formatForDisplay(activePeriod.endDate, {
            locale: 'ko-KR',
            timeZone: 'Asia/Seoul',
            month: 'short',
            day: 'numeric',
          })}
          까지의 수업 계획입니다.
        </p>
      </header>

      {sortedPeriods.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2">
          {sortedPeriods.map((period) => (
            <Button
              key={period.id}
              asChild
              variant={period.id === activePeriod.id ? 'default' : 'outline'}
              size="sm"
            >
              <Link href={`/dashboard/student/monthly-plan?period=${period.id}`}>
                {period.label ?? `${period.startDate} ~ ${period.endDate}`}
              </Link>
            </Button>
          ))}
        </div>
      ) : null}

      {hasAnyContent ? null : (
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
          아직 등록된 학습 자료가 없습니다. 선생님이 계획을 채우면 이곳에 표시됩니다.
        </div>
      )}

      <div className="space-y-6">
        {weeks.map((week) => {
          const visibleSubjects = LEARNING_JOURNAL_SUBJECTS.filter((subject) => {
            const subjectConfig = week.subjects[subject]
            return subjectConfig.materials.length > 0 || Boolean(subjectConfig.note)
          })

          if (visibleSubjects.length === 0) {
            return null
          }

          return (
            <Card key={week.weekIndex} className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-xl text-slate-900">{week.label}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {visibleSubjects.map((subject, subjectIndex) => {
                  const subjectConfig = week.subjects[subject]
                  const meta = LEARNING_JOURNAL_SUBJECT_INFO[subject]
                  return (
                    <div key={`${week.weekIndex}-${subject}`} className="space-y-3">
                      <div className="flex flex-col gap-1">
                        <h3 className="text-lg font-semibold text-slate-900">{meta.label}</h3>
                        <p className="text-xs text-slate-500">{meta.description}</p>
                        {subjectConfig.note ? (
                          <p className="rounded-md bg-sky-50 p-2 text-sm text-sky-700">
                            {subjectConfig.note}
                          </p>
                        ) : null}
                      </div>

                      {subjectConfig.materials.length > 0 ? (
                        <div className="space-y-4">
                          {subjectConfig.materials.map((material, index) => (
                            <div
                              key={`${week.weekIndex}-${subject}-${index}`}
                              className="rounded-md border border-slate-200 p-4"
                            >
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <p className="text-base font-medium text-slate-900">{material.title}</p>
                                  {material.description ? (
                                    <p className="text-sm text-slate-600">{material.description}</p>
                                  ) : null}
                                </div>
                                {material.handout ? (
                                  <Button asChild size="sm" variant="outline">
                                    <Link
                                      href={material.handout.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      download={material.handout.filename}
                                    >
                                      학생 유인물 다운로드
                                    </Link>
                                  </Button>
                                ) : (
                                  <span className="text-xs text-slate-400">학생 유인물이 등록되지 않았습니다.</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {subjectIndex < visibleSubjects.length - 1 ? (
                        <div className="border-t border-slate-200" />
                      ) : null}
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </section>
  )
}
