import { notFound, redirect } from 'next/navigation'

import { requireAuthForDashboard } from '@/lib/auth'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

interface SearchParams {
  student?: string
  period?: string
}

export default async function EnsureLearningJournalEntryPage({
  searchParams,
}: {
  searchParams?: SearchParams
}) {
  await requireAuthForDashboard(['teacher', 'manager'])

  const studentId = typeof searchParams?.student === 'string' ? searchParams.student : null
  const periodId = typeof searchParams?.period === 'string' ? searchParams.period : null

  if (!studentId || !periodId) {
    notFound()
  }

  const supabase = createServerSupabase()

  const { data: existing, error: fetchError } = await supabase
    .from('learning_journal_entries')
    .select('id')
    .eq('student_id', studentId)
    .eq('period_id', periodId)
    .maybeSingle()

  if (fetchError) {
    console.error('[learning-journal] ensure entry fetch error', fetchError)
    throw new Error('학습일지를 생성하지 못했습니다.')
  }

  if (existing?.id) {
    redirect(`/dashboard/teacher/learning-journal/entries/${existing.id}`)
  }

  const { data: inserted, error: insertError } = await supabase
    .from('learning_journal_entries')
    .insert({
      student_id: studentId,
      period_id: periodId,
      status: 'draft',
    })
    .select('id')
    .maybeSingle()

  if (insertError || !inserted) {
    console.error('[learning-journal] ensure entry insert error', insertError)
    throw new Error('학습일지를 생성하지 못했습니다.')
  }

  redirect(`/dashboard/teacher/learning-journal/entries/${inserted.id}`)
}
