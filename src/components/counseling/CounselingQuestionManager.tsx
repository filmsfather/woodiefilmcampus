
'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'

import {
  createCounselingQuestion,
  deleteCounselingQuestion,
  moveCounselingQuestion,
  updateCounselingQuestion,
} from '@/app/dashboard/manager/counseling/actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface QuestionItem {
  id: string
  field_key: string
  prompt: string
  field_type: 'text' | 'textarea'
  is_required: boolean
  is_active: boolean
  position: number
}

interface CounselingQuestionManagerProps {
  questions: QuestionItem[]
}

export function CounselingQuestionManager({ questions }: CounselingQuestionManagerProps) {
  const [createPrompt, setCreatePrompt] = useState('')
  const [createFieldType, setCreateFieldType] = useState<'text' | 'textarea'>('text')
  const [createRequired, setCreateRequired] = useState(false)
  const [busyQuestion, setBusyQuestion] = useState<string | null>(null)
  const [busyCreate, setBusyCreate] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, { prompt: string; fieldType: 'text' | 'textarea'; isRequired: boolean; isActive: boolean }>>(
    () =>
      Object.fromEntries(
        questions.map((question) => [question.id, {
          prompt: question.prompt,
          fieldType: question.field_type,
          isRequired: question.is_required,
          isActive: question.is_active,
        }])
      )
  )

  const handleCreate = async () => {
    if (!createPrompt.trim()) {
      return
    }
    setBusyCreate(true)
    try {
      await createCounselingQuestion({
        prompt: createPrompt.trim(),
        fieldType: createFieldType,
        isRequired: createRequired,
      })
      setCreatePrompt('')
      setCreateFieldType('text')
      setCreateRequired(false)
    } catch (error) {
      console.error('[counseling] create question failed', error)
    } finally {
      setBusyCreate(false)
    }
  }

  const handleUpdate = async (id: string) => {
    const draft = drafts[id]
    if (!draft) {
      return
    }
    setBusyQuestion(id)
    try {
      await updateCounselingQuestion({
        id,
        prompt: draft.prompt.trim(),
        fieldType: draft.fieldType,
        isRequired: draft.isRequired,
        isActive: draft.isActive,
      })
    } catch (error) {
      console.error('[counseling] update question failed', error)
    } finally {
      setBusyQuestion(null)
    }
  }

  const handleMove = async (id: string, direction: 'up' | 'down') => {
    setBusyQuestion(id)
    try {
      await moveCounselingQuestion({ id, direction })
    } catch (error) {
      console.error('[counseling] move question failed', error)
    } finally {
      setBusyQuestion(null)
    }
  }

  const handleDelete = async (id: string) => {
    setBusyQuestion(id)
    try {
      await deleteCounselingQuestion({ id })
    } catch (error) {
      console.error('[counseling] delete question failed', error)
    } finally {
      setBusyQuestion(null)
    }
  }

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-900">새 질문 추가</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-question">질문 내용</Label>
            <Input
              id="new-question"
              value={createPrompt}
              onChange={(event) => setCreatePrompt(event.target.value)}
              placeholder="예: 상담 시 추가로 확인하고 싶은 내용이 있나요?"
            />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>필드 타입</Label>
              <Select value={createFieldType} onValueChange={(value) => setCreateFieldType(value as 'text' | 'textarea')}>
                <SelectTrigger>
                  <SelectValue placeholder="입력 타입" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">단답형 입력</SelectItem>
                  <SelectItem value="textarea">서술형 입력</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="new-required"
                checked={createRequired}
                onChange={(event) => setCreateRequired(event.target.checked)}
              />
              <Label htmlFor="new-required">필수 질문</Label>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleCreate} disabled={busyCreate || !createPrompt.trim()}>
              {busyCreate ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              질문 추가
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {questions.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
            등록된 추가 질문이 없습니다.
          </div>
        ) : null}
        {questions.map((question, index) => {
          const draft = drafts[question.id] ?? {
            prompt: question.prompt,
            fieldType: question.field_type,
            isRequired: question.is_required,
            isActive: question.is_active,
          }
          const isBusy = busyQuestion === question.id
          return (
            <Card key={question.id} className="border-slate-200 shadow-sm">
              <CardHeader className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <CardTitle className="text-base font-semibold text-slate-900">{question.prompt}</CardTitle>
                  <p className="text-xs text-slate-500">필드 키: {question.field_key}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleMove(question.id, 'up')}
                    disabled={isBusy || index === 0}
                  >
                    위로
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleMove(question.id, 'down')}
                    disabled={isBusy || index === questions.length - 1}
                  >
                    아래로
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(question.id)} disabled={isBusy}>
                    삭제
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor={`prompt-${question.id}`}>질문 문구</Label>
                  <Input
                    id={`prompt-${question.id}`}
                    value={draft.prompt}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [question.id]: {
                          ...draft,
                          prompt: event.target.value,
                        },
                      }))
                    }
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>입력 타입</Label>
                    <Select
                      value={draft.fieldType}
                      onValueChange={(value) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [question.id]: {
                            ...draft,
                            fieldType: value as 'text' | 'textarea',
                          },
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">단답형 입력</SelectItem>
                        <SelectItem value="textarea">서술형 입력</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`required-${question.id}`}
                      checked={draft.isRequired}
                      onChange={(event) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [question.id]: {
                            ...draft,
                            isRequired: event.target.checked,
                          },
                        }))
                      }
                    />
                    <Label htmlFor={`required-${question.id}`}>필수 질문</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`active-${question.id}`}
                      checked={draft.isActive}
                      onChange={(event) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [question.id]: {
                            ...draft,
                            isActive: event.target.checked,
                          },
                        }))
                      }
                    />
                    <Label htmlFor={`active-${question.id}`}>예약 폼에 표시</Label>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button size="sm" onClick={() => handleUpdate(question.id)} disabled={isBusy}>
                    {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    변경 사항 저장
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
