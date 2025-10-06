'use client'

import { useState, useTransition, type FormEvent } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type PrintResult = {
  success?: boolean
  error?: string
}

interface ClassMaterialPrintRequestFormProps {
  postId: string
  onSubmit: (formData: FormData) => Promise<PrintResult>
}

export function ClassMaterialPrintRequestForm({ postId, onSubmit }: ClassMaterialPrintRequestFormProps) {
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSuccessMessage(null)

    const formData = new FormData(event.currentTarget)
    formData.set('postId', postId)

    startTransition(async () => {
      const result = await onSubmit(formData)

      if (result?.error) {
        setError(result.error)
        return
      }

      if (result?.success) {
        setSuccessMessage('인쇄 요청을 등록했습니다.')
        event.currentTarget.reset()
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
          <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
            <label className="grid gap-2 text-sm text-slate-700">
              <span>희망일</span>
              <Input type="date" name="desiredDate" disabled={isPending} />
            </label>
            <label className="grid gap-2 text-sm text-slate-700">
              <span>희망 교시</span>
              <Input type="text" name="desiredPeriod" placeholder="예: 2교시" maxLength={50} disabled={isPending} />
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
            <Button type="submit" disabled={isPending} className="sm:w-32">
              {isPending ? '요청 중...' : '인쇄 요청' }
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
