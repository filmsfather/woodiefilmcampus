'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ImagePlus, Loader2, Plus, Trash2, X } from 'lucide-react'

import {
  createPracticeProblemAction,
  updatePracticeProblemAction,
} from '@/app/dashboard/teacher/mock-practice/problems/actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { PRACTICE_ASSETS_BUCKET } from '@/lib/storage/buckets'
import {
  buildPendingStoragePath,
  uploadFileToStorageViaClient,
  type UploadedObjectMeta,
} from '@/lib/storage-upload'
import type { PracticeProblemDetail, PracticeType, PracticeUniversityOption } from '@/types/practice'

const MAX_IMAGE_SIZE = 20 * 1024 * 1024
const PROBLEMS_PATH = '/dashboard/teacher/mock-practice/problems'

type FormImage =
  | { kind: 'existing'; mediaAssetId: string; url: string | null }
  | { kind: 'new'; meta: UploadedObjectMeta; previewUrl: string }

interface FormItem {
  key: string
  prompt: string
}

interface FormRubricItem {
  key: string
  label: string
  maxScore: string
  description: string
}

function newItem(prompt = ''): FormItem {
  return { key: crypto.randomUUID(), prompt }
}

function newRubricItem(): FormRubricItem {
  return { key: crypto.randomUUID(), label: '', maxScore: '10', description: '' }
}

interface PracticeProblemFormProps {
  uploaderId: string
  universities: PracticeUniversityOption[]
  initialProblem?: PracticeProblemDetail
}

