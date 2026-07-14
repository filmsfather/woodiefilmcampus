'use server'

import { revalidatePath } from 'next/cache'

import { ensureManagerProfile } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  deleteClassScheduleEntrySchema,
  upsertClassScheduleEntrySchema,
  type DeleteClassScheduleEntryInput,
  type UpsertClassScheduleEntryInput,
} from '@/lib/validation/timetable'

const MANAGER_CLASSES_PATH = '/dashboard/manager/classes'

interface ActionResultBase {
  status: 'success' | 'error'
  message?: string
}

export interface UpsertClassScheduleEntryResult extends ActionResultBase {
  entry?: {
    id: string
    classId: string
    dayOfWeek: number
    period: number
    startTime: string
    endTime: string
    teacherId: string | null
  }
}

export interface DeleteClassScheduleEntryResult extends ActionResultBase {
  removedId?: string
}

function makeError(message: string): ActionResultBase {
  return { status: 'error', message }
}

export async function upsertClassScheduleEntryAction(
  input: UpsertClassScheduleEntryInput,
): Promise<UpsertClassScheduleEntryResult> {
  const profile = await ensureManagerProfile()

  if (!profile) {
    return makeError('시간표를 수정할 권한이 없습니다.')
  }

  const parsed = upsertClassScheduleEntrySchema.safeParse(input)

  if (!parsed.success) {
    return makeError(parsed.error.flatten().formErrors[0] ?? '입력값을 다시 확인해주세요.')
  }

  const supabase = createAdminClient()
  const { entryId, classId, dayOfWeek, period, startTime, endTime, teacherId } = parsed.data

  try {
    const payload = {
      class_id: classId,
      day_of_week: dayOfWeek,
      period,
      start_time: startTime,
      end_time: endTime,
      teacher_id: teacherId,
    }

    const query = entryId
      ? supabase.from('class_schedule_entries').update(payload).eq('id', entryId)
      : supabase.from('class_schedule_entries').insert(payload)

    const { data, error } = await query
      .select('id, class_id, day_of_week, period, start_time, end_time, teacher_id')
      .maybeSingle()

    if (error) {
      console.error('upsertClassScheduleEntryAction error', error)

      if (error.code === '23505') {
        return makeError('해당 반에 같은 요일·교시 수업이 이미 등록되어 있습니다.')
      }

      return makeError('시간표 항목을 저장하지 못했습니다.')
    }

    if (!data) {
      return makeError('시간표 항목을 저장하지 못했습니다.')
    }

    revalidatePath(MANAGER_CLASSES_PATH)

    return {
      status: 'success',
      message: entryId ? '시간표 항목을 수정했습니다.' : '시간표 항목을 추가했습니다.',
      entry: {
        id: data.id,
        classId: data.class_id,
        dayOfWeek: data.day_of_week,
        period: data.period,
        startTime: data.start_time,
        endTime: data.end_time,
        teacherId: data.teacher_id,
      },
    }
  } catch (error) {
    console.error('upsertClassScheduleEntryAction unexpected error', error)
    return makeError('시간표 항목 저장 중 예상치 못한 오류가 발생했습니다.')
  }
}

export async function deleteClassScheduleEntryAction(
  input: DeleteClassScheduleEntryInput,
): Promise<DeleteClassScheduleEntryResult> {
  const profile = await ensureManagerProfile()

  if (!profile) {
    return makeError('시간표를 수정할 권한이 없습니다.')
  }

  const parsed = deleteClassScheduleEntrySchema.safeParse(input)

  if (!parsed.success) {
    return makeError(parsed.error.flatten().formErrors[0] ?? '입력값을 다시 확인해주세요.')
  }

  const supabase = createAdminClient()

  try {
    const { error } = await supabase
      .from('class_schedule_entries')
      .delete()
      .eq('id', parsed.data.entryId)

    if (error) {
      console.error('deleteClassScheduleEntryAction delete error', error)
      return makeError('시간표 항목을 삭제하지 못했습니다.')
    }

    revalidatePath(MANAGER_CLASSES_PATH)

    return {
      status: 'success',
      message: '시간표 항목을 삭제했습니다.',
      removedId: parsed.data.entryId,
    }
  } catch (error) {
    console.error('deleteClassScheduleEntryAction unexpected error', error)
    return makeError('시간표 항목 삭제 중 예상치 못한 오류가 발생했습니다.')
  }
}
