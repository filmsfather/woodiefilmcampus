'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { WeeklyOverview } from '@/components/dashboard/teacher/learning-journal/WeeklyOverview'
import { ClassTemplateMaterialDialog } from '@/components/dashboard/teacher/learning-journal/ClassTemplateMaterialDialog'
import { upsertClassTemplateWeekAction } from '@/app/dashboard/teacher/learning-journal/actions'
import type {
  LearningJournalSubject,
  LearningJournalWeeklyData,
} from '@/types/learning-journal'
import { LEARNING_JOURNAL_SUBJECT_INFO } from '@/types/learning-journal'

interface MaterialOption {
  id: string
  title: string
  description: string | null
  subject: LearningJournalSubject
  display: string
  weekLabel: string | null
}

interface WeeklyOverviewEditableProps {
  classId: string
  periodId: string
  className: string
  weeks: LearningJournalWeeklyData[]
  materials: Record<LearningJournalSubject, MaterialOption[]>
}

export function WeeklyOverviewEditable({
  classId,
  periodId,
  className,
  weeks,
  materials,
}: WeeklyOverviewEditableProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [dialogState, setDialogState] = useState<{
    open: boolean
    weekIndex: number
    subject: LearningJournalSubject
  }>({ open: false, weekIndex: 1, subject: 'directing' })

  // 현재 선택된 주차/과목의 수업 자료 찾기
  const activeConfig = useMemo(() => {
    const targetWeek = weeks.find((w) => w.weekIndex === dialogState.weekIndex)
    if (!targetWeek) {
      return { materialIds: [], materialTitles: [], materialNotes: null }
    }

    const subjectData = targetWeek.subjects?.[dialogState.subject]
    if (!subjectData) {
      return { materialIds: [], materialTitles: [], materialNotes: null }
    }

    // materials에서 ID와 title 추출
    const materialIds = subjectData.materials
      .filter((m) => m.sourceId)
      .map((m) => m.sourceId as string)
    const materialTitles = subjectData.materials.map((m) => m.title)
    const materialNotes = subjectData.summaryNote ?? null

    return { materialIds, materialTitles, materialNotes }
  }, [weeks, dialogState.weekIndex, dialogState.subject])

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

      setFeedback({ type: 'success', message: '수업 내용이 저장되었습니다.' })
      handleDialogClose()
      router.refresh()

      // 피드백 메시지 3초 후 제거
      setTimeout(() => setFeedback(null), 3000)
    })
  }

  // 다이얼로그에 전달할 selected 배열 생성
  const selectedMaterials = useMemo(() => {
    return activeConfig.materialIds.map((id, index) => ({
      id,
      title: activeConfig.materialTitles[index] ?? '',
    }))
  }, [activeConfig.materialIds, activeConfig.materialTitles])

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

      <WeeklyOverview
        weeks={weeks}
        className={className}
        editable={true}
        onEdit={handleEdit}
      />

      {dialogState.open ? (
        <ClassTemplateMaterialDialog
          open={dialogState.open}
          onClose={handleDialogClose}
          subjectLabel={LEARNING_JOURNAL_SUBJECT_INFO[dialogState.subject].label}
          options={materials[dialogState.subject] ?? []}
          selected={selectedMaterials}
          notes={activeConfig.materialNotes}
          onSubmit={handleSubmit}
        />
      ) : null}
    </>
  )
}

