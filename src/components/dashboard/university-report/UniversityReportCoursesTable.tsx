import { AlertCircle } from 'lucide-react'

import CourseRowEditor from '@/components/dashboard/university-report/CourseRowEditor'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { CourseRow } from '@/lib/university-report/data'

interface UniversityReportCoursesTableProps {
  courses: CourseRow[]
  studentId: string
}

interface SubjectRow {
  key: string
  grade: number
  subjectArea: string
  rawSubjectName: string
  courseType: string
  isPassFail: boolean
  parserConfidenceLow: boolean
  edited: boolean
  firstSemester: CourseRow | null
  secondSemester: CourseRow | null
  firstPosition: number
}

function formatScore(course: CourseRow | null) {
  if (!course) return '-'
  if (course.rawScore == null && course.subjectMean == null) return '-'
  const raw = course.rawScore ?? '-'
  const mean = course.subjectMean ?? '-'
  const std = course.stdDev != null ? `(${course.stdDev})` : ''
  return `${raw}/${mean}${std}`
}

function formatGrade(course: CourseRow | null) {
  if (!course) return '-'
  if (course.isPassFail && course.achievement) {
    const countSuffix =
      course.studentCount != null ? `(${course.studentCount})` : ''
    return `${course.achievement}${countSuffix}`
  }
  if (course.achievement && course.rank == null) {
    const countSuffix =
      course.studentCount != null ? `(${course.studentCount})` : ''
    return `${course.achievement}${countSuffix}`
  }
  if (course.rank != null) {
    const countSuffix =
      course.studentCount != null ? `(${course.studentCount})` : ''
    return `${course.rank}${countSuffix}`
  }
  return '-'
}

function formatCredits(course: CourseRow | null) {
  if (!course || course.credits == null) return '-'
  if (Number.isInteger(course.credits)) return String(course.credits)
  return course.credits.toFixed(1)
}

function buildSubjectRows(courses: CourseRow[]): Map<number, SubjectRow[]> {
  const grouped = new Map<string, SubjectRow>()

  for (const course of courses) {
    if (course.grade == null) continue
    const key = `${course.grade}::${course.subjectArea}::${course.rawSubjectName}::${course.courseType}`
    let row = grouped.get(key)
    if (!row) {
      row = {
        key,
        grade: course.grade,
        subjectArea: course.subjectArea,
        rawSubjectName: course.rawSubjectName,
        courseType: course.courseType,
        isPassFail: course.isPassFail,
        parserConfidenceLow: course.parserConfidence === 'low',
        edited: course.editedByUser,
        firstSemester: null,
        secondSemester: null,
        firstPosition: course.position,
      }
      grouped.set(key, row)
    }
    if (course.semester === 1) {
      row.firstSemester = course
    } else if (course.semester === 2) {
      row.secondSemester = course
    }
    if (course.parserConfidence === 'low') row.parserConfidenceLow = true
    if (course.editedByUser) row.edited = true
    if (course.isPassFail) row.isPassFail = true
    if (course.position < row.firstPosition) row.firstPosition = course.position
  }

  const byGrade = new Map<number, SubjectRow[]>()
  for (const row of grouped.values()) {
    const list = byGrade.get(row.grade) ?? []
    list.push(row)
    byGrade.set(row.grade, list)
  }

  for (const list of byGrade.values()) {
    list.sort((a, b) => a.firstPosition - b.firstPosition)
  }

  return byGrade
}

const COURSE_TYPE_TONE: Record<string, string> = {
  공통: 'bg-slate-100 text-slate-700',
  일반선택: 'bg-sky-100 text-sky-700',
  진로선택: 'bg-violet-100 text-violet-700',
  융합선택: 'bg-teal-100 text-teal-700',
  '체육·예술': 'bg-amber-100 text-amber-700',
  교양: 'bg-stone-100 text-stone-700',
  전문교과I: 'bg-emerald-100 text-emerald-700',
  전문교과II: 'bg-emerald-100 text-emerald-700',
  기타: 'bg-slate-100 text-slate-600',
}

