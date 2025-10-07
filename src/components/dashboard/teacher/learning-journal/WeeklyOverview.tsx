import { Badge } from '@/components/ui/badge'
import type { LearningJournalWeeklyData } from '@/types/learning-journal'
import { LEARNING_JOURNAL_SUBJECTS } from '@/types/learning-journal'

const SUBJECT_LABELS: Record<(typeof LEARNING_JOURNAL_SUBJECTS)[number], string> = {
  directing: '연출론',
  screenwriting: '작법론',
  film_research: '영화연구',
}

interface WeeklyOverviewProps {
  weeks: LearningJournalWeeklyData[]
}

export function WeeklyOverview({ weeks }: WeeklyOverviewProps) {
  return (
    <div className="space-y-4">
      {weeks.map((week) => (
        <section key={week.weekIndex} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-lg font-semibold text-slate-900">{week.weekIndex}주차</h3>
            <p className="text-xs text-slate-500">
              {week.startDate} ~ {week.endDate}
            </p>
          </header>

          <div className="grid gap-4 md:grid-cols-3">
            {LEARNING_JOURNAL_SUBJECTS.map((subject) => {
              const data = week.subjects[subject]

              return (
                <div key={subject} className="space-y-3 rounded-md border border-slate-200 p-3">
                  <h4 className="text-sm font-semibold text-slate-900">{SUBJECT_LABELS[subject]}</h4>

                  <div className="space-y-2">
                    <p className="text-xs font-medium text-slate-500">수업 자료</p>
                    {data.materials.length === 0 ? (
                      <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                        등록된 수업 자료가 없습니다.
                      </div>
                    ) : (
                      <ul className="space-y-2">
                        {data.materials.map((item, index) => (
                          <li key={`${subject}-material-${index}`} className="space-y-1 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-slate-800">{item.title}</span>
                              <Badge variant="outline" className="text-[10px]">
                                {item.sourceType === 'class_material' ? '아카이브' : '직접 입력'}
                              </Badge>
                            </div>
                            {item.note ? <p className="text-[11px] text-slate-500">{item.note}</p> : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium text-slate-500">과제 현황</p>
                    {data.assignments.length === 0 ? (
                      <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                        등록된 과제가 없습니다.
                      </div>
                    ) : (
                      <ul className="space-y-2">
                        {data.assignments.map((assignment) => (
                          <li key={assignment.id} className="space-y-1 rounded-md border border-slate-200 bg-white p-2 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-slate-800">{assignment.title}</span>
                              <Badge variant={assignment.status === 'completed' ? 'default' : 'outline'} className="text-[10px]">
                                {assignment.status === 'completed'
                                  ? '완료'
                                  : assignment.status === 'in_progress'
                                    ? '진행 중'
                                    : assignment.status === 'not_started'
                                      ? '미시작'
                                      : '대기'}
                              </Badge>
                            </div>
                            <div className="flex flex-wrap gap-2 text-[10px] text-slate-500">
                              {assignment.dueDate ? <span>마감: {assignment.dueDate}</span> : null}
                              {assignment.submittedAt ? <span>제출: {assignment.submittedAt}</span> : null}
                              {assignment.score !== null ? <span>점수: {assignment.score}</span> : null}
                            </div>
                            {assignment.note ? <p className="text-[11px] text-slate-500">{assignment.note}</p> : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
