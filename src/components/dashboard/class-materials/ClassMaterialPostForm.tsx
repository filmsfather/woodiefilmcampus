'use client'

import { useMemo, useRef, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  CLASS_MATERIALS_BUCKET,
  type ClassMaterialAssetType,
  type ClassMaterialSubject,
} from '@/lib/class-materials-shared'
import { buildPendingStoragePath, uploadFileToStorageViaClient, type UploadedObjectMeta } from '@/lib/storage-upload'
import { createClient as createBrowserSupabase } from '@/lib/supabase/client'

const MAX_UPLOAD_SIZE = 50 * 1024 * 1024 // 50MB

const ATTACHMENT_SECTIONS: Array<{
  kind: ClassMaterialAssetType
  label: string
  helper: string
}> = [
  {
    kind: 'class_material',
    label: '수업자료',
    helper: '수업 진행에 사용하는 본 자료를 업로드하세요.',
  },
  {
    kind: 'student_handout',
    label: '학생 유인물',
    helper: '학생들에게 배포하거나 숙제로 활용할 파일을 등록하세요.',
  },
]

type FormResult = {
  success?: boolean
  error?: string
  postId?: string
}

type DeleteResult = {
  success?: boolean
  error?: string
}

type ExistingAttachmentSummary = {
  id: string
  kind: ClassMaterialAssetType
  name: string
}

type PendingAttachmentSummary = {
  clientId: string
  kind: ClassMaterialAssetType
  name: string
  size: number
  meta: UploadedObjectMeta
}

export interface ClassMaterialPostFormDefaults {
  postId?: string
  weekLabel?: string | null
  title?: string
  description?: string | null
  attachments?: Array<{ id: string; kind: ClassMaterialAssetType; name: string }>
}

interface ClassMaterialPostFormProps {
  subject: ClassMaterialSubject
  defaults?: ClassMaterialPostFormDefaults
  submitLabel?: string
  onSubmit: (formData: FormData) => Promise<FormResult>
  onDelete?: (() => Promise<DeleteResult>) | null
  currentUserId: string
}

