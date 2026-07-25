'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { BookmarkCheck, BookmarkPlus, BookOpen, Loader2, Trash2 } from 'lucide-react'

import {
  attachReferenceAnswersAction,
  deactivateReferenceAnswerAction,
  evaluateReviewTaskAction,
  passReviewTaskAllAction,
  saveReferenceAnswerAction,
} from '@/app/dashboard/principal/exams/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  groupReviewItemsByQuestion,
  ReviewOriginalQuestion,
} from '@/components/dashboard/exams/ReviewOriginalQuestion'
import type {
  ExamReviewItemView,
  ExamReviewReferenceAnswerPoolItem,
  ExamReviewTaskView,
} from '@/types/exam'

const RESULT_BADGE: Record<string, { label: string; className: string }> = {
  pending: { label: '판정 대기', className: 'bg-slate-100 text-slate-700' },
  pass: { label: 'PASS', className: 'bg-emerald-100 text-emerald-700' },
  nonpass: { label: 'NON-PASS', className: 'bg-rose-100 text-rose-700' },
}

interface ItemDecision {
  result: 'pass' | 'nonpass'
  feedback: string
}

interface ReviewTaskEvaluationProps {
  task: ExamReviewTaskView
  /** 이 오답노트를 작성한 학생 (본인 답안을 참고자료 후보에서 제외하는 데 쓴다) */
  studentId: string
  referencePool: ExamReviewReferenceAnswerPoolItem[]
}

