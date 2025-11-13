'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { reactivateInactiveMember } from '@/app/dashboard/principal/withdrawn-students/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { UserRole } from '@/lib/supabase'

type InactiveStatus = 'withdrawn' | 'graduated'

export type InactiveMemberSummary = {
  id: string
  name: string | null
  email: string
  role: UserRole
  status: InactiveStatus
  studentPhone: string | null
  parentPhone: string | null
  academicRecord: string | null
  createdAt: string
  updatedAt: string
}

type StatusMessage = { type: 'success' | 'error'; text: string }

const statusFilterOptions: Array<{ label: string; value: 'all' | InactiveStatus }> = [
  { label: '전체', value: 'all' },
  { label: '퇴원생', value: 'withdrawn' },
  { label: '졸업생', value: 'graduated' },
]

const statusLabelMap: Record<InactiveStatus, string> = {
  withdrawn: '퇴원',
  graduated: '졸업',
}

const roleLabelMap: Record<UserRole, string> = {
  principal: '원장',
  manager: '실장',
  teacher: '교사',
  student: '학생',
}

function formatDate(value: string) {
  try {
    const date = new Date(value)
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date)
  } catch {
    return value
  }
}

interface PrincipalInactiveMembersClientProps {
  initialMembers: InactiveMemberSummary[]
}

export function PrincipalInactiveMembersClient({ initialMembers }: PrincipalInactiveMembersClientProps) {
  const router = useRouter()
  const [members, setMembers] = useState(initialMembers)
  const [filter, setFilter] = useState<'all' | InactiveStatus>('all')
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState<StatusMessage | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [reactivating, startTransition] = useTransition()

  const normalizedSearch = search.trim().toLowerCase()

  const filteredMembers = useMemo(() => {
    return members.filter((member) => {
      if (filter !== 'all' && member.status !== filter) {
        return false
      }

      if (!normalizedSearch) {
        return true
      }

      return [
        member.name ?? '',
        member.email,
        member.studentPhone ?? '',
        member.parentPhone ?? '',
        member.academicRecord ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch)
    })
  }, [members, filter, normalizedSearch])

  const handleReactivate = (member: InactiveMemberSummary) => {
    if (!window.confirm(`${member.name ?? member.email} 계정을 다시 승인하시겠습니까?`)) {
      return
    }

    setMessage(null)
    setPendingId(member.id)

    startTransition(async () => {
      const result = await reactivateInactiveMember({ memberId: member.id })

      if (result?.error) {
        setMessage({ type: 'error', text: result.error })
        setPendingId(null)
        return
      }

      setMessage({
        type: 'success',
        text: `${member.name ?? member.email} 계정을 다시 승인했습니다. 반 배정은 별도로 진행해주세요.`,
      })
      setMembers((prev) => prev.filter((item) => item.id !== member.id))
      setPendingId(null)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {message && (
        <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {statusFilterOptions.map((option) => (
            <Button
              key={option.value}
              size="sm"
              variant={filter === option.value ? 'default' : 'outline'}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
              <Badge variant="secondary" className="ml-2 text-xs font-normal">
                {option.value === 'all'
                  ? members.length
                  : members.filter((member) => member.status === option.value).length}
              </Badge>
            </Button>
          ))}
        </div>
        <div className="w-full max-w-xs">
          <Input
            placeholder="이름, 이메일, 연락처 검색"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-64">이름 / 이메일</TableHead>
              <TableHead className="w-24">상태</TableHead>
              <TableHead className="w-24">역할</TableHead>
              <TableHead className="w-40">학생 연락처</TableHead>
              <TableHead className="w-40">부모님 연락처</TableHead>
              <TableHead className="w-36">최종 업데이트</TableHead>
              <TableHead className="w-36 text-right">액션</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredMembers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-500">
                  조건에 맞는 퇴원/졸업 계정이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              filteredMembers.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span className="font-medium text-slate-900">{member.name ?? '이름 미등록'}</span>
                      <span className="text-xs text-slate-500">{member.email}</span>
                      {member.academicRecord && (
                        <span className="text-xs text-slate-400">{member.academicRecord}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{statusLabelMap[member.status]}</Badge>
                  </TableCell>
                  <TableCell>{roleLabelMap[member.role]}</TableCell>
                  <TableCell>{member.studentPhone ?? '미입력'}</TableCell>
                  <TableCell>{member.parentPhone ?? '미입력'}</TableCell>
                  <TableCell>{formatDate(member.updatedAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleReactivate(member)}
                      disabled={reactivating && pendingId === member.id}
                    >
                      {reactivating && pendingId === member.id ? (
                        <span className="flex items-center gap-2">
                          <LoadingSpinner className="size-4" /> 처리 중
                        </span>
                      ) : (
                        '다시 승인'
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
