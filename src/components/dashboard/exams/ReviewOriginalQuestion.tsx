import type { ExamReviewItemQuestionContext, ExamReviewItemView } from '@/types/exam'

export interface ReviewItemGroup {
  key: string
  question: ExamReviewItemQuestionContext | null
  items: Array<{ item: ExamReviewItemView; index: number }>
}

/**
 * 오답노트 문항을 원본 시험 문항 기준으로 묶는다.
 * 원본 문항이 없는 항목(원장이 직접 추가한 문항 등)은 단독 그룹으로 처리한다.
 * index는 전체 목록 기준 순번을 유지해 "문항 N" 번호가 흔들리지 않도록 한다.
 */
export function groupReviewItemsByQuestion(items: ExamReviewItemView[]): ReviewItemGroup[] {
  const groups: ReviewItemGroup[] = []

  items.forEach((item, index) => {
    const last = groups[groups.length - 1]
    if (item.examQuestionId && last && last.key === item.examQuestionId) {
      last.items.push({ item, index })
    } else {
      groups.push({
        key: item.examQuestionId ?? `standalone-${item.id}`,
        question: item.examQuestion,
        items: [{ item, index }],
      })
    }
  })

  return groups
}

interface ReviewOriginalQuestionProps {
  question: ExamReviewItemQuestionContext
}

export function ReviewOriginalQuestion({ question }: ReviewOriginalQuestionProps) {
  return (
    <div className="space-y-3 rounded-md border border-slate-300 bg-slate-50 p-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          시험 문항 {question.orderIndex + 1}
        </p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-900">{question.prompt}</p>
      </div>

      {question.assets.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {question.assets.map((asset, assetIndex) =>
            asset.url ? (
              <a key={asset.id} href={asset.url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={asset.url}
                  alt={`시험 문항 이미지 ${assetIndex + 1}`}
                  className="max-h-56 w-full rounded-md border border-slate-200 bg-white object-contain"
                />
              </a>
            ) : (
              <div key={asset.id} className="rounded-md border border-slate-200 p-4 text-xs text-slate-400">
                이미지를 불러오지 못했습니다.
              </div>
            )
          )}
        </div>
      )}

      <div>
        <p className="text-xs font-medium text-slate-500">응시 당시 제출한 답안</p>
        <div className="mt-1 whitespace-pre-wrap rounded border border-slate-200 bg-white p-3 text-sm text-slate-700">
          {question.originalAnswer?.trim() ? (
            question.originalAnswer
          ) : (
            <span className="text-slate-400">답안 없음</span>
          )}
        </div>
      </div>
    </div>
  )
}
