'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, ExternalLink, Loader2, Plus } from 'lucide-react'

import { addInterviewReviewQuestionAction } from '@/app/dashboard/teacher/mock-practice/interview/actions'
import { addInterviewSheetQuestionAction } from '@/app/dashboard/teacher/mock-practice/interview-sheet/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { InterviewAttemptRow } from '@/types/interview'
import type { InterviewSheetItemSource, InterviewSheetOverview } from '@/types/interview-sheet'

const SHEET_SOURCE_LABELS: Record<InterviewSheetItemSource, string> = {
  template: '기본',
  student: '학생',
  teacher: '선생님',
}

export function InterviewAttemptReviewPanel({
  row,
  sheet,
}: {
  row: InterviewAttemptRow
  sheet: InterviewSheetOverview | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const [sheetPrompt, setSheetPrompt] = useState('')
  const [sheetError, setSheetError] = useState<string | null>(null)
  const [sheetNotice, setSheetNotice] = useState<string | null>(null)
  const [isSheetPending, startSheetTransition] = useTransition()

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

  const handleAddSheetQuestion = () => {
    const trimmed = sheetPrompt.trim()
    if (!trimmed) {
      setSheetError('추가할 질문 내용을 입력해주세요.')
      return
    }

    setSheetError(null)
    setSheetNotice(null)
    startSheetTransition(async () => {
      const result = await addInterviewSheetQuestionAction({
        studentId: row.studentId,
        prompt: trimmed,
      })

      if (result.success) {
        setSheetPrompt('')
        setSheetNotice('면접지에 질문이 추가되었습니다.')
        router.refresh()
      } else {
        setSheetError(result.error ?? '질문 추가에 실패했습니다.')
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

          <div className="grid gap-4 md:grid-cols-2">
            {/* 왼쪽: 복기 과제 */}
            <div className="space-y-4">
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
                    추가한 문항은 이 학생의 복기 과제에만 반영됩니다. 이미 제출을 마친 과제라면 다시 진행 중
                    상태로 바뀝니다.
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

            {/* 오른쪽: 면접지 */}
            <div className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">면접지 질문 · 답변</p>
                  <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-slate-600">
                    <Link href={`/dashboard/teacher/mock-practice/interview-sheet/${row.studentId}`}>
                      면접지 전체 보기 <ExternalLink className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
                {!sheet || sheet.items.length === 0 ? (
                  <p className="rounded-md border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-500">
                    아직 면접지에 질문이 없습니다. 아래에서 질문을 추가하면 학생 면접지가 만들어집니다.
                  </p>
                ) : (
                  <ol className="space-y-3">
                    {sheet.items.map((item, index) => (
                      <li key={item.id} className="rounded-md border border-slate-200 bg-white p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-slate-800">
                            {index + 1}. <span className="whitespace-pre-line">{item.prompt}</span>
                          </p>
                          <div className="flex shrink-0 items-center gap-1">
                            <Badge variant="secondary">{SHEET_SOURCE_LABELS[item.source]}</Badge>
                            <Badge variant={item.answer?.trim() ? 'default' : 'outline'}>
                              {item.answer?.trim() ? '답변 완료' : '미답변'}
                            </Badge>
                          </div>
                        </div>
                        {item.answer?.trim() && (
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
                <p className="text-sm font-semibold text-slate-900">면접지에 질문 추가</p>
                <p className="text-xs text-slate-500">
                  이 학생의 면접지에 질문이 추가되며, 학생은 내 면접지에서 답변을 작성합니다.
                </p>
                <Textarea
                  value={sheetPrompt}
                  onChange={(event) => setSheetPrompt(event.target.value)}
                  placeholder="예) 이 작품에서 감독의 선택 중 아쉬웠던 부분은 무엇인가요?"
                  rows={3}
                  disabled={isSheetPending}
                />
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" onClick={handleAddSheetQuestion} disabled={isSheetPending}>
                    {isSheetPending ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="mr-1 h-4 w-4" />
                    )}
                    질문 추가
                  </Button>
                  {sheetError && <span className="text-xs text-red-600">{sheetError}</span>}
                  {sheetNotice && <span className="text-xs text-emerald-600">{sheetNotice}</span>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
