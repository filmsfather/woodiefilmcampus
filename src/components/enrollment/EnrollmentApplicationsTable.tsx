'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MoreVertical, Trash2 } from 'lucide-react'

import { deleteEnrollmentApplication } from '@/app/dashboard/manager/enrollment/actions'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import DateUtil from '@/lib/date-util'

export interface EnrollmentApplicationItem {
  id: string
  student_name: string
  parent_phone: string
  student_phone: string | null
  desired_class: 'weekday' | 'saturday' | 'sunday' | 'regular' | 'online'
  saturday_briefing_received: boolean | null
  schedule_fee_confirmed: boolean | null
  created_at: string
  status: 'pending' | 'confirmed' | 'assigned'
  status_updated_at: string
  status_updated_by: string | null
  matched_profile_id: string | null
  assigned_class_id: string | null
  assigned_class_name?: string | null
}

const classLabelMap: Record<EnrollmentApplicationItem['desired_class'], string> = {
  weekday: '평일반',
  saturday: '토요반',
  sunday: '일요반',
  regular: '정시반',
  online: '온라인반',
}

function formatPhone(value: string) {
  if (!/^01[0-9]{8,9}$/.test(value)) {
    return value
  }

  if (value.length === 11) {
    return `${value.slice(0, 3)}-${value.slice(3, 7)}-${value.slice(7)}`
  }

  return `${value.slice(0, 3)}-${value.slice(3, 6)}-${value.slice(6)}`
}

function renderStatus(item: EnrollmentApplicationItem) {
  switch (item.status) {
    case 'assigned':
      return (
        <Badge variant="secondary" className="bg-indigo-100 text-indigo-800">
          배정 완료{item.assigned_class_name ? ` · ${item.assigned_class_name}` : ''}
        </Badge>
      )
    case 'confirmed':
      return (
        <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">
          가입 완료
        </Badge>
      )
    default:
      return (
        <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
          미확인
        </Badge>
      )
  }
}


function DeleteButton({ applicationId, studentName }: { applicationId: string; studentName: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteEnrollmentApplication({ applicationId })
      if (result?.error) {
        alert(result.error)
        return
      }
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreVertical className="h-4 w-4" />
            <span className="sr-only">메뉴 열기</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setOpen(true)} className="text-red-600 focus:text-red-600">
            <Trash2 className="mr-2 h-4 w-4" />
            삭제
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>정말 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              {studentName} 학생의 등록원서가 영구적으로 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleDelete()
              }}
              disabled={isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {isPending ? '삭제 중...' : '삭제'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

interface EnrollmentApplicationsTableProps {
  title?: string
  emptyHint?: string
  actions?: React.ReactNode
  applications: EnrollmentApplicationItem[]
}

export function EnrollmentApplicationsTable({ title, emptyHint, actions, applications }: EnrollmentApplicationsTableProps) {
  if (applications.length === 0) {
    return (
      <Card className="border-slate-200">
        {title ? (
          <CardHeader className="pb-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base font-semibold text-slate-900">{title}</CardTitle>
              {actions}
            </div>
          </CardHeader>
        ) : null}
        <CardContent>
          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-6 py-8 text-center text-sm text-slate-500">
            {emptyHint ?? '아직 접수된 등록원서가 없습니다.'}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-slate-200">
      {title ? (
        <CardHeader className="pb-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base font-semibold text-slate-900">{title}</CardTitle>
            {actions}
          </div>
        </CardHeader>
      ) : null}
      <CardContent className="px-0 pb-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="whitespace-nowrap">제출일</TableHead>
                <TableHead className="whitespace-nowrap">학생 이름</TableHead>
                <TableHead className="whitespace-nowrap">부모님 번호</TableHead>
                <TableHead className="whitespace-nowrap">학생 번호 (선택)</TableHead>
                <TableHead className="whitespace-nowrap">희망 반</TableHead>
                <TableHead className="whitespace-nowrap">토요반 안내</TableHead>
                <TableHead className="whitespace-nowrap">일정/수강료 확인</TableHead>
                <TableHead className="whitespace-nowrap">상태</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applications.map((item) => (
                <TableRow key={item.id} className="text-sm text-slate-700">
                  <TableCell className="whitespace-nowrap text-slate-600">
                    {DateUtil.formatForDisplay(item.created_at, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </TableCell>
                  <TableCell className="font-medium text-slate-900">{item.student_name}</TableCell>
                  <TableCell>{formatPhone(item.parent_phone)}</TableCell>
                  <TableCell>{item.student_phone ? formatPhone(item.student_phone) : <span className="text-slate-500">-</span>}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">
                      {classLabelMap[item.desired_class]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {item.desired_class === 'saturday' ? (
                      item.saturday_briefing_received === null ? (
                        <span className="text-slate-500">미응답</span>
                      ) : item.saturday_briefing_received ? (
                        <span className="text-emerald-600">네</span>
                      ) : (
                        <span className="text-slate-700">아니요</span>
                      )
                    ) : (
                      <span className="text-slate-500">해당 없음</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {item.schedule_fee_confirmed ? (
                      <span className="text-emerald-600">확인</span>
                    ) : (
                      <span className="text-slate-700">미확인</span>
                    )}
                  </TableCell>
                  <TableCell className="space-y-1">
                    {renderStatus(item)}
                    <div className="text-xs text-slate-500">
                      {DateUtil.formatForDisplay(item.status_updated_at, {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </div>
                  </TableCell>
                  <TableCell>
                    <DeleteButton applicationId={item.id} studentName={item.student_name} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
