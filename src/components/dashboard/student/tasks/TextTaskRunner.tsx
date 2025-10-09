'use client'
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'

import { submitTextResponses } from '@/app/dashboard/student/tasks/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { StudentTaskDetail } from '@/types/student-task'
import { stripHtml } from '@/lib/rich-text'

interface TextTaskRunnerProps {
  task: StudentTaskDetail
  submissionType: 'writing' | 'lecture'
  instructions?: string | null
  maxCharacters?: number | null
  attachments?: Record<string, Array<{
    id: string
    filename: string
    url: string
    mimeType: string | null
  }>>
}

interface PromptEntry {
  studentTaskItemId: string
  workbookItemId: string
  prompt: string
  index: number
  existingAnswer: string
}

export function TextTaskRunner({
  task,
  submissionType,
  instructions,
  maxCharacters,
  attachments,
}: TextTaskRunnerProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const prompts = useMemo<PromptEntry[]>(() => {
    return task.items.map((item, index) => ({
      studentTaskItemId: item.id,
      workbookItemId: item.workbookItem.id,
      prompt: item.workbookItem.prompt,
      index: index + 1,
      existingAnswer: stripHtml(item.submission?.content ?? ''),
    }))
  }, [task.items])

  const [answers, setAnswers] = useState<string[]>(() => prompts.map((entry) => entry.existingAnswer))

  useEffect(() => {
    setAnswers(prompts.map((entry) => entry.existingAnswer))
  }, [prompts])

  const handleChange = (value: string, targetIndex: number) => {
    setAnswers((prev) => prev.map((answer, index) => (index === targetIndex ? value : answer)))
  }

  const handleSubmit = () => {
    setErrorMessage(null)
    setSuccessMessage(null)

    startTransition(async () => {
      try {
        const normalizedAnswers = prompts.map((prompt, index) => {
          const raw = answers[index] ?? ''
          const normalized = raw.replace(/\r/g, '')
          return {
            studentTaskItemId: prompt.studentTaskItemId,
            workbookItemId: prompt.workbookItemId,
            content: normalized,
          }
        })

        const payload = {
          studentTaskId: task.id,
          submissionType,
          answers: normalizedAnswers,
        }

        const response = await submitTextResponses(payload)

        if (!response.success) {
          setErrorMessage(response.error ?? '제출 중 오류가 발생했습니다.')
          return
        }

        setSuccessMessage('답안을 저장했어요.')
        router.refresh()
      } catch (error) {
        console.error('[TextTaskRunner] submit failed', error)
        setErrorMessage('제출 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
      }
    })
  }

  if (prompts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
        작성할 문항이 없습니다. 담당 선생님께 문의해주세요.
      </div>
    )
  }

  const limit = typeof maxCharacters === 'number' && maxCharacters > 0 ? maxCharacters : undefined
  const attachmentMap = attachments ?? {}

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <div className="flex flex-col gap-2">
          <p className="text-base font-medium text-slate-900">답안을 작성해주세요</p>
          {instructions && <p className="whitespace-pre-line">{instructions}</p>}
          {submissionType === 'lecture' && (
            <p className="text-xs text-slate-500">요약을 저장하면 시청 완료로 표시됩니다.</p>
          )}
          {limit && (
            <p className="text-xs text-slate-500">최대 {limit.toLocaleString()}자까지 입력할 수 있습니다.</p>
          )}
        </div>
      </div>

      <div className="space-y-5">
        {prompts.map((prompt, index) => {
          const value = answers[index] ?? ''
          const characterCount = value.length
          const overLimit = limit ? characterCount > limit : false
          const itemAttachments = attachmentMap[prompt.studentTaskItemId] ?? []

          return (
            <div key={prompt.studentTaskItemId} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-start gap-2">
                <Badge variant="secondary">문항 {prompt.index}</Badge>
                <p className="font-medium text-slate-900 whitespace-pre-line">{prompt.prompt}</p>
              </div>
              {itemAttachments.length > 0 && (
                <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  <p className="font-medium text-slate-700">첨부 파일</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {itemAttachments.map((file) => {
                      if (file.mimeType && file.mimeType.startsWith('image/')) {
                        return (
                          <figure key={file.id} className="space-y-1">
                            <img
                              src={file.url}
                              alt={file.filename}
                              className="max-h-64 w-full rounded-md border border-slate-200 object-contain"
                              loading="lazy"
                            />
                            <figcaption className="break-all text-slate-500">{file.filename}</figcaption>
                          </figure>
                        )
                      }

                      const isPdf = file.mimeType === 'application/pdf' || file.filename.toLowerCase().endsWith('.pdf')

                      return (
                        <div key={file.id} className="flex flex-col gap-1">
                          <a
                            href={file.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary underline break-all"
                            download={isPdf ? file.filename : undefined}
                          >
                            {file.filename}
                          </a>
                          <span className="text-slate-500">{isPdf ? 'PDF 파일' : file.mimeType ?? '파일'}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              <Textarea
                value={value}
                onChange={(event) => handleChange(event.target.value, index)}
                placeholder="답안을 입력하세요"
                disabled={isPending}
                rows={6}
              />
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>작성한 글자 수: {characterCount.toLocaleString()}자</span>
                {limit && (
                  <span className={cn(overLimit ? 'text-red-600' : 'text-slate-500')}>
                    최대 {limit.toLocaleString()}자
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {errorMessage && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4" />
          <p>{errorMessage}</p>
        </div>
      )}

      {successMessage && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          <p>{successMessage}</p>
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={handleSubmit} disabled={isPending} className="min-w-[120px]">
          {isPending ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> 저장 중
            </span>
          ) : (
            '답안 저장'
          )}
        </Button>
      </div>
    </div>
  )
}
