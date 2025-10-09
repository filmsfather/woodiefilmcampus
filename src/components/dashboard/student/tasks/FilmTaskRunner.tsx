'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CheckCircle2, Film } from 'lucide-react'

import { submitFilmResponses } from '@/app/dashboard/student/tasks/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  FILM_NOTE_FIELDS,
  FILM_NOTE_TEXT_AREAS,
  coerceFilmEntry,
  createEmptyFilmEntry,
  sanitizeFilmEntry,
  type FilmNoteEntry,
  type FilmNoteFieldKey,
} from '@/lib/film-notes'
import type { StudentTaskDetail } from '@/types/student-task'
import { useGlobalAsyncTask } from '@/hooks/use-global-loading'

function decodeFilmSubmission(
  content: string | null
): { entries: FilmNoteEntry[]; noteCount?: number } | null {
  if (!content) {
    return null
  }

  try {
    const parsed = JSON.parse(content) as unknown

    if (Array.isArray(parsed)) {
      return { entries: parsed.map(coerceFilmEntry) }
    }

    if (parsed && typeof parsed === 'object') {
      const maybeEntries = (parsed as { entries?: unknown }).entries
      const maybeNoteCount = Number((parsed as { noteCount?: unknown }).noteCount)

      if (Array.isArray(maybeEntries)) {
        return {
          entries: maybeEntries.map(coerceFilmEntry),
          noteCount: Number.isFinite(maybeNoteCount) ? maybeNoteCount : undefined,
        }
      }

      return { entries: [coerceFilmEntry(parsed)] }
    }
  } catch (error) {
    console.error('[FilmTaskRunner] failed to parse submission', error)
  }

  return null
}

function hasAnyValue(entry: FilmNoteEntry): boolean {
  return (Object.values(entry) as string[]).some((value) => value.trim().length > 0)
}

function isEntryComplete(entry: FilmNoteEntry): boolean {
  return (Object.values(entry) as string[]).every((value) => value.trim().length > 0)
}

interface FilmTaskRunnerProps {
  task: StudentTaskDetail
}

