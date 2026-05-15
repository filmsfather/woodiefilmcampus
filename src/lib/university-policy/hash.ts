/**
 * snapshot의 정규화된 과목 행을 안정 정렬해 SHA-256 해시를 만든다.
 * 같은 입력이면 항상 같은 해시가 나오도록 키 순서·필드 순서를 고정한다.
 * 캐시 무효화 키로 사용된다.
 */

import { createHash } from 'node:crypto'

import type { CourseRow } from '@/lib/university-report/data'

function pickStable(row: CourseRow) {
  return {
    grade: row.grade ?? null,
    semester: row.semester ?? null,
    raw_subject_name: row.rawSubjectName ?? '',
    subject_area: row.subjectArea,
    course_type: row.courseType,
    is_pass_fail: row.isPassFail,
    credits: row.credits ?? null,
    rank: row.rank ?? null,
    achievement: row.achievement ?? null,
    raw_score: row.rawScore ?? null,
    subject_mean: row.subjectMean ?? null,
    std_dev: row.stdDev ?? null,
    student_count: row.studentCount ?? null,
  }
}

function compareCourses(a: ReturnType<typeof pickStable>, b: ReturnType<typeof pickStable>) {
  const aGrade = a.grade ?? -1
  const bGrade = b.grade ?? -1
  if (aGrade !== bGrade) return aGrade - bGrade
  const aSem = a.semester ?? -1
  const bSem = b.semester ?? -1
  if (aSem !== bSem) return aSem - bSem
  if (a.subject_area !== b.subject_area) return a.subject_area.localeCompare(b.subject_area)
  if (a.course_type !== b.course_type) return a.course_type.localeCompare(b.course_type)
  return a.raw_subject_name.localeCompare(b.raw_subject_name)
}

export function hashSnapshotCourses(courses: CourseRow[]): string {
  const rows = courses.map(pickStable).sort(compareCourses)
  const json = JSON.stringify(rows)
  return createHash('sha256').update(json).digest('hex')
}
