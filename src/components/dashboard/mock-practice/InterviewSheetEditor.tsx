'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Link2, Loader2, Paperclip, Plus, Trash2, X } from 'lucide-react'

import * as studentActions from '@/app/dashboard/student/interview-sheet/actions'
import * as teacherActions from '@/app/dashboard/teacher/mock-practice/interview-sheet/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { INTERVIEW_ASSETS_BUCKET } from '@/lib/storage/buckets'
import { buildPendingStoragePath, uploadFileToStorageViaClient } from '@/lib/storage-upload'
import type {
  InterviewSheetDetail,
  InterviewSheetItem,
  InterviewSheetItemSource,
  InterviewSheetTemplateSummary,
} from '@/types/interview-sheet'

const MAX_ATTACHMENT_SIZE = 50 * 1024 * 1024

const SOURCE_LABELS: Record<InterviewSheetItemSource, string> = {
  template: '기본 질문',
  student: '학생 질문',
  teacher: '선생님 질문',
}

function sourceBadgeVariant(source: InterviewSheetItemSource): 'default' | 'secondary' | 'outline' {
  if (source === 'teacher') return 'default'
  if (source === 'template') return 'secondary'
  return 'outline'
}

interface InterviewSheetEditorProps {
  mode: 'teacher' | 'student'
  sheet: InterviewSheetDetail
  viewerId: string
  /** 교사 모드에서만: 적용 가능한 템플릿 목록 */
  templates?: InterviewSheetTemplateSummary[]
}

type ActionResult = { success?: boolean; error?: string; id?: string }

