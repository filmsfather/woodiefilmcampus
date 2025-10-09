'use client'

import { useMemo, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { SpinnerIcon } from '@/components/ui/fullscreen-spinner'
import { useGlobalAsyncTask } from '@/hooks/use-global-loading'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { ClassMaterialSubject } from '@/lib/class-materials'

const MAX_UPLOAD_SIZE = 20 * 1024 * 1024 // 20MB

type FormResult = {
  success?: boolean
  error?: string
  postId?: string
}

type DeleteResult = {
  success?: boolean
  error?: string
}

export interface ClassMaterialPostFormDefaults {
  postId?: string
  weekLabel?: string | null
  title?: string
  description?: string | null
  classMaterialName?: string | null
  studentHandoutName?: string | null
}

interface ClassMaterialPostFormProps {
  subject: ClassMaterialSubject
  defaults?: ClassMaterialPostFormDefaults
  submitLabel?: string
  onSubmit: (formData: FormData) => Promise<FormResult>
  onDelete?: (() => Promise<DeleteResult>) | null
}

export function ClassMaterialPostForm({
  subject,
  defaults,
  submitLabel = '저장',
  onSubmit,
  onDelete,
}: ClassMaterialPostFormProps) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const { runWithLoading: runSubmit, isLoading: isPending } = useGlobalAsyncTask()
  const { runWithLoading: runDelete, isLoading: isDeleting } = useGlobalAsyncTask()

  const maxSizeLabel = useMemo(() => `${Math.round(MAX_UPLOAD_SIZE / (1024 * 1024))}MB`, [])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSuccessMessage(null)

    const form = event.currentTarget
    const formData = new FormData(form)
    formData.set('subject', subject)
    if (defaults?.postId) {
      formData.set('postId', defaults.postId)
    }

    const classMaterialFile = formData.get('classMaterialFile')
    const studentHandoutFile = formData.get('studentHandoutFile')

    if (classMaterialFile instanceof File && classMaterialFile.size > MAX_UPLOAD_SIZE) {
      setError(`수업자료 파일은 최대 ${maxSizeLabel}까지 업로드할 수 있습니다.`)
      return
    }

    if (studentHandoutFile instanceof File && studentHandoutFile.size > MAX_UPLOAD_SIZE) {
      setError(`학생 유인물 파일은 최대 ${maxSizeLabel}까지 업로드할 수 있습니다.`)
      return
    }

    void runSubmit(async () => {
      const result = await onSubmit(formData)

      if (result?.error) {
        setError(result.error)
        return
      }

      if (result?.success) {
        const targetPostId = result.postId ?? defaults?.postId ?? null

        if (targetPostId) {
          router.push(`/dashboard/teacher/class-materials/${subject}/${targetPostId}`)
          await router.refresh()
          return
        }

        setSuccessMessage('자료가 저장되었습니다.')
        await router.refresh()
      }
    })
  }

  const handleDelete = () => {
    if (!onDelete) {
      return
    }

    setError(null)
    setSuccessMessage(null)

    void runDelete(async () => {
      const result = await onDelete()

      if (result?.error) {
        setError(result.error)
        return
      }

      if (result?.success) {
        router.push(`/dashboard/teacher/class-materials/${subject}`)
        await router.refresh()
      }
    })
  }

  return (
    <Card className="border-slate-200">
      <CardHeader className="space-y-1">
        <CardTitle className="text-xl text-slate-900">수업자료 정보</CardTitle>
        <p className="text-sm text-slate-500">
          주차와 제목을 입력하고 필요한 파일을 업로드하세요. PDF, 이미지, 오피스 문서 등을 지원합니다.
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

          <div className="grid gap-2">
            <Label htmlFor="classMaterialFile">
              수업자료 파일 (선택)
              {defaults?.classMaterialName ? (
                <span className="ml-2 text-xs text-slate-500">현재: {defaults.classMaterialName}</span>
              ) : null}
            </Label>
            <Input
              id="classMaterialFile"
              name="classMaterialFile"
              type="file"
              accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.zip,image/*"
              disabled={isPending}
            />
            {defaults?.classMaterialName ? (
              <label className="flex items-center gap-2 text-xs text-slate-500">
                <input type="checkbox" name="removeClassMaterial" value="1" disabled={isPending} />
                기존 수업자료 파일 삭제
              </label>
            ) : null}
            <p className="text-xs text-slate-500">업로드 제한: 최대 {maxSizeLabel}. 파일을 새로 선택하면 기존 파일을 덮어씁니다.</p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="studentHandoutFile">
              학생 유인물 파일 (선택)
              {defaults?.studentHandoutName ? (
                <span className="ml-2 text-xs text-slate-500">현재: {defaults.studentHandoutName}</span>
              ) : null}
            </Label>
            <Input
              id="studentHandoutFile"
              name="studentHandoutFile"
              type="file"
              accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.zip,image/*"
              disabled={isPending}
            />
            {defaults?.studentHandoutName ? (
              <label className="flex items-center gap-2 text-xs text-slate-500">
                <input type="checkbox" name="removeStudentHandout" value="1" disabled={isPending} />
                기존 유인물 파일 삭제
              </label>
            ) : null}
            <p className="text-xs text-slate-500">업로드 제한: 최대 {maxSizeLabel}. 새 파일이 선택되면 기존 파일은 교체됩니다.</p>
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
                    <SpinnerIcon />
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
              <Button type="submit" disabled={isPending || isDeleting} className="sm:w-32">
                {isPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <SpinnerIcon />
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
