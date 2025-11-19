import { Badge } from '@/components/ui/badge'
import type { LearningJournalWeeklyData, LearningJournalWeeklySubjectData } from '@/types/learning-journal'
import { LEARNING_JOURNAL_SUBJECTS, LEARNING_JOURNAL_SUBJECT_INFO } from '@/types/learning-journal'

const STATUS_LABEL: Record<string, string> = {
  completed: '완료',
  in_progress: '진행 중',
  not_started: '미시작',
  pending: '대기',
}

interface WeeklyOverviewProps {
  weeks: LearningJournalWeeklyData[]
}

export function WeeklyOverview({ weeks }: WeeklyOverviewProps) {
  return (
    <div className="space-y-4">
      {weeks.map((week) => {
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
            className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
          >
            <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-lg font-semibold text-slate-900">{week.weekIndex}주차</h3>
              <p className="text-xs text-slate-500">
                {week.startDate} ~ {week.endDate}
              </p>
            </header>

            {allSubjectsEmpty ? (
              <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">
                등록된 학습 정보가 없습니다.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
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

                  if (!hasContent) {
                    return null
                  }

                  return (
                    <div key={subject} className="space-y-3 rounded-md border border-slate-200 p-3">
                      <h4 className="text-sm font-semibold text-slate-900">
                        {LEARNING_JOURNAL_SUBJECT_INFO[subject].label}
                      </h4>

                      {hasMaterials || hasSummary ? (
                        <div className="space-y-2">
                          {hasMaterials ? (
                            <>
                              <p className="text-xs font-medium text-slate-500">수업 내용</p>
                              <ul className="space-y-1 text-xs text-slate-600">
                                {data.materials.map((item, index) => (
                                  <li
                                    key={`${subject}-material-${index}`}
                                    className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
                                  >
                                    <span className="font-medium text-slate-800">{item.title}</span>
                                  </li>
                                ))}
                              </ul>
                            </>
                          ) : null}

                          {hasSummary ? (
                            <p className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
                              {data.summaryNote}
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      {hasAssignments ? (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-slate-500">과제</p>
                          <ul className="space-y-2">
                            {data.assignments.map((assignment) => (
                              <li
                                key={assignment.id}
                                className="space-y-1 rounded-md border border-slate-200 bg-white p-2 text-xs"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-medium text-slate-800">{assignment.title}</span>
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
                                  </div>
                                </div>
                              </li>
                            ))}
                          </ul>
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
