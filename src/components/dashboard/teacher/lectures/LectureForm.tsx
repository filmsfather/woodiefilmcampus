'use client'

import { useMemo, useRef, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Lecture, LECTURE_ASSETS_BUCKET, LECTURE_MAX_UPLOAD_SIZE } from '@/lib/lectures'
import {
    buildPendingStoragePath,
    uploadFileToStorageViaClient,
    type UploadedObjectMeta,
} from '@/lib/storage-upload'
import { createClient as createBrowserSupabase } from '@/lib/supabase/client'

export type LectureFormResult = {
    success?: boolean
    error?: string
    lectureId?: string
}

export interface LectureAttachmentSummary {
    id: string
    name: string
}

interface LectureFormProps {
    lecture?: Lecture
    action: (formData: FormData) => Promise<LectureFormResult>
    currentUserId: string
    existingAttachments?: LectureAttachmentSummary[]
    submitLabel?: string
    redirectAfterCreatePath?: string
}

interface PendingAttachment {
    clientId: string
    name: string
    size: number
    meta: UploadedObjectMeta
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

export function LectureForm({
    lecture,
    action,
    currentUserId,
    existingAttachments = [],
    submitLabel,
    redirectAfterCreatePath = '/dashboard/teacher/lectures',
}: LectureFormProps) {
    const router = useRouter()
    const supabase = useMemo(() => createBrowserSupabase(), [])
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()
    const [isUploading, setIsUploading] = useState(false)
    const [published, setPublished] = useState(lecture?.is_published ?? true)
    const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([])
    const [removedAttachmentIds, setRemovedAttachmentIds] = useState<Set<string>>(new Set())
    const fileInputRef = useRef<HTMLInputElement | null>(null)

    const maxSizeLabel = useMemo(
        () => `${Math.round(LECTURE_MAX_UPLOAD_SIZE / (1024 * 1024))}MB`,
        []
    )

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

    const handleRemovePendingAttachment = (clientId: string) => {
        setPendingAttachments((prev) => {
            const target = prev.find((item) => item.clientId === clientId)
            if (target) {
                supabase.storage
                    .from(LECTURE_ASSETS_BUCKET)
                    .remove([target.meta.path])
                    .catch((removeError) => {
                        console.error('[lectures] failed to remove pending attachment', removeError)
                    })
            }
            return prev.filter((item) => item.clientId !== clientId)
        })
    }

    const handleUpload = async (files: FileList | null) => {
        if (!files || files.length === 0) {
            return
        }

        setError(null)
        setIsUploading(true)

        for (const file of Array.from(files)) {
            if (file.size > LECTURE_MAX_UPLOAD_SIZE) {
                setError(`첨부 파일은 최대 ${maxSizeLabel}까지 업로드할 수 있습니다.`)
                continue
            }

            const storagePath = buildPendingStoragePath({
                ownerId: currentUserId,
                prefix: 'pending/lectures',
                fileName: file.name,
            })

            try {
                const uploaded = await uploadFileToStorageViaClient({
                    bucket: LECTURE_ASSETS_BUCKET,
                    file,
                    path: storagePath,
                    maxSizeBytes: LECTURE_MAX_UPLOAD_SIZE,
                })

                setPendingAttachments((prev) => [
                    ...prev,
                    {
                        clientId: crypto.randomUUID(),
                        name: file.name,
                        size: file.size,
                        meta: {
                            bucket: LECTURE_ASSETS_BUCKET,
                            path: uploaded.path,
                            size: uploaded.size,
                            mimeType: uploaded.mimeType,
                            originalName: uploaded.originalName,
                        },
                    },
                ])
            } catch (uploadError) {
                console.error('[lectures] upload failed', uploadError)
                setError(uploadError instanceof Error ? uploadError.message : '파일 업로드 중 오류가 발생했습니다.')
                break
            }
        }

        setIsUploading(false)
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
    }

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        setError(null)

        if (isUploading) {
            setError('파일 업로드가 완료될 때까지 기다려주세요.')
            return
        }

        const form = event.currentTarget
        const formData = new FormData(form)

        const serializedUploads = pendingAttachments.map((attachment) => ({
            bucket: LECTURE_ASSETS_BUCKET,
            path: attachment.meta.path,
            size: attachment.meta.size,
            mimeType: attachment.meta.mimeType,
            originalName: attachment.meta.originalName,
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
            const result = await action(formData)

            if (result?.error) {
                setError(result.error)
                return
            }

            if (result?.success) {
                setPendingAttachments([])
                setRemovedAttachmentIds(new Set())
                if (lecture) {
                    router.push(`/dashboard/teacher/lectures/${lecture.id}/edit`)
                    router.refresh()
                    return
                }
                router.push(redirectAfterCreatePath)
                router.refresh()
            }
        })
    }

    const renderAttachmentList = () => {
        if (existingAttachments.length === 0 && pendingAttachments.length === 0) {
            return <p className="text-xs text-slate-400">아직 첨부된 파일이 없습니다.</p>
        }

        return (
            <div className="space-y-2">
                {existingAttachments.map((attachment) => {
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

                {pendingAttachments.map((attachment) => (
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
                            onClick={() => handleRemovePendingAttachment(attachment.clientId)}
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
        <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
            {error ? (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            ) : null}

            <div className="space-y-2">
                <Label htmlFor="title">강의 제목</Label>
                <Input
                    id="title"
                    name="title"
                    defaultValue={lecture?.title}
                    required
                    placeholder="예: 1강. 영화의 이해"
                    disabled={isPending}
                />
            </div>

            <div className="space-y-2">
                <Label htmlFor="youtube_url">YouTube 링크</Label>
                <Input
                    id="youtube_url"
                    name="youtube_url"
                    defaultValue={lecture?.youtube_url}
                    required
                    placeholder="https://www.youtube.com/watch?v=..."
                    disabled={isPending}
                />
                <p className="text-xs text-slate-500">YouTube 영상의 전체 주소를 입력해주세요.</p>
            </div>

            <div className="space-y-2">
                <Label htmlFor="description">설명</Label>
                <Textarea
                    id="description"
                    name="description"
                    defaultValue={lecture?.description || ''}
                    placeholder="강의에 대한 간단한 설명을 입력하세요."
                    rows={5}
                    disabled={isPending}
                />
            </div>

            {lecture ? (
                <div className="flex items-center space-x-2">
                    <input type="hidden" name="is_published" value={published ? 'on' : 'off'} />
                    <Switch
                        id="is_published_switch"
                        checked={published}
                        onCheckedChange={setPublished}
                        disabled={isPending}
                    />
                    <Label htmlFor="is_published_switch">공개 여부</Label>
                </div>
            ) : null}

            <Card className="border-slate-200">
                <CardHeader className="space-y-1">
                    <CardTitle className="text-base text-slate-900">첨부자료</CardTitle>
                    <p className="text-xs text-slate-500">
                        강의 자료, 활동지 등 학생에게 공유할 파일을 추가하세요. 파일당 최대 {maxSizeLabel}까지 업로드할 수 있습니다.
                    </p>
                </CardHeader>
                <CardContent className="space-y-3">
                    {renderAttachmentList()}

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            className="hidden"
                            onChange={(event) => handleUpload(event.currentTarget.files)}
                        />
                        <Button
                            type="button"
                            variant="outline"
                            className="sm:w-48"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isPending || isUploading}
                        >
                            {isUploading ? '업로드 중...' : '파일 추가'}
                        </Button>
                        <p className="text-xs text-slate-400 sm:text-right">
                            여러 파일을 선택해 한 번에 첨부할 수 있습니다.
                        </p>
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => history.back()} disabled={isPending}>
                    취소
                </Button>
                <Button type="submit" disabled={isPending || isUploading}>
                    {isPending ? (
                        <span className="flex items-center justify-center gap-2">
                            <LoadingSpinner />
                            저장 중...
                        </span>
                    ) : (
                        submitLabel ?? (lecture ? '수정하기' : '등록하기')
                    )}
                </Button>
            </div>
        </form>
    )
}
