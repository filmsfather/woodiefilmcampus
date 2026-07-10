'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Trash2 } from 'lucide-react'

import { evaluateAttemptAction } from '@/app/dashboard/principal/exams/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import type { ExamQuestion, SessionAttemptRow } from '@/types/exam'

const RESULT_BADGE: Record<string, { label: string; className: string }> = {
  pending: { label: '판정 대기', className: 'bg-slate-100 text-slate-700' },
  pass: { label: 'PASS', className: 'bg-emerald-100 text-emerald-700' },
  nonpass: { label: 'NON-PASS', className: 'bg-rose-100 text-rose-700' },
}

const REVIEW_STATUS_LABEL: Record<string, string> = {
  assigned: '작성 대기',
  submitted: '제출됨(확인 필요)',
  partial: '부분 통과(재작성 중)',
  pass: '통과',
}

interface CustomReviewItem {
  prompt: string
  requiresImage: boolean
}

interface SessionAttemptsTableProps {
  rows: SessionAttemptRow[]
  questions: ExamQuestion[]
}

export function SessionAttemptsTable({ rows, questions }: SessionAttemptsTableProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [answerRow, setAnswerRow] = useState<SessionAttemptRow | null>(null)
  const [nonpassRow, setNonpassRow] = useState<SessionAttemptRow | null>(null)
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(new Set())
  const [customItems, setCustomItems] = useState<CustomReviewItem[]>([])

  const questionById = useMemo(() => new Map(questions.map((question) => [question.id, question])), [questions])

  const openNonpassDialog = (row: SessionAttemptRow) => {
    setError(null)
    setNonpassRow(row)
    setSelectedQuestionIds(new Set(questions.map((question) => question.id)))
    setCustomItems([])
  }

  const handlePass = (row: SessionAttemptRow) => {
    if (!row.attemptId) return
    setError(null)
    startTransition(async () => {
      const result = await evaluateAttemptAction({ attemptId: row.attemptId as string, result: 'pass' })
      if (result.success) {
        router.refresh()
      } else {
        setError(result.error ?? '판정에 실패했습니다.')
      }
    })
  }

  const handleNonpassConfirm = () => {
    if (!nonpassRow?.attemptId) return
    setError(null)

    const reviewItems: Array<{ examQuestionId: string | null; prompt: string; requiresImage: boolean }> = []

    for (const question of questions) {
      if (!selectedQuestionIds.has(question.id)) continue
      if (question.reviewQuestions.length > 0) {
        for (const template of question.reviewQuestions) {
          reviewItems.push({
            examQuestionId: question.id,
            prompt: template.prompt,
            requiresImage: template.requiresImage,
          })
        }
      } else {
        reviewItems.push({
          examQuestionId: question.id,
          prompt: `다음 문제를 오답노트로 다시 풀어오세요.\n\n${question.prompt}`,
          requiresImage: false,
        })
      }
    }

    for (const item of customItems) {
      if (item.prompt.trim()) {
        reviewItems.push({ examQuestionId: null, prompt: item.prompt.trim(), requiresImage: item.requiresImage })
      }
    }

    if (reviewItems.length === 0) {
      setError('오답노트로 낼 문항을 1개 이상 선택하거나 추가해주세요.')
      return
    }

    startTransition(async () => {
      const result = await evaluateAttemptAction({
        attemptId: nonpassRow.attemptId as string,
        result: 'nonpass',
        reviewItems,
      })
      if (result.success) {
        setNonpassRow(null)
        router.refresh()
      } else {
        setError(result.error ?? '판정에 실패했습니다.')
      }
    })
  }

  const formatDateTime = (value: string | null) =>
    value ? new Date(value).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }) : '-'

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>학생</TableHead>
            <TableHead>반</TableHead>
            <TableHead>응시 상태</TableHead>
            <TableHead>제출 시각</TableHead>
            <TableHead>판정</TableHead>
            <TableHead>오답노트</TableHead>
            <TableHead className="text-right">작업</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="py-8 text-center text-sm text-slate-500">
                대상 학생이 없습니다.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => {
              const badge = RESULT_BADGE[row.result] ?? RESULT_BADGE.pending
              const attemptState = !row.attemptId
                ? '미응시'
                : row.submittedAt
                  ? '제출 완료'
                  : '응시 중'

              return (
                <TableRow key={row.studentId}>
                  <TableCell className="font-medium text-slate-900">{row.studentName}</TableCell>
                  <TableCell className="text-slate-600">{row.className ?? '-'}</TableCell>
                  <TableCell className="text-slate-600">{attemptState}</TableCell>
                  <TableCell className="text-slate-600">{formatDateTime(row.submittedAt)}</TableCell>
                  <TableCell>
                    {row.submittedAt ? (
                      <Badge className={badge.className}>{badge.label}</Badge>
                    ) : (
                      <span className="text-sm text-slate-400">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.reviewTask ? (
                      <Link
                        href={`/dashboard/principal/exams/reviews/${row.reviewTask.id}`}
                        className="text-sm text-blue-600 underline-offset-2 hover:underline"
                      >
                        {REVIEW_STATUS_LABEL[row.reviewTask.status] ?? row.reviewTask.status}
                      </Link>
                    ) : (
                      <span className="text-sm text-slate-400">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      {row.submittedAt && (
                        <>
                          <Button variant="outline" size="sm" onClick={() => setAnswerRow(row)}>
                            답안 보기
                          </Button>
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700"
                            disabled={isPending}
                            onClick={() => handlePass(row)}
                          >
                            PASS
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={isPending}
                            onClick={() => openNonpassDialog(row)}
                          >
                            NON-PASS
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>

      {/* 답안 보기 다이얼로그 */}
      <Dialog open={answerRow !== null} onOpenChange={(open) => !open && setAnswerRow(null)}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{answerRow?.studentName} 답안</DialogTitle>
            <DialogDescription>제출된 답안을 확인하고 판정하세요.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {questions.map((question, index) => {
              const answer = answerRow?.answers.find((entry) => entry.questionId === question.id)
              return (
                <div key={question.id} className="rounded-md border border-slate-200 p-3">
                  <p className="text-sm font-medium text-slate-900">
                    문항 {index + 1}. <span className="whitespace-pre-wrap font-normal">{question.prompt}</span>
                  </p>
                  <div className="mt-2 rounded bg-slate-50 p-2 text-sm text-slate-700 whitespace-pre-wrap">
                    {answer?.content?.trim() ? answer.content : <span className="text-slate-400">답안 없음</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* NON-PASS + 오답노트 배정 다이얼로그 */}
      <Dialog open={nonpassRow !== null} onOpenChange={(open) => !open && setNonpassRow(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{nonpassRow?.studentName} NON-PASS 처리</DialogTitle>
            <DialogDescription>
              오답노트로 다시 풀어올 문항을 선택하세요. 선택한 문항의 오답노트 문항 세트가 학생에게 배정됩니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {questions.map((question, index) => (
              <label
                key={question.id}
                className="flex items-start gap-2 rounded-md border border-slate-200 p-3 text-sm"
              >
                <Checkbox
                  checked={selectedQuestionIds.has(question.id)}
                  onChange={(event) => {
                    const isChecked = event.target.checked
                    setSelectedQuestionIds((prev) => {
                      const next = new Set(prev)
                      if (isChecked) {
                        next.add(question.id)
                      } else {
                        next.delete(question.id)
                      }
                      return next
                    })
                  }}
                />
                <span className="flex-1">
                  <span className="font-medium text-slate-900">문항 {index + 1}</span>
                  <span className="mt-1 block whitespace-pre-wrap text-slate-600 line-clamp-3">{question.prompt}</span>
                  <span className="mt-1 block text-xs text-slate-400">
                    {questionById.get(question.id)?.reviewQuestions.length
                      ? `오답노트 문항 ${question.reviewQuestions.length}개 배정`
                      : '오답노트 문항 없음 → 원 문항 다시 풀이로 배정'}
                  </span>
                </span>
              </label>
            ))}

            <div className="space-y-2 rounded-md border border-dashed border-slate-300 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-900">이 학생에게만 추가할 문항</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCustomItems((prev) => [...prev, { prompt: '', requiresImage: false }])}
                >
                  <Plus className="mr-1 h-4 w-4" /> 추가
                </Button>
              </div>
              {customItems.map((item, index) => (
                <div key={index} className="space-y-2 rounded-md border border-slate-200 p-2">
                  <div className="flex items-start gap-2">
                    <Textarea
                      value={item.prompt}
                      onChange={(event) =>
                        setCustomItems((prev) =>
                          prev.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, prompt: event.target.value } : entry
                          )
                        )
                      }
                      placeholder="추가 문항 내용"
                      rows={2}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-red-600"
                      onClick={() => setCustomItems((prev) => prev.filter((_, entryIndex) => entryIndex !== index))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <Checkbox
                      checked={item.requiresImage}
                      onChange={(event) =>
                        setCustomItems((prev) =>
                          prev.map((entry, entryIndex) =>
                            entryIndex === index
                              ? { ...entry, requiresImage: event.target.checked }
                              : entry
                          )
                        )
                      }
                    />
                    이미지 제출 필요
                  </label>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setNonpassRow(null)} disabled={isPending}>
              취소
            </Button>
            <Button variant="destructive" onClick={handleNonpassConfirm} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              NON-PASS + 오답노트 배정
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