export function ReviewTaskEvaluation({ task, studentId, referencePool }: ReviewTaskEvaluationProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [decisions, setDecisions] = useState<Map<string, ItemDecision>>(() => {
    const map = new Map<string, ItemDecision>()
    for (const item of task.items) {
      map.set(item.id, {
        result: item.result === 'nonpass' ? 'nonpass' : 'pass',
        feedback: item.feedback ?? '',
      })
    }
    return map
  })

  const [saveTarget, setSaveTarget] = useState<ExamReviewItemView | null>(null)
  const [saveLabel, setSaveLabel] = useState('')
  const [saveNote, setSaveNote] = useState('')
  const [saveShowName, setSaveShowName] = useState(true)

  const [attachTarget, setAttachTarget] = useState<ExamReviewItemView | null>(null)
  const [attachSelection, setAttachSelection] = useState<Set<string>>(new Set())

  const poolByQuestion = useMemo(() => {
    const map = new Map<string, ExamReviewReferenceAnswerPoolItem[]>()
    for (const entry of referencePool) {
      // 본인 답안을 자기 참고자료로 주는 건 의미가 없다.
      if (entry.sourceStudentId && entry.sourceStudentId === studentId) continue
      const list = map.get(entry.reviewQuestionId) ?? []
      list.push(entry)
      map.set(entry.reviewQuestionId, list)
    }
    return map
  }, [referencePool, studentId])

  const poolForItem = (item: ExamReviewItemView) =>
    item.reviewQuestionId ? poolByQuestion.get(item.reviewQuestionId) ?? [] : []

  // 이 문항의 답안으로 만들어진 참고자료 (저장 후 라벨·메모를 다시 수정할 때 쓴다)
  const savedReferenceByItemId = useMemo(() => {
    const map = new Map<string, ExamReviewReferenceAnswerPoolItem>()
    for (const entry of referencePool) {
      if (entry.sourceItemId) {
        map.set(entry.sourceItemId, entry)
      }
    }
    return map
  }, [referencePool])

  const updateDecision = (itemId: string, updater: (decision: ItemDecision) => ItemDecision) => {
    setDecisions((prev) => {
      const next = new Map(prev)
      const current = next.get(itemId) ?? { result: 'pass' as const, feedback: '' }
      next.set(itemId, updater(current))
      return next
    })
  }

  const handleSave = () => {
    setError(null)
    startTransition(async () => {
      const result = await evaluateReviewTaskAction({
        reviewTaskId: task.id,
        items: task.items.map((item) => {
          const decision = decisions.get(item.id) ?? { result: 'pass' as const, feedback: '' }
          return {
            itemId: item.id,
            result: decision.result,
            feedback: decision.feedback.trim() || null,
          }
        }),
      })

      if (result.success) {
        router.refresh()
      } else {
        setError(result.error ?? '판정 저장에 실패했습니다.')
      }
    })
  }

  const handlePassAll = () => {
    setError(null)
    startTransition(async () => {
      const result = await passReviewTaskAllAction(task.id)
      if (result.success) {
        router.refresh()
      } else {
        setError(result.error ?? '일괄 통과 처리에 실패했습니다.')
      }
    })
  }

  const openSaveDialog = (item: ExamReviewItemView) => {
    const saved = savedReferenceByItemId.get(item.id)
    setError(null)
    setSaveTarget(item)
    setSaveLabel(saved?.label ?? '')
    setSaveNote(saved?.note ?? '')
    setSaveShowName(saved?.showStudentName ?? true)
  }

  const handleSaveReference = () => {
    if (!saveTarget) return
    setError(null)
    startTransition(async () => {
      const result = await saveReferenceAnswerAction({
        itemId: saveTarget.id,
        label: saveLabel.trim() || null,
        note: saveNote.trim() || null,
        showStudentName: saveShowName,
      })

      if (result.success) {
        setSaveTarget(null)
        router.refresh()
      } else {
        setError(result.error ?? '참고자료 저장에 실패했습니다.')
      }
    })
  }

  const openAttachDialog = (item: ExamReviewItemView) => {
    setError(null)
    setAttachTarget(item)
    setAttachSelection(new Set(item.references.map((reference) => reference.id)))
  }

  const handleAttachReferences = () => {
    if (!attachTarget) return
    setError(null)
    startTransition(async () => {
      const result = await attachReferenceAnswersAction({
        itemId: attachTarget.id,
        referenceAnswerIds: Array.from(attachSelection),
      })

      if (result.success) {
        setAttachTarget(null)
        router.refresh()
      } else {
        setError(result.error ?? '참고자료 연결에 실패했습니다.')
      }
    })
  }

  const handleDeactivateReference = (referenceAnswerId: string) => {
    if (!window.confirm('이 참고자료를 목록에서 삭제할까요? 이미 붙여준 학생에게서도 사라집니다.')) {
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await deactivateReferenceAnswerAction(referenceAnswerId)
      if (result.success) {
        setAttachTarget(null)
        router.refresh()
      } else {
        setError(result.error ?? '참고자료 삭제에 실패했습니다.')
      }
    })
  }

  const canEvaluate = task.status === 'submitted' || task.status === 'partial' || task.status === 'pass'

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {task.status === 'assigned' && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          학생이 아직 오답노트를 제출하지 않았습니다.
        </div>
      )}

      {groupReviewItemsByQuestion(task.items).map((group) => (
        <div key={group.key} className="space-y-3">
          {group.question && <ReviewOriginalQuestion question={group.question} />}

          {group.items.map(({ item, index }) => {
            const decision = decisions.get(item.id) ?? { result: 'pass' as const, feedback: '' }
            const badge = RESULT_BADGE[item.result] ?? RESULT_BADGE.pending
            const hasAnswer = Boolean(item.answerContent?.trim())
            const pool = poolForItem(item)

            return (
              <Card key={item.id} className="border-slate-200">
                <CardHeader className="flex flex-row items-start justify-between gap-2">
                  <CardTitle className="text-sm font-medium text-slate-900">
                    문항 {index + 1}. <span className="whitespace-pre-wrap font-normal">{item.prompt}</span>
                  </CardTitle>
                  <Badge className={badge.className}>{badge.label}</Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-slate-500">학생 답안</p>
                      {item.reviewQuestionId && hasAnswer && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className={`h-7 text-xs ${
                            item.savedAsReference ? 'text-emerald-700' : 'text-slate-600'
                          }`}
                          disabled={isPending}
                          onClick={() => openSaveDialog(item)}
                        >
                          {item.savedAsReference ? (
                            <>
                              <BookmarkCheck className="mr-1 h-3.5 w-3.5" />
                              참고자료로 저장됨 (수정)
                            </>
                          ) : (
                            <>
                              <BookmarkPlus className="mr-1 h-3.5 w-3.5" />
                              참고자료로 저장
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                    <div className="rounded bg-slate-50 p-3 text-sm text-slate-700 whitespace-pre-wrap">
                      {item.answerContent?.trim() ? item.answerContent : <span className="text-slate-400">답안 없음</span>}
                    </div>
                  </div>

                  {item.assets.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-xs font-medium text-slate-500">제출 이미지</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {item.assets.map((asset, assetIndex) => (
                          <figure key={asset.id} className="space-y-1">
                            {asset.url ? (
                              <a href={asset.url} target="_blank" rel="noreferrer">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={asset.url}
                                  alt={`이미지 ${assetIndex + 1}`}
                                  className="max-h-64 w-full rounded-md border border-slate-200 object-contain"
                                />
                              </a>
                            ) : (
                              <div className="rounded-md border border-slate-200 p-4 text-xs text-slate-400">
                                이미지를 불러오지 못했습니다.
                              </div>
                            )}
                            <figcaption className="text-xs text-slate-600 whitespace-pre-wrap">
                              {asset.caption?.trim() ? asset.caption : '해설 없음'}
                            </figcaption>
                          </figure>
                        ))}
                      </div>
                    </div>
                  )}

                  {item.reviewQuestionId && (pool.length > 0 || item.references.length > 0) && (
                    <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50/60 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-blue-800">학생에게 제공할 참고자료</p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 border-blue-300 bg-white text-xs text-blue-700 hover:bg-blue-50"
                          disabled={isPending || pool.length === 0}
                          onClick={() => openAttachDialog(item)}
                        >
                          <BookOpen className="mr-1 h-3.5 w-3.5" />
                          {item.references.length > 0
                            ? `참고자료 변경 (${item.references.length}/${pool.length})`
                            : `참고자료 붙이기 (${pool.length})`}
                        </Button>
                      </div>
                      {item.references.length === 0 ? (
                        <p className="text-xs text-blue-700">아직 붙여준 참고자료가 없습니다.</p>
                      ) : (
                        <ul className="space-y-1">
                          {item.references.map((reference) => (
                            <li key={reference.id} className="text-xs text-blue-900">
                              <span className="font-medium">{reference.studentName} 학생 답안</span>
                              {reference.label && <span className="ml-1 text-blue-700">· {reference.label}</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {canEvaluate && (
                    <div className="space-y-2 rounded-md border border-slate-200 p-3">
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={decision.result === 'pass' ? 'default' : 'outline'}
                          className={decision.result === 'pass' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
                          disabled={isPending}
                          onClick={() => updateDecision(item.id, (entry) => ({ ...entry, result: 'pass' }))}
                        >
                          PASS
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={decision.result === 'nonpass' ? 'destructive' : 'outline'}
                          disabled={isPending}
                          onClick={() => updateDecision(item.id, (entry) => ({ ...entry, result: 'nonpass' }))}
                        >
                          NON-PASS
                        </Button>
                      </div>
                      <Textarea
                        value={decision.feedback}
                        onChange={(event) =>
                          updateDecision(item.id, (entry) => ({ ...entry, feedback: event.target.value }))
                        }
                        placeholder="피드백 (선택)"
                        rows={2}
                        maxLength={2000}
                        disabled={isPending}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      ))}

      {canEvaluate && (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
            disabled={isPending}
            onClick={handlePassAll}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            전체 통과
          </Button>
          <Button disabled={isPending} onClick={handleSave}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            판정 저장
          </Button>
        </div>
      )}

      {/* 참고자료로 저장 */}
      <Dialog open={saveTarget !== null} onOpenChange={(open) => !open && setSaveTarget(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{saveTarget?.savedAsReference ? '참고자료 수정' : '참고자료로 저장'}</DialogTitle>
            <DialogDescription>
              {saveTarget?.savedAsReference
                ? '라벨·메모와 함께 답안 내용도 지금 화면에 보이는 내용으로 다시 저장됩니다.'
                : '같은 오답노트 문항을 다시 작성하는 다른 학생에게 골라서 제공할 수 있습니다. 저장 시점의 답안이 그대로 보관되며, 이후 학생이 답안을 수정해도 참고자료는 바뀌지 않습니다.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-medium text-slate-500">저장할 답안</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                {saveTarget?.answerContent?.trim()}
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600" htmlFor="reference-label">
                라벨 (선택)
              </label>
              <Input
                id="reference-label"
                value={saveLabel}
                onChange={(event) => setSaveLabel(event.target.value)}
                placeholder="예: 장르 해석이 좋은 답안"
                maxLength={100}
                disabled={isPending}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600" htmlFor="reference-note">
                메모 (선택)
              </label>
              <Textarea
                id="reference-note"
                value={saveNote}
                onChange={(event) => setSaveNote(event.target.value)}
                placeholder="어떤 점을 참고하면 좋은지 적어두면 학생에게 함께 보입니다."
                rows={3}
                maxLength={2000}
                disabled={isPending}
              />
            </div>

            <label className="flex items-start gap-2 text-sm text-slate-700">
              <Checkbox
                className="mt-0.5"
                checked={saveShowName}
                onChange={(event) => setSaveShowName(event.target.checked)}
                disabled={isPending}
              />
              <span>
                작성한 학생의 이름을 공개합니다.
                <span className="mt-0.5 block text-xs text-slate-500">
                  끄면 다른 학생에게 &lsquo;다른 학생 답안&rsquo;으로만 표시됩니다.
                </span>
              </span>
            </label>
          </div>

          <DialogFooter>
            <Button variant="ghost" disabled={isPending} onClick={() => setSaveTarget(null)}>
              취소
            </Button>
            <Button disabled={isPending} onClick={handleSaveReference}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {saveTarget?.savedAsReference ? '갱신' : '저장'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 참고자료 붙이기 */}
      <Dialog open={attachTarget !== null} onOpenChange={(open) => !open && setAttachTarget(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>참고자료 선택</DialogTitle>
            <DialogDescription>
              선택한 답안이 이 학생의 오답노트 화면에 참고자료로 표시됩니다. 재작성이 끝난 뒤에도 계속 보입니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {attachTarget && poolForItem(attachTarget).length === 0 ? (
              <p className="rounded-md border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
                이 문항에 저장된 참고자료가 없습니다.
              </p>
            ) : (
              attachTarget &&
              poolForItem(attachTarget).map((entry) => {
                const checked = attachSelection.has(entry.id)
                return (
                  <div
                    key={entry.id}
                    className={`space-y-2 rounded-md border p-3 ${
                      checked ? 'border-blue-300 bg-blue-50/60' : 'border-slate-200'
                    }`}
                  >
                    <label className="flex items-start gap-2">
                      <Checkbox
                        className="mt-1"
                        checked={checked}
                        disabled={isPending}
                        onChange={(event) => {
                          const isChecked = event.target.checked
                          setAttachSelection((prev) => {
                            const next = new Set(prev)
                            if (isChecked) {
                              next.add(entry.id)
                            } else {
                              next.delete(entry.id)
                            }
                            return next
                          })
                        }}
                      />
                      <span className="flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-slate-900">{entry.studentName}</span>
                          {!entry.showStudentName && (
                            <Badge className="bg-slate-100 text-xs text-slate-600">이름 비공개</Badge>
                          )}
                          {entry.label && <span className="text-xs text-slate-500">{entry.label}</span>}
                        </span>
                        <span className="mt-1 block whitespace-pre-wrap text-sm text-slate-700">
                          {entry.content}
                        </span>
                        {entry.note && (
                          <span className="mt-1 block text-xs text-slate-500">메모: {entry.note}</span>
                        )}
                      </span>
                    </label>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-red-600 hover:text-red-700"
                        disabled={isPending}
                        onClick={() => handleDeactivateReference(entry.id)}
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" /> 목록에서 삭제
                      </Button>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" disabled={isPending} onClick={() => setAttachTarget(null)}>
              취소
            </Button>
            <Button disabled={isPending} onClick={handleAttachReferences}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              적용
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
