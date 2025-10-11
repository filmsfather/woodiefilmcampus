'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { updateMemberProfile, updateMemberClassAssignments, deleteApprovedUser } from '@/app/dashboard/manager/members/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type MemberRole = 'student' | 'teacher' | 'manager' | 'principal'

type ClassSummary = {
  id: string
  name: string
}

type ClassAssignmentSummary = {
  id: string
  name: string
  isHomeroom: boolean
}

type AssignableMember = ManagerMemberSummary & { role: 'student' | 'teacher' }

type ManagerMemberSummary = {
  id: string
  name: string | null
  email: string
  role: MemberRole
  studentPhone: string | null
  parentPhone: string | null
  academicRecord: string | null
  approvedAt: string
  updatedAt: string
  classAssignments: ClassAssignmentSummary[]
}

type ManagerMembersPageClientProps = {
  initialData: {
    classes: ClassSummary[]
    members: ManagerMemberSummary[]
  }
}

type StatusMessage = { type: 'success' | 'error'; text: string }

type ActiveAssignmentState = {
  target: AssignableMember
  selectedClassIds: Set<string>
  homeroomClassId: string | null
  error: string | null
}

type EditState = {
  memberId: string
  role: MemberRole
  name: string
  studentPhone: string
  parentPhone: string
  academicRecord: string
}

const roleFilterOptions: Array<{ label: string; value: 'all' | MemberRole }> = [
  { label: '전체', value: 'all' },
  { label: '학생', value: 'student' },
  { label: '교사', value: 'teacher' },
  { label: '매니저', value: 'manager' },
]

const roleLabelMap: Record<MemberRole, string> = {
  student: '학생',
  teacher: '교사',
  manager: '매니저',
  principal: '원장',
}

