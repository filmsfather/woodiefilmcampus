'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ImagePlus, Loader2, Trash2 } from 'lucide-react'

import {
  autosaveReviewItemAction,
  deleteReviewItemImageAction,
  saveReviewTaskAction,
  updateReviewItemImageCaptionAction,
  uploadReviewItemImageAction,
} from '@/app/dashboard/student/exams/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import {
  groupReviewItemsByQuestion,
  ReviewOriginalQuestion,
} from '@/components/dashboard/exams/ReviewOriginalQuestion'
import { EXAM_ASSETS_BUCKET } from '@/lib/storage/buckets'
import { buildPendingStoragePath, uploadFileToStorageViaClient } from '@/lib/storage-upload'
import type { ExamReviewTaskView } from '@/types/exam'

const MAX_IMAGE_SIZE = 50 * 1024 * 1024

const ITEM_BADGE: Record<string, { label: string; className: string }> = {
  pending: { label: '확인 대기', className: 'bg-slate-100 text-slate-700' },
  pass: { label: '통과', className: 'bg-emerald-100 text-emerald-700' },
  nonpass: { label: '재작성 필요', className: 'bg-rose-100 text-rose-700' },
}

interface ReviewTaskFormProps {
  task: ExamReviewTaskView
}

export function ReviewTaskForm({ task }: ReviewTaskFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null)
  const [captionDrafts, setCaptionDrafts] = useState<Map<string, string>>(() => {
    const map = new Map<string, string>()
    for (const item of task.items) {
      for (const asset of item.assets) {
        map.set(asset.id, asset.caption ?? '')
      }
    }
    return map
  })
  const [answers, setAnswers] = useState<Map<string, string>>(() => {
    const map = new Map<string, string>()
    for (const item of task.items) {
      map.set(item.id, item.answerContent ?? '')
    }
    return map
  })
  const fileInputRefs = useRef<Map<string, HTMLInputElement>>(new Map())

  // 마지막으로 서버에 저장된 값 (변경 없는 blur에서는 저장 요청을 생략)
  const lastSavedAnswersRef = useRef<Map<string, string>>(
    new Map(task.items.map((item) => [item.id, item.answerContent ?? '']))
  )
  const lastSavedCaptionsRef = useRef<Map<string, string>>(
    new Map(task.items.flatMap((item) => item.assets.map((asset) => [asset.id, asset.caption ?? ''] as const)))
  )
  const [autosaveState, setAutosaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [autosaveSavedAt, setAutosaveSavedAt] = useState<Date | null>(null)

  const isTaskLocked = task.status === 'pass'
  // partial 상태에서는 nonpass 문항만 수정 가능
  const isItemEditable = (result: string) => {
    if (isTaskLocked) return false
    if (result === 'pass') return false
    if (task.status === 'partial') return result === 'nonpass'
    return true
  }

  const markAutosaveSuccess = () => {
    setAutosaveState('saved')
    setAutosaveSavedAt(new Date())
  }

  const autosaveAnswer = async (itemId: string) => {
    const value = answers.get(itemId) ?? ''
    if (lastSavedAnswersRef.current.get(itemId) === value) return

    setAutosaveState('saving')
    try {
      const result = await autosaveReviewItemAction({
        reviewTaskId: task.id,
        itemId,
        answerContent: value,
      })
      if (result.success) {
        lastSavedAnswersRef.current.set(itemId, value)
        markAutosaveSuccess()
      } else {
        setAutosaveState('error')
      }
    } catch (err) {
      console.error('[exams] review answer autosave failed', err)
      setAutosaveState('error')
    }
  }

  const autosaveCaption = async (assetLinkId: string) => {
    const value = captionDrafts.get(assetLinkId) ?? ''
    if (lastSavedCaptionsRef.current.get(assetLinkId) === value) return

    setAutosaveState('saving')
    try {
      const result = await updateReviewItemImageCaptionAction(
        { assetLinkId, caption: value },
        { skipRevalidate: true }
      )
      if (result.success) {
        lastSavedCaptionsRef.current.set(assetLinkId, value)
        markAutosaveSuccess()
      } else {
        setAutosaveState('error')
      }
    } catch (err) {
      console.error('[exams] review caption autosave failed', err)
      setAutosaveState('error')
    }
  }

  const save = (submit: boolean) => {
    if (submit && !window.confirm('오답노트를 제출할까요?')) return
    setError(null)
    startTransition(async () => {
      const editableItems = task.items.filter((item) => isItemEditable(item.result))
      const result = await saveReviewTaskAction({
        reviewTaskId: task.id,
        submit,
        items: editableItems.map((item) => ({
          itemId: item.id,
          answerContent: answers.get(item.id) ?? '',
        })),
      })
      if (result.success) {
        for (const item of editableItems) {
          lastSavedAnswersRef.current.set(item.id, answers.get(item.id) ?? '')
        }
        setAutosaveState('idle')
        router.refresh()
      } else {
        setError(result.error ?? '저장에 실패했습니다.')
      }
    })
  }

  const handleImageSelect = async (itemId: string, event: React.ChangeEvent<HTMLInputElement>) => {
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
    setUploadingItemId(itemId)

    try {
      const path = buildPendingStoragePath({ ownerId: itemId, prefix: 'pending', fileName: file.name })
      const uploaded = await uploadFileToStorageViaClient({
        bucket: EXAM_ASSETS_BUCKET,
        file,
        path,
        maxSizeBytes: MAX_IMAGE_SIZE,
      })

      const result = await uploadReviewItemImageAction({
        itemId,
        file: {
          bucket: EXAM_ASSETS_BUCKET,
          path: uploaded.path,
          size: uploaded.size,
          mimeType: uploaded.mimeType,
          originalName: uploaded.originalName,
        },
        caption: null,
      })

      if (result.success) {
        router.refresh()
      } else {
        setError(result.error ?? '이미지 업로드에 실패했습니다.')
      }
    } catch (err) {
      console.error('[exams] review image upload failed', err)
      setError(err instanceof Error ? err.message : '이미지 업로드에 실패했습니다.')
    } finally {
      setUploadingItemId(null)
    }
  }

  const handleDeleteImage = (assetLinkId: string) => {
    if (!window.confirm('이미지를 삭제할까요?')) return
    setError(null)
    startTransition(async () => {
      const result = await deleteReviewItemImageAction(assetLinkId)
      if (result.success) {
        router.refresh()
      } else {
        setError(result.error ?? '이미지 삭제에 실패했습니다.')
      }
    })
  }

  const handleSaveCaption = (assetLinkId: string) => {
    setError(null)
    startTransition(async () => {
      const caption = captionDrafts.get(assetLinkId) ?? ''
      const result = await updateReviewItemImageCaptionAction({
        assetLinkId,
        caption,
      })
      if (result.success) {
        lastSavedCaptionsRef.current.set(assetLinkId, caption)
        router.refresh()
      } else {
        setError(result.error ?? '해설 저장에 실패했습니다.')
      }
    })
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {task.status === 'partial' && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
          부분 통과되었습니다. <span className="font-medium">재작성 필요</span> 문항만 수정해 다시 제출해주세요.
        </div>
      )}
      {task.status === 'pass' && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          오답노트가 통과되었습니다. 수고했어요!
        </div>
      )}

      {groupReviewItemsByQuestion(task.items).map((group) => (
        <div key={group.key} className="space-y-3">
          {group.question && <ReviewOriginalQuestion question={group.question} />}

          {group.items.map(({ item, index }) => {
            const badge = ITEM_BADGE[item.result] ?? ITEM_BADGE.pending
            const editable = isItemEditable(item.result)

            return (
              <Card key={item.id} className="border-slate-200">
                <CardHeader className="flex flex-row items-start justify-between gap-2">
                  <CardTitle className="text-sm font-medium text-slate-900">
                    문항 {index + 1}. <span className="whitespace-pre-wrap font-normal">{item.prompt}</span>
                    {item.requiresImage && (
                      <span className="ml-1 text-xs font-normal text-blue-600">(이미지 제출 필요)</span>
                    )}
                  </CardTitle>
                  <Badge className={badge.className}>{badge.label}</Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  {item.feedback && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 whitespace-pre-wrap">
                      <span className="font-medium">원장 피드백:</span> {item.feedback}
                    </div>
                  )}

                  <Textarea
                    value={answers.get(item.id) ?? ''}
                    onChange={(event) =>
                      setAnswers((prev) => {
                        const next = new Map(prev)
                        next.set(item.id, event.target.value)
                        return next
                      })
                    }
                    onBlur={() => {
                      if (editable) void autosaveAnswer(item.id)
                    }}
                    placeholder={editable ? '답안을 작성하세요' : ''}
                    rows={5}
                    disabled={!editable || isPending}
                  />

                  {item.requiresImage && (
                    <div className="space-y-3">
                      <p className="text-xs font-medium text-slate-500">이미지 및 해설</p>
                      {item.assets.length > 0 && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          {item.assets.map((asset, assetIndex) => (
                            <div key={asset.id} className="space-y-2 rounded-md border border-slate-200 p-2">
                              {asset.url ? (
                                <a href={asset.url} target="_blank" rel="noreferrer">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={asset.url}
                                    alt={`이미지 ${assetIndex + 1}`}
                                    className="max-h-56 w-full rounded object-contain"
                                  />
                                </a>
                              ) : (
                                <div className="rounded border border-slate-200 p-4 text-xs text-slate-400">
                                  이미지를 불러오지 못했습니다.
                                </div>
                              )}
                              <Textarea
                                value={captionDrafts.get(asset.id) ?? ''}
                                onChange={(event) =>
                                  setCaptionDrafts((prev) => {
                                    const next = new Map(prev)
                                    next.set(asset.id, event.target.value)
                                    return next
                                  })
                                }
                                onBlur={() => {
                                  if (editable) void autosaveCaption(asset.id)
                                }}
                                placeholder="이미지에 대한 해설을 작성하세요"
                                rows={3}
                                disabled={!editable || isPending}
                              />
                              {editable && (
                                <div className="flex justify-between">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="text-red-600 hover:text-red-700"
                                    disabled={isPending}
                                    onClick={() => handleDeleteImage(asset.id)}
                                  >
                                    <Trash2 className="mr-1 h-4 w-4" /> 삭제
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={isPending}
                                    onClick={() => handleSaveCaption(asset.id)}
                                  >
                                    해설 저장
                                  </Button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {editable && (
                        <>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            ref={(element) => {
                              if (element) {
                                fileInputRefs.current.set(item.id, element)
                              } else {
                                fileInputRefs.current.delete(item.id)
                              }
                            }}
                            onChange={(event) => handleImageSelect(item.id, event)}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isPending || uploadingItemId === item.id}
                            onClick={() => fileInputRefs.current.get(item.id)?.click()}
                          >
                            {uploadingItemId === item.id ? (
                              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                            ) : (
                              <ImagePlus className="mr-1 h-4 w-4" />
                            )}
                            이미지 추가
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      ))}

      {!isTaskLocked && (
        <div className="flex items-center justify-end gap-3">
          {autosaveState === 'saving' && (
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <Loader2 className="h-3 w-3 animate-spin" /> 자동 저장 중...
            </span>
          )}
          {autosaveState === 'saved' && autosaveSavedAt && (
            <span className="text-xs text-emerald-600">
              자동 저장됨 ({autosaveSavedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })})
            </span>
          )}
          {autosaveState === 'error' && (
            <span className="text-xs text-red-600">자동 저장 실패 — 임시저장 버튼을 눌러주세요</span>
          )}
          <Button variant="outline" disabled={isPending} onClick={() => save(false)}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            임시저장
          </Button>
          <Button disabled={isPending} onClick={() => save(true)}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            오답노트 제출
          </Button>
        </div>
      )}
    </div>
  )
}
