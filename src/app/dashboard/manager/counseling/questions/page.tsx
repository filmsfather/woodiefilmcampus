
import { CounselingQuestionManager } from '@/components/counseling/CounselingQuestionManager'
import { requireAuthForDashboard } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

interface QuestionRow {
  id: string
  field_key: string
  prompt: string
  field_type: 'text' | 'textarea'
  is_required: boolean
  is_active: boolean
  position: number
}

export default async function ManagerCounselingQuestionsPage() {
  await requireAuthForDashboard('manager')

  const supabase = createClient()
  const { data, error } = await supabase
    .from('counseling_questions')
    .select('id, field_key, prompt, field_type, is_required, is_active, position')
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[counseling] question fetch error', error)
  }

  const questions = (data ?? []) as QuestionRow[]

  return <CounselingQuestionManager questions={questions} />
}
