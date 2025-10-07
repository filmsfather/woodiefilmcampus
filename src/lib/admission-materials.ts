export const ADMISSION_MATERIALS_BUCKET = 'admission-materials'

export const ADMISSION_MATERIAL_CATEGORIES = {
  guideline: {
    label: '대학별 입시 요강',
    description: '대학별 모집요강과 제출 서류 정보를 정리합니다.',
  },
  past_exam: {
    label: '대학별 기출 자료',
    description: '기출 문제와 분석 자료를 모읍니다.',
  },
  success_review: {
    label: '대학별 합격 복기 자료',
    description: '합격생 복기, 노하우, 일정 등을 공유합니다.',
  },
} as const

export type AdmissionMaterialCategory = keyof typeof ADMISSION_MATERIAL_CATEGORIES

export const ADMISSION_MATERIAL_ALLOWED_ROLES = ['teacher', 'manager', 'principal'] as const

export type AdmissionMaterialAllowedRole = (typeof ADMISSION_MATERIAL_ALLOWED_ROLES)[number]

export type AdmissionMaterialAssetType = 'guide' | 'resource'

export function isAdmissionMaterialAllowedRole(
  role: string | null | undefined
): role is AdmissionMaterialAllowedRole {
  if (!role) {
    return false
  }

  return (ADMISSION_MATERIAL_ALLOWED_ROLES as readonly string[]).includes(role)
}

export function isAdmissionMaterialCategory(value: string | null | undefined): value is AdmissionMaterialCategory {
  if (!value) {
    return false
  }

  return Object.prototype.hasOwnProperty.call(ADMISSION_MATERIAL_CATEGORIES, value)
}

export function getAdmissionCategoryLabel(category: AdmissionMaterialCategory) {
  return ADMISSION_MATERIAL_CATEGORIES[category].label
}

export function getAdmissionCategoryDescription(category: AdmissionMaterialCategory) {
  return ADMISSION_MATERIAL_CATEGORIES[category].description
}
