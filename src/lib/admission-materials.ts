export const ADMISSION_MATERIALS_BUCKET = 'admission-materials'

export const ADMISSION_MATERIAL_CATEGORIES = {
  interview: {
    label: '면접 준비',
    description: '모의 면접 자료와 질문 리스트를 정리합니다.',
  },
  essay: {
    label: '자기소개서 · 에세이',
    description: '자기소개서 템플릿과 수정 사례를 공유합니다.',
  },
  portfolio: {
    label: '포트폴리오',
    description: '작품집 구성 가이드와 참고 자료를 모읍니다.',
  },
  notice: {
    label: '입시 일정 안내',
    description: '대학별 일정과 준비 체크리스트를 안내합니다.',
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
