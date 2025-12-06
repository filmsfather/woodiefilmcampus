'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { createLecture, updateLecture, deleteLecture } from '@/lib/lectures'
import { requireAuthForDashboard } from '@/lib/auth'

export async function createLectureAction(formData: FormData) {
    const { profile } = await requireAuthForDashboard(['teacher', 'manager', 'principal'])
    if (!profile) throw new Error('Unauthorized')

    const title = formData.get('title') as string
    const description = formData.get('description') as string
    const youtube_url = formData.get('youtube_url') as string

    const supabase = createServerSupabase()
    await createLecture(supabase, { title, description, youtube_url })

    revalidatePath('/dashboard/teacher/lectures')
    redirect('/dashboard/teacher/lectures')
}

export async function updateLectureAction(id: string, formData: FormData) {
    const { profile } = await requireAuthForDashboard(['teacher', 'manager', 'principal'])
    if (!profile) throw new Error('Unauthorized')

    const title = formData.get('title') as string
    const description = formData.get('description') as string
    const youtube_url = formData.get('youtube_url') as string
    const is_published = formData.get('is_published') === 'on'

    const supabase = createServerSupabase()
    await updateLecture(supabase, id, { title, description, youtube_url, is_published })

    revalidatePath('/dashboard/teacher/lectures')
    redirect('/dashboard/teacher/lectures')
}

export async function deleteLectureAction(id: string) {
    const { profile } = await requireAuthForDashboard(['teacher', 'manager', 'principal'])
    if (!profile) throw new Error('Unauthorized')

    const supabase = createServerSupabase()
    await deleteLecture(supabase, id)

    revalidatePath('/dashboard/teacher/lectures')
}