function formatAssignments(assignments: ClassAssignmentSummary[], role: MemberRole) {
  if (!assignments.length) {
    return role === 'student' ? '배정된 반 없음' : role === 'teacher' ? '담당 반 없음' : '-'
  }

  return assignments
    .map((item) => (item.isHomeroom ? `${item.name} (담임)` : item.name))
    .join(', ')
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

function normalizeInput(value: string) {
  return value.trim()
}

export function ManagerMembersPageClient({ initialData }: ManagerMembersPageClientProps) {
  const router = useRouter()
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(null)
  const [filter, setFilter] = useState<'all' | MemberRole>('all')
  const [search, setSearch] = useState('')
  const [editState, setEditState] = useState<EditState | null>(null)
  const [saving, startSavingTransition] = useTransition()
  const [assignmentState, setAssignmentState] = useState<ActiveAssignmentState | null>(null)
  const [assignmentPending, startAssignmentTransition] = useTransition()
  const [deletePendingId, setDeletePendingId] = useState<string | null>(null)
  const [deletePending, startDeleteTransition] = useTransition()

  const classes = initialData.classes
  const members = initialData.members

  const filteredMembers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    return members.filter((member) => {
      const roleMatches = filter === 'all' ? true : member.role === filter

      if (!roleMatches) {
        return false
      }

      if (!normalizedSearch) {
        return true
      }

      const tokens = [
        member.name ?? '',
        member.email,
        member.studentPhone ?? '',
        member.parentPhone ?? '',
        member.academicRecord ?? '',
        formatAssignments(member.classAssignments, member.role),
      ]

      return tokens.some((token) => token.toLowerCase().includes(normalizedSearch))
    })
  }, [members, filter, search])

  const handleStartEdit = (member: ManagerMemberSummary) => {
    setStatusMessage(null)
    setEditState({
      memberId: member.id,
      role: member.role,
      name: member.name ?? '',
      studentPhone: member.studentPhone ?? '',
      parentPhone: member.parentPhone ?? '',
      academicRecord: member.academicRecord ?? '',
    })
  }

  const handleCancelEdit = () => {
    setEditState(null)
  }

  const updateEditField = (field: keyof Omit<EditState, 'memberId' | 'role'>, value: string) => {
    setEditState((prev) => (prev ? { ...prev, [field]: value } : prev))
  }

  const activeEditMember = editState
  const isEditing = (memberId: string) => activeEditMember?.memberId === memberId

  const handleSaveEdit = () => {
    if (!activeEditMember) {
      return
    }

    setStatusMessage(null)

    startSavingTransition(async () => {
      const result = await updateMemberProfile({
        memberId: activeEditMember.memberId,
        role: activeEditMember.role,
        name: normalizeInput(activeEditMember.name),
        studentPhone: normalizeInput(activeEditMember.studentPhone),
        parentPhone: normalizeInput(activeEditMember.parentPhone),
        academicRecord: normalizeInput(activeEditMember.academicRecord),
      })

      if (result?.error) {
        setStatusMessage({ type: 'error', text: result.error })
        return
      }

      setStatusMessage({ type: 'success', text: '구성원 정보를 저장했습니다.' })
      setEditState(null)
      router.refresh()
    })
  }

  const handleOpenAssignment = (member: ManagerMemberSummary) => {
    if (member.role !== 'student' && member.role !== 'teacher') {
      return
    }

    const selected = new Set(member.classAssignments.map((item) => item.id))
    const homeroom = member.classAssignments.find((item) => item.isHomeroom)?.id ?? null

    const assignableMember: AssignableMember = {
      ...member,
      role: member.role as 'student' | 'teacher',
    }

    setAssignmentState({
      target: assignableMember,
      selectedClassIds: selected,
      homeroomClassId: homeroom,
      error: null,
    })
  }

  const handleCloseAssignment = () => {
    setAssignmentState(null)
  }

  useEffect(() => {
    setStatusMessage(null)
  }, [filter, search])

  const handleToggleClassSelection = (classId: string, checked: boolean) => {
    setAssignmentState((prev) => {
      if (!prev) return prev

      const nextSelected = new Set(prev.selectedClassIds)

      if (checked) {
        nextSelected.add(classId)
      } else {
        nextSelected.delete(classId)
      }

      const nextHomeroom =
        prev.target.role === 'teacher' && prev.homeroomClassId === classId && !checked
          ? null
          : prev.homeroomClassId

      return {
        ...prev,
        selectedClassIds: nextSelected,
        homeroomClassId: nextHomeroom,
        error: null,
      }
    })
  }

  const handleSelectHomeroom = (classId: string) => {
    setAssignmentState((prev) => {
      if (!prev) return prev
      if (!prev.selectedClassIds.has(classId)) {
        return prev
      }

      return {
        ...prev,
        homeroomClassId: classId,
        error: null,
      }
    })
  }

  const handleSaveAssignment = () => {
    if (!assignmentState) {
      return
    }

    const { target, selectedClassIds, homeroomClassId } = assignmentState

    if (target.role === 'teacher' && homeroomClassId && !selectedClassIds.has(homeroomClassId)) {
      setAssignmentState((prev) => (prev ? { ...prev, error: '담임으로 지정할 반을 선택해주세요.' } : prev))
      return
    }

    startAssignmentTransition(async () => {
      const result = await updateMemberClassAssignments({
        memberId: target.id,
        role: target.role,
        classIds: Array.from(selectedClassIds),
        homeroomClassId: target.role === 'teacher' ? homeroomClassId ?? null : null,
      })

      if (result?.error) {
        setAssignmentState((prev) => (prev ? { ...prev, error: result.error } : prev))
        return
      }

      setStatusMessage({ type: 'success', text: '반 배정을 저장했습니다.' })
      setAssignmentState(null)
      router.refresh()
    })
  }

  const handleDeleteMember = (member: ManagerMemberSummary) => {
    if (!window.confirm(`${member.name ?? member.email} 계정을 삭제하시겠습니까?`)) {
      return
    }

    setStatusMessage(null)
    setDeletePendingId(member.id)

    startDeleteTransition(async () => {
      try {
        const result = await deleteApprovedUser({ memberId: member.id })

        if (result?.error) {
          setStatusMessage({ type: 'error', text: result.error })
          return
        }

        setStatusMessage({ type: 'success', text: '구성원을 삭제했습니다.' })
        setEditState((prev) => (prev?.memberId === member.id ? null : prev))
        router.refresh()
      } finally {
        setDeletePendingId(null)
      }
    })
  }

  const renderPhoneCell = (value: string | null, editingValue: string, onChange: (value: string) => void, isEditable: boolean) => {
    if (isEditable) {
      return (
        <Input
          value={editingValue}
          onChange={(event) => onChange(event.target.value)}
          placeholder="미입력"
          className="h-9 w-40"
        />
      )
    }

    return value && value.trim().length > 0 ? value : '미입력'
  }

  const renderAcademicCell = (value: string | null, editingValue: string, onChange: (value: string) => void, isEditable: boolean) => {
    if (isEditable) {
      return (
        <Input
          value={editingValue}
          onChange={(event) => onChange(event.target.value)}
          placeholder="예: 3.5 / 검정고시"
          className="h-9 w-44"
        />
      )
    }

    return value && value.trim().length > 0 ? value : '-'
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {roleFilterOptions.map((option) => (
            <Button
              key={option.value}
              size="sm"
              variant={filter === option.value ? 'default' : 'outline'}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
              {option.value !== 'all' && (
                <Badge variant="secondary" className="ml-2 text-xs font-normal">
                  {members.filter((member) => member.role === option.value).length}
                </Badge>
              )}
            </Button>
          ))}
        </div>
        <div className="max-w-xs">
          <Input
            placeholder="이름, 이메일, 연락처 검색"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-9"
          />
        </div>
      </div>

      {statusMessage && (
        <Alert variant={statusMessage.type === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{statusMessage.text}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-48">이름</TableHead>
              <TableHead className="w-20">역할</TableHead>
              <TableHead>배정 반</TableHead>
              <TableHead className="w-40">학생 번호</TableHead>
              <TableHead className="w-40">부모님 번호</TableHead>
              <TableHead className="w-36">성적</TableHead>
              <TableHead className="w-64 text-right">액션</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredMembers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-500">
                  조건에 맞는 구성원이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              filteredMembers.map((member) => {
                const editing = isEditing(member.id)
                const editingValues = editing
                  ? {
                      name: editState?.name ?? '',
                      studentPhone: editState?.studentPhone ?? '',
                      parentPhone: editState?.parentPhone ?? '',
                      academicRecord: editState?.academicRecord ?? '',
                    }
                  : null

                return (
                  <TableRow key={member.id} data-state={editing ? 'selected' : undefined}>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {editing ? (
                          <Input
                            value={editingValues?.name ?? ''}
                            onChange={(event) => updateEditField('name', event.target.value)}
                            className="h-9"
                          />
                        ) : (
                          <span className="font-medium text-slate-900">{member.name ?? '이름 미등록'}</span>
                        )}
                        <span className="text-xs text-slate-500">{member.email}</span>
                        <span className="text-xs text-slate-400">
                          승인일 {formatDate(member.approvedAt)} · 업데이트 {formatDate(member.updatedAt)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{roleLabelMap[member.role]}</Badge>
                    </TableCell>
                    <TableCell className="max-w-sm truncate" title={formatAssignments(member.classAssignments, member.role)}>
                      {formatAssignments(member.classAssignments, member.role)}
                    </TableCell>
                    <TableCell>
                      {renderPhoneCell(member.studentPhone, editingValues?.studentPhone ?? '', (value) => updateEditField('studentPhone', value), editing)}
                    </TableCell>
                    <TableCell>
                      {renderPhoneCell(member.parentPhone, editingValues?.parentPhone ?? '', (value) => updateEditField('parentPhone', value), editing)}
                    </TableCell>
                    <TableCell>
                      {renderAcademicCell(member.academicRecord, editingValues?.academicRecord ?? '', (value) => updateEditField('academicRecord', value), editing)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-2">
                        {editing ? (
                          <>
                            <Button size="sm" onClick={handleSaveEdit} disabled={saving}>
                              {saving ? (
                                <span className="flex items-center gap-2">
                                  <LoadingSpinner className="size-4" /> 저장 중
                                </span>
                              ) : (
                                '저장'
                              )}
                            </Button>
                            <Button size="sm" variant="outline" onClick={handleCancelEdit} disabled={saving}>
                              취소
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => handleStartEdit(member)}>
                            정보 수정
                          </Button>
                        )}
                        {(member.role === 'student' || member.role === 'teacher') && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleOpenAssignment(member)}
                          >
                            반 배정
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteMember(member)}
                          disabled={deletePending && deletePendingId === member.id}
                        >
                          {deletePending && deletePendingId === member.id ? (
                            <span className="flex items-center gap-2">
                              <LoadingSpinner className="size-4" /> 삭제 중
                            </span>
                          ) : (
                            '삭제'
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={!!assignmentState} onOpenChange={(open) => (!open ? handleCloseAssignment() : undefined)}>
        <SheetContent className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>반 배정 관리</SheetTitle>
            {assignmentState && (
              <SheetDescription>
                {assignmentState.target.name ?? assignmentState.target.email} · {roleLabelMap[assignmentState.target.role]}
              </SheetDescription>
            )}
          </SheetHeader>

          {assignmentState && (
            <div className="flex flex-1 flex-col gap-4 p-4">
              <div className="space-y-3">
                <p className="text-sm text-slate-600">배정할 반을 선택하세요. 교사의 경우 담임 반을 지정할 수 있습니다.</p>
                <div className="max-h-64 space-y-2 overflow-y-auto pr-2">
                  {classes.length === 0 ? (
                    <p className="text-sm text-slate-500">등록된 반이 없습니다.</p>
                  ) : (
                    classes.map((classItem) => {
                      const checked = assignmentState.selectedClassIds.has(classItem.id)
                      return (
                        <div
                          key={classItem.id}
                          className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2"
                        >
                          <label className="flex items-center gap-3 text-sm text-slate-700">
                            <Checkbox
                              checked={checked}
                              onChange={(event) =>
                                handleToggleClassSelection(classItem.id, event.target.checked)
                              }
                            />
                            <span>{classItem.name}</span>
                          </label>
                          {assignmentState.target.role === 'teacher' && checked && (
                            <label className="flex items-center gap-2 text-xs text-slate-600">
                              <input
                                type="radio"
                                name="homeroom"
                                checked={assignmentState.homeroomClassId === classItem.id}
                                onChange={() => handleSelectHomeroom(classItem.id)}
                              />
                              담임 지정
                            </label>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              {assignmentState.target.role === 'teacher' && assignmentState.selectedClassIds.size > 0 && (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  담임 반을 지정하지 않으면 담당 교사만 등록됩니다.
                </div>
              )}

              {assignmentState.error && (
                <Alert variant="destructive">
                  <AlertDescription>{assignmentState.error}</AlertDescription>
                </Alert>
              )}

              <div className="mt-auto flex items-center justify-end gap-2">
                <Button variant="outline" onClick={handleCloseAssignment} disabled={assignmentPending}>
                  닫기
                </Button>
                <Button onClick={handleSaveAssignment} disabled={assignmentPending}>
                  {assignmentPending ? (
                    <span className="flex items-center gap-2">
                      <LoadingSpinner className="size-4" /> 저장 중
                    </span>
                  ) : (
                    '저장'
                  )}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
