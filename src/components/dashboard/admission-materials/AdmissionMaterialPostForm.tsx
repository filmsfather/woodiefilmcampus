'use client'

import { useMemo, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { AdmissionMaterialCategory } from '@/lib/admission-materials'

const MAX_UPLOAD_SIZE = 20 * 1024 * 1024 // 20MB

export interface AdmissionMaterialScheduleDefaults {
  title: string
  startAt: string
  endAt?: string | null
  memo?: string | null
}

export interface AdmissionMaterialPostFormDefaults {
  postId?: string
  targetLevel?: string | null
  title?: string
  description?: string | null
  guideName?: string | null
  resourceName?: string | null
  schedules?: AdmissionMaterialScheduleDefaults[]
}

type FormResult = {
  success?: boolean
  error?: string
  postId?: string
}

type DeleteResult = {
  success?: boolean
  error?: string
}

interface AdmissionMaterialPostFormProps {
  category: AdmissionMaterialCategory
  defaults?: AdmissionMaterialPostFormDefaults
  submitLabel?: string
  onSubmit: (formData: FormData) => Promise<FormResult>
  onDelete?: (() => Promise<DeleteResult>) | null
}

type ScheduleItem = {
  id: string
  title: string
  startAt: string
  endAt: string | null
  memo: string
}

function safeRandomId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `schedule-${Math.random().toString(36).slice(2)}`
}

function toLocalInputValue(value: string | null): string {
  if (!value) {
    return ''
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const tzOffset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - tzOffset * 60_000)
  return local.toISOString().slice(0, 16)
}

