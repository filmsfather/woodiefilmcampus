"use client"

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Edit3, PlusCircle } from 'lucide-react'

import { submitFilmResponses } from '@/app/dashboard/student/tasks/actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  FILM_NOTE_FIELDS,
  FILM_NOTE_TEXT_AREAS,
  createEmptyFilmEntry,
  sanitizeFilmEntry,
  hasFilmEntryValue,
  type FilmNoteEntry,
} from '@/lib/film-notes'
import type { FilmNoteHistoryEntry, FilmNoteHistorySummary } from '@/lib/film-history'

interface FilmNoteHistoryManagerProps {
  history: FilmNoteHistorySummary
}

type FormMode = 'create' | 'edit' | null

export function FilmNoteHistoryManager({ history }: FilmNoteHistoryManagerProps) {
  const router = useRouter()
  const [formMode, setFormMode] = useState<FormMode>(null)
  const [targetIndex, setTargetIndex] = useState<number | null>(null)
  const [formValues, setFormValues] = useState<FilmNoteEntry>(createEmptyFilmEntry())
  const [message, setMessage] = useState<string | null>(null)
  const [isError, setIsError] = useState(false)
  const [isPending, startTransition] = useTransition()

  const noteCount = history.workbook.noteCount

  const slotSnapshots = useMemo(() => {
    return Array.from({ length: noteCount }, (_, index) => {
      const source = history.noteSlots[index]
      return source ? sanitizeFilmEntry(source) : createEmptyFilmEntry()
    })
  }, [history.noteSlots, noteCount])

  const usedIndexSet = useMemo(() => {
    const set = new Set<number>()
    slotSnapshots.forEach((slot, index) => {
      if (hasFilmEntryValue(slot)) {
        set.add(index)
      }
    })
    return set
  }, [slotSnapshots])

  const completedEntries = history.entries

  const handleFieldChange = (key: keyof FilmNoteEntry, rawValue: string) => {
    setFormValues((prev) => {
      const next = { ...prev }
      if (key === 'releaseYear') {
        next[key] = rawValue.replace(/[^0-9]/g, '').slice(0, 4)
      } else {
        next[key] = rawValue
      }
      return next
    })
  }

  const beginCreate = () => {
    setMessage(null)
    setIsError(false)

    if (!history.taskItem.id || !history.taskItem.workbookItemId) {
      setIsError(true)
      setMessage('감상지 문항 정보를 찾을 수 없습니다.')
      return
    }

    const nextIndex = (() => {
      for (let index = 0; index < noteCount; index += 1) {
        if (!usedIndexSet.has(index)) {
          return index
        }
      }
      return null
    })()

    if (nextIndex === null) {
      setIsError(true)
      setMessage('추가할 수 있는 감상지가 없습니다. 기존 감상지를 수정해보세요.')
      return
    }

    setFormMode('create')
    setTargetIndex(nextIndex)
    setFormValues(createEmptyFilmEntry())
  }

  const beginEdit = (entry: FilmNoteHistoryEntry) => {
    setMessage(null)
    setIsError(false)
    setFormMode('edit')
    setTargetIndex(entry.noteIndex)
    setFormValues({ ...entry.content })
  }

  const handleCancel = () => {
    setFormMode(null)
    setTargetIndex(null)
    setFormValues(createEmptyFilmEntry())
    setMessage(null)
    setIsError(false)
  }

  const handleSubmit = () => {
    if (targetIndex === null || !formMode) {
      return
    }

    const studentTaskItemId = history.taskItem.id
    const workbookItemId = history.taskItem.workbookItemId

    if (!studentTaskItemId || !workbookItemId) {
      setIsError(true)
      setMessage('감상지 문항 정보를 찾을 수 없습니다.')
      return
    }

    const sanitized = sanitizeFilmEntry(formValues)
    const entriesPayload = slotSnapshots.map((slot) => ({ ...slot }))
    entriesPayload[targetIndex] = sanitized

    setIsError(false)
    setMessage(null)

    startTransition(async () => {
      const result = await submitFilmResponses({
        studentTaskId: history.taskId,
        studentTaskItemId,
        workbookItemId,
        noteCount,
        entries: entriesPayload,
      })

      if (!result.success) {
        setIsError(true)
        setMessage(result.error ?? '감상지를 저장하지 못했습니다.')
        return
      }

      setFormMode(null)
      setTargetIndex(null)
      setFormValues(createEmptyFilmEntry())
      setIsError(false)
      setMessage('감상지를 저장했습니다.')
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={beginCreate} disabled={isPending}>
          <PlusCircle className="mr-2 h-4 w-4" /> 새로운 감상지 작성하기
        </Button>
      </div>

      {message && (
        <Alert variant={isError ? 'destructive' : 'default'}>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        {completedEntries.length === 0 ? (
          <Card className="border-slate-200">
            <CardContent className="py-6 text-sm text-slate-600">
              아직 완료된 감상지가 없습니다. 새로운 감상지를 작성해보세요.
            </CardContent>
          </Card>
        ) : (
          completedEntries.map((entry) => {
            const infoSegments = [
              entry.content.title || '제목 미입력',
              entry.content.director || '감독 미입력',
              entry.content.releaseYear || '연도 미입력',
              entry.content.genre || '장르 미입력',
              entry.content.country || '국가 미입력',
            ]

            return (
              <Card key={entry.noteIndex} className="border-slate-200">
                <CardContent className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-slate-700">
                    <span className="font-semibold text-slate-900">감상지 {entry.noteIndex + 1}</span>{' '}
                    {infoSegments.join(' / ')}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => beginEdit(entry)}
                    disabled={isPending}
                    className="w-full sm:w-auto"
                  >
                    <Edit3 className="mr-2 h-4 w-4" /> 수정하기
                  </Button>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      {formMode && targetIndex !== null && (
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base text-slate-800">
              {formMode === 'create' ? '새로운 감상지 작성' : `감상지 ${targetIndex + 1} 수정`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {FILM_NOTE_FIELDS.map((field) => (
                <div key={field.key} className="space-y-1">
                  <label className="text-sm font-medium text-slate-700" htmlFor={`history-${field.key}`}>
                    {field.label}
                  </label>
                  <Input
                    id={`history-${field.key}`}
                    value={formValues[field.key] ?? ''}
                    onChange={(event) => handleFieldChange(field.key, event.target.value)}
                    placeholder={field.placeholder}
                    disabled={isPending}
                    {...(field.inputMode ? { inputMode: field.inputMode } : {})}
                  />
                </div>
              ))}
            </div>
            <div className="space-y-4">
              {FILM_NOTE_TEXT_AREAS.map((field) => (
                <div key={field.key} className="space-y-1">
                  <label className="text-sm font-medium text-slate-700" htmlFor={`history-${field.key}`}>
                    {field.label}
                  </label>
                  <Textarea
                    id={`history-${field.key}`}
                    value={formValues[field.key] ?? ''}
                    onChange={(event) => handleFieldChange(field.key, event.target.value)}
                    placeholder={field.placeholder}
                    disabled={isPending}
                    rows={field.rows}
                  />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={handleSubmit} disabled={isPending}>
                {isPending ? '저장 중...' : '감상지 저장'}
              </Button>
              <Button onClick={handleCancel} variant="ghost" disabled={isPending}>
                취소
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
