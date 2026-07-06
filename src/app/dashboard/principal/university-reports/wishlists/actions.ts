'use server'

import { revalidatePath } from 'next/cache'

import { ensureManagerProfile } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchClassFormationBoard } from '@/lib/class-formation/data'
import {
  assignStudentSchema,
  createGroupSchema,
  createPlanSchema,
  renamePlanSchema,
  unassignStudentSchema,
  updateGroupSchema,
} from '@/lib/validation/class-formation'

export type FormationActionResult =
  | { ok: true; planId?: string; message?: string }
  | { ok: false; error: string }

const WORKSPACE_PATH = '/dashboard/principal/university-reports/wishlists'
const MANAGER_CLASSES_PATH = '/dashboard/manager/classes'

function fail(error: string): FormationActionResult {
  return { ok: false, error }
}

async function requireManager() {
  const profile = await ensureManagerProfile()
  return profile
}

export async function createPlanAction(input: unknown): Promise<FormationActionResult> {
  const profile = await requireManager()
  if (!profile) return fail('반편성안을 생성할 권한이 없습니다.')

  const parsed = createPlanSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? '입력값을 확인해주세요.')
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('class_formation_plans')
    .insert({ name: parsed.data.name, created_by: profile.id })
    .select('id')
    .single()

  if (error || !data) {
    console.error('[class-formation] createPlanAction error', error)
    return fail('반편성안 생성 중 오류가 발생했습니다.')
  }

  revalidatePath(WORKSPACE_PATH)
  return { ok: true, planId: data.id as string }
}

export async function renamePlanAction(input: unknown): Promise<FormationActionResult> {
  const profile = await requireManager()
  if (!profile) return fail('반편성안을 수정할 권한이 없습니다.')

  const parsed = renamePlanSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? '입력값을 확인해주세요.')
  }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('class_formation_plans')
    .update({ name: parsed.data.name })
    .eq('id', parsed.data.planId)

  if (error) {
    console.error('[class-formation] renamePlanAction error', error)
    return fail('반편성안 이름을 수정하지 못했습니다.')
  }

  revalidatePath(WORKSPACE_PATH)
  return { ok: true }
}

export async function deletePlanAction(planId: string): Promise<FormationActionResult> {
  const profile = await requireManager()
  if (!profile) return fail('반편성안을 삭제할 권한이 없습니다.')

  const supabase = createAdminClient()
  const { error } = await supabase.from('class_formation_plans').delete().eq('id', planId)

  if (error) {
    console.error('[class-formation] deletePlanAction error', error)
    return fail('반편성안을 삭제하지 못했습니다.')
  }

  revalidatePath(WORKSPACE_PATH)
  return { ok: true }
}

export async function createGroupAction(input: unknown): Promise<FormationActionResult> {
  const profile = await requireManager()
  if (!profile) return fail('반을 추가할 권한이 없습니다.')

  const parsed = createGroupSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? '입력값을 확인해주세요.')
  }

  const supabase = createAdminClient()

  const { data: maxRow } = await supabase
    .from('class_formation_groups')
    .select('sort_order')
    .eq('plan_id', parsed.data.planId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextSort = ((maxRow?.sort_order as number | undefined) ?? -1) + 1

  const { error } = await supabase.from('class_formation_groups').insert({
    plan_id: parsed.data.planId,
    name: parsed.data.name,
    weekday: parsed.data.weekday,
    homeroom_teacher_id: parsed.data.homeroomTeacherId,
    note: parsed.data.note,
    sort_order: nextSort,
  })

  if (error) {
    console.error('[class-formation] createGroupAction error', error)
    return fail('반 추가 중 오류가 발생했습니다.')
  }

  revalidatePath(WORKSPACE_PATH)
  return { ok: true }
}

export async function updateGroupAction(input: unknown): Promise<FormationActionResult> {
  const profile = await requireManager()
  if (!profile) return fail('반을 수정할 권한이 없습니다.')

  const parsed = updateGroupSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? '입력값을 확인해주세요.')
  }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('class_formation_groups')
    .update({
      name: parsed.data.name,
      weekday: parsed.data.weekday,
      homeroom_teacher_id: parsed.data.homeroomTeacherId,
      note: parsed.data.note,
    })
    .eq('id', parsed.data.groupId)

  if (error) {
    console.error('[class-formation] updateGroupAction error', error)
    return fail('반 정보를 수정하지 못했습니다.')
  }

  revalidatePath(WORKSPACE_PATH)
  return { ok: true }
}

export async function deleteGroupAction(groupId: string): Promise<FormationActionResult> {
  const profile = await requireManager()
  if (!profile) return fail('반을 삭제할 권한이 없습니다.')

  const supabase = createAdminClient()
  const { error } = await supabase.from('class_formation_groups').delete().eq('id', groupId)

  if (error) {
    console.error('[class-formation] deleteGroupAction error', error)
    return fail('반을 삭제하지 못했습니다.')
  }

  revalidatePath(WORKSPACE_PATH)
  return { ok: true }
}

