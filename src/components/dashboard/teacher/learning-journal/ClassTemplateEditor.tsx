'use client'


import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { LearningJournalSubject } from '@/types/learning-journal'
import { LEARNING_JOURNAL_SUBJECTS, LEARNING_JOURNAL_SUBJECT_INFO } from '@/types/learning-journal'

interface TemplateSubjectConfig {
  templateId: string | null
  materialIds: string[]
  materialTitles: string[]
  materialNotes: string | null
}

interface TemplateWeekConfig {
  weekIndex: number
  subjects: Record<LearningJournalSubject, TemplateSubjectConfig>
}

interface ClassTemplateEditorProps {
  weeks: TemplateWeekConfig[]
  onEdit: (weekIndex: number, subject: LearningJournalSubject) => void
}

export function ClassTemplateEditor({ weeks, onEdit }: ClassTemplateEditorProps) {
  return (
    <div className="space-y-6">
      {LEARNING_JOURNAL_SUBJECTS.map((subject) => (
        <Card key={subject} className="overflow-hidden border-slate-200">
          <CardHeader className="bg-slate-50 px-4 py-3">
            <CardTitle className="text-base font-semibold text-slate-900">
              {LEARNING_JOURNAL_SUBJECT_INFO[subject].label}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid divide-y divide-slate-200 md:grid-cols-4 md:divide-x md:divide-y-0">
              {[1, 2, 3, 4].map((weekIndex) => {
                const weekConfig = weeks.find((w) => w.weekIndex === weekIndex)
                const subjectConfig = weekConfig?.subjects[subject]
                const hasMaterials =
                  subjectConfig &&
                  (subjectConfig.materialIds.length > 0 || subjectConfig.materialTitles.length > 0)

                return (
                  <div
                    key={weekIndex}
                    className="group relative flex min-h-[120px] cursor-pointer flex-col gap-2 p-4 transition-colors hover:bg-slate-50"
                    onClick={() => onEdit(weekIndex, subject)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-500">{weekIndex}주차</span>
                      {subjectConfig?.materialNotes ? (
                        <Badge variant="secondary" className="text-[10px]">
                          노트
                        </Badge>
                      ) : null}
                    </div>

                    {hasMaterials ? (
                      <div className="space-y-1">
                        {subjectConfig.materialTitles.map((title, idx) => (
                          <p key={idx} className="line-clamp-2 text-sm text-slate-700">
                            {title || '제목 없음'}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-1 items-center justify-center text-xs text-slate-400">
                        계획 없음
                      </div>
                    )}

                    <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                      <Button variant="secondary" size="sm" className="shadow-sm">
                        편집
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
