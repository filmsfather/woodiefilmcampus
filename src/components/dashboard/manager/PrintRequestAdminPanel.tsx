'use client'

import { useState, useTransition } from 'react'
import { AlertCircle, Download } from 'lucide-react'

import DateUtil from '@/lib/date-util'
import {
  updateClassMaterialPrintRequestStatus,
  updatePrintRequestStatus,
} from '@/app/dashboard/manager/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SpinnerIcon } from '@/components/ui/fullscreen-spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface UnifiedPrintRequestFile {
  id: string
  label: string
  downloadUrl: string | null
}

export interface PrintRequestView {
  id: string
  source: 'assignment' | 'class_material'
  status: 'requested' | 'done' | 'canceled'
  desiredDate: string | null
  desiredPeriod: string | null
  copies: number
  colorMode: string
  notes: string | null
  createdAt: string
  updatedAt: string
  teacherName: string
  studentLabel: string
  files: UnifiedPrintRequestFile[]
}

const STATUS_LABELS: Record<string, string> = {
  requested: '대기',
  done: '완료',
  canceled: '취소',
}

const STATUS_VARIANTS: Record<string, 'secondary' | 'outline' | 'destructive'> = {
  requested: 'destructive',
  done: 'secondary',
  canceled: 'outline',
}

export function PrintRequestAdminPanel({ requests }: { requests: PrintRequestView[] }) {
  const [feedback, setFeedback] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (requests.length === 0) {
    return null
  }

  const handleUpdate = (request: PrintRequestView, status: 'done' | 'canceled') => {
    setPendingId(request.id)
    setFeedback(null)
    startTransition(async () => {
      const result =
        request.source === 'assignment'
          ? await updatePrintRequestStatus({ requestId: request.id, status })
          : await updateClassMaterialPrintRequestStatus({ requestId: request.id, status })

      if (result?.error) {
        setFeedback(result.error)
      } else {
        setFeedback('요청 상태가 업데이트되었습니다.')
      }
      setPendingId(null)
    })
  }

  const formatDesiredDate = (value: string | null) => {
    if (!value) {
      return '미지정'
    }
    try {
      return DateUtil.formatForDisplay(value, { month: 'short', day: 'numeric' })
    } catch {
      return value
    }
  }

  const formatCreatedAt = (value: string) => {
    try {
      return DateUtil.formatForDisplay(value, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return value
    }
  }

  return (
    <Card className="border-slate-200">
      <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <CardTitle className="text-lg text-slate-900">인쇄 요청 관리</CardTitle>
        <p className="text-xs text-slate-500">대기 중인 요청을 확인하고 인쇄 완료 또는 취소 상태로 업데이트하세요.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {feedback && (
          <div
            className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${feedback.includes('오류') ? 'border-destructive/30 bg-destructive/10 text-destructive' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}
          >
            <AlertCircle className="h-3 w-3" /> {feedback}
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>희망일</TableHead>
              <TableHead>교시</TableHead>
              <TableHead>부수</TableHead>
              <TableHead>교사</TableHead>
              <TableHead>학생</TableHead>
              <TableHead>파일</TableHead>
              <TableHead className="text-right">처리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((request) => {
              const desiredLabel = formatDesiredDate(request.desiredDate)
              const createdLabel = formatCreatedAt(request.createdAt)
              const copiesLabel = `${request.copies}부 · ${request.colorMode === 'color' ? '컬러' : '흑백'}`

              return (
                <TableRow key={request.id}>
                  <TableCell>
                    <div className="flex flex-col text-xs text-slate-600">
                      <span className="text-sm font-medium text-slate-900">{desiredLabel}</span>
                      <span>요청일 {createdLabel}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-slate-700">{request.desiredPeriod ?? '미지정'}</TableCell>
                  <TableCell className="text-sm text-slate-700">
                    <div className="flex flex-col gap-1">
                      <span>{copiesLabel}</span>
                      {request.notes ? <span className="text-[11px] text-slate-500">메모: {request.notes}</span> : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-slate-700">{request.teacherName}</TableCell>
                  <TableCell className="text-sm text-slate-600">{request.studentLabel}</TableCell>
                  <TableCell>
                    {request.files.length === 0 ? (
                      <span className="text-xs text-slate-400">파일 없음</span>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {request.files.map((file) => (
                          <Button
                            key={file.id}
                            asChild
                            size="sm"
                            variant={file.downloadUrl ? 'outline' : 'ghost'}
                            className="justify-start text-xs"
                            disabled={!file.downloadUrl}
                          >
                            <a href={file.downloadUrl ?? '#'} target="_blank" rel="noreferrer">
                              <Download className="mr-1 inline h-3 w-3" /> {file.label}
                            </a>
                          </Button>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="space-y-2 text-right">
                    <Badge variant={STATUS_VARIANTS[request.status] ?? 'outline'}>
                      {STATUS_LABELS[request.status] ?? request.status}
                    </Badge>
                    {request.status === 'requested' ? (
                      <div className="mt-2 flex flex-col gap-1">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleUpdate(request, 'done')}
                          disabled={isPending && pendingId === request.id}
                        >
                          {isPending && pendingId === request.id ? (
                            <span className="flex items-center justify-center gap-2">
                              <SpinnerIcon />
                              완료 중...
                            </span>
                          ) : (
                            '완료'
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleUpdate(request, 'canceled')}
                          disabled={isPending && pendingId === request.id}
                        >
                          {isPending && pendingId === request.id ? (
                            <span className="flex items-center justify-center gap-2">
                              <SpinnerIcon />
                              취소 중...
                            </span>
                          ) : (
                            '취소'
                          )}
                        </Button>
                      </div>
                    ) : null}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
