'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ImagePlus, Loader2, Plus, Trash2, X } from 'lucide-react'

import {
  createWritingSetAction,
  updateWritingSetAction,
} from '@/app/dashboard/teacher/mock-practice/writing/actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { WRITING_ASSETS_BUCKET } from '@/lib/storage/buckets'
import {
  buildPendingStoragePath,
  uploadFileToStorageViaClient,
  type UploadedObjectMeta,
} from '@/lib/storage-upload'
import type { WritingSetDetail } from '@/types/writing'

const MAX_IMAGE_SIZE = 50 * 1024 * 1024

type FormImage =
  | { kind: 'existing'; mediaAssetId: string; url: string | null }
  | { kind: 'new'; meta: UploadedObjectMeta; previewUrl: string }

interface FormQuestion {
  key: string
  prompt: string
  images: FormImage[]
}

interface FormReviewQuestion {
  key: string
  prompt: string
}

function newQuestion(): FormQuestion {
  return { key: crypto.randomUUID(), prompt: '', images: [] }
}

function newReviewQuestion(prompt = ''): FormReviewQuestion {
  return { key: crypto.randomUUID(), prompt }
}

interface WritingSetFormProps {
  uploaderId: string
  initialSet?: WritingSetDetail
}

export function WritingSetForm({ uploaderId, initialSet }: WritingSetFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [uploadingKey, setUploadingKey] = useState<string | null>(null)
  const fileInputRefs = useRef<Map<string, HTMLInputElement>>(new Map())

  const [title, setTitle] = useState(initialSet?.title ?? '')
  const [description, setDescription] = useState(initialSet?.description ?? '')
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<string>(
    initialSet ? String(initialSet.timeLimitMinutes) : '60'
  )
  const [questions, setQuestions] = useState<FormQuestion[]>(() => {
    if (!initialSet) {
      return [newQuestion()]
    }
    return initialSet.questions.map((question) => ({
      key: question.id,
      prompt: question.prompt,
      images: question.assets.map((asset) => ({
        kind: 'existing' as const,
        mediaAssetId: asset.mediaAssetId,
        url: asset.url,
      })),
    }))
  })
  const [reviewQuestions, setReviewQuestions] = useState<FormReviewQuestion[]>(() => {
    if (!initialSet) {
      return []
    }
    return initialSet.reviewQuestions.map((review) => ({
      key: review.id,
      prompt: review.prompt,
    }))
  })

  const updateQuestion = (key: string, updater: (question: FormQuestion) => FormQuestion) => {
    setQuestions((prev) => prev.map((question) => (question.key === key ? updater(question) : question)))
  }

  const handleImageSelect = async (key: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('이미지 파일만 업로드할 수 있습니다.')
      return
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setError('이미지 크기는 최대 50MB까지 허용됩니다.')
      return
    }

    setError(null)
    setUploadingKey(key)

    try {
      const path = buildPendingStoragePath({ ownerId: uploaderId, prefix: 'pending', fileName: file.name })
      const result = await uploadFileToStorageViaClient({
        bucket: WRITING_ASSETS_BUCKET,
        file,
        path,
        maxSizeBytes: MAX_IMAGE_SIZE,
      })

      const previewUrl = URL.createObjectURL(file)
      updateQuestion(key, (question) => ({
        ...question,
        images: [
          ...question.images,
          {
            kind: 'new',
            meta: {
              bucket: WRITING_ASSETS_BUCKET,
              path: result.path,
              size: result.size,
              mimeType: result.mimeType,
              originalName: result.originalName,
            },
            previewUrl,
          },
        ],
      }))
    } catch (err) {
      console.error('[writings] question image upload failed', err)
      setError(err instanceof Error ? err.message : '이미지 업로드에 실패했습니다.')
    } finally {
      setUploadingKey(null)
    }
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (!title.trim()) {
      setError('세트 제목을 입력해주세요.')
      return
    }

    const parsedTimeLimit = Number(timeLimitMinutes)
    if (!Number.isInteger(parsedTimeLimit) || parsedTimeLimit < 5 || parsedTimeLimit > 600) {
      setError('제한시간은 5분 이상 600분 이하의 정수로 입력해주세요.')
      return
    }

    if (questions.length === 0 || questions.some((question) => !question.prompt.trim())) {
      setError('모든 작문 문항의 내용을 입력해주세요.')
      return
    }

    if (reviewQuestions.some((review) => !review.prompt.trim())) {
      setError('오답노트 템플릿 문항 내용을 모두 입력해주세요.')
      return
    }

    const payloadQuestions = questions.map((question) => ({
      prompt: question.prompt.trim(),
      images: question.images.map((image) =>
        image.kind === 'existing' ? { mediaAssetId: image.mediaAssetId } : image.meta
      ),
    }))

    const payloadReviewQuestions = reviewQuestions.map((review) => ({
      prompt: review.prompt.trim(),
    }))

    startTransition(async () => {
      const result = initialSet
        ? await updateWritingSetAction({
            setId: initialSet.id,
            title: title.trim(),
            description: description.trim() || null,
            timeLimitMinutes: parsedTimeLimit,
            questions: payloadQuestions,
            reviewQuestions: payloadReviewQuestions,
          })
        : await createWritingSetAction({
            title: title.trim(),
            description: description.trim() || null,
            timeLimitMinutes: parsedTimeLimit,
            questions: payloadQuestions,
            reviewQuestions: payloadReviewQuestions,
          })

      if (result.success) {
        router.push('/dashboard/teacher/mock-practice/writing')
        router.refresh()
      } else {
        setError(result.error ?? '저장에 실패했습니다.')
      }
    })
  }

  const isBusy = isPending || uploadingKey !== null

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
          <div className="space-y-2">
            <Label htmlFor="writing-title">세트 제목 *</Label>
            <Input
              id="writing-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="예: 한예종 모의 작문 1차"
              maxLength={200}
              disabled={isBusy}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="writing-time-limit">제한시간 (분) *</Label>
            <Input
              id="writing-time-limit"
              type="number"
              inputMode="numeric"
              min={5}
              max={600}
              step={5}
              value={timeLimitMinutes}
              onChange={(event) => setTimeLimitMinutes(event.target.value)}
              disabled={isBusy}
              required
              className="max-w-[160px]"
            />
            <p className="text-xs text-slate-500">
              학생이 시험 시작을 누른 순간부터 이 시간 안에 원고 사진을 제출해야 합니다.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="writing-description">설명</Label>
            <Textarea
              id="writing-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="모의 작문에 대한 안내를 입력하세요 (선택)"
              rows={3}
              maxLength={2000}
              disabled={isBusy}
            />
          </div>
        </CardContent>
      </Card>

      {questions.map((question, questionIndex) => (
        <Card key={question.key} className="border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base text-slate-900">작문 문항 {questionIndex + 1}</CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-red-600 hover:text-red-700"
              disabled={isBusy || questions.length <= 1}
              onClick={() => setQuestions((prev) => prev.filter((entry) => entry.key !== question.key))}
            >
              <Trash2 className="mr-1 h-4 w-4" /> 문항 삭제
            </Button>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>문항 내용 *</Label>
              <Textarea
                value={question.prompt}
                onChange={(event) =>
                  updateQuestion(question.key, (entry) => ({ ...entry, prompt: event.target.value }))
                }
                placeholder="작문 문항 내용을 입력하세요"
                rows={4}
                maxLength={4000}
                disabled={isBusy}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>문항 이미지</Label>
              {question.images.length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {question.images.map((image, imageIndex) => {
                    const src = image.kind === 'existing' ? image.url : image.previewUrl
                    return (
                      <div
                        key={`${question.key}-image-${imageIndex}`}
                        className="relative h-28 w-28 overflow-hidden rounded-md border border-slate-200 bg-slate-50"
                      >
                        {src ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={src} alt={`문항 이미지 ${imageIndex + 1}`} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                            미리보기 없음
                          </div>
                        )}
                        <button
                          type="button"
                          className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-slate-600 shadow hover:text-red-600"
                          disabled={isBusy}
                          onClick={() =>
                            updateQuestion(question.key, (entry) => ({
                              ...entry,
                              images: entry.images.filter((_, index) => index !== imageIndex),
                            }))
                          }
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                ref={(element) => {
                  if (element) {
                    fileInputRefs.current.set(question.key, element)
                  } else {
                    fileInputRefs.current.delete(question.key)
                  }
                }}
                onChange={(event) => handleImageSelect(question.key, event)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isBusy || question.images.length >= 10}
                onClick={() => fileInputRefs.current.get(question.key)?.click()}
              >
                {uploadingKey === question.key ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <ImagePlus className="mr-1 h-4 w-4" />
                )}
                이미지 추가
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      <div className="flex justify-start">
        <Button
          type="button"
          variant="outline"
          disabled={isBusy || questions.length >= 50}
          onClick={() => setQuestions((prev) => [...prev, newQuestion()])}
        >
          <Plus className="mr-1 h-4 w-4" /> 작문 문항 추가
        </Button>
      </div>

      <Card className="border-slate-200">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base text-slate-900">오답노트 공통 문항 (선택)</CardTitle>
            <p className="mt-1 text-xs text-slate-500">
              모든 학생의 오답노트에 기본으로 들어갈 문항입니다. 학생별 문항은 제출물을 검토하면서 발부할 때
              추가할 수 있습니다.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isBusy || reviewQuestions.length >= 30}
            onClick={() => setReviewQuestions((prev) => [...prev, newReviewQuestion()])}
          >
            <Plus className="mr-1 h-4 w-4" /> 문항 추가
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {reviewQuestions.length === 0 ? (
            <p className="text-xs text-slate-400">
              공통 문항 없이 진행할 수 있습니다. 이 경우 오답노트는 발부 시 작성한 문항으로만 구성됩니다.
            </p>
          ) : (
            reviewQuestions.map((review, reviewIndex) => (
              <div key={review.key} className="flex items-start gap-2 rounded-md border border-slate-200 bg-white p-3">
                <span className="mt-2 text-xs font-medium text-slate-500">문항 {reviewIndex + 1}</span>
                <Textarea
                  value={review.prompt}
                  onChange={(event) =>
                    setReviewQuestions((prev) =>
                      prev.map((item) => (item.key === review.key ? { ...item, prompt: event.target.value } : item))
                    )
                  }
                  placeholder="오답노트 공통 문항 내용"
                  rows={2}
                  maxLength={2000}
                  disabled={isBusy}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:text-red-700"
                  disabled={isBusy}
                  onClick={() => setReviewQuestions((prev) => prev.filter((item) => item.key !== review.key))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
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
          {initialSet ? '수정 저장' : '작문 세트 저장'}
        </Button>
      </div>
    </form>
  )
}
