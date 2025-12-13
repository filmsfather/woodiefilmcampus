'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { ensureManagerProfile } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'

interface ProfileRecord {
  id: string
  role: string
  parent_phone: string | null
  student_phone: string | null
  class_id: string | null
}

const CHUNK_SIZE = 100

function chunk<T>(values: T[], size: number): T[][] {
  const result: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size))
  }
  return result
}

export async function syncEnrollmentApplicationStatuses() {
  const managerProfile = await ensureManagerProfile()

  if (!managerProfile) {
    return { error: '등록원서 상태를 갱신할 권한이 없습니다.' }
  }

  try {
    const supabase = createAdminClient()

    const { data: applications, error: applicationsError } = await supabase
      .from('enrollment_applications')
      .select('id, parent_phone, student_phone, status, matched_profile_id, assigned_class_id')
      .neq('status', 'assigned')

    if (applicationsError) {
      console.error('[enrollment] sync fetch applications error', applicationsError)
      return { error: '등록원서를 불러오지 못했습니다.' }
    }

    if (!applications || applications.length === 0) {
      return { success: true as const, updated: 0 }
    }

    const phoneSet = new Set<string>()
    applications.forEach((item) => {
      if (item.parent_phone) {
        phoneSet.add(item.parent_phone)
      }
      if (item.student_phone) {
        phoneSet.add(item.student_phone)
      }
    })

    const phoneList = Array.from(phoneSet)
    const matchedProfileIds = Array.from(
      new Set(
        applications
          .map((item) => item.matched_profile_id)
          .filter((value): value is string => Boolean(value))
      )
    )

    const profilesMap = new Map<string, ProfileRecord>()
    const parentPhoneMap = new Map<string, ProfileRecord[]>()
    const studentPhoneMap = new Map<string, ProfileRecord[]>()

    const upsertProfile = (profile: ProfileRecord) => {
      if (profile.role !== 'student') {
        return
      }

      profilesMap.set(profile.id, profile)

      if (profile.parent_phone) {
        const list = parentPhoneMap.get(profile.parent_phone) ?? []
        list.push(profile)
        parentPhoneMap.set(profile.parent_phone, list)
      }

      if (profile.student_phone) {
        const list = studentPhoneMap.get(profile.student_phone) ?? []
        list.push(profile)
        studentPhoneMap.set(profile.student_phone, list)
      }
    }

    const fetchProfilesByColumn = async (column: 'parent_phone' | 'student_phone') => {
      if (phoneList.length === 0) {
        return null
      }

      for (const values of chunk(phoneList, CHUNK_SIZE)) {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, role, parent_phone, student_phone, class_id')
          .eq('role', 'student')
          .in(column, values)

        if (error) {
          console.error(`[enrollment] sync fetch profiles by ${column} error`, error)
          return error
        }

        data?.forEach((profile) => upsertProfile(profile))
      }

      return null
    }

    const fetchProfilesById = async () => {
      if (matchedProfileIds.length === 0) {
        return null
      }

      for (const values of chunk(matchedProfileIds, CHUNK_SIZE)) {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, role, parent_phone, student_phone, class_id')
          .in('id', values)

        if (error) {
          console.error('[enrollment] sync fetch profiles by id error', error)
          return error
        }

        data?.forEach((profile) => upsertProfile(profile))
      }

      return null
    }

    const fetchErrors = [await fetchProfilesByColumn('parent_phone'), await fetchProfilesByColumn('student_phone'), await fetchProfilesById()].filter(Boolean)

    if (fetchErrors.length > 0) {
      return { error: '학원생 정보를 불러오지 못했습니다.' }
    }

    const now = new Date().toISOString()
    const updates: Array<{
      id: string
      status: 'pending' | 'confirmed' | 'assigned'
      status_updated_at: string
      status_updated_by: string
      matched_profile_id: string | null
      assigned_class_id: string | null
    }> = []

    applications.forEach((application) => {
      const existingProfile = application.matched_profile_id
        ? profilesMap.get(application.matched_profile_id) ?? null
        : null

      const phoneMatches: ProfileRecord[] = []

      if (application.student_phone) {
        const candidates = studentPhoneMap.get(application.student_phone)
        if (candidates) {
          phoneMatches.push(...candidates)
        }
      }

      if (application.parent_phone) {
        const candidates = parentPhoneMap.get(application.parent_phone)
        if (candidates) {
          phoneMatches.push(...candidates)
        }
      }

      let matchedProfile = existingProfile

      if (!matchedProfile) {
        matchedProfile = phoneMatches.find((profile) => profile.student_phone === application.student_phone && profile.student_phone) ?? null
      }

      if (!matchedProfile) {
        matchedProfile = phoneMatches.find((profile) => profile.parent_phone === application.parent_phone && profile.parent_phone) ?? null
      }

      if (!matchedProfile) {
        matchedProfile = phoneMatches[0] ?? null
      }

      const nextStatus: 'pending' | 'confirmed' | 'assigned' = matchedProfile
        ? matchedProfile.class_id
          ? 'assigned'
          : 'confirmed'
        : 'pending'

      const nextMatchedProfileId = matchedProfile ? matchedProfile.id : null
      const nextAssignedClassId = matchedProfile?.class_id ?? null

      const statusChanged = nextStatus !== application.status
      const profileChanged = nextMatchedProfileId !== application.matched_profile_id
      const classChanged = nextAssignedClassId !== application.assigned_class_id

      if (statusChanged || profileChanged || classChanged) {
        updates.push({
          id: application.id,
          status: nextStatus,
          status_updated_at: now,
          status_updated_by: managerProfile.id,
          matched_profile_id: nextMatchedProfileId,
          assigned_class_id: nextAssignedClassId,
        })
      }
    })

    if (updates.length === 0) {
      return { success: true as const, updated: 0 }
    }

    for (const payload of updates) {
      const { error: updateError } = await supabase
        .from('enrollment_applications')
        .update({
          status: payload.status,
          status_updated_at: payload.status_updated_at,
          status_updated_by: payload.status_updated_by,
          matched_profile_id: payload.matched_profile_id,
          assigned_class_id: payload.assigned_class_id,
        })
        .eq('id', payload.id)

      if (updateError) {
        console.error('[enrollment] sync update error', updateError)
        return { error: '등록원서 상태 갱신 중 오류가 발생했습니다.' }
      }
    }

    revalidatePath('/dashboard/manager/enrollment')

    return { success: true as const, updated: updates.length }
  } catch (error) {
    console.error('[enrollment] sync unexpected error', error)
    return { error: '등록원서 상태를 갱신하지 못했습니다.' }
  }
}

const deleteEnrollmentApplicationSchema = z.object({
  applicationId: z.string().uuid(),
})

export async function deleteEnrollmentApplication(input: z.infer<typeof deleteEnrollmentApplicationSchema>) {
  const parsed = deleteEnrollmentApplicationSchema.safeParse(input)

  if (!parsed.success) {
    return { error: '잘못된 요청입니다.' }
  }

  const managerProfile = await ensureManagerProfile()

  if (!managerProfile) {
    return { error: '권한이 없습니다.' }
  }

  try {
    const supabase = createAdminClient()
    const { error } = await supabase
      .from('enrollment_applications')
      .delete()
      .eq('id', parsed.data.applicationId)

    if (error) {
      console.error('[manager] deleteEnrollmentApplication failed', error)
      return { error: '삭제 중 오류가 발생했습니다.' }
    }

    revalidatePath('/dashboard/manager/enrollment')
    return { success: true }
  } catch (error) {
    console.error('[manager] deleteEnrollmentApplication unexpected', error)
    return { error: '예상치 못한 오류가 발생했습니다.' }
  }
}
