'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { ClassTemplateEditor } from '@/components/dashboard/teacher/learning-journal/ClassTemplateEditor'
import { ClassTemplateMaterialDialog } from '@/components/dashboard/teacher/learning-journal/ClassTemplateMaterialDialog'
import { upsertClassTemplateWeekAction } from '@/app/dashboard/teacher/learning-journal/templates/actions'
import type {
  ClassLearningJournalTemplate,
  LearningJournalSubject,
} from '@/types/learning-journal'

interface MaterialOption {
  id: string
  title: string
  description: string | null
  subject: LearningJournalSubject
}

interface ClassTemplateEditorClientProps {
  classId: string
  periodId: string
  template: ClassLearningJournalTemplate
  materials: Record<LearningJournalSubject, MaterialOption[]>
}

export function ClassTemplateEditorClient({ classId, periodId, template, materials }: ClassTemplateEditorClientProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [dialogState, setDialogState] = useState<{
    open: boolean
    weekIndex: number
    subject: LearningJournalSubject
  }>({ open: false, weekIndex: 1, subject: 'directing' })

  const activeConfig = useMemo(() => {
    const target = template.weeks.find((week) => week.weekIndex === dialogState.weekIndex)
    if (!target) {
      return null
    }
    return target.subjects[dialogState.subject]
  }, [template.weeks, dialogState.weekIndex, dialogState.subject])

  const handleEdit = (weekIndex: number, subject: LearningJournalSubject) => {
    setDialogState({ open: true, weekIndex, subject })
  }

  const handleDialogClose = () => {
    setDialogState((prev) => ({ ...prev, open: false }))
  }

  const handleSubmit = (payload: { materialIds: string[]; materialTitles: string[]; materialNotes: string | null }) => {
    const formData = new FormData()
    formData.set('classId', classId)
    formData.set('periodId', periodId)
    formData.set('weekIndex', String(dialogState.weekIndex))
    formData.set('subject', dialogState.subject)

    for (const id of payload.materialIds) {
      formData.append('materialIds', id)
    }
    for (const title of payload.materialTitles) {
      formData.append('materialTitles', title)
    }
    if (payload.materialNotes) {
      formData.set('materialNotes', payload.materialNotes)
    } else {
      formData.set('materialNotes', '')
    }

    startTransition(async () => {
      const result = await upsertClassTemplateWeekAction(formData)

      if (result?.error) {
        setFeedback({ type: 'error', message: result.error })
        return
      }

      setFeedback({ type: 'success', message: '주차 템플릿이 저장되었습니다.' })
      handleDialogClose()
      router.refresh()
    })
  }

  return (
    <>
      {feedback ? (
        <div
          className={
            feedback.type === 'success'
              ? 'mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700'
              : 'mb-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700'
          }
        >
          {feedback.message}
        </div>
      ) : null}
      <ClassTemplateEditor weeks={template.weeks} onEdit={handleEdit} />
      {dialogState.open && activeConfig ? (
        <ClassTemplateMaterialDialog
          open={dialogState.open}
          onClose={handleDialogClose}
          subjectLabel={
            dialogState.subject === 'directing'
              ? '연출론'
              : dialogState.subject === 'screenwriting'
                ? '작법론'
                : '영화연구'
          }
          options={materials[dialogState.subject] ?? []}
          selected={activeConfig.materialIds.map((id, index) => ({
            id,
            title: activeConfig.materialTitles[index] ?? '',
          }))}
          notes={activeConfig.materialNotes}
          onSubmit={handleSubmit}
        />
      ) : null}
    </>
  )
}
