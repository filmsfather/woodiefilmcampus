'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  CalendarDays,
  GripVertical,
  Loader2,
  MoreVertical,
  Pencil,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  UserPlus,
  X,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { prepareFinalConfirmationFormAction } from '@/app/dashboard/principal/university-reports/workflow/actions'
import { weekdayPreferenceLabel, type WeekdayPreference } from '@/lib/university-confirmation/constants'
import type { WishlistCategory } from '@/lib/university-policy/yedae'
import type { ClassFormationGroup, FormationStudent } from '@/types/class-formation'

export const CATEGORY_LABELS: Record<WishlistCategory, string> = {
  general: '일반대',
  specialized: '예대',
  karts: '한예종',
}

export const CATEGORY_TONE: Record<WishlistCategory, string> = {
  general: 'bg-sky-100 text-sky-700',
  specialized: 'bg-amber-100 text-amber-800',
  karts: 'bg-violet-100 text-violet-700',
}

/**
 * 학생의 최종 확정 폼(/confirm/[token])으로 이동하는 미니 버튼.
 * 워크플로 화면의 "원장 확정" 버튼과 동일한 동작을 반 편성 카드에서 바로 실행한다.
 */
function ConfirmFormMiniButton({ studentId }: { studentId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const handleClick = () => {
    startTransition(async () => {
      const result = await prepareFinalConfirmationFormAction({ studentId })
      if ('error' in result) {
        window.alert(result.error)
        return
      }
      router.push(`/confirm/${result.token}`)
    })
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-5 gap-0.5 rounded px-1.5 text-[10px] border-violet-300 text-violet-700 hover:bg-violet-50"
      disabled={isPending}
      onClick={handleClick}
      onMouseDown={(event) => event.stopPropagation()}
      title="원장 확정 폼으로 이동"
    >
      {isPending ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <ShieldCheck className="size-3" />
      )}
      확정
    </Button>
  )
}

function UniversityBadges({ student }: { student: FormationStudent }) {
  if (student.universities.length === 0) {
    return <span className="text-xs text-slate-400">지원 대학 없음</span>
  }
  return (
    <div className="flex flex-wrap gap-1">
      {student.universities.map((u) => (
        <Badge key={u.key} className={`${CATEGORY_TONE[u.category]} font-medium`}>
          {u.shortName ?? u.universityName}
          <span className="ml-1 font-normal opacity-70">· {u.programName}</span>
        </Badge>
      ))}
    </div>
  )
}

function WeekdayBadges({ values }: { values: WeekdayPreference[] }) {
  if (values.length === 0) {
    return (
      <Badge variant="outline" className="gap-1 border-slate-200 text-slate-400">
        <TriangleAlert className="size-3" /> 요일 미선택
      </Badge>
    )
  }
  return (
    <>
      {values.map((value) => (
        <Badge key={value} variant="outline" className="gap-1 border-slate-200 text-slate-600">
          <CalendarDays className="size-3" /> {weekdayPreferenceLabel(value)}
        </Badge>
      ))}
    </>
  )
}

