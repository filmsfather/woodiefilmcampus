'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Trash2 } from 'lucide-react'

import {
  createInterviewSheetTemplateAction,
  updateInterviewSheetTemplateAction,
} from '@/app/dashboard/teacher/mock-practice/interview-sheet/actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { InterviewSheetTemplateDetail } from '@/types/interview-sheet'

interface FormItem {
  key: string
  prompt: string
}

function newItem(prompt = ''): FormItem {
  return { key: crypto.randomUUID(), prompt }
}

interface InterviewSheetTemplateFormProps {
  initialTemplate?: InterviewSheetTemplateDetail
}

export function InterviewSheetTemplateForm({ initialTemplate }: InterviewSheetTemplateFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState(initialTemplate?.title ?? '')
  const [description, setDescription] = useState(initialTemplate?.description ?? '')
  const [isDefault, setIsDefault] = useState(initialTemplate?.isDefault ?? false)
  const [items, setItems] = useState<FormItem[]>(() => {
    if (!initialTemplate) {
      return [newItem()]
    }
    return initialTemplate.items.map((item) => ({ key: item.id, prompt: item.prompt }))
  })

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (!title.trim()) {
      setError('템플릿 제목을 입력해주세요.')
      return
    }

    if (items.length === 0 || items.some((item) => !item.prompt.trim())) {
      setError('모든 질문의 내용을 입력해주세요.')
      return
    }

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      isDefault,
      items: items.map((item) => ({ prompt: item.prompt.trim() })),
    }

    startTransition(async () => {
      const result = initialTemplate
        ? await updateInterviewSheetTemplateAction({ templateId: initialTemplate.id, ...payload })
        : await createInterviewSheetTemplateAction(payload)

      if (result.success) {
        router.push('/dashboard/teacher/mock-practice/interview-sheet/templates')
        router.refresh()
      } else {
        setError(result.error ?? '저장에 실패했습니다.')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">기본 정보</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="template-title">템플릿 제목 *</Label>
            <Input
              id="template-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="예: 기본 면접지, 중앙대 대비 면접지"
              maxLength={200}
              disabled={isPending}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="template-description">설명</Label>
            <Textarea
              id="template-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="템플릿에 대한 안내를 입력하세요 (선택)"
              rows={2}
              maxLength={2000}
              disabled={isPending}
            />
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              id="template-default"
              checked={isDefault}
              onChange={(event) => setIsDefault(event.target.checked)}
              disabled={isPending}
              className="mt-0.5"
            />
            <div className="space-y-1">
              <Label htmlFor="template-default" className="cursor-pointer">
                기본 템플릿으로 설정
              </Label>
              <p className="text-xs text-slate-500">
                학생이 처음 면접지를 열 때 이 템플릿의 질문이 자동으로 채워집니다. 기본 템플릿은 1개만 지정할 수
                있습니다.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base text-slate-900">질문 목록</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending || items.length >= 100}
            onClick={() => setItems((prev) => [...prev, newItem()])}
          >
            <Plus className="mr-1 h-4 w-4" /> 질문 추가
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.map((item, index) => (
            <div key={item.key} className="flex items-start gap-2 rounded-md border border-slate-200 bg-white p-3">
              <span className="mt-2 shrink-0 text-xs font-medium text-slate-500">질문 {index + 1}</span>
              <Textarea
                value={item.prompt}
                onChange={(event) =>
                  setItems((prev) =>
                    prev.map((entry) => (entry.key === item.key ? { ...entry, prompt: event.target.value } : entry))
                  )
                }
                placeholder="면접 질문 내용을 입력하세요"
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
                disabled={isPending || items.length <= 1}
                onClick={() => setItems((prev) => prev.filter((entry) => entry.key !== item.key))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" disabled={isPending} onClick={() => router.back()}>
          취소
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {initialTemplate ? '수정 저장' : '템플릿 저장'}
        </Button>
      </div>
    </form>
  )
}
