'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CheckCircle2, Film } from 'lucide-react'

import { submitFilmResponses } from '@/app/dashboard/student/tasks/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { StudentTaskDetail } from '@/types/student-task'

const FILM_FIELDS: Array<{
  key: 'title' | 'director' | 'releaseYear' | 'genre' | 'country'
  label: string
  placeholder: string
  inputMode?: 'numeric'
}> = [
  { key: 'title', label: '영화 제목', placeholder: '예: 기생충' },
  { key: 'director', label: '감독', placeholder: '예: 봉준호' },
  { key: 'releaseYear', label: '개봉 연도', placeholder: '예: 2019', inputMode: 'numeric' },
  { key: 'genre', label: '장르', placeholder: '예: 드라마' },
  { key: 'country', label: '국가', placeholder: '예: 한국' },
]

const FILM_TEXTAREAS = [
  { key: 'summary', label: '줄거리 요약 (3문장 이상)', placeholder: '핵심 줄거리를 최소 3문장으로 작성해주세요.', rows: 4 },
  {
    key: 'favoriteScene',
    label: '연출적으로 좋았던 장면',
    placeholder: '인상 깊었던 장면과 이유를 작성해주세요.',
    rows: 4,
  },
] as const

type FilmFieldKey = (typeof FILM_FIELDS[number] | typeof FILM_TEXTAREAS[number])['key']

type FilmEntryValues = Record<FilmFieldKey, string>

function createEmptyEntry(): FilmEntryValues {
  return {
    title: '',
    director: '',
    releaseYear: '',
    genre: '',
    country: '',
    summary: '',
    favoriteScene: '',
  }
}

function parseExistingSubmission(content: string | null): FilmEntryValues {
  if (!content) {
    return createEmptyEntry()
  }

  try {
    const parsed = JSON.parse(content) as Partial<FilmEntryValues>
    const base: FilmEntryValues = createEmptyEntry()
    for (const key of [...FILM_FIELDS.map((field) => field.key), ...FILM_TEXTAREAS.map((field) => field.key)] as FilmFieldKey[]) {
      if (typeof parsed[key] === 'string') {
        base[key] = parsed[key] as string
      }
    }
    return base
  } catch (error) {
    console.error('[FilmTaskRunner] failed to parse submission', error)
    return createEmptyEntry()
  }
}

function sanitizeValue(value: string): string {
  return value.replace(/\r/g, '').replace(/\u00a0/g, ' ').trim()
}

function hasAnyValue(entry: FilmEntryValues): boolean {
  return (Object.values(entry) as string[]).some((value) => value.trim().length > 0)
}

function isEntryComplete(entry: FilmEntryValues): boolean {
  return (Object.values(entry) as string[]).every((value) => value.trim().length > 0)
}

interface FilmTaskRunnerProps {
  task: StudentTaskDetail
}

export function FilmTaskRunner({ task }: FilmTaskRunnerProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const items = task.items
  const initialEntries = useMemo(() => {
    return items.map((item) => parseExistingSubmission(item.submission?.content ?? null))
  }, [items])

  const [entries, setEntries] = useState<FilmEntryValues[]>(initialEntries)

  useEffect(() => {
    setEntries(initialEntries)
  }, [initialEntries])

  const noteCount = useMemo(() => {
    const workbookConfig = (task.assignment?.workbook.config ?? {}) as {
      film?: { noteCount?: number | null }
    }
    return workbookConfig.film?.noteCount ?? items.length
  }, [task.assignment?.workbook.config, items.length])

  const handleFieldChange = (entryIndex: number, key: FilmFieldKey, value: string) => {
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
    setEntries((prev) => prev.map((entry, index) => (index === entryIndex ? createEmptyEntry() : entry)))
    setErrorMessage(null)
    setSuccessMessage(null)
  }

  const handleSubmit = () => {
    setErrorMessage(null)
    setSuccessMessage(null)

    startTransition(async () => {
      try {
        const payload = {
          studentTaskId: task.id,
          entries: entries.map((entry, index) => {
            const normalized = Object.fromEntries(
              (Object.entries(entry) as Array<[FilmFieldKey, string]>).map(([key, value]) => [
                key,
                sanitizeValue(value),
              ])
            ) as FilmEntryValues

            return {
              studentTaskItemId: items[index]?.id ?? '',
              workbookItemId: items[index]?.workbookItem.id ?? '',
              ...normalized,
            }
          }),
        }

        const response = await submitFilmResponses(payload)

        if (!response.success) {
          setErrorMessage(response.error ?? '감상지를 저장하지 못했습니다.')
          return
        }

        setSuccessMessage('감상지를 저장했습니다.')
        router.refresh()
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
          const item = items[index]
          const heading = item?.workbookItem.prompt || `감상지 ${index + 1}`
          const completed = isEntryComplete(entry)
          const started = hasAnyValue(entry)

          return (
            <Card key={item?.id ?? index} className="border-slate-200">
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
                  {FILM_FIELDS.map((field) => (
                    <div key={field.key} className="space-y-2">
                      <label className="text-sm font-medium text-slate-700" htmlFor={`${item?.id}-${field.key}`}>
                        {field.label}
                      </label>
                      <Input
                        id={`${item?.id}-${field.key}`}
                        value={entry[field.key]}
                        onChange={(event) => handleFieldChange(index, field.key, event.target.value)}
                        placeholder={field.placeholder}
                        disabled={isPending}
                        inputMode={field.inputMode}
                      />
                    </div>
                  ))}
                </div>

                <div className="space-y-4">
                  {FILM_TEXTAREAS.map((field) => (
                    <div key={field.key} className="space-y-2">
                      <label className="text-sm font-medium text-slate-700" htmlFor={`${item?.id}-${field.key}`}>
                        {field.label}
                      </label>
                      <Textarea
                        id={`${item?.id}-${field.key}`}
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