export function StudentPoolCard({
  student,
  groups,
  disabled,
  onAssign,
}: {
  student: FormationStudent
  groups: ClassFormationGroup[]
  disabled: boolean
  onAssign: (groupId: string) => void
}) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <Link
                href={`/dashboard/principal/university-reports/${student.studentId}/report`}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-semibold text-slate-900 underline-offset-2 hover:text-sky-600 hover:underline"
              >
                {student.studentName}
              </Link>
              {student.className ? (
                <Badge variant="outline" className="text-[10px] text-slate-500">
                  {student.className}
                </Badge>
              ) : null}
              {!student.isConfirmed ? (
                <Badge className="gap-1 bg-rose-100 text-[10px] text-rose-700">
                  <TriangleAlert className="size-3" /> 미확정
                </Badge>
              ) : null}
              {!student.isConfirmed ? <ConfirmFormMiniButton studentId={student.studentId} /> : null}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 gap-1 px-2 text-xs"
                disabled={disabled || groups.length === 0}
              >
                <UserPlus className="size-3.5" /> 배치
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
              <DropdownMenuLabel>반으로 배치</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {groups.length === 0 ? (
                <DropdownMenuItem disabled>먼저 반을 추가하세요</DropdownMenuItem>
              ) : (
                groups.map((group) => (
                  <DropdownMenuItem key={group.id} onSelect={() => onAssign(group.id)}>
                    {group.name}
                    {group.weekday ? (
                      <span className="ml-auto text-[10px] text-slate-400">
                        {weekdayPreferenceLabel(group.weekday)}
                      </span>
                    ) : null}
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex flex-wrap gap-1">
          <WeekdayBadges values={student.weekdayPreferences} />
        </div>
        <UniversityBadges student={student} />
      </CardContent>
    </Card>
  )
}

interface CommonUniversity {
  key: string
  label: string
  count: number
}

function computeCommonUniversities(members: FormationStudent[]): CommonUniversity[] {
  const map = new Map<string, CommonUniversity>()
  for (const member of members) {
    const seen = new Set<string>()
    for (const u of member.universities) {
      const key = u.universityId ?? u.universityName
      if (seen.has(key)) continue
      seen.add(key)
      const existing = map.get(key)
      if (existing) {
        existing.count += 1
      } else {
        map.set(key, { key, label: u.shortName ?? u.universityName, count: 1 })
      }
    }
  }
  return Array.from(map.values())
    .filter((item) => item.count >= 2)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ko'))
    .slice(0, 6)
}

export function GroupCard({
  group,
  members,
  allGroups,
  teacherName,
  disabled,
  onEdit,
  onDelete,
  onMoveStudent,
  onRemoveStudent,
  onReorderMembers,
}: {
  group: ClassFormationGroup
  members: FormationStudent[]
  allGroups: ClassFormationGroup[]
  teacherName: string | null
  disabled: boolean
  onEdit: () => void
  onDelete: () => void
  onMoveStudent: (studentId: string, targetGroupId: string) => void
  onRemoveStudent: (studentId: string) => void
  onReorderMembers: (orderedStudentIds: string[]) => void
}) {
  const commonUniversities = computeCommonUniversities(members)
  const otherGroups = allGroups.filter((g) => g.id !== group.id)

  const memberIdsKey = members.map((member) => member.studentId).join('|')
  const [order, setOrder] = useState<string[]>(() =>
    members.map((member) => member.studentId)
  )
  const [draggingId, setDraggingId] = useState<string | null>(null)

  // 서버 갱신(router.refresh) 등으로 멤버 구성이 바뀌면 로컬 순서를 동기화한다.
  useEffect(() => {
    setOrder(memberIdsKey ? memberIdsKey.split('|') : [])
  }, [memberIdsKey])

  const membersById = useMemo(() => {
    const map = new Map<string, FormationStudent>()
    for (const member of members) map.set(member.studentId, member)
    return map
  }, [members])

  const orderedMembers = order
    .map((id) => membersById.get(id))
    .filter((member): member is FormationStudent => Boolean(member))

  const handleDragStart = (event: React.DragEvent, studentId: string) => {
    event.dataTransfer.effectAllowed = 'move'
    // Safari는 setData 없이는 드래그를 시작하지 않는다.
    event.dataTransfer.setData('text/plain', studentId)
    setDraggingId(studentId)
  }

  const handleDragOver = (event: React.DragEvent, overId: string) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    if (!draggingId || draggingId === overId) return
    setOrder((prev) => {
      const from = prev.indexOf(draggingId)
      const to = prev.indexOf(overId)
      if (from < 0 || to < 0 || from === to) return prev
      const next = [...prev]
      next.splice(from, 1)
      next.splice(to, 0, draggingId)
      return next
    })
  }

  const handleDragEnd = () => {
    if (draggingId && order.join('|') !== memberIdsKey) {
      onReorderMembers(order)
    }
    setDraggingId(null)
  }

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-base font-semibold text-slate-900">{group.name}</span>
              {group.weekday ? (
                <Badge className="gap-1 bg-emerald-100 text-emerald-700">
                  <CalendarDays className="size-3" /> {weekdayPreferenceLabel(group.weekday)}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-slate-400">
                  요일 미지정
                </Badge>
              )}
              {group.materializedClassId ? (
                <Badge variant="outline" className="border-emerald-200 text-emerald-600">
                  반 반영됨
                </Badge>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>담임: {teacherName ?? '미지정'}</span>
              <span>·</span>
              <span>{members.length}명</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1 px-2 text-xs"
              onClick={onEdit}
              disabled={disabled}
            >
              <Pencil className="size-3.5" /> 편집
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs text-rose-600 hover:bg-rose-50"
              onClick={onDelete}
              disabled={disabled}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>

        {commonUniversities.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-slate-50 px-2.5 py-2">
            <span className="text-[11px] font-medium text-slate-500">공통 지원</span>
            {commonUniversities.map((item) => (
              <Badge key={item.key} variant="outline" className="border-slate-200 text-slate-600">
                {item.label}
                <span className="ml-1 font-semibold text-slate-800">{item.count}</span>
              </Badge>
            ))}
          </div>
        ) : null}

        {members.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-200 py-4 text-center text-xs text-slate-400">
            배치된 학생이 없습니다. 왼쪽 풀에서 배치하세요.
          </p>
        ) : (
          <div className="space-y-1.5">
            {orderedMembers.map((member) => {
              const mismatch = group.weekday && !member.weekdayPreferences.includes(group.weekday)
              const isDragging = draggingId === member.studentId
              return (
                <div
                  key={member.studentId}
                  draggable={!disabled}
                  onDragStart={(event) => handleDragStart(event, member.studentId)}
                  onDragOver={(event) => handleDragOver(event, member.studentId)}
                  onDrop={(event) => event.preventDefault()}
                  onDragEnd={handleDragEnd}
                  className={`flex items-start justify-between gap-2 rounded-md border bg-white px-2.5 py-2 ${
                    isDragging
                      ? 'border-sky-300 opacity-60 shadow-sm'
                      : 'border-slate-100'
                  } ${disabled ? '' : 'cursor-grab active:cursor-grabbing'}`}
                >
                  <div className="flex min-w-0 items-start gap-1.5">
                    <GripVertical className="mt-0.5 size-3.5 shrink-0 text-slate-300" />
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Link
                          href={`/dashboard/principal/university-reports/${member.studentId}/report`}
                          target="_blank"
                          rel="noreferrer"
                          draggable={false}
                          className="text-sm font-medium text-slate-800 underline-offset-2 hover:text-sky-600 hover:underline"
                        >
                          {member.studentName}
                        </Link>
                        <ConfirmFormMiniButton studentId={member.studentId} />
                        {member.className ? (
                          <span className="text-[10px] text-slate-400">{member.className}</span>
                        ) : null}
                        {!member.isConfirmed ? (
                          <Badge className="gap-1 bg-rose-100 text-rose-700">
                            <TriangleAlert className="size-3" /> 미확정
                          </Badge>
                        ) : null}
                        {mismatch ? (
                          <Badge className="gap-1 bg-rose-100 text-rose-700">
                            <TriangleAlert className="size-3" /> 요일 불일치
                          </Badge>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {member.universities.slice(0, 4).map((u) => (
                          <Badge key={u.key} className={`${CATEGORY_TONE[u.category]} text-[10px]`}>
                            {u.shortName ?? u.universityName}
                          </Badge>
                        ))}
                        {member.universities.length > 4 ? (
                          <span className="text-[10px] text-slate-400">
                            +{member.universities.length - 4}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 shrink-0 p-0"
                        disabled={disabled}
                      >
                        <MoreVertical className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
                      <DropdownMenuItem onSelect={() => onRemoveStudent(member.studentId)}>
                        <X className="size-3.5" /> 배치 해제
                      </DropdownMenuItem>
                      {otherGroups.length > 0 ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel>다른 반으로 이동</DropdownMenuLabel>
                          {otherGroups.map((target) => (
                            <DropdownMenuItem
                              key={target.id}
                              onSelect={() => onMoveStudent(member.studentId, target.id)}
                            >
                              {target.name}
                              {target.weekday ? (
                                <span className="ml-auto text-[10px] text-slate-400">
                                  {weekdayPreferenceLabel(target.weekday)}
                                </span>
                              ) : null}
                            </DropdownMenuItem>
                          ))}
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