function toISOStringFromLocal(value: string): string | null {
  if (!value || value.length === 0) {
    return null
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return date.toISOString()
}

export function AdmissionMaterialPostForm({
  category,
  defaults,
  submitLabel = '저장',
  onSubmit,
  onDelete,
}: AdmissionMaterialPostFormProps) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isDeleting, startDeleteTransition] = useTransition()

  const isGuideline = category === 'guideline'

  const [guidelineSelection, setGuidelineSelection] = useState(() => {
    const titleSeed = defaults?.title ?? ''
    return {
      susi: titleSeed.includes('수시'),
      jeongsi: titleSeed.includes('정시'),
    }
  })

  const [schedules, setSchedules] = useState<ScheduleItem[]>(() => {
    const seed = defaults?.schedules ?? []
    if (seed.length === 0) {
      return []
    }
    return seed.map((item) => ({
      id: safeRandomId(),
      title: item.title,
      startAt: item.startAt,
      endAt: item.endAt ?? null,
      memo: item.memo ?? '',
    }))
  })

  const maxSizeLabel = useMemo(() => `${Math.round(MAX_UPLOAD_SIZE / (1024 * 1024))}MB`, [])
  const headerDescription = isGuideline
    ? '대학교 이름과 전형을 선택하고 요강 자료 · 일정을 등록하세요. PDF, 이미지, 오피스 문서를 지원합니다.'
    : '준비 대상과 제목을 입력하고 필요한 자료 · 일정을 등록하세요. PDF, 이미지, 오피스 문서를 지원합니다.'
  const targetLabel = isGuideline ? '대학교 이름 (선택)' : '준비 대상 (선택)'
  const targetPlaceholder = isGuideline ? '예: 중앙대학교 영화과' : '예: 영화과 3학년, 수시 준비반'
  const targetHelper = isGuideline
    ? '대학교 이름을 입력하면 검색이 쉬워집니다.'
    : '자료가 어떤 학생을 위한 것인지 표시하면 검색이 쉬워집니다.'
  const descriptionLabel = isGuideline ? '입시 요강 (선택)' : '자료 설명 (선택)'
  const descriptionPlaceholder = isGuideline
    ? '모집 요강의 핵심 내용이나 전달하고 싶은 사항을 정리하세요.'
    : '자료 활용법이나 참고 사항을 간단히 작성하세요.'
  const guideLabel = isGuideline ? '입시 전체 요강 (선택)' : '기본 가이드 파일 (선택)'
  const guideRemoveLabel = isGuideline ? '기존 입시 전체 요강 파일 삭제' : '기존 가이드 파일 삭제'
  const resourceLabel = isGuideline ? '입시 요강 요약본 (선택)' : '참고 자료 파일 (선택)'
  const resourceRemoveLabel = isGuideline ? '기존 입시 요강 요약본 삭제' : '기존 참고 자료 파일 삭제'
  const guideHelpText = isGuideline
    ? `업로드 제한: 최대 ${maxSizeLabel}. 요강 원문 파일을 업로드하세요.`
    : `업로드 제한: 최대 ${maxSizeLabel}. 새 파일을 선택하면 기존 파일을 교체합니다.`
  const resourceHelpText = isGuideline
    ? `업로드 제한: 최대 ${maxSizeLabel}. 요약본 파일을 업로드하세요.`
    : `업로드 제한: 최대 ${maxSizeLabel}. 새 파일을 선택하면 기존 파일을 교체합니다.`
  const scheduleTitlePlaceholder = isGuideline
    ? '예: 2025학년도 수시 모집요강 발표'
    : '예: 중앙대 모의 면접'
  const scheduleMemoPlaceholder = isGuideline
    ? '요강에서 주목해야 할 변경 사항을 메모하세요.'
    : '지참 서류나 사전 준비 사항을 적어두세요.'

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSuccessMessage(null)

    const form = event.currentTarget
    const formData = new FormData(form)
    formData.set('category', category)
    if (defaults?.postId) {
      formData.set('postId', defaults.postId)
    }

    const guideFile = formData.get('guideFile')
    const resourceFile = formData.get('resourceFile')

    if (guideFile instanceof File && guideFile.size > MAX_UPLOAD_SIZE) {
      setError(`가이드 파일은 최대 ${maxSizeLabel}까지 업로드할 수 있습니다.`)
      return
    }

    if (resourceFile instanceof File && resourceFile.size > MAX_UPLOAD_SIZE) {
      setError(`참고 자료 파일은 최대 ${maxSizeLabel}까지 업로드할 수 있습니다.`)
      return
    }

    if (isGuideline) {
      const selections: string[] = []
      if (guidelineSelection.susi) {
        selections.push('수시')
      }
      if (guidelineSelection.jeongsi) {
        selections.push('정시')
      }

      if (selections.length === 0) {
        setError('수시 또는 정시를 최소 한 개 이상 선택해주세요.')
        return
      }

      formData.set('title', selections.join(' · '))
    }

    const schedulePayload = schedules.map((item) => ({
      title: item.title.trim(),
      startAt: item.startAt,
      endAt: item.endAt,
      memo: item.memo.trim().length > 0 ? item.memo.trim() : undefined,
    }))

    formData.set('schedules', JSON.stringify(schedulePayload))

    startTransition(async () => {
      const result = await onSubmit(formData)

      if (result?.error) {
        setError(result.error)
        if (typeof window !== 'undefined') {
          window.alert(result.error)
        }
        return
      }

      if (result?.success) {
        const targetPostId = result.postId ?? defaults?.postId ?? null

        if (targetPostId) {
          router.push(`/dashboard/teacher/admission-materials/${category}/${targetPostId}`)
          router.refresh()
          return
        }

        setSuccessMessage('자료가 저장되었습니다.')
        router.refresh()
      }
    })
  }

  const handleDelete = () => {
    if (!onDelete) {
      return
    }

    setError(null)
    setSuccessMessage(null)

    startDeleteTransition(async () => {
      const result = await onDelete()

      if (result?.error) {
        setError(result.error)
        return
      }

      if (result?.success) {
        router.push(`/dashboard/teacher/admission-materials/${category}`)
        router.refresh()
      }
    })
  }

  const addSchedule = () => {
    const nowIso = new Date().toISOString()
    setSchedules((prev) => [
      ...prev,
      {
        id: safeRandomId(),
        title: '',
        startAt: nowIso,
        endAt: null,
        memo: '',
      },
    ])
  }

  const updateSchedule = (id: string, field: keyof ScheduleItem, value: string) => {
    setSchedules((prev) =>
      prev.map((item) => {
        if (item.id !== id) {
          return item
        }

        if (field === 'startAt') {
          const iso = toISOStringFromLocal(value)
          return {
            ...item,
            startAt: iso ?? item.startAt,
          }
        }

        if (field === 'endAt') {
          const iso = toISOStringFromLocal(value)
          return {
            ...item,
            endAt: iso,
          }
        }

        return {
          ...item,
          [field]: value,
        }
      })
    )
  }

  const removeSchedule = (id: string) => {
    setSchedules((prev) => prev.filter((item) => item.id !== id))
  }

  return (
    <Card className="border-slate-200">
      <CardHeader className="space-y-1">
        <CardTitle className="text-xl text-slate-900">입시 자료 정보</CardTitle>
        <p className="text-sm text-slate-500">{headerDescription}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {successMessage ? (
          <Alert>
            <AlertDescription>{successMessage}</AlertDescription>
          </Alert>
        ) : null}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <input type="hidden" name="category" value={category} />
          {defaults?.postId ? <input type="hidden" name="postId" value={defaults.postId} /> : null}

          <div className="grid gap-2">
            <Label htmlFor="targetLevel">{targetLabel}</Label>
            <Input
              id="targetLevel"
              name="targetLevel"
              placeholder={targetPlaceholder}
              defaultValue={defaults?.targetLevel ?? ''}
              maxLength={120}
              disabled={isPending}
            />
            <p className="text-xs text-slate-500">{targetHelper}</p>
          </div>

          {isGuideline ? (
            <div className="space-y-2">
              <span className="text-sm font-medium text-slate-700">전형 선택</span>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={guidelineSelection.susi}
                    onChange={(event) =>
                      setGuidelineSelection((prev) => ({ ...prev, susi: event.target.checked }))
                    }
                    disabled={isPending}
                  />
                  수시
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={guidelineSelection.jeongsi}
                    onChange={(event) =>
                      setGuidelineSelection((prev) => ({ ...prev, jeongsi: event.target.checked }))
                    }
                    disabled={isPending}
                  />
                  정시
                </label>
              </div>
              <p className="text-xs text-slate-500">수시, 정시 중 공유할 전형을 선택하세요.</p>
            </div>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="title">제목</Label>
              <Input
                id="title"
                name="title"
                required
                placeholder="예: 2025 수시 대비 모의 면접 가이드"
                defaultValue={defaults?.title ?? ''}
                maxLength={200}
                disabled={isPending}
              />
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="description">{descriptionLabel}</Label>
            <Textarea
              id="description"
              name="description"
              rows={5}
              defaultValue={defaults?.description ?? ''}
              placeholder={descriptionPlaceholder}
              disabled={isPending}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="guideFile">
              {guideLabel}
              {defaults?.guideName ? (
                <span className="ml-2 text-xs text-slate-500">현재: {defaults.guideName}</span>
              ) : null}
            </Label>
            <Input
              id="guideFile"
              name="guideFile"
              type="file"
              accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.zip,image/*"
              disabled={isPending}
            />
            {defaults?.guideName ? (
              <label className="flex items-center gap-2 text-xs text-slate-500">
                <input type="checkbox" name="removeGuide" value="1" disabled={isPending} />
                {guideRemoveLabel}
              </label>
            ) : null}
            <p className="text-xs text-slate-500">{guideHelpText}</p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="resourceFile">
              {resourceLabel}
              {defaults?.resourceName ? (
                <span className="ml-2 text-xs text-slate-500">현재: {defaults.resourceName}</span>
              ) : null}
            </Label>
            <Input
              id="resourceFile"
              name="resourceFile"
              type="file"
              accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.zip,image/*"
              disabled={isPending}
            />
            {defaults?.resourceName ? (
              <label className="flex items-center gap-2 text-xs text-slate-500">
                <input type="checkbox" name="removeResource" value="1" disabled={isPending} />
                {resourceRemoveLabel}
              </label>
            ) : null}
            <p className="text-xs text-slate-500">{resourceHelpText}</p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-medium text-slate-900">일정 등록</h2>
                <p className="text-xs text-slate-500">입시 관련 일정을 추가하면 달력에서 한 번에 확인할 수 있습니다.</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addSchedule} disabled={isPending}>
                일정 추가
              </Button>
            </div>

            {schedules.length === 0 ? (
              <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                등록된 일정이 없습니다. 오른쪽 버튼을 눌러 첫 일정을 추가하세요.
              </p>
            ) : (
              <div className="space-y-4">
                {schedules.map((schedule) => (
                  <div key={schedule.id} className="rounded-md border border-slate-200 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <Label className="text-sm font-medium text-slate-700">일정 제목</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="self-start text-xs text-red-500 hover:text-red-600"
                        onClick={() => removeSchedule(schedule.id)}
                        disabled={isPending}
                      >
                        삭제
                      </Button>
                    </div>
                    <div className="mt-3 grid gap-3">
                      <div className="grid gap-2">
                        <Label className="text-xs text-slate-500">제목</Label>
                        <Input
                          value={schedule.title}
                          onChange={(event) => updateSchedule(schedule.id, 'title', event.target.value)}
                          placeholder={scheduleTitlePlaceholder}
                          maxLength={150}
                          disabled={isPending}
                        />
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div className="grid gap-2">
                        <Label className="text-xs text-slate-500">시작</Label>
                        <Input
                          type="datetime-local"
                          value={toLocalInputValue(schedule.startAt)}
                          onChange={(event) => updateSchedule(schedule.id, 'startAt', event.target.value)}
                          disabled={isPending}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label className="text-xs text-slate-500">종료 (선택)</Label>
                        <Input
                          type="datetime-local"
                          value={toLocalInputValue(schedule.endAt)}
                          onChange={(event) => updateSchedule(schedule.id, 'endAt', event.target.value)}
                          disabled={isPending}
                        />
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2">
                      <Label className="text-xs text-slate-500">메모 (선택)</Label>
                      <Textarea
                        value={schedule.memo}
                        onChange={(event) => updateSchedule(schedule.id, 'memo', event.target.value)}
                        rows={3}
                        placeholder={scheduleMemoPlaceholder}
                        disabled={isPending}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
            {onDelete ? (
              <Button
                type="button"
                variant="ghost"
                className="text-red-500 hover:text-red-600"
                onClick={handleDelete}
                disabled={isDeleting || isPending}
              >
                {isDeleting ? '삭제 중…' : '자료 삭제'}
              </Button>
            ) : <span />}

            <div className="flex gap-2">
              <Button type="submit" disabled={isPending}>
                {isPending ? '저장 중…' : submitLabel}
              </Button>
              <Button type="button" variant="secondary" onClick={() => router.back()} disabled={isPending}>
                취소
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
