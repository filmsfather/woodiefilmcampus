'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, ImagePlus, Loader2, Lock, Send, X } from 'lucide-react'

import {
  openPracticeAttemptAction,
  savePracticeInterviewAnswersAction,
  submitPracticeInterviewAction,
  submitPracticeWritingAction,
} from '@/app/dashboard/student/practice-feedback/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { compressImageFile } from '@/lib/image-compress'
import { formatKstDateTime, formatKstTime, formatPracticeRoomLabel } from '@/lib/practice/shared'
import { PRACTICE_SUBMISSIONS_BUCKET } from '@/lib/storage/buckets'
import {
  buildPendingStoragePath,
  uploadFileToStorageViaClient,
  type UploadedObjectMeta,
} from '@/lib/storage-upload'
import { PRACTICE_TYPE_LABELS, type PracticeAttemptDetail } from '@/types/practice'

/** 업로드 전 압축 목표 크기. 원고지 사진 여러 장을 15분 안에 올려야 한다. */
const COMPRESS_TARGET_BYTES = 2 * 1024 * 1024
const MAX_RAW_IMAGE_SIZE = 30 * 1024 * 1024
const AUTOSAVE_DEBOUNCE_MS = 15_000

interface PendingImage {
  key: string
  meta: UploadedObjectMeta
  previewUrl: string
  originalName: string
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function PracticeAttemptRoom({ attempt }: { attempt: PracticeAttemptDetail }) {
  const router = useRouter()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const opensAtMs = useMemo(() => Date.parse(attempt.opensAt), [attempt.opensAt])
  const deadlineMs = useMemo(() => Date.parse(attempt.deadlineAt), [attempt.deadlineAt])

  const isOpen = now >= opensAtMs
  const isSubmitted = Boolean(attempt.submittedAt)

  // opens_at을 지나면 서버에 열람 시각을 남긴다.
  const openedRef = useRef(false)
  useEffect(() => {
    if (!isOpen || attempt.startedAt || openedRef.current) {
      return
    }
    openedRef.current = true
    void openPracticeAttemptAction({ attemptId: attempt.attemptId })
  }, [isOpen, attempt.startedAt, attempt.attemptId])

  if (!isOpen) {
    return (
      <Card className="border-slate-200">
        <CardContent className="space-y-4 py-12 text-center">
          <Lock className="mx-auto h-10 w-10 text-slate-300" />
          <div className="space-y-1">
            <p className="text-lg font-semibold text-slate-900">아직 문제가 공개되지 않았습니다</p>
            <p className="text-sm text-slate-600">
              {formatKstDateTime(attempt.opensAt)}부터 문제를 볼 수 있습니다. 제한시간{' '}
              {attempt.problem.timeLimitMinutes}분이 지나면               {formatKstTime(attempt.deadlineAt)}에{' '}
              {formatPracticeRoomLabel(attempt.roomNo)}에서 1:1 피드백을 진행합니다.
            </p>
          </div>
          <p className="font-mono text-2xl text-emerald-700">{formatDuration(opensAtMs - now)}</p>
          <p className="text-xs text-slate-400">공개까지 남은 시간</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card className={isSubmitted ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200'}>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="space-y-1">
            <p className="text-sm text-slate-600">
              {attempt.universityName} · {PRACTICE_TYPE_LABELS[attempt.practiceType]} · 제한시간{' '}
              {attempt.problem.timeLimitMinutes}분
            </p>
            <p className="text-xs text-slate-500">
              제출 마감 {formatKstTime(attempt.deadlineAt)} · 이후 {formatPracticeRoomLabel(attempt.roomNo)}에서 1:1
              피드백
            </p>
          </div>
          {isSubmitted ? (
            <Badge variant="secondary" className="text-sm">
              {formatKstTime(attempt.submittedAt)} 제출 완료
            </Badge>
          ) : (
            <div className="text-right">
              <p
                className={[
                  'font-mono text-2xl',
                  deadlineMs - now < 5 * 60 * 1000 ? 'text-red-600' : 'text-slate-900',
                ].join(' ')}
              >
                {formatDuration(deadlineMs - now)}
              </p>
              <p className="text-xs text-slate-400">남은 시간</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-900">{attempt.problem.title}</CardTitle>
          {attempt.problem.description ? (
            <p className="whitespace-pre-wrap text-sm text-slate-600">{attempt.problem.description}</p>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          {attempt.problem.items.map((item, index) => (
            <div key={item.id} className="space-y-1 rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-medium text-slate-500">문항 {index + 1}</p>
              <p className="whitespace-pre-wrap text-sm text-slate-900">{item.prompt}</p>
            </div>
          ))}

          {attempt.problem.assets.length > 0 ? (
            <div className="flex flex-wrap gap-3">
              {attempt.problem.assets.map((asset, index) =>
                asset.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={asset.id}
                    src={asset.url}
                    alt={`문제 이미지 ${index + 1}`}
                    className="max-h-96 rounded-md border border-slate-200 object-contain"
                  />
                ) : null
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {attempt.practiceType === 'writing' ? (
        <WritingSubmissionPanel attempt={attempt} onDone={() => router.refresh()} />
      ) : (
        <InterviewAnswerPanel attempt={attempt} onDone={() => router.refresh()} />
      )}
    </div>
  )
}

function WritingSubmissionPanel({
  attempt,
  onDone,
}: {
  attempt: PracticeAttemptDetail
  onDone: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [uploadingCount, setUploadingCount] = useState(0)
  const [images, setImages] = useState<PendingImage[]>([])
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const isSubmitted = Boolean(attempt.submittedAt)

  const handleFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0) return

    setError(null)

    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        setError('이미지 파일만 업로드할 수 있습니다.')
        continue
      }
      if (file.size > MAX_RAW_IMAGE_SIZE) {
        setError('사진 한 장은 최대 30MB까지 올릴 수 있습니다.')
        continue
      }

      setUploadingCount((count) => count + 1)

      try {
        const { file: compressed } = await compressImageFile(file, COMPRESS_TARGET_BYTES)
        const path = buildPendingStoragePath({
          ownerId: attempt.studentId,
          prefix: 'pending',
          fileName: compressed.name,
        })
        const result = await uploadFileToStorageViaClient({
          bucket: PRACTICE_SUBMISSIONS_BUCKET,
          file: compressed,
          path,
          maxSizeBytes: MAX_RAW_IMAGE_SIZE,
        })

        setImages((prev) => [
          ...prev,
          {
            key: crypto.randomUUID(),
            meta: {
              bucket: PRACTICE_SUBMISSIONS_BUCKET,
              path: result.path,
              size: result.size,
              mimeType: result.mimeType,
              originalName: result.originalName,
            },
            previewUrl: URL.createObjectURL(compressed),
            originalName: file.name,
          },
        ])
      } catch (err) {
        console.error('[practice] submission upload failed', err)
        setError(err instanceof Error ? err.message : '사진 업로드에 실패했습니다.')
      } finally {
        setUploadingCount((count) => count - 1)
      }
    }
  }

  const move = (index: number, direction: -1 | 1) => {
    setImages((prev) => {
      const next = [...prev]
      const target = index + direction
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const handleSubmit = () => {
    if (images.length === 0) {
      setError('원고 사진을 1장 이상 올려주세요.')
      return
    }

    if (!window.confirm(`원고 사진 ${images.length}장을 제출할까요? 제출 후에는 수정할 수 없습니다.`)) {
      return
    }

    setError(null)
    startTransition(async () => {
      const result = await submitPracticeWritingAction({
        attemptId: attempt.attemptId,
        images: images.map((image) => image.meta),
      })

      if (result.error) {
        setError(result.error)
        return
      }
      onDone()
    })
  }

  if (isSubmitted) {
    return (
      <Card className="border-emerald-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-900">제출한 원고</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-3">
            {attempt.submissionImages.map((image, index) =>
              image.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={image.id}
                  src={image.url}
                  alt={`제출 원고 ${index + 1}`}
                  className="max-h-96 rounded-md border border-slate-200 object-contain"
                />
              ) : null
            )}
          </div>
          <p className="text-sm text-slate-600">
            제출이 완료되었습니다. {formatKstTime(attempt.deadlineAt)}에 {formatPracticeRoomLabel(attempt.roomNo)}에서
            1:1 피드백을 진행합니다.
          </p>
        </CardContent>
      </Card>
    )
  }

  const isBusy = isPending || uploadingCount > 0

  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-slate-900">원고지 사진 제출</CardTitle>
        <p className="text-sm text-slate-600">
          원고지를 순서대로 촬영해 올려주세요. 제출하면 손글씨가 자동으로 텍스트로 변환되어 선생님 화면에 함께
          표시됩니다.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {images.length > 0 ? (
          <div className="space-y-2">
            {images.map((image, index) => (
              <div
                key={image.key}
                className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-2"
              >
                <span className="w-8 shrink-0 text-center text-sm font-medium text-slate-500">{index + 1}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.previewUrl}
                  alt={`원고 ${index + 1}`}
                  className="h-20 w-20 shrink-0 rounded object-cover"
                />
                <span className="min-w-0 flex-1 truncate text-xs text-slate-500">{image.originalName}</span>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isBusy || index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isBusy || index === images.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    disabled={isBusy}
                    onClick={() => setImages((prev) => prev.filter((entry) => entry.key !== image.key))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <input
          type="file"
          accept="image/*"
          multiple
          capture="environment"
          className="hidden"
          ref={fileInputRef}
          onChange={handleFiles}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isBusy || images.length >= 10}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploadingCount > 0 ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <ImagePlus className="mr-1 h-4 w-4" />
            )}
            사진 추가
          </Button>
          <span className="text-xs text-slate-500">{images.length} / 10장</span>
        </div>

        <Button type="button" className="w-full" disabled={isBusy || images.length === 0} onClick={handleSubmit}>
          {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          제출하기
        </Button>
      </CardContent>
    </Card>
  )
}

function InterviewAnswerPanel({
  attempt,
  onDone,
}: {
  attempt: PracticeAttemptDetail
  onDone: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>(() => ({ ...attempt.typedAnswers }))
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const isSubmitted = Boolean(attempt.submittedAt)
  const answersRef = useRef(answers)
  answersRef.current = answers

  const persist = useCallback(async () => {
    if (isSubmitted) return
    setIsSaving(true)
    try {
      const result = await savePracticeInterviewAnswersAction({
        attemptId: attempt.attemptId,
        answers: answersRef.current,
      })
      if (!result.error) {
        setSavedAt(new Date())
      }
    } finally {
      setIsSaving(false)
    }
  }, [attempt.attemptId, isSubmitted])

  // 새로고침 복구를 위해 주기적으로 서버에 저장한다.
  const dirtyRef = useRef(false)
  useEffect(() => {
    if (isSubmitted) return
    const timer = window.setInterval(() => {
      if (!dirtyRef.current) return
      dirtyRef.current = false
      void persist()
    }, AUTOSAVE_DEBOUNCE_MS)
    return () => window.clearInterval(timer)
  }, [persist, isSubmitted])

  const handleChange = (itemId: string, value: string) => {
    dirtyRef.current = true
    setAnswers((prev) => ({ ...prev, [itemId]: value }))
  }

  const handleSubmit = () => {
    const unanswered = attempt.problem.items.filter((item) => !(answers[item.id] ?? '').trim())
    if (unanswered.length > 0) {
      if (!window.confirm(`${unanswered.length}개 문항이 비어 있습니다. 이대로 제출할까요?`)) {
        return
      }
    } else if (!window.confirm('답안을 제출할까요? 제출 후에는 수정할 수 없습니다.')) {
      return
    }

    setError(null)
    startTransition(async () => {
      const result = await submitPracticeInterviewAction({
        attemptId: attempt.attemptId,
        answers,
      })

      if (result.error) {
        setError(result.error)
        return
      }
      onDone()
    })
  }

  if (isSubmitted) {
    return (
      <Card className="border-emerald-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-900">제출한 답안</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {attempt.problem.items.map((item, index) => (
            <div key={item.id} className="space-y-1 rounded-md border border-slate-200 bg-white p-3">
              <p className="text-xs font-medium text-slate-500">문항 {index + 1}</p>
              <p className="whitespace-pre-wrap text-sm text-slate-900">
                {attempt.typedAnswers[item.id]?.trim() || '작성하지 않음'}
              </p>
            </div>
          ))}
          <p className="text-sm text-slate-600">
            제출이 완료되었습니다. {formatKstTime(attempt.deadlineAt)}에 {formatPracticeRoomLabel(attempt.roomNo)}에서
            5분 면접을 진행한 뒤 피드백을 받습니다.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-slate-900">답안 작성</CardTitle>
        <p className="text-sm text-slate-600">
          작성 중인 내용은 자동 저장됩니다. 제출하면 선생님이 답안을 보며 5분 면접을 진행합니다.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {attempt.problem.items.map((item, index) => (
          <div key={item.id} className="space-y-2">
            <p className="text-sm font-medium text-slate-700">문항 {index + 1}</p>
            <Textarea
              value={answers[item.id] ?? ''}
              onChange={(event) => handleChange(item.id, event.target.value)}
              placeholder="답안을 입력하세요"
              rows={6}
              maxLength={20000}
              disabled={isPending}
            />
            <p className="text-right text-xs text-slate-400">{(answers[item.id] ?? '').length}자</p>
          </div>
        ))}

        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">
            {isSaving ? '저장 중...' : savedAt ? `${savedAt.toLocaleTimeString('ko-KR')} 자동 저장됨` : '자동 저장 대기'}
          </span>
          <Button type="button" variant="ghost" size="sm" disabled={isPending || isSaving} onClick={() => void persist()}>
            지금 저장
          </Button>
        </div>

        <Button type="button" className="w-full" disabled={isPending} onClick={handleSubmit}>
          {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          제출하기
        </Button>
      </CardContent>
    </Card>
  )
}