const formatFileSize = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0B'
  }
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)}${units[unitIndex]}`
}

export function ClassMaterialPostForm({
  subject,
  defaults,
  submitLabel = '저장',
  onSubmit,
  onDelete,
  currentUserId,
}: ClassMaterialPostFormProps) {
  const router = useRouter()
  const supabase = useMemo(() => createBrowserSupabase(), [])
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isDeleting, startDeleteTransition] = useTransition()
  const [uploadingKind, setUploadingKind] = useState<ClassMaterialAssetType | null>(null)

  const initialExisting = useMemo(() => {
    const grouped: Record<ClassMaterialAssetType, ExistingAttachmentSummary[]> = {
      class_material: [],
      student_handout: [],
    }
    for (const attachment of defaults?.attachments ?? []) {
      grouped[attachment.kind] = [...grouped[attachment.kind], attachment]
    }
    return grouped
  }, [defaults?.attachments])

  const [existingAttachments] = useState(initialExisting)
  const [pendingAttachments, setPendingAttachments] = useState<Record<ClassMaterialAssetType, PendingAttachmentSummary[]>>({
    class_material: [],
    student_handout: [],
  })
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<Set<string>>(new Set())

  const maxSizeLabel = useMemo(() => `${Math.round(MAX_UPLOAD_SIZE / (1024 * 1024))}MB`, [])

  const fileInputRefs: Record<ClassMaterialAssetType, React.RefObject<HTMLInputElement | null>> = {
    class_material: useRef<HTMLInputElement | null>(null),
    student_handout: useRef<HTMLInputElement | null>(null),
  }

  const toggleExistingAttachment = (attachmentId: string) => {
    setRemovedAttachmentIds((prev) => {
      const next = new Set(prev)
      if (next.has(attachmentId)) {
        next.delete(attachmentId)
      } else {
        next.add(attachmentId)
      }
      return next
    })
  }

  const handleRemovePendingAttachment = (kind: ClassMaterialAssetType, clientId: string) => {
    setPendingAttachments((prev) => {
      const target = prev[kind].find((item) => item.clientId === clientId)
      if (target) {
        supabase.storage.from(CLASS_MATERIALS_BUCKET).remove([target.meta.path]).catch((removeError) => {
          console.error('[class-materials] failed to remove pending attachment', removeError)
        })
      }
      return {
        ...prev,
        [kind]: prev[kind].filter((item) => item.clientId !== clientId),
      }
    })
  }

  const handleUpload = async (kind: ClassMaterialAssetType, files: FileList | null) => {
    if (!files || files.length === 0) {
      return
    }

    setError(null)
    setUploadingKind(kind)

    for (const file of Array.from(files)) {
      if (file.size > MAX_UPLOAD_SIZE) {
        setError(`${ATTACHMENT_SECTIONS.find((section) => section.kind === kind)?.label ?? '파일'}은 최대 ${maxSizeLabel}까지 업로드할 수 있습니다.`)
        continue
      }

      const storagePath = buildPendingStoragePath({
        ownerId: currentUserId,
        prefix: 'pending/class-materials',
        fileName: file.name,
      })

      try {
        const uploaded = await uploadFileToStorageViaClient({
          bucket: CLASS_MATERIALS_BUCKET,
          file,
          path: storagePath,
          maxSizeBytes: MAX_UPLOAD_SIZE,
        })

        setPendingAttachments((prev) => ({
          ...prev,
          [kind]: [
            ...prev[kind],
            {
              clientId: crypto.randomUUID(),
              kind,
              name: file.name,
              size: file.size,
              meta: uploaded,
            },
          ],
        }))
      } catch (uploadError) {
        console.error('[class-materials] upload failed', uploadError)
        setError(uploadError instanceof Error ? uploadError.message : '파일 업로드 중 오류가 발생했습니다.')
        break
      }
    }

    setUploadingKind(null)
    const input = fileInputRefs[kind].current
    if (input) {
      input.value = ''
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSuccessMessage(null)

    if (uploadingKind) {
      setError('파일 업로드가 완료될 때까지 기다려주세요.')
      return
    }

    const form = event.currentTarget
    const formData = new FormData(form)
    formData.set('subject', subject)
    if (defaults?.postId) {
      formData.set('postId', defaults.postId)
    }

    const serializedUploads = Object.values(pendingAttachments)
      .flat()
      .map((attachment) => ({
        bucket: CLASS_MATERIALS_BUCKET,
        path: attachment.meta.path,
        size: attachment.meta.size,
        mimeType: attachment.meta.mimeType,
        originalName: attachment.meta.originalName,
        kind: attachment.kind,
      }))

    if (serializedUploads.length > 0) {
      formData.set('uploadedAttachments', JSON.stringify(serializedUploads))
    } else {
      formData.delete('uploadedAttachments')
    }

    formData.delete('removedAttachmentIds')
    removedAttachmentIds.forEach((id) => {
      formData.append('removedAttachmentIds', id)
    })

    startTransition(async () => {
      const result = await onSubmit(formData)

      if (result?.error) {
        setError(result.error)
        return
      }

      if (result?.success) {
        const targetPostId = result.postId ?? defaults?.postId ?? null

        if (targetPostId) {
          router.push(`/dashboard/teacher/class-materials/${subject}/${targetPostId}`)
          router.refresh()
          return
        }

        setPendingAttachments({ class_material: [], student_handout: [] })
        setRemovedAttachmentIds(new Set())
        setSuccessMessage('자료가 저장되었습니다.')
        router.refresh()
      }
    })
  }

  const handleDelete = () => {
    if (!onDelete) {
      return
    }

    setError(null)
    setSuccessMessage(null)

    startDeleteTransition(async () => {
      const result = await onDelete()

      if (result?.error) {
        setError(result.error)
        return
      }

      if (result?.success) {
        router.push(`/dashboard/teacher/class-materials/${subject}`)
        router.refresh()
      }
    })
  }

  const renderAttachmentList = (kind: ClassMaterialAssetType) => {
    const existingList = existingAttachments[kind]
    const pendingList = pendingAttachments[kind]

    if (existingList.length === 0 && pendingList.length === 0) {
      return <p className="text-xs text-slate-400">아직 첨부된 파일이 없습니다.</p>
    }

    return (
      <div className="space-y-2">
        {existingList.map((attachment) => {
          const isRemoved = removedAttachmentIds.has(attachment.id)
          return (
            <div
              key={attachment.id}
              className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${isRemoved ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-200 bg-white text-slate-700'}`}
            >
              <div className="flex flex-col">
                <span className={isRemoved ? 'line-through' : ''}>{attachment.name}</span>
                {isRemoved ? <span className="text-xs">삭제 예정</span> : null}
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

        {pendingList.map((attachment) => (
          <div
            key={attachment.clientId}
            className="flex items-center justify-between rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
          >
            <div className="flex flex-col gap-1">
              <span>{attachment.name}</span>
              <Badge variant="secondary" className="w-fit">
                {formatFileSize(attachment.size)} 대기 중
              </Badge>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleRemovePendingAttachment(attachment.kind, attachment.clientId)}
              disabled={isPending}
            >
              제거
            </Button>
          </div>
        ))}
      </div>
    )
  }

  return (
    <Card className="border-slate-200">
      <CardHeader className="space-y-1">
        <CardTitle className="text-xl text-slate-900">수업자료 정보</CardTitle>
        <p className="text-sm text-slate-500">
          주차와 제목을 입력하고 필요한 파일을 업로드하세요. 파일당 {maxSizeLabel}까지 지원하며, 각 카테고리에 여러 파일을 첨부할 수 있습니다.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {successMessage ? (
          <Alert>
            <AlertDescription>{successMessage}</AlertDescription>
          </Alert>
        ) : null}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <input type="hidden" name="subject" value={subject} />
          {defaults?.postId ? <input type="hidden" name="postId" value={defaults.postId} /> : null}

          <div className="grid gap-2">
            <Label htmlFor="weekLabel">주차 (선택)</Label>
            <Input
              id="weekLabel"
              name="weekLabel"
              placeholder="예: 1주차"
              defaultValue={defaults?.weekLabel ?? ''}
              maxLength={100}
              disabled={isPending}
            />
            <p className="text-xs text-slate-500">주차 또는 차시 정보를 입력하면 목록에서 빠르게 정렬할 수 있습니다.</p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="title">제목</Label>
            <Input
              id="title"
              name="title"
              required
              placeholder="예: 시퀀스 분석 워크숍"
              defaultValue={defaults?.title ?? ''}
              maxLength={200}
              disabled={isPending}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="description">수업 설명 (선택)</Label>
            <Textarea
              id="description"
              name="description"
              rows={5}
              defaultValue={defaults?.description ?? ''}
              placeholder="수업에서 다룰 내용이나 참고 사항을 간단히 작성하세요."
              disabled={isPending}
            />
          </div>

          <div className="space-y-6 rounded-lg border border-slate-200 p-4">
            {ATTACHMENT_SECTIONS.map((section) => (
              <div key={section.kind} className="space-y-2">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold text-slate-800">{section.label}</Label>
                    <span className="text-xs text-slate-400">파일당 최대 {maxSizeLabel}</span>
                  </div>
                  <p className="text-xs text-slate-500">{section.helper}</p>
                </div>

                {renderAttachmentList(section.kind)}

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <input
                    ref={fileInputRefs[section.kind]}
                    type="file"
                    multiple
                    accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.zip,image/*"
                    className="hidden"
                    onChange={(event) => handleUpload(section.kind, event.currentTarget.files)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="sm:w-48"
                    onClick={() => fileInputRefs[section.kind].current?.click()}
                    disabled={isPending || uploadingKind === section.kind}
                  >
                    {uploadingKind === section.kind ? '업로드 중...' : '파일 추가'}
                  </Button>
                  <p className="text-xs text-slate-400 sm:text-right">
                    여러 파일을 선택하면 순서대로 첨부됩니다. 저장 전까지는 언제든지 삭제할 수 있습니다.
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
            {onDelete ? (
              <Button
                type="button"
                variant="outline"
                className="sm:w-32"
                onClick={handleDelete}
                disabled={isPending || isDeleting}
              >
                {isDeleting ? (
                  <span className="flex items-center justify-center gap-2">
                    <LoadingSpinner />
                    삭제 중...
                  </span>
                ) : (
                  '자료 삭제'
                )}
              </Button>
            ) : (
              <span className="text-xs text-slate-400">제출 후에도 언제든지 수정할 수 있습니다.</span>
            )}
            <div className="flex gap-2 sm:justify-end">
              <Button type="submit" variant="outline" className="sm:w-32" disabled={isPending}>
                임시 저장
              </Button>
              <Button type="submit" className="sm:w-36" disabled={isPending}>
                {isPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <LoadingSpinner />
                    저장 중...
                  </span>
                ) : (
                  submitLabel
                )}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