export default function UniversityReportCoursesTable({
  courses,
  studentId,
}: UniversityReportCoursesTableProps) {
  if (courses.length === 0) {
    return null
  }

  const byGrade = buildSubjectRows(courses)
  const grades = Array.from(byGrade.keys()).sort((a, b) => a - b)
  const hasEdited = courses.some((c) => c.editedByUser)

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-slate-900">
          학년별 성적 추출 결과
        </CardTitle>
        <p className="text-xs text-slate-500">
          행 오른쪽의 연필 아이콘으로 데이터를 수정할 수 있습니다. 노란색 행은 AI 신뢰도가 낮은 항목이며,
          <span className="font-medium text-red-600"> 빨간색 행</span>은 사용자가 직접 수정한 항목입니다.
          {hasEdited ? null : ' (아직 수정한 행이 없습니다)'}
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {grades.map((grade) => {
          const rows = byGrade.get(grade) ?? []
          return (
            <div key={grade} className="space-y-2">
              <div className="flex items-baseline gap-2">
                <h3 className="text-sm font-semibold text-slate-900">{grade}학년</h3>
                <span className="text-xs text-slate-500">총 {rows.length}과목</span>
              </div>
              <div className="overflow-x-auto rounded-md border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-xs">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-2 py-2 text-left font-medium" rowSpan={2}>교과</th>
                      <th className="px-2 py-2 text-left font-medium" rowSpan={2}>과목</th>
                      <th
                        className="border-l border-slate-200 px-2 py-1 text-center font-medium"
                        colSpan={3}
                      >
                        1학기
                      </th>
                      <th
                        className="border-l border-slate-200 px-2 py-1 text-center font-medium"
                        colSpan={3}
                      >
                        2학기
                      </th>
                      <th
                        className="border-l border-slate-200 px-2 py-1 text-center font-medium"
                        rowSpan={2}
                      >
                        수정
                      </th>
                    </tr>
                    <tr className="text-[11px] text-slate-500">
                      <th className="border-l border-slate-200 px-2 py-1 text-center">단위</th>
                      <th className="px-2 py-1 text-center">원점수/평균(표준편차)</th>
                      <th className="px-2 py-1 text-center">석차/성취도</th>
                      <th className="border-l border-slate-200 px-2 py-1 text-center">단위</th>
                      <th className="px-2 py-1 text-center">원점수/평균(표준편차)</th>
                      <th className="px-2 py-1 text-center">석차/성취도</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {rows.map((row) => (
                      <tr
                        key={row.key}
                        className={cn(
                          row.parserConfidenceLow && !row.edited && 'bg-amber-50/70',
                          row.edited && 'bg-red-50/60 text-red-700'
                        )}
                      >
                        <td className="whitespace-nowrap px-2 py-2 align-middle">
                          <div className="flex flex-col gap-1">
                            <span
                              className={cn(row.edited ? 'text-red-700' : 'text-slate-800')}
                            >
                              {row.subjectArea}
                            </span>
                            <Badge
                              variant="outline"
                              className={cn(
                                'w-fit border-transparent text-[10px] font-medium',
                                row.edited
                                  ? 'bg-red-100 text-red-700'
                                  : COURSE_TYPE_TONE[row.courseType] ?? 'bg-slate-100 text-slate-600'
                              )}
                            >
                              {row.courseType}
                            </Badge>
                          </div>
                        </td>
                        <td
                          className={cn(
                            'px-2 py-2 align-middle',
                            row.edited ? 'text-red-700' : 'text-slate-900'
                          )}
                        >
                          <div className="flex items-center gap-1">
                            {row.rawSubjectName}
                            {row.parserConfidenceLow && !row.edited ? (
                              <AlertCircle
                                className="size-3 text-amber-500"
                                aria-label="신뢰도 낮음"
                              />
                            ) : null}
                            {row.isPassFail ? (
                              <span
                                className={cn(
                                  'rounded px-1 text-[10px] font-medium',
                                  row.edited
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-amber-100 text-amber-700'
                                )}
                              >
                                P/F
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <SemesterCells course={row.firstSemester} edited={row.edited} />
                        <SemesterCells course={row.secondSemester} edited={row.edited} />
                        <td className="border-l border-slate-200 px-1 py-2 text-center align-middle">
                          <CourseRowEditor studentId={studentId} subjectRow={row} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

function SemesterCells({
  course,
  edited,
}: {
  course: CourseRow | null
  edited: boolean
}) {
  const empty = course === null
  const baseCellClass = cn(
    'px-2 py-2 text-center align-middle',
    empty && 'text-slate-300',
    !empty && edited && 'text-red-700',
    !empty && !edited && 'text-slate-700'
  )
  return (
    <>
      <td className={cn(baseCellClass, 'border-l border-slate-200')}>
        {formatCredits(course)}
      </td>
      <td className={cn(baseCellClass, 'tabular-nums')}>{formatScore(course)}</td>
      <td
        className={cn(
          baseCellClass,
          'tabular-nums font-medium',
          !empty && !edited && 'text-slate-800',
          !empty && edited && 'text-red-700'
        )}
      >
        {formatGrade(course)}
      </td>
    </>
  )
}