export async function assignStudentAction(input: unknown): Promise<FormationActionResult> {
  const profile = await requireManager()
  if (!profile) return fail('학생을 배치할 권한이 없습니다.')

  const parsed = assignStudentSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? '입력값을 확인해주세요.')
  }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('class_formation_members')
    .upsert(
      {
        plan_id: parsed.data.planId,
        group_id: parsed.data.groupId,
        student_id: parsed.data.studentId,
      },
      { onConflict: 'plan_id,student_id' }
    )

  if (error) {
    console.error('[class-formation] assignStudentAction error', error)
    return fail('학생 배치 중 오류가 발생했습니다.')
  }

  revalidatePath(WORKSPACE_PATH)
  return { ok: true }
}

export async function unassignStudentAction(input: unknown): Promise<FormationActionResult> {
  const profile = await requireManager()
  if (!profile) return fail('학생 배치를 해제할 권한이 없습니다.')

  const parsed = unassignStudentSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? '입력값을 확인해주세요.')
  }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('class_formation_members')
    .delete()
    .eq('plan_id', parsed.data.planId)
    .eq('student_id', parsed.data.studentId)

  if (error) {
    console.error('[class-formation] unassignStudentAction error', error)
    return fail('학생 배치를 해제하지 못했습니다.')
  }

  revalidatePath(WORKSPACE_PATH)
  return { ok: true }
}

/**
 * 반편성안을 실제 반(classes/class_students/class_teachers)으로 반영한다.
 * 각 group을 반 1개로 만들고, 이미 만든 반(materialized_class_id)은 멤버·담임을 재동기화한다(멱등).
 */
export async function materializePlanAction(planId: string): Promise<FormationActionResult> {
  const profile = await requireManager()
  if (!profile) return fail('반을 생성할 권한이 없습니다.')

  const board = await fetchClassFormationBoard(planId)
  if (!board) return fail('반편성안을 찾을 수 없습니다.')

  const groupsWithMembers = board.groups.filter((group) => group.memberIds.length > 0)
  if (groupsWithMembers.length === 0) {
    return fail('학생이 배치된 반이 없습니다. 먼저 학생을 반에 배치해주세요.')
  }

  const supabase = createAdminClient()
  let createdCount = 0
  let updatedCount = 0

  try {
    for (const group of groupsWithMembers) {
      const teacherRows = group.homeroomTeacherId
        ? [{ teacher_id: group.homeroomTeacherId, is_homeroom: true }]
        : []
      const studentRows = group.memberIds.map((studentId) => ({ student_id: studentId }))

      let classId = group.materializedClassId

      if (classId) {
        const { error: updateError } = await supabase
          .from('classes')
          .update({ name: group.name, homeroom_teacher_id: group.homeroomTeacherId })
          .eq('id', classId)
        if (updateError) {
          console.error('[class-formation] materialize update class error', updateError)
          return fail(`"${group.name}" 반 갱신 중 오류가 발생했습니다.`)
        }
        updatedCount += 1
      } else {
        const { data: created, error: createError } = await supabase
          .from('classes')
          .insert({
            name: group.name,
            description: `반편성: ${board.plan.name}`,
            homeroom_teacher_id: group.homeroomTeacherId,
          })
          .select('id')
          .single()
        if (createError || !created) {
          console.error('[class-formation] materialize insert class error', createError)
          return fail(`"${group.name}" 반 생성 중 오류가 발생했습니다.`)
        }
        classId = created.id as string
        await supabase
          .from('class_formation_groups')
          .update({ materialized_class_id: classId })
          .eq('id', group.id)
        createdCount += 1
      }

      await supabase.from('class_teachers').delete().eq('class_id', classId)
      if (teacherRows.length > 0) {
        const { error: teacherError } = await supabase
          .from('class_teachers')
          .insert(teacherRows.map((row) => ({ class_id: classId, ...row })))
        if (teacherError) {
          console.error('[class-formation] materialize class_teachers error', teacherError)
          return fail(`"${group.name}" 담임 배정 중 오류가 발생했습니다.`)
        }
      }

      await supabase.from('class_students').delete().eq('class_id', classId)
      const { error: studentError } = await supabase
        .from('class_students')
        .insert(studentRows.map((row) => ({ class_id: classId, ...row })))
      if (studentError) {
        console.error('[class-formation] materialize class_students error', studentError)
        return fail(`"${group.name}" 학생 배정 중 오류가 발생했습니다.`)
      }
    }

    await supabase
      .from('class_formation_plans')
      .update({ status: 'finalized' })
      .eq('id', planId)

    revalidatePath(WORKSPACE_PATH)
    revalidatePath(MANAGER_CLASSES_PATH)
    return {
      ok: true,
      message: `반 ${createdCount + updatedCount}개를 반영했습니다. (신규 ${createdCount} · 갱신 ${updatedCount})`,
    }
  } catch (error) {
    console.error('[class-formation] materializePlanAction unexpected error', error)
    return fail('반 생성 중 예상치 못한 오류가 발생했습니다.')
  }
}
