'use server'

import { revalidatePath } from 'next/cache'

import { getAuthContext } from '@/lib/auth'
import {
  deleteClassLearningJournalWeek,
  upsertClassLearningJournalWeek,
  type UpsertClassLearningJournalWeekInput,
} from '@/lib/learning-journals'
import {
  deleteClassLearningJournalWeekSchema,
  upsertClassLearningJournalWeekSchema,
} from '@/lib/validation/learning-journal'

const TEMPLATE_PATH = '/dashboard/teacher/learning-journal/templates'

export async function upsertClassTemplateWeekAction(rawForm: FormData) {
  const { profile } = await getAuthContext()

  if (!profile || !['teacher', 'manager', 'principal'].includes(profile.role)) {
    return { error: '월간 학습 계획을 수정할 권한이 없습니다.' }
  }

  const payload = {
    classId: String(rawForm.get('classId') ?? ''),
    periodId: String(rawForm.get('periodId') ?? ''),
    weekIndex: Number(rawForm.get('weekIndex') ?? 0),
    subject: String(rawForm.get('subject') ?? ''),
    materialIds: (rawForm.getAll('materialIds') ?? []).map((value) => String(value)),
    materialTitles: (rawForm.getAll('materialTitles') ?? []).map((value) => String(value)),
    materialNotes: rawForm.get('materialNotes')?.toString() ?? null,
  }

  const result = upsertClassLearningJournalWeekSchema.safeParse(payload)

  if (!result.success) {
    return {
      error: '입력값을 다시 확인해주세요.',
      fieldErrors: result.error.flatten().fieldErrors,
    }
  }

  const input: UpsertClassLearningJournalWeekInput = {
    ...result.data,
    materialNotes: result.data.materialNotes ?? null,
    actorId: profile.id,
  }

  const template = await upsertClassLearningJournalWeek(input)

  if (!template) {
    return { error: '템플릿을 저장하지 못했습니다.' }
  }

  revalidatePath(TEMPLATE_PATH)
  revalidatePath('/dashboard/teacher/learning-journal')

  return { success: true } as const
}

export async function deleteClassTemplateWeekAction(formData: FormData) {
  const { profile } = await getAuthContext()

  if (!profile || !['teacher', 'manager', 'principal'].includes(profile.role)) {
    return { error: '월간 학습 계획을 수정할 권한이 없습니다.' }
  }

  const payload = {
    classId: String(formData.get('classId') ?? ''),
    periodId: String(formData.get('periodId') ?? ''),
    weekIndex: Number(formData.get('weekIndex') ?? 0),
    subject: String(formData.get('subject') ?? ''),
  }

  const result = deleteClassLearningJournalWeekSchema.safeParse(payload)

  if (!result.success) {
    return {
      error: '삭제할 템플릿 정보를 확인하지 못했습니다.',
      fieldErrors: result.error.flatten().fieldErrors,
    }
  }

  const deleted = await deleteClassLearningJournalWeek(
    result.data.classId,
    result.data.periodId,
    result.data.weekIndex,
    result.data.subject
  )

  if (!deleted) {
    return { error: '템플릿을 삭제하지 못했습니다.' }
  }

  revalidatePath(TEMPLATE_PATH)
  revalidatePath('/dashboard/teacher/learning-journal')

  return { success: true } as const
}