export function PracticeProblemForm({ uploaderId, universities, initialProblem }: PracticeProblemFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [universityId, setUniversityId] = useState(initialProblem?.universityId ?? '')
  const [practiceType, setPracticeType] = useState<PracticeType>(initialProblem?.practiceType ?? 'writing')
  const [title, setTitle] = useState(initialProblem?.title ?? '')
  const [description, setDescription] = useState(initialProblem?.description ?? '')
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<string>(
    initialProblem ? String(initialProblem.timeLimitMinutes) : '60'
  )
  const [orderIndex, setOrderIndex] = useState<string>(initialProblem ? String(initialProblem.orderIndex) : '0')
  const [isActive, setIsActive] = useState(initialProblem?.isActive ?? true)

  const [items, setItems] = useState<FormItem[]>(() => {
    if (!initialProblem) {
      return [newItem()]
    }
    return initialProblem.items.map((item) => ({ key: item.id, prompt: item.prompt }))
  })

  const [images, setImages] = useState<FormImage[]>(() => {
    if (!initialProblem) {
      return []
    }
    return initialProblem.assets.map((asset) => ({
      kind: 'existing' as const,
      mediaAssetId: asset.mediaAssetId,
      url: asset.url,
    }))
  })

  const [rubricItems, setRubricItems] = useState<FormRubricItem[]>(() => {
    if (!initialProblem) {
      return []
    }
    return initialProblem.rubricItems.map((item) => ({
      key: item.id,
      label: item.label,
      maxScore: String(item.maxScore),
      description: item.description ?? '',
    }))
  })

  const handleImageSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('이미지 파일만 업로드할 수 있습니다.')
      return
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setError('이미지 크기는 최대 20MB까지 허용됩니다.')
      return
    }

    setError(null)
    setIsUploading(true)

    try {
      const path = buildPendingStoragePath({ ownerId: uploaderId, prefix: 'pending', fileName: file.name })
      const result = await uploadFileToStorageViaClient({
        bucket: PRACTICE_ASSETS_BUCKET,
        file,
        path,
        maxSizeBytes: MAX_IMAGE_SIZE,
      })

      setImages((prev) => [
        ...prev,
        {
          kind: 'new',
          meta: {
            bucket: PRACTICE_ASSETS_BUCKET,
            path: result.path,
            size: result.size,
            mimeType: result.mimeType,
            originalName: result.originalName,
          },
          previewUrl: URL.createObjectURL(file),
        },
      ])
    } catch (err) {
      console.error('[practice] problem image upload failed', err)
      setError(err instanceof Error ? err.message : '이미지 업로드에 실패했습니다.')
    } finally {
      setIsUploading(false)
    }
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (!universityId) {
      setError('대학을 선택해주세요.')
      return
    }
    if (!title.trim()) {
      setError('문제 제목을 입력해주세요.')
      return
    }

    const parsedTimeLimit = Number(timeLimitMinutes)
    if (!Number.isInteger(parsedTimeLimit) || parsedTimeLimit < 5 || parsedTimeLimit > 600) {
      setError('제한시간은 5분 이상 600분 이하의 정수로 입력해주세요.')
      return
    }

    const parsedOrder = Number(orderIndex)
    if (!Number.isInteger(parsedOrder) || parsedOrder < 0 || parsedOrder > 9999) {
      setError('배정 순번은 0 이상 9999 이하의 정수로 입력해주세요.')
      return
    }

    if (items.length === 0 || items.some((item) => !item.prompt.trim())) {
      setError('모든 문항의 내용을 입력해주세요.')
      return
    }

    for (const rubric of rubricItems) {
      if (!rubric.label.trim()) {
        setError('채점 항목명을 모두 입력해주세요.')
        return
      }
      const score = Number(rubric.maxScore)
      if (!Number.isFinite(score) || score <= 0) {
        setError('채점 항목의 배점은 0보다 큰 숫자여야 합니다.')
        return
      }
    }

    const payload = {
      universityId,
      practiceType,
      title: title.trim(),
      description: description.trim() || null,
      timeLimitMinutes: parsedTimeLimit,
      orderIndex: parsedOrder,
      isActive,
      items: items.map((item) => ({ prompt: item.prompt.trim() })),
      images: images.map((image) =>
        image.kind === 'existing' ? { mediaAssetId: image.mediaAssetId } : image.meta
      ),
      rubricItems: rubricItems.map((rubric) => ({
        label: rubric.label.trim(),
        maxScore: Number(rubric.maxScore),
        description: rubric.description.trim() || null,
      })),
    }

    startTransition(async () => {
      const result = initialProblem
        ? await updatePracticeProblemAction({ ...payload, problemId: initialProblem.id })
        : await createPracticeProblemAction(payload)

      if (result.success) {
        router.push(PROBLEMS_PATH)
        router.refresh()
      } else {
        setError(result.error ?? '저장에 실패했습니다.')
      }
    })
  }

  const isBusy = isPending || isUploading

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">기본 정보</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>대학 *</Label>
              <Select value={universityId} onValueChange={setUniversityId} disabled={isBusy}>
                <SelectTrigger>
                  <SelectValue placeholder="대학을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {universities.map((university) => (
                    <SelectItem key={university.id} value={university.id}>
                      {university.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {universities.length === 0 && (
                <p className="text-xs text-amber-600">
                  등록된 대학이 없습니다. 원장님 대학 관리 화면에서 대학을 먼저 추가해주세요.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>유형 *</Label>
              <Select
                value={practiceType}
                onValueChange={(value) => setPracticeType(value as PracticeType)}
                disabled={isBusy}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="writing">작법형 (원고지 손글씨 제출)</SelectItem>
                  <SelectItem value="interview">면접형 (타자 답안 + 녹화 면접)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="practice-problem-title">문제 제목 *</Label>
            <Input
              id="practice-problem-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="예: 서울예대 극작 실기 1회"
              maxLength={200}
              disabled={isBusy}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="practice-problem-time">제한시간 (분) *</Label>
              <Input
                id="practice-problem-time"
                type="number"
                inputMode="numeric"
                min={5}
                max={600}
                step={5}
                value={timeLimitMinutes}
                onChange={(event) => setTimeLimitMinutes(event.target.value)}
                disabled={isBusy}
                required
              />
              <p className="text-xs text-slate-500">
                예약 시각에서 이 시간을 뺀 시점에 문제가 공개됩니다. 예약이 15:00이고 제한시간이 60분이면 14:00부터
                풀 수 있습니다.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="practice-problem-order">배정 순번</Label>
              <Input
                id="practice-problem-order"
                type="number"
                inputMode="numeric"
                min={0}
                max={9999}
                value={orderIndex}
                onChange={(event) => setOrderIndex(event.target.value)}
                disabled={isBusy}
              />
              <p className="text-xs text-slate-500">
                숫자가 작을수록 먼저 배정됩니다. 학생마다 아직 안 푼 문제 중 순번이 가장 빠른 것이 자동 배정됩니다.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="practice-problem-description">안내 문구</Label>
            <Textarea
              id="practice-problem-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="응시 안내를 입력하세요 (선택)"
              rows={3}
              maxLength={4000}
              disabled={isBusy}
            />
          </div>

          <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
            <Switch id="practice-problem-active" checked={isActive} onCheckedChange={setIsActive} disabled={isBusy} />
            <div>
              <Label htmlFor="practice-problem-active" className="cursor-pointer">
                배정 대상에 포함
              </Label>
              <p className="text-xs text-slate-500">끄면 새 예약에 배정되지 않습니다. 기존 예약에는 영향이 없습니다.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base text-slate-900">문항</CardTitle>
            <p className="mt-1 text-xs text-slate-500">
              {practiceType === 'writing'
                ? '작법형은 보통 한 문항입니다. 학생은 원고지에 작성해 사진으로 제출합니다.'
                : '면접형은 전형에 맞춰 여러 문항을 둘 수 있습니다. 학생이 문항별로 타자 답안을 작성합니다.'}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isBusy || items.length >= 30}
            onClick={() => setItems((prev) => [...prev, newItem()])}
          >
            <Plus className="mr-1 h-4 w-4" /> 문항 추가
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.map((item, index) => (
            <div key={item.key} className="flex items-start gap-2 rounded-md border border-slate-200 bg-white p-3">
              <span className="mt-2 shrink-0 text-xs font-medium text-slate-500">문항 {index + 1}</span>
              <Textarea
                value={item.prompt}
                onChange={(event) =>
                  setItems((prev) =>
                    prev.map((entry) => (entry.key === item.key ? { ...entry, prompt: event.target.value } : entry))
                  )
                }
                placeholder="문항 내용을 입력하세요"
                rows={3}
                maxLength={4000}
                disabled={isBusy}
                className="flex-1"
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-red-600 hover:text-red-700"
                disabled={isBusy || items.length <= 1}
                onClick={() => setItems((prev) => prev.filter((entry) => entry.key !== item.key))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">문제 이미지</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {images.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {images.map((image, index) => {
                const src = image.kind === 'existing' ? image.url : image.previewUrl
                return (
                  <div
                    key={`problem-image-${index}`}
                    className="relative h-28 w-28 overflow-hidden rounded-md border border-slate-200 bg-slate-50"
                  >
                    {src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={src} alt={`문제 이미지 ${index + 1}`} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                        미리보기 없음
                      </div>
                    )}
                    <button
                      type="button"
                      className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-slate-600 shadow hover:text-red-600"
                      disabled={isBusy}
                      onClick={() => setImages((prev) => prev.filter((_, entryIndex) => entryIndex !== index))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleImageSelect} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isBusy || images.length >= 10}
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-1 h-4 w-4" />}
            이미지 추가
          </Button>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base text-slate-900">채점표</CardTitle>
            <p className="mt-1 text-xs text-slate-500">
              1:1 피드백 중 선생님이 항목별로 점수를 입력합니다. 비워두면 서술 피드백만 남깁니다.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isBusy || rubricItems.length >= 20}
            onClick={() => setRubricItems((prev) => [...prev, newRubricItem()])}
          >
            <Plus className="mr-1 h-4 w-4" /> 항목 추가
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {rubricItems.length === 0 ? (
            <p className="text-xs text-slate-400">채점 항목이 없습니다.</p>
          ) : (
            rubricItems.map((rubric, index) => (
              <div key={rubric.key} className="space-y-2 rounded-md border border-slate-200 bg-white p-3">
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-xs font-medium text-slate-500">항목 {index + 1}</span>
                  <Input
                    value={rubric.label}
                    onChange={(event) =>
                      setRubricItems((prev) =>
                        prev.map((entry) =>
                          entry.key === rubric.key ? { ...entry, label: event.target.value } : entry
                        )
                      )
                    }
                    placeholder="예: 주제 구현력"
                    maxLength={100}
                    disabled={isBusy}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    min={1}
                    max={1000}
                    value={rubric.maxScore}
                    onChange={(event) =>
                      setRubricItems((prev) =>
                        prev.map((entry) =>
                          entry.key === rubric.key ? { ...entry, maxScore: event.target.value } : entry
                        )
                      )
                    }
                    disabled={isBusy}
                    className="w-24"
                    aria-label="배점"
                  />
                  <span className="text-xs text-slate-500">점</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    disabled={isBusy}
                    onClick={() => setRubricItems((prev) => prev.filter((entry) => entry.key !== rubric.key))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <Input
                  value={rubric.description}
                  onChange={(event) =>
                    setRubricItems((prev) =>
                      prev.map((entry) =>
                        entry.key === rubric.key ? { ...entry, description: event.target.value } : entry
                      )
                    )
                  }
                  placeholder="채점 기준 설명 (선택)"
                  maxLength={500}
                  disabled={isBusy}
                />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" disabled={isPending} onClick={() => router.back()}>
          취소
        </Button>
        <Button type="submit" disabled={isBusy}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {initialProblem ? '수정 저장' : '문제 저장'}
        </Button>
      </div>
    </form>
  )
}
