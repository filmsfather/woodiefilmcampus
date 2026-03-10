'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { ensureManagerProfile } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'

interface ProfileRecord {
  id: string
  role: string
  status: string | null
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

function normalizePhone(phone: string): string {
  return phone.replace(/-/g, '')
}

function phoneVariants(phone: string): string[] {
  const stripped = normalizePhone(phone)
  const variants = [stripped]
  if (stripped.length === 11) {
    variants.push(`${stripped.slice(0, 3)}-${stripped.slice(3, 7)}-${stripped.slice(7)}`)
  } else if (stripped.length === 10) {
    variants.push(`${stripped.slice(0, 3)}-${stripped.slice(3, 6)}-${stripped.slice(6)}`)
  }
  return variants
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
        for (const v of phoneVariants(item.parent_phone)) phoneSet.add(v)
      }
      if (item.student_phone) {
        for (const v of phoneVariants(item.student_phone)) phoneSet.add(v)
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
        const key = normalizePhone(profile.parent_phone)
        const list = parentPhoneMap.get(key) ?? []
        if (!list.some((p) => p.id === profile.id)) list.push(profile)
        parentPhoneMap.set(key, list)
      }

      if (profile.student_phone) {
        const key = normalizePhone(profile.student_phone)
        const list = studentPhoneMap.get(key) ?? []
        if (!list.some((p) => p.id === profile.id)) list.push(profile)
        studentPhoneMap.set(key, list)
      }
    }

    const fetchProfilesByColumn = async (column: 'parent_phone' | 'student_phone') => {
      if (phoneList.length === 0) {
        return null
      }

      for (const values of chunk(phoneList, CHUNK_SIZE)) {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, role, status, parent_phone, student_phone, class_id')
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
          .select('id, role, status, parent_phone, student_phone, class_id')
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

    const allProfileIds = Array.from(profilesMap.keys())
    const classAssignmentMap = new Map<string, string>()

    if (allProfileIds.length > 0) {
      for (const ids of chunk(allProfileIds, CHUNK_SIZE)) {
        const { data: csRows, error: csError } = await supabase
          .from('class_students')
          .select('student_id, class_id')
          .in('student_id', ids)

        if (csError) {
          console.error('[enrollment] sync fetch class_students error', csError)
        }

        csRows?.forEach((row) => {
          if (!classAssignmentMap.has(row.student_id)) {
            classAssignmentMap.set(row.student_id, row.class_id)
          }
        })
      }
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
      const appStudentNorm = application.student_phone ? normalizePhone(application.student_phone) : null
      const appParentNorm = application.parent_phone ? normalizePhone(application.parent_phone) : null

      if (appStudentNorm) {
        const candidates = studentPhoneMap.get(appStudentNorm)
        if (candidates) {
          phoneMatches.push(...candidates)
        }
      }

      if (appParentNorm) {
        const candidates = parentPhoneMap.get(appParentNorm)
        if (candidates) {
          phoneMatches.push(...candidates)
        }
      }

      let matchedProfile = existingProfile

      if (!matchedProfile) {
        matchedProfile = phoneMatches.find((profile) => profile.student_phone && appStudentNorm && normalizePhone(profile.student_phone) === appStudentNorm) ?? null
      }

      if (!matchedProfile) {
        matchedProfile = phoneMatches.find((profile) => profile.parent_phone && appParentNorm && normalizePhone(profile.parent_phone) === appParentNorm) ?? null
      }

      if (!matchedProfile) {
        matchedProfile = phoneMatches[0] ?? null
      }

      const assignedClassId = matchedProfile
        ? classAssignmentMap.get(matchedProfile.id) ?? matchedProfile.class_id ?? null
        : null

      const INACTIVE_STATUSES = new Set(['withdrawn', 'graduated'])
      const isProfileInactive = matchedProfile?.status ? INACTIVE_STATUSES.has(matchedProfile.status) : false

      const nextStatus: 'pending' | 'confirmed' | 'assigned' = matchedProfile
        ? (assignedClassId || isProfileInactive)
          ? 'assigned'
          : 'confirmed'
        : 'pending'

      const nextMatchedProfileId = matchedProfile ? matchedProfile.id : null
      const nextAssignedClassId = assignedClassId

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
