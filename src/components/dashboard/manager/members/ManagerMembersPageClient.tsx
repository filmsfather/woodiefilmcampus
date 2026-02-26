'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Camera, ChevronDown, Loader2, Maximize2 } from 'lucide-react'

import { updateMemberProfile, updateMemberClassAssignments, transitionMemberToInactive, updateMemberRole, updateMemberPhoto } from '@/app/dashboard/manager/members/actions'
import { compressImageFile, isImageFile } from '@/lib/image-compress'
import { PROFILE_PHOTOS_BUCKET } from '@/lib/storage/buckets'
import { createClient } from '@/lib/supabase/client'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
  photoUrl: string | null
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

type MembersFilter = 'all' | MemberRole | 'unassigned'

type InactiveStatus = 'withdrawn' | 'graduated'

type InactiveDialogState = {
  member: ManagerMemberSummary
  nextStatus: InactiveStatus
}

const roleFilterOptions: Array<{ label: string; value: MembersFilter }> = [
  { label: '전체', value: 'all' },
  { label: '학생', value: 'student' },
  { label: '교사', value: 'teacher' },
  { label: '매니저', value: 'manager' },
  { label: '미배정 학생', value: 'unassigned' },
]

const roleLabelMap: Record<MemberRole, string> = {
  student: '학생',
  teacher: '교사',
  manager: '매니저',
  principal: '원장',
}

const inactiveStatusOptions: Array<{ value: InactiveStatus; label: string; description: string }> = [
  {
    value: 'withdrawn',
    label: '퇴원',
    description: '중도 퇴원 처리합니다. 학원 시스템 접근이 즉시 차단됩니다.',
  },
  {
    value: 'graduated',
    label: '졸업',
    description: '과정을 수료해 졸업 처리합니다. 데이터는 보존되지만 접근은 차단됩니다.',
  },
]

