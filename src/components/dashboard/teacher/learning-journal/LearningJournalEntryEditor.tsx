'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { LearningJournalEntryContent } from '@/components/dashboard/learning-journal/LearningJournalEntryContent'
import { ClassTemplateMaterialDialog } from '@/components/dashboard/teacher/learning-journal/ClassTemplateMaterialDialog'
import { PublishedAtDialog } from '@/components/dashboard/teacher/learning-journal/PublishedAtDialog'
import { upsertClassTemplateWeekAction, updateAssignmentDatesAction } from '@/app/dashboard/teacher/learning-journal/actions'
import type {
  LearningJournalAcademicEvent,
  LearningJournalAnnualSchedule,
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
  photoUrl?: string | null
  subtitle?: string | null
  meta?: HeaderMetaItem[]
}

interface PeriodOption {
  id: string
  label: string
  startDate: string
  endDate: string
}

interface StudentEntry {
  id: string
  studentId: string
  studentName: string
}

interface ClassOption {
  periodId: string
  classId: string
  className: string
  firstEntryId: string | null
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
  annualSchedules?: LearningJournalAnnualSchedule[]
  comments: LearningJournalComment[]
  materials: Record<LearningJournalSubject, MaterialOption[]>
  availablePeriods: PeriodOption[]
  entries?: StudentEntry[]
  availableClasses?: ClassOption[]
  currentClassId?: string
  /** 코멘트 카드 대신 렌더링할 커스텀 슬롯 (편집 모드용) */
  commentSlot?: React.ReactNode
  /** 인사말 카드 대신 렌더링할 커스텀 슬롯 (원장 편집 모드용) */
  greetingSlot?: React.ReactNode
  /** 연간 일정 관리 페이지 링크 (원장용) */
  annualScheduleHref?: string
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
  annualSchedules,
  comments,
  materials,
  availablePeriods,
  entries,
  availableClasses,
  currentClassId,
  commentSlot,
  greetingSlot,
  annualScheduleHref,
}: LearningJournalEntryEditorProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [dialogState, setDialogState] = useState<{
    open: boolean
    weekIndex: number
    subject: LearningJournalSubject
  }>({ open: false, weekIndex: 1, subject: 'directing' })

  // 출제일 수정 다이얼로그 상태
  const [publishedAtState, setPublishedAtState] = useState<{
    open: boolean
    task: LearningJournalWeekAssignmentItem | null
  }>({ open: false, task: null })

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
    formData.set('entryId', entryId)
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

  // 출제일 수정 핸들러
  const handleEditPublishedAt = (task: LearningJournalWeekAssignmentItem) => {
    setPublishedAtState({ open: true, task })
  }

  const handlePublishedAtClose = () => {
    setPublishedAtState((prev) => ({ ...prev, open: false }))
  }

  const handlePublishedAtSubmit = (assignmentId: string, publishedAt: string | null, dueAt: string | null) => {
    const formData = new FormData()
    formData.set('assignmentId', assignmentId)
    formData.set('publishedAt', publishedAt ?? 'null')
    formData.set('dueAt', dueAt ?? 'null')
    formData.set('entryId', entryId)

    startTransition(async () => {
      const result = await updateAssignmentDatesAction(formData)

      if (result?.error) {
        setFeedback({ type: 'error', message: result.error })
        return
      }

      setFeedback({ type: 'success', message: '출제일이 변경되었습니다.' })
      handlePublishedAtClose()
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
        annualSchedules={annualSchedules}
        summary={summary}
        weekly={weekly}
        comments={comments}
        commentSlot={commentSlot}
        greetingSlot={greetingSlot}
        annualScheduleHref={annualScheduleHref}
        editable={true}
        className={className}
        onEditWeeklyMaterial={handleEdit}
        onEditPublishedAt={handleEditPublishedAt}
        entries={entries}
        currentEntryId={entryId}
        availableClasses={availableClasses}
        currentClassId={currentClassId}
      />

      {dialogState.open ? (
        <ClassTemplateMaterialDialog
          open={dialogState.open}
          onClose={handleDialogClose}
          subject={dialogState.subject}
          subjectLabel={LEARNING_JOURNAL_SUBJECT_INFO[dialogState.subject].label}
          options={materials[dialogState.subject] ?? []}
          selected={selectedMaterials}
          notes={activeConfig.materialNotes}
          onSubmit={handleSubmit}
        />
      ) : null}

      {publishedAtState.open && publishedAtState.task ? (
        <PublishedAtDialog
          open={publishedAtState.open}
          onClose={handlePublishedAtClose}
          task={{
            taskId: publishedAtState.task.taskId,
            assignmentId: publishedAtState.task.id,
            title: publishedAtState.task.title,
            publishedAt: publishedAtState.task.publishedAt ?? null,
            dueAt: publishedAtState.task.dueAt ?? null,
          }}
          onSubmit={handlePublishedAtSubmit}
          isSubmitting={isPending}
        />
      ) : null}
    </>
  )
}

