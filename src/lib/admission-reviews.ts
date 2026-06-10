/**
 * 합격 복기 아카이브 조회/표현 헬퍼.
 * 테이블: admission_reviews / admission_review_images (108 마이그레이션).
 */

import { getUniversityPreset } from '@/lib/university-policy/presets'

export const ADMISSION_REVIEWS_BUCKET = 'admission-reviews'

export interface AdmissionReviewRow {
  id: string
  university_id: string | null
  university_label: string | null
  admission_year: number | null
  posted_at: string | null
  admission_track: string | null
  stage: string | null
  student_name: string | null
  title: string
  body: string | null
  source_file: string | null
  source_url: string | null
}

/** 대학 표시명: 프리셋 약칭 우선 → 정식명 → 미매핑 라벨 → '기타'. */
export function resolveUniversityLabel(row: {
  university_id: string | null
  university_label: string | null
}): string {
  if (row.university_id) {
    const preset = getUniversityPreset(row.university_id)
    if (preset) return preset.shortName ?? preset.name
  }
  return row.university_label ?? '기타'
}

/** 학년도 표시(예: 2026 → '2026학년도'). */
export function formatAdmissionYear(year: number | null): string | null {
  return year != null ? `${year}학년도` : null
}