export function FilmTaskRunner({ task }: FilmTaskRunnerProps) {
  const router = useRouter()
  const { runWithLoading, isLoading: isPending } = useGlobalAsyncTask()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const items = task.items
  const baseItem = items[0] ?? null

  const workbookConfig = useMemo(() => {
    return (task.assignment?.workbook.config ?? {}) as {
      film?: { noteCount?: number | null }
    }
  }, [task.assignment?.workbook.config])

  const decodedEntries = useMemo(() => {
    const primary = decodeFilmSubmission(baseItem?.submission?.content ?? null)

    if (primary?.entries?.length) {
      return {
        entries: primary.entries.map(sanitizeFilmEntry),
        noteCount: primary.noteCount,
      }
    }

    const collected: FilmNoteEntry[] = []

    for (const item of items) {
      const parsed = decodeFilmSubmission(item.submission?.content ?? null)
      if (parsed?.entries?.length) {
        collected.push(...parsed.entries.map(sanitizeFilmEntry))
      }
    }

    return {
      entries: collected,
      noteCount: primary?.noteCount,
    }
  }, [baseItem?.submission?.content, items])

  const configuredNoteCount = useMemo(() => {
    const configured = workbookConfig.film?.noteCount
    if (typeof configured === 'number' && configured > 0) {
      return configured
    }
    return Math.max(items.length, 1)
  }, [workbookConfig, items.length])

  const noteCount = useMemo(() => {
    const detected = decodedEntries.noteCount && decodedEntries.noteCount > 0 ? decodedEntries.noteCount : undefined
    const storedLength = decodedEntries.entries.length
    return Math.max(configuredNoteCount, detected ?? 0, storedLength || 0, 1)
  }, [configuredNoteCount, decodedEntries])

  const initialEntries = useMemo(() => {
    return Array.from({ length: noteCount }, (_, index) => {
      const source = decodedEntries.entries[index]
      return source ? { ...source } : createEmptyFilmEntry()
    })
  }, [noteCount, decodedEntries])

  const [entries, setEntries] = useState<FilmNoteEntry[]>(initialEntries)

  useEffect(() => {
    setEntries(initialEntries)
  }, [initialEntries])

  const handleFieldChange = (entryIndex: number, key: FilmNoteFieldKey, value: string) => {
    setEntries((prev) =>
      prev.map((entry, index) => {
        if (index !== entryIndex) {
          return entry
        }

        if (key === 'releaseYear') {
          const cleaned = value.replace(/[^0-9]/g, '').slice(0, 4)
          return { ...entry, [key]: cleaned }
        }

        return { ...entry, [key]: value }
      })
    )
  }

  const handleClearEntry = (entryIndex: number) => {
    setEntries((prev) => prev.map((entry, index) => (index === entryIndex ? createEmptyFilmEntry() : entry)))
    setErrorMessage(null)
    setSuccessMessage(null)
  }

  const handleSubmit = () => {
    setErrorMessage(null)
    setSuccessMessage(null)

    void runWithLoading(async () => {
      try {
        if (!baseItem || !baseItem.workbookItem) {
          setErrorMessage('감상지 문항 정보를 불러오지 못했습니다.')
          return
        }

        const payload = {
          studentTaskId: task.id,
          studentTaskItemId: baseItem.id,
          workbookItemId: baseItem.workbookItem.id,
          noteCount,
          entries: entries.map((entry) => sanitizeFilmEntry(entry)),
        }

        const response = await submitFilmResponses(payload)

        if (!response.success) {
          setErrorMessage(response.error ?? '감상지를 저장하지 못했습니다.')
          return
        }

        setSuccessMessage('감상지를 저장했습니다.')
        await router.refresh()
      } catch (error) {
        console.error('[FilmTaskRunner] submit failed', error)
        setErrorMessage('제출 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
      }
    })
  }

  return (
    <div className="space-y-6">
      <Card className="border-slate-200">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base text-slate-800">
            <Film className="h-4 w-4" /> 감상지 작성 안내
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-slate-600">
          <p>각 영화에 대해 모든 항목을 작성하면 1개의 감상지가 완료됩니다.</p>
          <p>필요한 감상지 수: {noteCount}개 / 현재 완료: {entries.filter(isEntryComplete).length}개</p>
        </CardContent>
      </Card>

      <div className="space-y-6">
        {entries.map((entry, index) => {
          const itemForIndex = items[index] ?? baseItem
          const prompt = itemForIndex?.workbookItem.prompt ?? null
          const heading = prompt
            ? items.length > 1
              ? prompt
              : `${prompt} (${index + 1})`
            : `감상지 ${index + 1}`
          const completed = isEntryComplete(entry)
          const started = hasAnyValue(entry)
          const controlIdBase = `${itemForIndex?.id ?? 'film'}-${index}`

          return (
            <Card key={`${itemForIndex?.id ?? 'film'}-${index}`} className="border-slate-200">
              <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-lg font-semibold text-slate-900">{heading}</CardTitle>
                  <p className="text-sm text-slate-500">모든 항목을 작성하면 자동으로 완료 처리됩니다.</p>
                </div>
                <div className="flex items-center gap-2">
                  {completed ? (
                    <Badge variant="secondary">완료</Badge>
                  ) : started ? (
                    <Badge variant="outline">작성 중</Badge>
                  ) : (
                    <Badge variant="outline">미작성</Badge>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => handleClearEntry(index)} disabled={isPending}>
                    초기화
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  {FILM_NOTE_FIELDS.map((field) => (
                    <div key={field.key} className="space-y-2">
                      <label
                        className="text-sm font-medium text-slate-700"
                        htmlFor={`${controlIdBase}-${field.key}`}
                      >
                        {field.label}
                      </label>
                      <Input
                        id={`${controlIdBase}-${field.key}`}
                        value={entry[field.key]}
                        onChange={(event) => handleFieldChange(index, field.key, event.target.value)}
                        placeholder={field.placeholder}
                        disabled={isPending}
                        {...(field.inputMode ? { inputMode: field.inputMode } : {})}
                      />
                    </div>
                  ))}
                </div>

                <div className="space-y-4">
                  {FILM_NOTE_TEXT_AREAS.map((field) => (
                    <div key={field.key} className="space-y-2">
                      <label
                        className="text-sm font-medium text-slate-700"
                        htmlFor={`${controlIdBase}-${field.key}`}
                      >
                        {field.label}
                      </label>
                      <Textarea
                        id={`${controlIdBase}-${field.key}`}
                        value={entry[field.key]}
                        onChange={(event) => handleFieldChange(index, field.key, event.target.value)}
                        placeholder={field.placeholder}
                        rows={field.rows}
                        disabled={isPending}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {errorMessage && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4" />
          <p>{errorMessage}</p>
        </div>
      )}

      {successMessage && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          <p>{successMessage}</p>
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={handleSubmit} disabled={isPending} className="min-w-[140px]">
          {isPending ? '저장 중...' : '감상지 저장'}
        </Button>
      </div>
    </div>
  )
}

export default FilmTaskRunner
