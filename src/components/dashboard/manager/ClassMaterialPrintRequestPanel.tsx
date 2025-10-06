'use client'

import DateUtil from '@/lib/date-util'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'

interface ClassMaterialPrintRequestItemView {
  id: string
  assetType: 'class_material' | 'student_handout'
  fileName: string | null
  downloadUrl: string | null
}

export interface ClassMaterialPrintRequestView {
  id: string
  status: string
  desiredDate: string | null
  desiredPeriod: string | null
  copies: number
  colorMode: string
  notes: string | null
  createdAt: string
  updatedAt: string
  teacher: {
    id: string
    name: string
  }
  material: {
    id: string
    title: string
    subject: string
  } | null
  items: ClassMaterialPrintRequestItemView[]
}

const STATUS_LABEL: Record<string, string> = {
  requested: '대기',
  done: '완료',
  canceled: '취소',
}

const STATUS_BADGE: Record<string, 'secondary' | 'outline' | 'destructive'> = {
  requested: 'destructive',
  done: 'secondary',
  canceled: 'outline',
}

export function ClassMaterialPrintRequestPanel({ requests }: { requests: ClassMaterialPrintRequestView[] }) {
  if (requests.length === 0) {
    return null
  }

  const formatDate = (value: string | null, fallback: string) => {
    if (!value) {
      return fallback
    }
    try {
      return DateUtil.formatForDisplay(value, {
        month: 'short',
        day: 'numeric',
      })
    } catch {
      return fallback
    }
  }

  const formatDateTime = (value: string) => {
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
      <CardContent className="overflow-x-auto p-0">
        <Table className="min-w-[960px]">
          <TableHeader>
            <TableRow>
              <TableHead>요청일</TableHead>
              <TableHead>자료</TableHead>
              <TableHead>희망일/교시</TableHead>
              <TableHead>부수</TableHead>
              <TableHead>컬러</TableHead>
              <TableHead>파일</TableHead>
              <TableHead>요청자</TableHead>
              <TableHead>메모</TableHead>
              <TableHead className="text-right">상태</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((request) => {
              const desiredLabel = formatDate(request.desiredDate, '미지정')
              const statusLabel = STATUS_LABEL[request.status] ?? request.status
              const badgeVariant = STATUS_BADGE[request.status] ?? 'outline'

              return (
                <TableRow key={request.id}>
                  <TableCell className="text-sm text-slate-600">{formatDateTime(request.createdAt)}</TableCell>
                  <TableCell className="text-sm text-slate-700">
                    <div className="flex flex-col">
                      <span className="font-medium text-slate-900">{request.material?.title ?? '자료 제목 미확인'}</span>
                      <span className="text-xs text-slate-500">과목: {request.material?.subject ?? '미지정'}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">
                    <div className="flex flex-col">
                      <span>{desiredLabel}</span>
                      <span className="text-xs text-slate-500">{request.desiredPeriod ?? '미지정'}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">{request.copies}부</TableCell>
                  <TableCell className="text-sm text-slate-600">{request.colorMode === 'color' ? '컬러' : '흑백'}</TableCell>
                  <TableCell className="text-sm text-slate-600">
                    {request.items.length === 0 ? (
                      <span className="text-xs text-slate-400">첨부 없음</span>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {request.items.map((item) => (
                          <div key={item.id} className="flex items-center justify-between gap-3">
                            <span className="text-xs text-slate-500">
                              {item.assetType === 'class_material' ? '수업자료' : '학생 유인물'}
                            </span>
                            {item.downloadUrl ? (
                              <Button asChild size="sm" variant="outline">
                                <a href={item.downloadUrl} target="_blank" rel="noreferrer">
                                  {item.fileName ?? '다운로드'}
                                </a>
                              </Button>
                            ) : (
                              <span className="text-xs text-slate-400">링크 없음</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">{request.teacher.name}</TableCell>
                  <TableCell className="text-sm text-slate-600">
                    {request.notes ? request.notes : <span className="text-xs text-slate-400">메모 없음</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant={badgeVariant}>{statusLabel}</Badge>
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
