import { Badge } from '@/components/ui/badge'
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
  desired_class: 'weekday' | 'saturday' | 'sunday' | 'regular'
  saturday_briefing_received: boolean | null
  schedule_fee_confirmed: boolean | null
  created_at: string
}

const classLabelMap: Record<EnrollmentApplicationItem['desired_class'], string> = {
  weekday: '평일반',
  saturday: '토요반',
  sunday: '일요반',
  regular: '정시반',
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

export function EnrollmentApplicationsTable({ applications }: { applications: EnrollmentApplicationItem[] }) {
  if (applications.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
        아직 접수된 등록원서가 없습니다.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
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
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
