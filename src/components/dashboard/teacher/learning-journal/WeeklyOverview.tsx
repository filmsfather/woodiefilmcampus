'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import type { LearningJournalWeeklyData, LearningJournalWeeklySubjectData, LearningJournalSubject, LearningJournalWeekAssignmentItem } from '@/types/learning-journal'
import { LEARNING_JOURNAL_SUBJECTS, LEARNING_JOURNAL_SUBJECT_INFO } from '@/types/learning-journal'

const STATUS_LABEL: Record<string, string> = {
  completed: '완료',
  in_progress: '진행 중',
  not_started: '미시작',
  pending: '대기',
}

interface WeeklyOverviewProps {
  weeks: LearningJournalWeeklyData[]
  className?: string
  editable?: boolean
  onEdit?: (weekIndex: number, subject: LearningJournalSubject) => void
  onEditPublishedAt?: (task: LearningJournalWeekAssignmentItem) => void
}

export function WeeklyOverview({ weeks, className, editable = false, onEdit, onEditPublishedAt }: WeeklyOverviewProps) {
  const handleMaterialClick = (weekIndex: number, subject: LearningJournalSubject) => {
    if (editable && onEdit) {
      onEdit(weekIndex, subject)
    }
  }

  const handlePublishedAtClick = (task: LearningJournalWeekAssignmentItem) => {
    if (editable && onEditPublishedAt) {
      // taskId가 없으면 id를 fallback으로 사용 (기존 데이터 호환성)
      const normalizedTask = {
        ...task,
        taskId: task.taskId ?? task.id,
      }
      onEditPublishedAt(normalizedTask)
    }
  }

  return (
    <div className="space-y-6">
      {weeks.map((week, index) => {
        const allSubjectsEmpty = LEARNING_JOURNAL_SUBJECTS.every((subject) => {
          const data =
            week.subjects?.[subject] ??
            ({
              materials: [],
              assignments: [],
              summaryNote: null,
            } satisfies LearningJournalWeeklySubjectData)
          return (
            data.materials.length === 0 &&
            data.assignments.length === 0 &&
            !(data.summaryNote && data.summaryNote.trim())
          )
        })

        return (
          <section
            key={week.weekIndex}
            className={`space-y-3 ${index > 0 ? 'border-t border-slate-200 pt-6' : ''}`}
          >
            <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-base font-semibold text-slate-900">{week.weekIndex}주차</h3>
              <p className="text-xs text-slate-500">
                {week.startDate} ~ {week.endDate}
              </p>
            </header>

            {allSubjectsEmpty ? (
              editable && onEdit ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {LEARNING_JOURNAL_SUBJECTS.map((subject) => (
                    <button
                      key={subject}
                      type="button"
                      onClick={() => handleMaterialClick(week.weekIndex, subject)}
                      className="group flex items-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500 transition-colors hover:border-slate-400 hover:bg-slate-100"
                    >
                      <Plus className="h-4 w-4 text-slate-400 transition-colors group-hover:text-slate-500" />
                      <span>
                        {className ? `${className} ` : ''}
                        {LEARNING_JOURNAL_SUBJECT_INFO[subject].label} 수업내용 추가하기
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">
                  등록된 학습 정보가 없습니다.
                </div>
              )
            ) : (
              <div className="space-y-4">
                {LEARNING_JOURNAL_SUBJECTS.map((subject) => {
                  const data =
                    week.subjects?.[subject] ??
                    ({
                      materials: [],
                      assignments: [],
                      summaryNote: null,
                    } satisfies LearningJournalWeeklySubjectData)
                  const hasMaterials = data.materials.length > 0
                  const hasAssignments = data.assignments.length > 0
                  const hasSummary = Boolean(data.summaryNote && data.summaryNote.trim())
                  const hasContent = hasMaterials || hasAssignments || hasSummary

                  // 편집 모드일 때는 내용이 없어도 표시
                  if (!hasContent && !editable) {
                    return null
                  }

                  return (
                    <div key={subject} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-slate-900">
                          {LEARNING_JOURNAL_SUBJECT_INFO[subject].label}
                        </h4>
                        {editable && onEdit ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleMaterialClick(week.weekIndex, subject)}
                            className="h-7 px-2 text-xs text-slate-500 hover:text-slate-700"
                          >
                            {hasMaterials ? '편집' : '추가'}
                          </Button>
                        ) : null}
                      </div>

                      {hasMaterials || hasSummary ? (
                        <div className="space-y-1 pl-3 text-xs text-slate-600">
                          {hasMaterials ? (
                            <div className="space-y-1">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">수업 내용</p>
                              {data.materials.map((item, index) => (
                                <p
                                  key={`${subject}-material-${index}`}
                                  className={editable && onEdit ? 'cursor-pointer hover:text-slate-900' : ''}
                                  onClick={
                                    editable && onEdit
                                      ? () => handleMaterialClick(week.weekIndex, subject)
                                      : undefined
                                  }
                                >
                                  {item.title}
                                </p>
                              ))}
                            </div>
                          ) : null}

                          {hasSummary ? (
                            <p className="text-slate-500">{data.summaryNote}</p>
                          ) : null}
                        </div>
                      ) : editable && onEdit ? (
                        <button
                          type="button"
                          onClick={() => handleMaterialClick(week.weekIndex, subject)}
                          className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-400 transition-colors hover:border-slate-300 hover:bg-slate-100 hover:text-slate-500"
                        >
                          <Plus className="h-3 w-3" />
                          <span>
                            {className ? `${className} ` : ''}수업내용 추가하기
                          </span>
                        </button>
                      ) : null}

                      {hasAssignments ? (
                        <div className="space-y-1 pl-3 text-xs">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">과제</p>
                          {data.assignments.map((assignment) => (
                            <div
                              key={assignment.id}
                              className="flex items-center justify-between gap-2 text-slate-600"
                            >
                              <span>{assignment.title}</span>
                              <div className="flex items-center gap-1">
                                <Badge
                                  variant={assignment.status === 'completed' ? 'default' : 'outline'}
                                  className="text-[10px]"
                                >
                                  {STATUS_LABEL[assignment.status] ?? assignment.status}
                                </Badge>
                                {assignment.submittedLate ? (
                                  <Badge variant="destructive" className="text-[10px]">
                                    지각
                                  </Badge>
                                ) : null}
                                {editable && onEditPublishedAt ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs text-slate-500 hover:text-slate-700"
                                    onClick={() => handlePublishedAtClick(assignment)}
                                  >
                                    날짜
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