const inactiveStatusLabelMap: Record<InactiveStatus, string> = {
  withdrawn: '퇴원',
  graduated: '졸업',
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

function sanitizePhone(value: string) {
  return value.replace(/\D/g, '')
}

const MAX_PHOTO_SIZE = 5 * 1024 * 1024
const COMPRESS_TARGET_SIZE = 500 * 1024

function buildProfilePhotoPath(memberId: string) {
  return `students/${memberId}/${Date.now()}.jpg`
}

export function ManagerMembersPageClient({ initialData }: ManagerMembersPageClientProps) {
  const router = useRouter()
  const supabase = createClient()
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [photoTargetId, setPhotoTargetId] = useState<string | null>(null)
  const [photoUploading, startPhotoUploadTransition] = useTransition()
  const [photoPreviewMap, setPhotoPreviewMap] = useState<Record<string, string>>({})
  const [photoViewUrl, setPhotoViewUrl] = useState<string | null>(null)
  const [photoViewName, setPhotoViewName] = useState<string>('')
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(null)
  const [filter, setFilter] = useState<MembersFilter>('all')
  const [search, setSearch] = useState('')
  const [editState, setEditState] = useState<EditState | null>(null)
  const [saving, startSavingTransition] = useTransition()
  const [assignmentState, setAssignmentState] = useState<ActiveAssignmentState | null>(null)
  const [assignmentPending, startAssignmentTransition] = useTransition()
  const [inactiveState, setInactiveState] = useState<InactiveDialogState | null>(null)
  const [inactiveError, setInactiveError] = useState<string | null>(null)
  const [inactivePending, startInactiveTransition] = useTransition()
  const [roleChangePending, startRoleChangeTransition] = useTransition()
  const [roleChangeTargetId, setRoleChangeTargetId] = useState<string | null>(null)

  const classes = initialData.classes
  const members = initialData.members

  const filteredMembers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    return members.filter((member) => {
      const roleMatches =
        filter === 'all'
          ? true
          : filter === 'unassigned'
            ? member.role === 'student' && member.classAssignments.length === 0
            : member.role === filter

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
        studentPhone: sanitizePhone(activeEditMember.studentPhone),
        parentPhone: sanitizePhone(activeEditMember.parentPhone),
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

  const handleOpenInactive = (member: ManagerMemberSummary) => {
    if (member.role === 'principal') {
      return
    }
    setInactiveError(null)
    setInactiveState({ member, nextStatus: 'withdrawn' })
  }

  const handleCloseInactive = () => {
    if (inactivePending) {
      return
    }
    setInactiveError(null)
    setInactiveState(null)
  }

  const handleChangeInactiveStatus = (value: InactiveStatus) => {
    setInactiveState((prev) => (prev ? { ...prev, nextStatus: value } : prev))
  }

  const handleConfirmInactive = () => {
    if (!inactiveState) {
      return
    }

    setStatusMessage(null)
    setInactiveError(null)

    startInactiveTransition(async () => {
      const result = await transitionMemberToInactive({
        memberId: inactiveState.member.id,
        nextStatus: inactiveState.nextStatus,
      })

      if (result?.error) {
        setInactiveError(result.error)
        return
      }

      const label = inactiveStatusLabelMap[inactiveState.nextStatus]
      setStatusMessage({
        type: 'success',
        text: `${inactiveState.member.name ?? inactiveState.member.email} 님을 ${label} 처리했습니다.`,
      })
      setEditState((prev) => (prev?.memberId === inactiveState.member.id ? null : prev))
      setInactiveState(null)
      router.refresh()
    })
  }

  const handleChangeRole = (member: ManagerMemberSummary, newRole: 'student' | 'teacher') => {
    if (member.role === newRole) {
      return
    }

    setStatusMessage(null)
    setRoleChangeTargetId(member.id)

    startRoleChangeTransition(async () => {
      const result = await updateMemberRole({
        memberId: member.id,
        newRole,
      })

      setRoleChangeTargetId(null)

      if (result?.error) {
        setStatusMessage({ type: 'error', text: result.error })
        return
      }

      const roleLabel = newRole === 'student' ? '학생' : '교사'
      setStatusMessage({
        type: 'success',
        text: `${member.name ?? member.email} 님의 역할을 ${roleLabel}(으)로 변경했습니다.`,
      })
      router.refresh()
    })
  }

  const canChangeRole = (member: ManagerMemberSummary) => {
    return member.role === 'student' || member.role === 'teacher'
  }

  const handleAvatarClick = (memberId: string) => {
    setPhotoTargetId(memberId)
    setTimeout(() => photoInputRef.current?.click(), 0)
  }

  const handlePhotoFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !photoTargetId) return

    if (!isImageFile(file)) {
      setStatusMessage({ type: 'error', text: '이미지 파일만 업로드할 수 있습니다.' })
      return
    }

    if (file.size > MAX_PHOTO_SIZE) {
      setStatusMessage({ type: 'error', text: '사진 크기는 5MB 이하로 업로드해주세요.' })
      return
    }

    setStatusMessage(null)
    const memberId = photoTargetId
    const objectUrl = URL.createObjectURL(file)
    setPhotoPreviewMap((prev) => ({ ...prev, [memberId]: objectUrl }))

    startPhotoUploadTransition(async () => {
      try {
        const { file: compressedFile } = await compressImageFile(file, COMPRESS_TARGET_SIZE)
        const path = buildProfilePhotoPath(memberId)

        const { error: uploadError } = await supabase.storage
          .from(PROFILE_PHOTOS_BUCKET)
          .upload(path, compressedFile, {
            cacheControl: '3600',
            upsert: false,
            contentType: 'image/jpeg',
          })

        if (uploadError) throw uploadError

        const result = await updateMemberPhoto({ memberId, photoPath: path })

        if (result.error) {
          await supabase.storage.from(PROFILE_PHOTOS_BUCKET).remove([path])
          setStatusMessage({ type: 'error', text: result.error })
          setPhotoPreviewMap((prev) => {
            const next = { ...prev }
            delete next[memberId]
            return next
          })
        } else {
          setStatusMessage({ type: 'success', text: '사진이 등록되었습니다.' })
          router.refresh()
        }
      } catch (error) {
        console.error('[ManagerMembers] photo upload error', error)
        setStatusMessage({ type: 'error', text: '사진 업로드에 실패했습니다.' })
        setPhotoPreviewMap((prev) => {
          const next = { ...prev }
          delete next[memberId]
          return next
        })
      } finally {
        if (photoInputRef.current) photoInputRef.current.value = ''
        setPhotoTargetId(null)
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
          className="h-8 w-32 text-sm"
        />
      )
    }

    return <span className="text-sm">{value && value.trim().length > 0 ? value : '미입력'}</span>
  }

  const renderAcademicCell = (value: string | null, editingValue: string, onChange: (value: string) => void, isEditable: boolean) => {
    if (isEditable) {
      return (
        <Input
          value={editingValue}
          onChange={(event) => onChange(event.target.value)}
          placeholder="예: 3.5 / 검정고시"
          className="h-8 w-32 text-sm"
        />
      )
    }

    return <span className="text-sm">{value && value.trim().length > 0 ? value : '-'}</span>
  }

  return (
    <div className="space-y-6">
      <input
        ref={photoInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
        capture="environment"
        className="hidden"
        onChange={handlePhotoFileSelect}
      />
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
                  {(() => {
                    if (option.value === 'unassigned') {
                      return members.filter(
                        (member) => member.role === 'student' && member.classAssignments.length === 0
                      ).length
                    }
                    return members.filter((member) => member.role === option.value).length
                  })()}
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
              <TableHead>이름</TableHead>
              <TableHead>역할</TableHead>
              <TableHead>배정 반</TableHead>
              <TableHead>학생 번호</TableHead>
              <TableHead>부모님 번호</TableHead>
              <TableHead>성적</TableHead>
              <TableHead className="text-right">액션</TableHead>
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
                      <div className="flex items-start gap-3">
                        {(() => {
                          const isProcessing = photoUploading && photoTargetId === member.id
                          const displayUrl = photoPreviewMap[member.id] || member.photoUrl
                          return (
                            <button
                              type="button"
                              className="group relative shrink-0"
                              onClick={displayUrl
                                ? () => { setPhotoViewUrl(displayUrl); setPhotoViewName(member.name ?? member.email) }
                                : () => handleAvatarClick(member.id)
                              }
                              disabled={isProcessing}
                              title={displayUrl ? '크게보기' : '사진 추가'}
                            >
                              <Avatar className="size-10">
                                {displayUrl && (
                                  <AvatarImage src={displayUrl} alt={member.name ?? ''} />
                                )}
                                <AvatarFallback className="text-sm">
                                  {member.name ? member.name.charAt(0) : '?'}
                                </AvatarFallback>
                              </Avatar>
                              {isProcessing ? (
                                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
                                  <Loader2 className="size-4 animate-spin text-white" />
                                </div>
                              ) : displayUrl ? (
                                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 transition-colors group-hover:bg-black/30">
                                  <Maximize2 className="size-4 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                                </div>
                              ) : (
                                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 transition-colors group-hover:bg-black/30">
                                  <Camera className="size-4 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                                </div>
                              )}
                            </button>
                          )
                        })()}
                        <div className="flex flex-col gap-1">
                          {editing ? (
                            <Input
                              value={editingValues?.name ?? ''}
                              onChange={(event) => updateEditField('name', event.target.value)}
                              className="h-8 w-28 text-sm"
                            />
                          ) : (
                            <span className="text-sm font-medium text-slate-900">{member.name ?? '이름 미등록'}</span>
                          )}
                          <span className="text-xs text-slate-500 truncate max-w-[140px]">{member.email}</span>
                          <span className="text-xs text-slate-400">
                            승인일 {formatDate(member.approvedAt)} · 업데이트 {formatDate(member.updatedAt)}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {canChangeRole(member) ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild disabled={roleChangePending && roleChangeTargetId === member.id}>
                            <button
                              type="button"
                              className="cursor-pointer focus:outline-none"
                              title="역할 변경"
                            >
                              <Badge
                                variant="outline"
                                className="hover:bg-slate-100 transition-colors"
                              >
                                {roleChangePending && roleChangeTargetId === member.id ? (
                                  <span className="flex items-center gap-1">
                                    <LoadingSpinner className="size-3" />
                                    변경 중
                                  </span>
                                ) : (
                                  <>
                                    {roleLabelMap[member.role]}
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      width="12"
                                      height="12"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      className="ml-1"
                                    >
                                      <path d="m6 9 6 6 6-6" />
                                    </svg>
                                  </>
                                )}
                              </Badge>
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            <DropdownMenuItem
                              onClick={() => handleChangeRole(member, 'student')}
                              disabled={member.role === 'student'}
                              className={member.role === 'student' ? 'bg-slate-100' : ''}
                            >
                              학생으로 변경
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleChangeRole(member, 'teacher')}
                              disabled={member.role === 'teacher'}
                              className={member.role === 'teacher' ? 'bg-slate-100' : ''}
                            >
                              교사로 변경
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <Badge variant="outline">{roleLabelMap[member.role]}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {member.classAssignments.length === 0 ? (
                        <span className="text-sm text-slate-400">
                          {member.role === 'student' ? '배정된 반 없음' : member.role === 'teacher' ? '담당 반 없음' : '-'}
                        </span>
                      ) : member.classAssignments.length <= 2 ? (
                        <div className="flex flex-col gap-0.5">
                          {member.classAssignments.map((a) => (
                            <span key={a.id} className="text-sm">
                              {a.isHomeroom ? `${a.name} (담임)` : a.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button type="button" className="flex items-center gap-1 text-sm hover:text-slate-700">
                              <span>{member.classAssignments[0].isHomeroom ? `${member.classAssignments[0].name} (담임)` : member.classAssignments[0].name}</span>
                              <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                                +{member.classAssignments.length - 1}
                              </Badge>
                              <ChevronDown className="size-3 text-slate-400" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="max-h-60 overflow-y-auto">
                            {member.classAssignments.map((a) => (
                              <DropdownMenuItem key={a.id} className="text-sm" onSelect={(e) => e.preventDefault()}>
                                {a.isHomeroom ? `${a.name} (담임)` : a.name}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
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
                        {member.role !== 'principal' && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleOpenInactive(member)}
                            disabled={inactivePending && inactiveState?.member.id === member.id}
                          >
                            {inactivePending && inactiveState?.member.id === member.id ? (
                              <span className="flex items-center gap-2">
                                <LoadingSpinner className="size-4" /> 처리 중
                              </span>
                            ) : (
                              '퇴원/졸업'
                            )}
                          </Button>
                        )}
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

      <Sheet open={!!inactiveState} onOpenChange={(open) => (!open ? handleCloseInactive() : undefined)}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>퇴원 · 졸업 처리</SheetTitle>
            {inactiveState && (
              <SheetDescription>
                {inactiveState.member.name ?? inactiveState.member.email} · {roleLabelMap[inactiveState.member.role]}
              </SheetDescription>
            )}
          </SheetHeader>

          {inactiveState && (
            <div className="flex flex-1 flex-col gap-4 p-4">
              <p className="text-sm text-slate-600">
                처리 유형을 선택하세요. 반 배정이 모두 해제되고 로그인할 수 없으며, 필요 시 원장 퇴원생 관리에서 복구할 수 있습니다.
              </p>

              <div className="space-y-3">
                {inactiveStatusOptions.map((option) => (
                  <label
                    key={option.value}
                    className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 shadow-sm transition hover:border-slate-400"
                  >
                    <input
                      type="radio"
                      name="inactive-status"
                      className="mt-1 h-4 w-4"
                      checked={inactiveState.nextStatus === option.value}
                      onChange={() => handleChangeInactiveStatus(option.value)}
                    />
                    <span className="space-y-1">
                      <span className="block text-sm font-semibold text-slate-900">{option.label}</span>
                      <span className="block text-sm text-slate-600">{option.description}</span>
                    </span>
                  </label>
                ))}
              </div>

              <p className="text-xs text-slate-500">
                처리된 계정은 원장 대시보드 &gt; 퇴원생 관리에서만 조회할 수 있습니다.
              </p>

              {inactiveError && (
                <Alert variant="destructive">
                  <AlertDescription>{inactiveError}</AlertDescription>
                </Alert>
              )}

              <div className="mt-2 flex justify-end gap-2 border-t border-slate-100 pt-4">
                <Button variant="outline" onClick={handleCloseInactive} disabled={inactivePending}>
                  취소
                </Button>
                <Button variant="destructive" onClick={handleConfirmInactive} disabled={inactivePending}>
                  {inactivePending ? (
                    <span className="flex items-center gap-2">
                      <LoadingSpinner className="size-4" /> 처리 중
                    </span>
                  ) : (
                    `${inactiveStatusLabelMap[inactiveState.nextStatus]} 처리`
                  )}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={!!photoViewUrl} onOpenChange={(open) => !open && setPhotoViewUrl(null)}>
        <DialogContent className="max-w-sm p-2">
          <DialogTitle className="sr-only">{photoViewName} 사진</DialogTitle>
          {photoViewUrl && (
            <div className="space-y-3">
              <div className="relative aspect-square w-full overflow-hidden rounded-lg">
                <Image
                  src={photoViewUrl}
                  alt={`${photoViewName} 사진`}
                  fill
                  className="object-cover"
                />
              </div>
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPhotoViewUrl(null)
                    const member = members.find((m) => (m.name ?? m.email) === photoViewName)
                    if (member) handleAvatarClick(member.id)
                  }}
                >
                  <Camera className="mr-1.5 size-4" />
                  사진 변경
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
