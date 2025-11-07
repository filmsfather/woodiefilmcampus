'use client'

import { useMemo, useState, useTransition, type FormEvent } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import type { ClassMaterialAssetType } from '@/lib/class-materials-shared'

type PrintResult = {
  success?: boolean
  error?: string
}

interface ClassMaterialPrintRequestFormProps {
  postId: string
  onSubmit: (formData: FormData) => Promise<PrintResult>
  availableAssets: Array<{
    id: string
    kind: ClassMaterialAssetType
    name: string
    downloadUrl: string | null
  }>
}

export function ClassMaterialPrintRequestForm({ postId, onSubmit, availableAssets }: ClassMaterialPrintRequestFormProps) {
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const hasSelectableAssets = availableAssets.length > 0

  const groupedAssets = useMemo(() => {
    const grouped: Record<ClassMaterialAssetType, typeof availableAssets> = {
      class_material: [],
      student_handout: [],
    }
    for (const asset of availableAssets) {
      grouped[asset.kind] = [...grouped[asset.kind], asset]
    }
    return grouped
  }, [availableAssets])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSuccessMessage(null)

    const form = event.currentTarget
    const formData = new FormData(form)
    formData.set('postId', postId)

    startTransition(async () => {
      const result = await onSubmit(formData)

      if (result?.error) {
        setError(result.error)
        return
      }

      if (result?.success) {
        setSuccessMessage('인쇄 요청을 등록했습니다.')
        form.reset()
      }
    })
  }

  return (
    <Card className="border-slate-200">
      <CardHeader className="space-y-1">
        <CardTitle className="text-lg text-slate-900">인쇄 요청</CardTitle>
        <p className="text-sm text-slate-500">희망일과 부수 등을 입력해 관리자에게 인쇄를 요청하세요.</p>
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

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <input type="hidden" name="postId" value={postId} />

          <div className="space-y-3">
            <span className="text-sm font-medium text-slate-700">인쇄할 파일 선택</span>
            <div className="flex flex-col gap-4 rounded-md border border-slate-200 bg-slate-50 p-3">
              {(['class_material', 'student_handout'] as const).map((kind) => {
                const assets = groupedAssets[kind]
                return (
                  <div key={kind} className="space-y-2">
                    <p className="text-xs font-semibold text-slate-600">
                      {kind === 'class_material' ? '수업자료' : '학생 유인물'}
                    </p>
                    {assets.length === 0 ? (
                      <p className="text-xs text-slate-400">첨부된 파일이 없습니다.</p>
                    ) : (
                      assets.map((asset, index) => (
                        <label
                          key={asset.id}
                          className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                        >
                          <div className="flex flex-col">
                            <span>
                              {index + 1}. {asset.name}
                            </span>
                            <span className="text-xs text-slate-500">인쇄 대상 포함</span>
                          </div>
                          <div className="flex items-center gap-3">
                            {asset.downloadUrl ? (
                              <Button asChild variant="outline" size="sm">
                                <a href={asset.downloadUrl} target="_blank" rel="noreferrer">
                                  미리보기
                                </a>
                              </Button>
                            ) : null}
                            <input
                              type="checkbox"
                              name="selectedAttachmentIds"
                              value={asset.id}
                              defaultChecked
                              disabled={isPending}
                              className="h-4 w-4 rounded border-slate-300"
                            />
                          </div>
                        </label>
                      ))
                    )}
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-slate-500">최소 1개 이상의 파일을 선택해주세요.</p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
            <label className="grid gap-2 text-sm text-slate-700">
              <span>희망일</span>
              <Input type="date" name="desiredDate" disabled={isPending} required />
            </label>
            <label className="grid gap-2 text-sm text-slate-700">
              <span>희망 교시</span>
              <select
                name="desiredPeriod"
                defaultValue=""
                disabled={isPending}
                className="h-9 rounded-md border border-slate-300 px-3 text-sm text-slate-700 focus:border-primary focus:outline-none"
              >
                <option value="">선택 안 함</option>
                <option value="1교시">1교시</option>
                <option value="2교시">2교시</option>
                <option value="3교시">3교시</option>
                <option value="4교시">4교시</option>
              </select>
            </label>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
            <label className="grid gap-2 text-sm text-slate-700">
              <span>부수</span>
              <Input type="number" name="copies" min={1} max={100} defaultValue={20} disabled={isPending} />
            </label>
            <div className="grid gap-2 text-sm text-slate-700">
              <span>컬러 여부</span>
              <div className="flex items-center gap-4 text-sm">
                <label className="flex items-center gap-2 text-slate-600">
                  <input type="radio" name="colorMode" value="bw" defaultChecked disabled={isPending} />
                  흑백
                </label>
                <label className="flex items-center gap-2 text-slate-600">
                  <input type="radio" name="colorMode" value="color" disabled={isPending} />
                  컬러
                </label>
              </div>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="print-notes">추가 메모 (선택)</Label>
            <Textarea id="print-notes" name="notes" rows={3} placeholder="예: 표지 1장 컬러, 본문 흑백으로 부탁드립니다." disabled={isPending} />
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={isPending || !hasSelectableAssets} className="sm:w-32">
              {isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <LoadingSpinner />
                  요청 중...
                </span>
              ) : (
                '인쇄 요청'
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
