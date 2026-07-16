'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, Loader2, Plus, RefreshCw, Send, Trash2 } from 'lucide-react'

import {
  addWritingReviewQuestionAction,
  issueWritingReviewTaskAction,
  retryWritingOcrAction,
} from '@/app/dashboard/teacher/mock-practice/writing/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { WritingAttemptRow } from '@/types/writing'

const OCR_STATUS_LABELS: Record<WritingAttemptRow['ocrStatus'], string> = {
  pending: '변환 대기',
  processing: '변환 중',
  done: '변환 완료',
  failed: '변환 실패',
}

interface DraftQuestion {
  key: string
  prompt: string
}

function newDraftQuestion(): DraftQuestion {
  return { key: crypto.randomUUID(), prompt: '' }
}

export function WritingAttemptReviewPanel({
  row,
  templateQuestionCount,
}: {
  row: WritingAttemptRow
  templateQuestionCount: number
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // 발부 전: 오답노트 문항 초안 목록 / 발부 후: 단건 추가 입력
  const [draftQuestions, setDraftQuestions] = useState<DraftQuestion[]>([newDraftQuestion()])
  const [additionalPrompt, setAdditionalPrompt] = useState('')

  const handleRetryOcr = () => {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const result = await retryWritingOcrAction({ attemptId: row.attemptId })
      if (result.success) {
        setNotice('텍스트 변환이 완료되었습니다.')
        router.refresh()
      } else {
        setError(result.error ?? '텍스트 변환에 실패했습니다.')
      }
    })
  }

  const handleIssueTask = () => {
    const prompts = draftQuestions.map((question) => question.prompt.trim()).filter(Boolean)
    if (prompts.length === 0) {
      setError('오답노트 문항을 1개 이상 작성해주세요.')
      return
    }

    setError(null)
    setNotice(null)
    startTransition(async () => {
      const result = await issueWritingReviewTaskAction({
        attemptId: row.attemptId,
        questions: prompts.map((prompt) => ({ prompt })),
      })

      if (result.success) {
        setNotice('오답노트 과제가 발부되었습니다. 학생 과제 목록에 바로 표시됩니다.')
        router.refresh()
      } else {
        setError(result.error ?? '오답노트 발부에 실패했습니다.')
      }
    })
  }

  const handleAddQuestion = () => {
    const trimmed = additionalPrompt.trim()
    if (!trimmed) {
      setError('추가할 문항 내용을 입력해주세요.')
      return
    }

    setError(null)
    setNotice(null)
    startTransition(async () => {
      const result = await addWritingReviewQuestionAction({
        attemptId: row.attemptId,
        prompt: trimmed,
      })

      if (result.success) {
        setAdditionalPrompt('')
        setNotice('문항이 추가되었습니다. 학생 과제에 바로 반영됩니다.')
        router.refresh()
      } else {
        setError(result.error ?? '문항 추가에 실패했습니다.')
      }
    })
  }

  return (
    <div className="w-full space-y-3">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 px-2 text-slate-600"
        onClick={() => setOpen((prev) => !prev)}
      >
        {open ? <ChevronUp className="mr-1 h-4 w-4" /> : <ChevronDown className="mr-1 h-4 w-4" />}
        {open ? '제출물 · 오답노트 접기' : '제출물 · 오답노트 보기'}
      </Button>

      {open && (
        <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-900">원고 사진</p>
              {row.submissionImages.length === 0 ? (
                <p className="rounded-md border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-500">
                  제출된 사진이 없습니다.
                </p>
              ) : (
                <div className="space-y-3">
                  {row.submissionImages.map((image, index) =>
                    image.url ? (
                      <a key={image.id} href={image.url} target="_blank" rel="noreferrer" className="block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={image.url}
                          alt={`원고 ${index + 1}페이지`}
                          className="w-full rounded-md border border-slate-200 bg-white object-contain"
                        />
                      </a>
                    ) : (
                      <p key={image.id} className="text-xs text-slate-400">
                        {index + 1}페이지 이미지를 불러오지 못했습니다.
                      </p>
                    )
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-slate-900">변환된 텍스트</p>
                <Badge variant={row.ocrStatus === 'done' ? 'default' : row.ocrStatus === 'failed' ? 'destructive' : 'outline'}>
                  {OCR_STATUS_LABELS[row.ocrStatus]}
                </Badge>
                {(row.ocrStatus === 'failed' || row.ocrStatus === 'done') && (
                  <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={handleRetryOcr}>
                    {isPending ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-1 h-4 w-4" />
                    )}
                    다시 변환
                  </Button>
                )}
              </div>
              {row.ocrText ? (
                <div className="max-h-[600px] overflow-y-auto whitespace-pre-line rounded-md border border-slate-200 bg-white p-3 text-sm leading-relaxed text-slate-700">
                  {row.ocrText}
                </div>
              ) : (
                <p className="rounded-md border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-500">
                  {row.ocrStatus === 'failed'
                    ? '텍스트 변환에 실패했습니다. 다시 변환을 눌러 재시도해주세요.'
                    : '아직 변환된 텍스트가 없습니다.'}
                </p>
              )}
            </div>
          </div>

          {row.status === 'task_created' ? (
            <>
              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-900">오답노트 문항 · 학생 답변</p>
                {row.reviewItems.length === 0 ? (
                  <p className="text-sm text-slate-500">오답노트 문항이 없습니다.</p>
                ) : (
                  <ol className="space-y-3">
                    {row.reviewItems.map((item, index) => (
                      <li key={item.itemId} className="rounded-md border border-slate-200 bg-white p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-slate-800">
                            {index + 1}. <span className="whitespace-pre-line">{item.prompt}</span>
                          </p>
                          <Badge variant={item.answer ? 'default' : 'outline'} className="shrink-0">
                            {item.answer ? '답변 완료' : '미답변'}
                          </Badge>
                        </div>
                        {item.answer && (
                          <p className="mt-2 whitespace-pre-line rounded-md bg-slate-50 p-2 text-sm text-slate-700">
                            {item.answer}
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              <div className="space-y-2 rounded-md border border-slate-200 bg-white p-3">
                <p className="text-sm font-semibold text-slate-900">이 학생에게 문항 추가</p>
                <p className="text-xs text-slate-500">
                  추가한 문항은 이 학생의 오답노트에만 반영됩니다. 이미 제출을 마친 과제라면 다시 진행 중 상태로
                  바뀝니다.
                </p>
                <Textarea
                  value={additionalPrompt}
                  onChange={(event) => setAdditionalPrompt(event.target.value)}
                  placeholder="예) 두 번째 문단의 논지가 흐려진 이유를 분석하고 다시 써보세요."
                  rows={3}
                  disabled={isPending}
                />
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" onClick={handleAddQuestion} disabled={isPending}>
                    {isPending ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="mr-1 h-4 w-4" />
                    )}
                    문항 추가
                  </Button>
                  {error && <span className="text-xs text-red-600">{error}</span>}
                  {notice && <span className="text-xs text-emerald-600">{notice}</span>}
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-3 rounded-md border border-slate-200 bg-white p-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">오답노트 발부</p>
                <p className="text-xs text-slate-500">
                  제출된 텍스트를 검토하며 이 학생에게 낼 오답노트 문항을 작성하세요.
                  {templateQuestionCount > 0 &&
                    ` 세트에 등록된 공통 문항 ${templateQuestionCount}개가 함께 포함됩니다.`}
                </p>
              </div>

              {draftQuestions.map((question, index) => (
                <div key={question.key} className="flex items-start gap-2">
                  <span className="mt-2 shrink-0 text-xs font-medium text-slate-500">문항 {index + 1}</span>
                  <Textarea
                    value={question.prompt}
                    onChange={(event) =>
                      setDraftQuestions((prev) =>
                        prev.map((item) =>
                          item.key === question.key ? { ...item, prompt: event.target.value } : item
                        )
                      )
                    }
                    placeholder="예) 결론 문단에서 주장을 뒷받침하는 근거가 부족합니다. 근거를 보강해 다시 써보세요."
                    rows={2}
                    maxLength={2000}
                    disabled={isPending}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    disabled={isPending || draftQuestions.length <= 1}
                    onClick={() =>
                      setDraftQuestions((prev) => prev.filter((item) => item.key !== question.key))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPending || draftQuestions.length >= 30}
                  onClick={() => setDraftQuestions((prev) => [...prev, newDraftQuestion()])}
                >
                  <Plus className="mr-1 h-4 w-4" /> 문항 추가
                </Button>
                <Button type="button" size="sm" onClick={handleIssueTask} disabled={isPending}>
                  {isPending ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-1 h-4 w-4" />
                  )}
                  오답노트 발부
                </Button>
                {error && <span className="text-xs text-red-600">{error}</span>}
                {notice && <span className="text-xs text-emerald-600">{notice}</span>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
