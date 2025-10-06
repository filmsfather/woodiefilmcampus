'use client'

import { useState, useTransition } from 'react'
import { AlertCircle, CheckCircle2, Download, FileText, XCircle } from 'lucide-react'

import DateUtil from '@/lib/date-util'
import { updatePrintRequestStatus } from '@/app/dashboard/manager/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface PrintRequestView {
  id: string
  status: string
  desiredDate: string | null
  desiredPeriod: string | null
  copies: number
  colorMode: string
  notes: string | null
  bundleMode: 'merged' | 'separate'
  bundleStatus: string
  bundleReadyAt: string | null
  bundleError: string | null
  itemCount: number
  createdAt: string
  updatedAt: string
  teacher: {
    id: string
    name: string
  }
  assignment: {
    id: string
    title: string
    subject: string
    type: string
  } | null
  students: Array<{ id: string; name: string }>
  items: Array<{
    id: string
    studentId: string
    studentName: string
    fileName: string
    downloadUrl: string | null
  }>
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

const BUNDLE_STATUS_LABELS: Record<string, string> = {
  pending: '자료 대기',
  processing: '자료 준비 중',
  ready: '자료 준비 완료',
  failed: '자료 준비 실패',
}

const BUNDLE_STATUS_VARIANTS: Record<string, 'secondary' | 'outline' | 'destructive'> = {
  pending: 'outline',
  processing: 'outline',
  ready: 'secondary',
  failed: 'destructive',
}

export function PrintRequestAdminPanel({ requests }: { requests: PrintRequestView[] }) {
  const [feedback, setFeedback] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (requests.length === 0) {
    return null
  }

  const handleUpdate = (requestId: string, status: 'done' | 'canceled') => {
    setPendingId(requestId)
    setFeedback(null)
    startTransition(async () => {
      const result = await updatePrintRequestStatus({ requestId, status })
      if (result?.error) {
        setFeedback(result.error)
      } else {
        setFeedback('요청 상태가 업데이트되었습니다.')
      }
      setPendingId(null)
    })
  }

  return (
    <Card className="border-slate-200">
      <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <CardTitle className="text-lg text-slate-900">인쇄 요청 관리</CardTitle>
        <p className="text-xs text-slate-500">
          대기 중인 요청을 확인하고 인쇄 완료 또는 취소 상태로 업데이트하세요.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {feedback && (
          <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${feedback.includes('오류') ? 'border-destructive/30 bg-destructive/10 text-destructive' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
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
              const desiredLabel = request.desiredDate
                ? DateUtil.formatForDisplay(request.desiredDate, { month: 'short', day: 'numeric' })
                : '미지정'
              const createdLabel = DateUtil.formatForDisplay(request.createdAt, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
              const assignmentLabel = request.assignment
                ? `${request.assignment.title} (${request.assignment.subject})`
                : '과제 정보 없음'
              const studentSummary = (() => {
                if (request.students.length === 0) {
                  return '전체 학생'
                }
                if (request.students.length <= 2) {
                  return request.students.map((student) => student.name).join(', ')
                }
                return `${request.students.slice(0, 2).map((student) => student.name).join(', ')} 외 ${request.students.length - 2}명`
              })()
              const studentLabel = `${studentSummary}${request.itemCount > 0 ? ` (${request.itemCount}건)` : ''}`
              const bundleStatusLabel = BUNDLE_STATUS_LABELS[request.bundleStatus] ?? request.bundleStatus
              const bundleVariant = BUNDLE_STATUS_VARIANTS[request.bundleStatus] ?? 'outline'

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
                    {request.copies}부 · {request.colorMode === 'color' ? '컬러' : '흑백'}
                    {request.notes ? (
                      <p className="text-[11px] text-slate-500">메모: {request.notes}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm text-slate-700">{request.teacher.name}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 text-xs text-slate-600">
                      <span>{studentLabel}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1 text-xs text-slate-500">
                        <FileText className="h-3 w-3" /> {assignmentLabel}
                      </div>
                      {request.items.length === 0 ? (
                        <span className="text-xs text-slate-400">파일 없음</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {request.items.map((item) => (
                            <Button
                              key={item.id}
                              asChild
                              size="sm"
                              variant={item.downloadUrl ? 'outline' : 'ghost'}
                              className="justify-start text-xs"
                              disabled={!item.downloadUrl}
                            >
                              <a
                                href={item.downloadUrl ?? '#'}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1"
                              >
                                <Download className="h-3 w-3" />
                                <span className="truncate">
                                  {item.studentName} · {item.fileName}
                                </span>
                              </a>
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="space-y-2 text-right">
                    <div className="flex flex-col gap-1 text-xs text-slate-500">
                      <Badge variant={STATUS_VARIANTS[request.status] ?? 'outline'}>
                        {STATUS_LABELS[request.status] ?? request.status}
                      </Badge>
                      <Badge variant={bundleVariant}>{bundleStatusLabel}</Badge>
                      {request.bundleError && (
                        <span className="text-[11px] text-destructive">오류: {request.bundleError}</span>
                      )}
                    </div>
                    {request.status === 'requested' ? (
                      <div className="mt-2 flex flex-col gap-1">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={isPending && pendingId === request.id}
                          onClick={() => handleUpdate(request.id, 'done')}
                          className="justify-end"
                        >
                          <CheckCircle2 className="mr-1 h-3 w-3" /> 완료 처리
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isPending && pendingId === request.id}
                          onClick={() => handleUpdate(request.id, 'canceled')}
                          className="justify-end"
                        >
                          <XCircle className="mr-1 h-3 w-3" /> 취소 처리
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
