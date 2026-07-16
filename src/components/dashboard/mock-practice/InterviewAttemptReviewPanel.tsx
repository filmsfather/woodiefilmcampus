'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, Loader2, Plus } from 'lucide-react'

import { addInterviewReviewQuestionAction } from '@/app/dashboard/teacher/mock-practice/interview/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { InterviewAttemptRow } from '@/types/interview'

export function InterviewAttemptReviewPanel({ row }: { row: InterviewAttemptRow }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleAddQuestion = () => {
    const trimmed = prompt.trim()
    if (!trimmed) {
      setError('추가할 문항 내용을 입력해주세요.')
      return
    }

    setError(null)
    setNotice(null)
    startTransition(async () => {
      const result = await addInterviewReviewQuestionAction({
        attemptId: row.attemptId,
        prompt: trimmed,
      })

      if (result.success) {
        setPrompt('')
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
        {open ? '영상 · 복기 접기' : '영상 · 복기 보기'}
      </Button>

      {open && (
        <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
          {row.videoUrl ? (
            <video
              src={row.videoUrl}
              controls
              playsInline
              preload="metadata"
              className="aspect-video w-full max-w-2xl rounded-md border border-slate-200 bg-black"
            />
          ) : (
            <p className="rounded-md border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-500">
              영상을 불러올 수 없습니다. 페이지를 새로고침해주세요.
            </p>
          )}

          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-900">복기 과제 문항 · 학생 답변</p>
            {row.reviewItems.length === 0 ? (
              <p className="text-sm text-slate-500">복기 문항이 없습니다.</p>
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

          {row.canAddQuestion ? (
            <div className="space-y-2 rounded-md border border-slate-200 bg-white p-3">
              <p className="text-sm font-semibold text-slate-900">이 학생에게 문항 추가</p>
              <p className="text-xs text-slate-500">
                추가한 문항은 이 학생의 복기 과제에만 반영됩니다. 이미 제출을 마친 과제라면 다시 진행 중 상태로
                바뀝니다.
              </p>
              <Textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="예) 두 번째 질문에서 답변이 길어진 이유를 스스로 분석해보세요."
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
          ) : (
            <p className="text-xs text-slate-500">
              이 과제는 공용 템플릿으로 생성되어 개별 문항 추가를 지원하지 않습니다.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
