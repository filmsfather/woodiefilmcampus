export const CLASS_MATERIALS_BUCKET = 'class-materials'

export const CLASS_MATERIAL_SUBJECTS = {
  directing: {
    label: '연출론 아카이브',
    description: '연출 수업에 사용하는 강의 자료와 참고 파일을 정리합니다.',
  },
  screenwriting: {
    label: '작법론 아카이브',
    description: '시나리오, 구성안 등 작법 수업 자료를 공유하세요.',
  },
  film_research: {
    label: '영화연구 아카이브',
    description: '영화 연구와 관련된 읽기 자료 및 과제를 보관합니다.',
  },
} as const

export type ClassMaterialSubject = keyof typeof CLASS_MATERIAL_SUBJECTS

export const CLASS_MATERIAL_ALLOWED_ROLES = ['teacher', 'manager', 'principal'] as const

export type ClassMaterialAllowedRole = (typeof CLASS_MATERIAL_ALLOWED_ROLES)[number]

export function isClassMaterialAllowedRole(
  role: string | null | undefined
): role is ClassMaterialAllowedRole {
  if (!role) {
    return false
  }

  return (CLASS_MATERIAL_ALLOWED_ROLES as readonly string[]).includes(role)
}

export function isClassMaterialSubject(value: string | null | undefined): value is ClassMaterialSubject {
  if (!value) {
    return false
  }

  return Object.prototype.hasOwnProperty.call(CLASS_MATERIAL_SUBJECTS, value)
}

export function getClassMaterialSubjectLabel(subject: ClassMaterialSubject) {
  return CLASS_MATERIAL_SUBJECTS[subject].label
}

export function getClassMaterialSubjectDescription(subject: ClassMaterialSubject) {
  return CLASS_MATERIAL_SUBJECTS[subject].description
}