export function InterviewSheetEditor({ mode, sheet, viewerId, templates = [] }: InterviewSheetEditorProps) {
  const router = useRouter()
  const isTeacher = mode === 'teacher'

  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const [newPrompt, setNewPrompt] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState('')

  const runAction = (action: () => Promise<ActionResult>) => {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result.success) {
        router.refresh()
      } else {
        setError(result.error ?? '요청에 실패했습니다.')
      }
    })
  }

  const handleAddQuestion = () => {
    const prompt = newPrompt.trim()
    if (!prompt) {
      setError('질문 내용을 입력해주세요.')
      return
    }

    runAction(async () => {
      const result = isTeacher
        ? await teacherActions.addInterviewSheetQuestionAction({ studentId: sheet.studentId, prompt })
        : await studentActions.addMyInterviewQuestionAction({ prompt })
      if (result.success) {
        setNewPrompt('')
      }
      return result
    })
  }

  const handleApplyTemplate = () => {
    if (!selectedTemplateId) {
      setError('적용할 템플릿을 선택해주세요.')
      return
    }
    runAction(() =>
      teacherActions.applyInterviewSheetTemplateAction({
        studentId: sheet.studentId,
        templateId: selectedTemplateId,
      })
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">질문 추가</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={newPrompt}
            onChange={(event) => setNewPrompt(event.target.value)}
            placeholder={
              isTeacher
                ? '학생 면접지에 추가할 질문을 입력하세요'
                : '스스로 준비하고 싶은 면접 질문을 입력하세요'
            }
            rows={2}
            maxLength={2000}
            disabled={isPending}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button type="button" size="sm" disabled={isPending || !newPrompt.trim()} onClick={handleAddQuestion}>
              {isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
              질문 추가
            </Button>

            {isTeacher && templates.length > 0 && (
              <div className="flex items-center gap-2">
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId} disabled={isPending}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="템플릿 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.title} ({template.itemCount}문항)
                        {template.isDefault ? ' · 기본' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={handleApplyTemplate}>
                  템플릿 적용
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {sheet.items.length === 0 ? (
        <Card className="border-dashed border-slate-300 bg-slate-50">
          <CardContent className="py-12 text-center text-sm text-slate-500">
            아직 면접지에 질문이 없습니다. 위에서 질문을 추가해보세요.
          </CardContent>
        </Card>
      ) : (
        sheet.items.map((item, index) => (
          <InterviewSheetItemCard
            key={item.id}
            mode={mode}
            item={item}
            index={index}
            viewerId={viewerId}
            disabled={isPending}
            onError={setError}
          />
        ))
      )}
    </div>
  )
}

interface ItemCardProps {
  mode: 'teacher' | 'student'
  item: InterviewSheetItem
  index: number
  viewerId: string
  disabled: boolean
  onError: (message: string | null) => void
}

function InterviewSheetItemCard({ mode, item, index, viewerId, disabled, onError }: ItemCardProps) {
  const router = useRouter()
  const isTeacher = mode === 'teacher'

  const canEditPrompt = isTeacher || (item.source === 'student' && item.createdBy === viewerId)
  const canDeleteItem = isTeacher || (item.source === 'student' && item.createdBy === viewerId)

  const [isPending, startTransition] = useTransition()
  const [isUploading, setIsUploading] = useState(false)

  const [prompt, setPrompt] = useState(item.prompt)
  const [answer, setAnswer] = useState(item.answer ?? '')
  const [feedback, setFeedback] = useState(item.teacherFeedback ?? '')

  const [showLinkForm, setShowLinkForm] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkTitle, setLinkTitle] = useState('')

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const isDirty = isTeacher
    ? prompt !== item.prompt || feedback !== (item.teacherFeedback ?? '')
    : (canEditPrompt && prompt !== item.prompt) || answer !== (item.answer ?? '')

  const isBusy = disabled || isPending || isUploading

  const runAction = (action: () => Promise<ActionResult>) => {
    onError(null)
    startTransition(async () => {
      const result = await action()
      if (result.success) {
        router.refresh()
      } else {
        onError(result.error ?? '요청에 실패했습니다.')
      }
    })
  }

  const handleSave = () => {
    if (canEditPrompt && !prompt.trim()) {
      onError('질문 내용을 입력해주세요.')
      return
    }

    if (isTeacher) {
      runAction(() =>
        teacherActions.updateInterviewSheetItemAction({
          itemId: item.id,
          prompt: prompt !== item.prompt ? prompt.trim() : undefined,
          feedback: feedback !== (item.teacherFeedback ?? '') ? feedback : undefined,
        })
      )
    } else {
      runAction(() =>
        studentActions.updateMyInterviewItemAction({
          itemId: item.id,
          prompt: canEditPrompt && prompt !== item.prompt ? prompt.trim() : undefined,
          answer: answer !== (item.answer ?? '') ? answer : undefined,
        })
      )
    }
  }

  const handleDelete = () => {
    if (!window.confirm('이 질문을 삭제할까요? 답변과 첨부도 함께 삭제됩니다.')) {
      return
    }
    runAction(() =>
      isTeacher
        ? teacherActions.deleteInterviewSheetItemAction({ itemId: item.id })
        : studentActions.deleteMyInterviewItemAction({ itemId: item.id })
    )
  }

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const isAllowed = file.type.startsWith('image/') || file.type === 'application/pdf'
    if (!isAllowed) {
      onError('이미지 또는 PDF 파일만 첨부할 수 있습니다.')
      return
    }
    if (file.size > MAX_ATTACHMENT_SIZE) {
      onError('첨부 파일 크기는 최대 50MB까지 허용됩니다.')
      return
    }

    onError(null)
    setIsUploading(true)

    try {
      const path = buildPendingStoragePath({ ownerId: viewerId, prefix: 'sheet-pending', fileName: file.name })
      const uploaded = await uploadFileToStorageViaClient({
        bucket: INTERVIEW_ASSETS_BUCKET,
        file,
        path,
        maxSizeBytes: MAX_ATTACHMENT_SIZE,
      })

      const input = {
        itemId: item.id,
        asset: {
          kind: 'file' as const,
          file: {
            bucket: INTERVIEW_ASSETS_BUCKET,
            path: uploaded.path,
            size: uploaded.size,
            mimeType: uploaded.mimeType,
            originalName: uploaded.originalName,
          },
        },
      }

      const result = isTeacher
        ? await teacherActions.addInterviewSheetItemAssetAction(input)
        : await studentActions.addMyInterviewItemAssetAction(input)

      if (result.success) {
        router.refresh()
      } else {
        onError(result.error ?? '첨부 추가에 실패했습니다.')
      }
    } catch (err) {
      console.error('[interview-sheets] attachment upload failed', err)
      onError(err instanceof Error ? err.message : '첨부 업로드에 실패했습니다.')
    } finally {
      setIsUploading(false)
    }
  }

  const handleAddLink = () => {
    const url = linkUrl.trim()
    if (!url) {
      onError('링크 주소를 입력해주세요.')
      return
    }

    const input = {
      itemId: item.id,
      asset: { kind: 'link' as const, url, title: linkTitle.trim() || null },
    }

    runAction(async () => {
      const result = isTeacher
        ? await teacherActions.addInterviewSheetItemAssetAction(input)
        : await studentActions.addMyInterviewItemAssetAction(input)
      if (result.success) {
        setShowLinkForm(false)
        setLinkUrl('')
        setLinkTitle('')
      }
      return result
    })
  }

  const handleDeleteAsset = (assetId: string) => {
    runAction(() =>
      isTeacher
        ? teacherActions.deleteInterviewSheetItemAssetAction({ assetId })
        : studentActions.deleteMyInterviewItemAssetAction({ assetId })
    )
  }

  return (
    <Card className="border-slate-200">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base text-slate-900">질문 {index + 1}</CardTitle>
          <Badge variant={sourceBadgeVariant(item.source)}>{SOURCE_LABELS[item.source]}</Badge>
          {item.answer?.trim() ? (
            <Badge variant="outline" className="border-emerald-300 text-emerald-700">
              답변 완료
            </Badge>
          ) : null}
        </div>
        {canDeleteItem && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-red-600 hover:text-red-700"
            disabled={isBusy}
            onClick={handleDelete}
          >
            <Trash2 className="h-4 w-4" />
            <span className="sr-only">질문 삭제</span>
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="text-xs text-slate-500">질문</Label>
          {canEditPrompt ? (
            <Textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={2}
              maxLength={2000}
              disabled={isBusy}
            />
          ) : (
            <p className="whitespace-pre-line rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
              {item.prompt}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-slate-500">답변</Label>
          {isTeacher ? (
            item.answer?.trim() ? (
              <p className="whitespace-pre-line rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-800">
                {item.answer}
              </p>
            ) : (
              <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-400">
                아직 학생이 답변을 작성하지 않았습니다.
              </p>
            )
          ) : (
            <Textarea
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder="답변을 작성해보세요"
              rows={4}
              maxLength={8000}
              disabled={isBusy}
            />
          )}
        </div>

        {(isTeacher || item.teacherFeedback?.trim()) && (
          <div className="space-y-2">
            <Label className="text-xs text-slate-500">
              선생님 피드백
              {item.feedbackByName ? ` · ${item.feedbackByName}` : ''}
            </Label>
            {isTeacher ? (
              <Textarea
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                placeholder="학생 답변에 대한 피드백을 남겨보세요"
                rows={3}
                maxLength={4000}
                disabled={isBusy}
              />
            ) : (
              <p className="whitespace-pre-line rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-slate-800">
                {item.teacherFeedback}
              </p>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-xs text-slate-500">첨부</Label>
          {item.assets.length > 0 && (
            <ul className="space-y-2">
              {item.assets.map((asset) => {
                const canDeleteAsset = isTeacher || asset.createdBy === viewerId
                const isImage = asset.kind === 'file' && asset.mimeType?.startsWith('image/')
                return (
                  <li key={asset.id} className="flex items-center gap-2">
                    {asset.kind === 'link' ? (
                      <a
                        href={asset.externalUrl ?? '#'}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-blue-600 underline-offset-2 hover:underline"
                      >
                        <Link2 className="h-4 w-4 shrink-0" />
                        {asset.title || asset.externalUrl}
                      </a>
                    ) : isImage && asset.url ? (
                      <a href={asset.url} target="_blank" rel="noreferrer" className="block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={asset.url}
                          alt={asset.title ?? '첨부 이미지'}
                          className="h-24 w-24 rounded-md border border-slate-200 object-cover"
                        />
                      </a>
                    ) : (
                      <a
                        href={asset.url ?? '#'}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-blue-600 underline-offset-2 hover:underline"
                      >
                        <FileText className="h-4 w-4 shrink-0" />
                        {asset.title || 'PDF 파일 열기'}
                      </a>
                    )}
                    {canDeleteAsset && (
                      <button
                        type="button"
                        className="rounded-full p-1 text-slate-400 hover:text-red-600"
                        disabled={isBusy}
                        onClick={() => handleDeleteAsset(asset.id)}
                      >
                        <X className="h-3.5 w-3.5" />
                        <span className="sr-only">첨부 삭제</span>
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileSelect}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isBusy}
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploading ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Paperclip className="mr-1 h-4 w-4" />
              )}
              파일 첨부
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isBusy}
              onClick={() => setShowLinkForm((prev) => !prev)}
            >
              <Link2 className="mr-1 h-4 w-4" />
              링크 첨부
            </Button>
          </div>

          {showLinkForm && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-3">
              <Input
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
                placeholder="https://..."
                className="w-64"
                disabled={isBusy}
              />
              <Input
                value={linkTitle}
                onChange={(event) => setLinkTitle(event.target.value)}
                placeholder="표시할 이름 (선택)"
                className="w-48"
                maxLength={200}
                disabled={isBusy}
              />
              <Button type="button" size="sm" disabled={isBusy || !linkUrl.trim()} onClick={handleAddLink}>
                추가
              </Button>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button type="button" size="sm" disabled={isBusy || !isDirty} onClick={handleSave}>
            {isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            저장
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
