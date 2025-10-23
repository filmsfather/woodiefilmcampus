'use client'

import { useMemo, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import RichTextEditor from '@/components/ui/rich-text-editor'
import type { StaffProfile } from '@/lib/notice-board'
import { MAX_NOTICE_ATTACHMENT_SIZE } from '@/lib/notice-board'

interface NoticeComposerDefaults {
  noticeId?: string
  title?: string
  body?: string
  recipientIds?: string[]
  attachments?: { id: string; name?: string | null }[]
}

interface NoticeComposerProps {
  recipients: StaffProfile[]
  onSubmit: (formData: FormData) => Promise<{ success?: boolean; error?: string; noticeId?: string }>
  defaults?: NoticeComposerDefaults
  submitLabel?: string
  onDelete?: ((formData: FormData) => Promise<{ success?: boolean; error?: string }>) | null
}

const ROLE_LABEL: Record<StaffProfile['role'], string> = {
  manager: '실장',
  teacher: '선생님',
}

function formatFileSize(bytes: number) {
  if (bytes === 0) {
    return '0B'
  }
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, index)
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)}${units[index]}`
}

export function NoticeComposer({ recipients, onSubmit, defaults, submitLabel = '공지 저장', onDelete }: NoticeComposerProps) {
  const router = useRouter()
  const [title, setTitle] = useState(defaults?.title ?? '')
  const [body, setBody] = useState(defaults?.body ?? '')
  const [selectedRecipients, setSelectedRecipients] = useState<Set<string>>(
    () => new Set(defaults?.recipientIds ?? [])
  )
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isDeleting, startDeleteTransition] = useTransition()
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<Set<string>>(new Set())

  const existingAttachments = useMemo(
    () => defaults?.attachments ?? [],
    [defaults?.attachments]
  )

  const groupedRecipients = useMemo(() => {
    return recipients.reduce<Record<StaffProfile['role'], StaffProfile[]>>(
      (acc, recipient) => {
        acc[recipient.role] = acc[recipient.role] ? [...acc[recipient.role], recipient] : [recipient]
        return acc
      },
      { manager: [], teacher: [] }
    )
  }, [recipients])

  const totalSelectedSize = useMemo(() => selectedFiles.reduce((acc, file) => acc + file.size, 0), [selectedFiles])
  const maxSizeLabel = useMemo(() => formatFileSize(MAX_NOTICE_ATTACHMENT_SIZE), [])

  const toggleExistingAttachment = (id: string) => {
    setRemovedAttachmentIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleRecipient = (id: string) => {
    setSelectedRecipients((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleAllForRole = (role: StaffProfile['role']) => {
    setSelectedRecipients((prev) => {
      const next = new Set(prev)
      const entries = groupedRecipients[role] ?? []
      const allSelected = entries.every((entry) => next.has(entry.id))
      entries.forEach((entry) => {
        if (allSelected) {
          next.delete(entry.id)
        } else {
          next.add(entry.id)
        }
      })
      return next
    })
  }

  const handleFileChange = (event: FormEvent<HTMLInputElement>) => {
    const files = event.currentTarget.files
    setSelectedFiles(files ? Array.from(files) : [])
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    const trimmedTitle = title.trim()
    if (trimmedTitle.length === 0) {
      setError('제목을 입력해주세요.')
      return
    }

    if (body.trim().length === 0) {
      setError('본문을 입력해주세요.')
      return
    }

    if (selectedRecipients.size === 0) {
      setError('공유 대상을 선택해주세요.')
      return
    }

    const attachments = selectedFiles
    let totalSize = 0
    for (const file of attachments) {
      totalSize += file.size
      if (!file.type || !file.type.startsWith('image/')) {
        setError('이미지 파일만 첨부할 수 있습니다.')
        return
      }
    }

    if (totalSize > MAX_NOTICE_ATTACHMENT_SIZE) {
      setError(`첨부 파일 용량은 최대 ${maxSizeLabel}까지 허용됩니다.`)
      return
    }

    const form = event.currentTarget
    const formData = new FormData(form)
    if (defaults?.noticeId) {
      formData.set('noticeId', defaults.noticeId)
    }
    formData.set('title', trimmedTitle)
    formData.set('body', body)
    formData.delete('recipientIds')
    formData.delete('removeAttachmentIds')

    selectedRecipients.forEach((id) => {
      formData.append('recipientIds', id)
    })

    removedAttachmentIds.forEach((id) => {
      formData.append('removeAttachmentIds', id)
    })

    startTransition(async () => {
      const result = await onSubmit(formData)

      if (result?.error) {
        setError(result.error)
        return
      }

      if (result?.success) {
        const targetId = result.noticeId ?? defaults?.noticeId ?? null
        if (targetId) {
          router.push(`/dashboard/teacher/notices/${targetId}`)
          router.refresh()
        } else {
          router.push('/dashboard/teacher/notices')
          router.refresh()
        }
      }
    })
  }

  const handleDelete = () => {
    if (!onDelete || !defaults?.noticeId) {
      return
    }

    setError(null)

    startDeleteTransition(async () => {
      const deleteFormData = new FormData()
      deleteFormData.set('noticeId', defaults.noticeId!)
      const result = await onDelete(deleteFormData)

      if (result?.error) {
        setError(result.error)
        return
      }

      if (result?.success) {
        router.push('/dashboard/teacher/notices')
        router.refresh()
      }
    })
  }

  return (
    <Card className="border-slate-200">
      <CardHeader className="space-y-1">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-xl text-slate-900">공지 정보</CardTitle>
            <CardDescription className="text-sm text-slate-600">
              공지 제목과 본문을 작성하고 공유 대상을 선택하세요. 첨부 이미지는 총 {maxSizeLabel}까지 업로드할 수 있습니다.
            </CardDescription>
          </div>
          {onDelete && defaults?.noticeId ? (
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending || isDeleting}
            >
              {isDeleting ? (
                <span className="flex items-center gap-2">
                  <LoadingSpinner className="h-4 w-4" /> 삭제 중...
                </span>
              ) : (
                '공지 삭제'
              )}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <form className="space-y-6" onSubmit={handleSubmit}>
          {defaults?.noticeId ? <input type="hidden" name="noticeId" value={defaults.noticeId} /> : null}

          <div className="space-y-2">
            <Label htmlFor="notice-title">제목</Label>
            <Input
              id="notice-title"
              name="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="예: 5월 첫째주 교무 일정 안내"
              maxLength={200}
              disabled={isPending}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>본문</Label>
            <RichTextEditor
              value={body}
              onChange={setBody}
              placeholder="공지 내용을 작성하세요. 중요 항목은 굵게 표시하거나 목록으로 정리할 수 있습니다."
              disabled={isPending}
            />
            <input type="hidden" name="body" value={body} />
          </div>

          {existingAttachments.length > 0 ? (
            <div className="space-y-2">
              <Label>기존 첨부 이미지</Label>
              <div className="space-y-2 rounded-md border border-slate-200 p-3 text-sm text-slate-700">
                {existingAttachments.map((attachment) => {
                  const isRemoved = removedAttachmentIds.has(attachment.id)
                  return (
                    <div
                      key={attachment.id}
                      className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2"
                    >
                      <div>
                        <p className={`text-sm ${isRemoved ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                          {attachment.name ?? '첨부 이미지'}
                        </p>
                        {isRemoved ? (
                          <p className="text-xs text-rose-500">삭제 예정</p>
                        ) : (
                          <p className="text-xs text-slate-500">유지 중</p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant={isRemoved ? 'secondary' : 'outline'}
                        size="sm"
                        onClick={() => toggleExistingAttachment(attachment.id)}
                        disabled={isPending}
                      >
                        {isRemoved ? '삭제 취소' : '삭제'}
                      </Button>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>공유 대상</Label>
              <span className="text-xs text-slate-500">원장은 자동으로 모든 공지를 열람할 수 있습니다.</span>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {(['manager', 'teacher'] as const).map((role) => {
                const entries = groupedRecipients[role]
                if (!entries || entries.length === 0) {
                  return (
                    <div
                      key={role}
                      className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500"
                    >
                      {ROLE_LABEL[role]} 리스트가 없습니다.
                    </div>
                  )
                }

                const allSelected = entries.every((entry) => selectedRecipients.has(entry.id))

                return (
                  <div key={role} className="space-y-3 rounded-lg border border-slate-200 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-800">{ROLE_LABEL[role]} ({entries.length}명)</span>
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline"
                        onClick={() => toggleAllForRole(role)}
                      >
                        {allSelected ? '모두 해제' : '모두 선택'}
                      </button>
                    </div>
                    <div className="space-y-2">
                      {entries.map((entry) => {
                        const isChecked = selectedRecipients.has(entry.id)
                        return (
                          <label key={entry.id} className="flex items-start gap-2 text-sm text-slate-700">
                            <Checkbox
                              name="recipientIds"
                              value={entry.id}
                              checked={isChecked}
                              onChange={() => toggleRecipient(entry.id)}
                              disabled={isPending}
                            />
                            <span>
                              <span className="font-medium">{entry.name}</span>
                              <span className="ml-2 text-xs text-slate-500">{ROLE_LABEL[entry.role]}</span>
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notice-attachments">첨부 이미지 (선택)</Label>
            <Input
              id="notice-attachments"
              name="attachments"
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              disabled={isPending}
            />
            <p className="text-xs text-slate-500">
              이미지 파일만 업로드할 수 있으며 전체 용량은 {maxSizeLabel} 이하여야 합니다.
            </p>
            {selectedFiles.length > 0 ? (
              <div className="space-y-1 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                <div className="flex items-center justify-between">
                  <span>선택한 파일 {selectedFiles.length}개</span>
                  <Badge variant={totalSelectedSize > MAX_NOTICE_ATTACHMENT_SIZE ? 'destructive' : 'secondary'}>
                    {formatFileSize(totalSelectedSize)} / {maxSizeLabel}
                  </Badge>
                </div>
                <ul className="list-disc space-y-1 pl-4">
                  {selectedFiles.map((file) => (
                    <li key={`${file.name}-${file.lastModified}`}>{file.name}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button type="submit" disabled={isPending || isDeleting} className="min-w-[120px]">
              {isPending ? (
                <span className="flex items-center gap-2">
                  <LoadingSpinner className="h-4 w-4" /> 저장 중...
                </span>
              ) : (
                submitLabel
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
