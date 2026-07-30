import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  groupReviewItemsByQuestion,
  ReviewOriginalQuestion,
} from '@/components/dashboard/exams/ReviewOriginalQuestion'
import type { ExamReviewTaskView } from '@/types/exam'

const RESULT_BADGE: Record<string, { label: string; className: string }> = {
  pending: { label: '판정 대기', className: 'bg-slate-100 text-slate-700' },
  pass: { label: 'PASS', className: 'bg-emerald-100 text-emerald-700' },
  nonpass: { label: 'NON-PASS', className: 'bg-rose-100 text-rose-700' },
}

interface ReviewTaskReadOnlyViewProps {
  task: ExamReviewTaskView
}

export function ReviewTaskReadOnlyView({ task }: ReviewTaskReadOnlyViewProps) {
  return (
    <div className="space-y-4">
      {task.status === 'assigned' && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          학생이 아직 오답노트를 제출하지 않았습니다.
        </div>
      )}

      {groupReviewItemsByQuestion(task.items).map((group) => (
        <div key={group.key} className="space-y-3">
          {group.question && <ReviewOriginalQuestion question={group.question} />}

          {group.items.map(({ item, index }) => {
            const badge = RESULT_BADGE[item.result] ?? RESULT_BADGE.pending

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
                    <p className="mb-1 text-xs font-medium text-slate-500">학생 답안</p>
                    <div className="rounded bg-slate-50 p-3 text-sm text-slate-700 whitespace-pre-wrap">
                      {item.answerContent?.trim() ? (
                        item.answerContent
                      ) : (
                        <span className="text-slate-400">답안 없음</span>
                      )}
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

                  {item.references.length > 0 && (
                    <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50/60 p-3">
                      <p className="text-xs font-medium text-blue-800">학생에게 제공된 참고자료</p>
                      <ul className="space-y-1">
                        {item.references.map((reference) => (
                          <li key={reference.id} className="text-xs text-blue-900">
                            <span className="font-medium">{reference.studentName} 학생 답안</span>
                            {reference.label && <span className="ml-1 text-blue-700">· {reference.label}</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {item.feedback?.trim() && (
                    <div className="rounded-md border border-slate-200 p-3">
                      <p className="text-xs font-medium text-slate-500">원장 피드백</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{item.feedback}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      ))}
    </div>
  )
}
