'use client'

import { useState, useTransition, type FormEvent } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import type { ClassMaterialAssetType } from '@/lib/class-materials'

type PrintResult = {
  success?: boolean
  error?: string
}

interface ClassMaterialPrintRequestFormProps {
  postId: string
  onSubmit: (formData: FormData) => Promise<PrintResult>
  availableAssets: Array<{
    type: ClassMaterialAssetType
    label: string
    fileName: string | null
    disabled: boolean
  }>
}

export function ClassMaterialPrintRequestForm({ postId, onSubmit, availableAssets }: ClassMaterialPrintRequestFormProps) {
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const hasSelectableAssets = availableAssets.some((asset) => !asset.disabled)

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

          <div className="space-y-2">
            <span className="text-sm font-medium text-slate-700">인쇄할 파일 선택</span>
            <div className="flex flex-col gap-2 rounded-md border border-slate-200 bg-slate-50 p-3">
              {availableAssets.length === 0 ? (
                <p className="text-sm text-slate-500">선택 가능한 파일이 없습니다. 먼저 자료를 업로드해주세요.</p>
              ) : (
                availableAssets.map((asset) => (
                  <label
                    key={asset.type}
                    className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm ${
                      asset.disabled ? 'border-slate-200 text-slate-400' : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        name="selectedAssets"
                        value={asset.type}
                        defaultChecked={!asset.disabled}
                        disabled={asset.disabled || isPending}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      <div className="flex flex-col">
                        <span className="font-medium text-slate-700">{asset.label}</span>
                        <span className="text-xs text-slate-500">{asset.fileName ?? '파일 없음'}</span>
                      </div>
                    </div>
                    {asset.disabled ? <span className="text-xs text-slate-400">업로드 필요</span> : null}
                  </label>
                ))
              )}
            </div>
            <p className="text-xs text-slate-500">최소 1개 이상의 파일을 선택해주세요.</p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
            <label className="grid gap-2 text-sm text-slate-700">
              <span>희망일</span>
              <Input type="date" name="desiredDate" disabled={isPending} />
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
