'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { LearningJournalEntryContent } from '@/components/dashboard/learning-journal/LearningJournalEntryContent'
import { ClassTemplateMaterialDialog } from '@/components/dashboard/teacher/learning-journal/ClassTemplateMaterialDialog'
import { TaskPlacementDialog } from '@/components/dashboard/teacher/learning-journal/TaskPlacementDialog'
import { upsertClassTemplateWeekAction, updateTaskPlacementAction } from '@/app/dashboard/teacher/learning-journal/actions'
import type {
  LearningJournalAcademicEvent,
  LearningJournalComment,
  LearningJournalGreeting,
  LearningJournalSubject,
  LearningJournalWeeklyData,
  LearningJournalWeekAssignmentItem,
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

interface HeaderMetaItem {
  label: string
  value: string
}

interface EntryHeaderInfo {
  title: string
  subtitle?: string | null
  meta?: HeaderMetaItem[]
}

interface PeriodOption {
  id: string
  label: string
  startDate: string
  endDate: string
}

interface LearningJournalEntryEditorProps {
  classId: string
  periodId: string
  entryId: string
  className: string
  header: EntryHeaderInfo
  summary: unknown
  weekly: unknown
  greeting: LearningJournalGreeting | null
  academicEvents: LearningJournalAcademicEvent[]
  comments: LearningJournalComment[]
  materials: Record<LearningJournalSubject, MaterialOption[]>
  availablePeriods: PeriodOption[]
}

export function LearningJournalEntryEditor({
  classId,
  periodId,
  entryId,
  className,
  header,
  summary,
  weekly,
  greeting,
  academicEvents,
  comments,
  materials,
  availablePeriods,
}: LearningJournalEntryEditorProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [dialogState, setDialogState] = useState<{
    open: boolean
    weekIndex: number
    subject: LearningJournalSubject
  }>({ open: false, weekIndex: 1, subject: 'directing' })

  // 과제 배치 다이얼로그 상태
  const [taskPlacementState, setTaskPlacementState] = useState<{
    open: boolean
    task: LearningJournalWeekAssignmentItem | null
    weekIndex: number
  }>({ open: false, task: null, weekIndex: 1 })

  // weekly 데이터를 LearningJournalWeeklyData[]로 파싱
  const weeklyData = useMemo(() => {
    if (!weekly || !Array.isArray(weekly)) {
      return []
    }
    return weekly as LearningJournalWeeklyData[]
  }, [weekly])

  // 현재 선택된 주차/과목의 수업 자료 찾기
  const activeConfig = useMemo(() => {
    const targetWeek = weeklyData.find((w) => w.weekIndex === dialogState.weekIndex)
    if (!targetWeek) {
      return { materialIds: [], materialTitles: [], materialNotes: null }
    }

    const subjectData = targetWeek.subjects?.[dialogState.subject]
    if (!subjectData) {
      return { materialIds: [], materialTitles: [], materialNotes: null }
    }

    const materialIds = subjectData.materials
      .filter((m) => m.sourceId)
      .map((m) => m.sourceId as string)
    const materialTitles = subjectData.materials.map((m) => m.title)
    const materialNotes = subjectData.summaryNote ?? null

    return { materialIds, materialTitles, materialNotes }
  }, [weeklyData, dialogState.weekIndex, dialogState.subject])

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

      setTimeout(() => setFeedback(null), 3000)
    })
  }

  const selectedMaterials = useMemo(() => {
    return activeConfig.materialIds.map((id, index) => ({
      id,
      title: activeConfig.materialTitles[index] ?? '',
    }))
  }, [activeConfig.materialIds, activeConfig.materialTitles])

  // 과제 배치 변경 핸들러
  const handleEditTaskPlacement = (task: LearningJournalWeekAssignmentItem, weekIndex: number) => {
    setTaskPlacementState({ open: true, task, weekIndex })
  }

  const handleTaskPlacementClose = () => {
    setTaskPlacementState((prev) => ({ ...prev, open: false }))
  }

  const handleTaskPlacementSubmit = (taskId: string, weekOverride: number | null, periodOverride: string | null) => {
    const formData = new FormData()
    formData.set('taskId', taskId)
    formData.set('entryId', entryId)
    formData.set('weekOverride', weekOverride !== null ? String(weekOverride) : 'auto')
    formData.set('periodOverride', periodOverride ?? 'auto')

    startTransition(async () => {
      const result = await updateTaskPlacementAction(formData)

      if (result?.error) {
        setFeedback({ type: 'error', message: result.error })
        return
      }

      setFeedback({ type: 'success', message: '과제 배치가 변경되었습니다.' })
      handleTaskPlacementClose()
      router.refresh()

      setTimeout(() => setFeedback(null), 3000)
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

      <LearningJournalEntryContent
        header={header}
        greeting={greeting}
        academicEvents={academicEvents}
        summary={summary}
        weekly={weekly}
        comments={comments}
        editable={true}
        className={className}
        onEditWeeklyMaterial={handleEdit}
        onEditTaskPlacement={handleEditTaskPlacement}
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

      {taskPlacementState.open && taskPlacementState.task ? (
        <TaskPlacementDialog
          open={taskPlacementState.open}
          onClose={handleTaskPlacementClose}
          task={{
            taskId: taskPlacementState.task.taskId,
            title: taskPlacementState.task.title,
            weekOverride: taskPlacementState.task.weekOverride,
            periodOverride: taskPlacementState.task.periodOverride,
          }}
          currentPeriodId={periodId}
          currentWeekIndex={taskPlacementState.weekIndex}
          availablePeriods={availablePeriods}
          onSubmit={handleTaskPlacementSubmit}
          isSubmitting={isPending}
        />
      ) : null}
    </>
  )
}

