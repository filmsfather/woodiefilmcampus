'use client'

import { useMemo, useState } from 'react'
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
  const [activeWeek, setActiveWeek] = useState<number>(weeks[0]?.weekIndex ?? 1)

  const activeConfig = useMemo(() => weeks.find((week) => week.weekIndex === activeWeek), [weeks, activeWeek])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {weeks.map((week) => (
          <Button
            key={week.weekIndex}
            variant={week.weekIndex === activeWeek ? 'default' : 'outline'}
            onClick={() => setActiveWeek(week.weekIndex)}
            className="px-4 py-2 text-sm"
          >
            {week.weekIndex}주차
          </Button>
        ))}
      </div>

      <div className="h-[500px] overflow-y-auto rounded-lg border border-slate-200 bg-white">
        <div className="space-y-4 p-4">
          {activeConfig ? (
            LEARNING_JOURNAL_SUBJECTS.map((subject) => {
              const config = activeConfig.subjects[subject]
              const hasMaterials = config.materialIds.length > 0 || config.materialTitles.length > 0

              return (
                <Card key={subject} className="border-slate-200">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-lg text-slate-900">{LEARNING_JOURNAL_SUBJECT_INFO[subject].label}</CardTitle>
                    <Button size="sm" onClick={() => onEdit(activeConfig.weekIndex, subject)}>
                      자료 선택 / 편집
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-slate-600">
                    {hasMaterials ? (
                      <div className="space-y-2">
                        <p className="text-xs text-slate-500">선택된 수업 자료</p>
                        <ul className="space-y-1">
                          {config.materialTitles.map((title, index) => (
                            <li key={`${subject}-${index}`} className="flex items-center gap-2">
                              <Badge variant="outline">자료 {index + 1}</Badge>
                              <span className="text-slate-700">{title || '제목 없음'}</span>
                            </li>
                          ))}
                        </ul>
                        {config.materialNotes ? (
                          <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs">
                            {config.materialNotes}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-500">
                        아직 선택된 수업 자료가 없습니다.
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })
          ) : (
            <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
              선택된 주차 정보가 없습니다.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
