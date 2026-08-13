'use client'

import { useState } from 'react'
import { FileSearch, Loader2 } from 'lucide-react'

import { getPracticeProblemPreviewAction } from '@/app/dashboard/teacher/mock-practice/problems/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { PRACTICE_TYPE_LABELS, type PracticeProblemDetail } from '@/types/practice'

export function PracticeProblemPreviewDialog({ problemId }: { problemId: string }) {
  const [open, setOpen] = useState(false)
  const [problem, setProblem] = useState<PracticeProblemDetail | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadProblem = async () => {
    setIsLoading(true)
    setError(null)
    const result = await getPracticeProblemPreviewAction(problemId)
    if (result.problem) {
      setProblem(result.problem)
    } else {
      setError(result.error ?? '문제를 불러오지 못했습니다.')
    }
    setIsLoading(false)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (nextOpen && !isLoading) {
      // 서명 URL이 만료될 수 있어 열 때마다 다시 불러온다.
      void loadProblem()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <FileSearch className="mr-1 h-4 w-4" /> 미리보기
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-6 text-left text-base text-slate-900">
            {problem?.title ?? '문제 미리보기'}
            {problem && (
              <>
                <Badge variant={problem.practiceType === 'writing' ? 'secondary' : 'outline'}>
                  {PRACTICE_TYPE_LABELS[problem.practiceType]}
                </Badge>
                {!problem.isActive && (
                  <Badge variant="outline" className="text-amber-600">
                    비활성
                  </Badge>
                )}
              </>
            )}
          </DialogTitle>
          <DialogDescription className="text-left text-xs">
            {problem
              ? `${problem.universityName} · 제한시간 ${problem.timeLimitMinutes}분 · 문항 ${problem.items.length}개 · 채점 항목 ${problem.rubricItems.length}개 · 배정 ${problem.usageCount}회`
              : '학생에게 보이는 문항 내용을 확인할 수 있습니다.'}
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> 문제를 불러오는 중입니다.
          </div>
        )}

        {!isLoading && error && (
          <div className="space-y-3 py-6 text-center">
            <p className="text-sm text-red-600">{error}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadProblem()}>
              다시 시도
            </Button>
          </div>
        )}

        {!isLoading && !error && problem && (
          <div className="space-y-4">
            {problem.description && (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-500">안내</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{problem.description}</p>
              </div>
            )}

            <div className="space-y-2">
              {problem.items.map((item, index) => (
                <div key={item.id} className="space-y-1 rounded-md border border-slate-200 bg-white p-3">
                  <p className="text-xs font-medium text-slate-500">문항 {index + 1}</p>
                  <p className="whitespace-pre-wrap text-sm text-slate-900">{item.prompt}</p>
                </div>
              ))}
            </div>

            {problem.assets.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-500">문제 이미지 {problem.assets.length}장</p>
                <div className="flex flex-wrap gap-2">
                  {problem.assets.map((asset, index) =>
                    asset.url ? (
                      <a
                        key={asset.id}
                        href={asset.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block h-28 w-28 overflow-hidden rounded-md border border-slate-200 bg-slate-50"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={asset.url}
                          alt={`문제 이미지 ${index + 1}`}
                          className="h-full w-full object-cover"
                        />
                      </a>
                    ) : (
                      <div
                        key={asset.id}
                        className="flex h-28 w-28 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-xs text-slate-400"
                      >
                        불러올 수 없음
                      </div>
                    )
                  )}
                </div>
              </div>
            )}

            {problem.rubricItems.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-500">채점 항목</p>
                <div className="space-y-2">
                  {problem.rubricItems.map((rubric) => (
                    <div
                      key={rubric.id}
                      className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-slate-200 bg-white p-3"
                    >
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm font-medium text-slate-900">{rubric.label}</p>
                        {rubric.description && (
                          <p className="whitespace-pre-wrap text-xs text-slate-500">{rubric.description}</p>
                        )}
                      </div>
                      <Badge variant="outline">{rubric.maxScore}점</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
