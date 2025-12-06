import { SupabaseClient } from '@supabase/supabase-js'

export type Lecture = {
    id: string
    title: string
    description: string | null
    youtube_url: string
    is_published: boolean
    created_at: string
    updated_at: string
}

export async function fetchLectures(supabase: SupabaseClient) {
    const { data, error } = await supabase
        .from('lectures')
        .select('*')
        .order('created_at', { ascending: false })

    if (error) throw error
    return data as Lecture[]
}

export async function getLecture(supabase: SupabaseClient, id: string) {
    const { data, error } = await supabase
        .from('lectures')
        .select('*')
        .eq('id', id)
        .single()

    if (error) throw error
    return data as Lecture
}

export async function createLecture(supabase: SupabaseClient, lecture: Pick<Lecture, 'title' | 'description' | 'youtube_url'>) {
    const { data, error } = await supabase
        .from('lectures')
        .insert(lecture)
        .select()
        .single()

    if (error) throw error
    return data as Lecture
}

export async function updateLecture(supabase: SupabaseClient, id: string, lecture: Partial<Pick<Lecture, 'title' | 'description' | 'youtube_url' | 'is_published'>>) {
    const { data, error } = await supabase
        .from('lectures')
        .update(lecture)
        .eq('id', id)
        .select()
        .single()

    if (error) throw error
    return data as Lecture
}

export async function deleteLecture(supabase: SupabaseClient, id: string) {
    const { error } = await supabase
        .from('lectures')
        .delete()
        .eq('id', id)

    if (error) throw error
}

export function getYoutubeVideoId(url: string) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/
    const match = url.match(regExp)
    return (match && match[2].length === 11) ? match[2] : null
}
