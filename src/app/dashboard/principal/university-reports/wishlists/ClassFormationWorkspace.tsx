'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Users,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { WEEKDAY_PREFERENCE_OPTIONS, type WeekdayPreference } from '@/lib/university-confirmation/constants'
import type { WishlistCategory } from '@/lib/university-policy/yedae'
import type {
  ClassFormationBoard,
  ClassFormationPlan,
  FormationStudent,
  TeacherOption,
} from '@/types/class-formation'
import {
  assignStudentAction,
  createGroupAction,
  createPlanAction,
  deleteGroupAction,
  deletePlanAction,
  materializePlanAction,
  renamePlanAction,
  reorderGroupMembersAction,
  unassignStudentAction,
  updateGroupAction,
  type FormationActionResult,
} from '@/app/dashboard/principal/university-reports/wishlists/actions'
import {
  CATEGORY_LABELS,
  GroupCard,
  StudentPoolCard,
} from '@/app/dashboard/principal/university-reports/wishlists/formation-cards'
import {
  GroupFormDialog,
  PlanFormDialog,
  type GroupFormValues,
} from '@/app/dashboard/principal/university-reports/wishlists/formation-dialogs'

const BASE_PATH = '/dashboard/principal/university-reports/wishlists'

type WeekdayFilter = 'all' | WeekdayPreference
type CategoryFilter = 'all' | WishlistCategory

interface UniversityOption {
  key: string
  label: string
}

const DEFAULT_GROUP_VALUES: GroupFormValues = {
  name: '',
  weekday: null,
  homeroomTeacherId: null,
  note: null,
}

export default function ClassFormationWorkspace({
  plans,
  board,
  activePlanId,
  teacherOptions,
}: {
  plans: ClassFormationPlan[]
  board: ClassFormationBoard | null
  activePlanId: string | null
  teacherOptions: TeacherOption[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [planDialog, setPlanDialog] = useState<{ open: boolean; mode: 'create' | 'rename' }>({
    open: false,
    mode: 'create',
  })
  const [groupDialog, setGroupDialog] = useState<{
    open: boolean
    mode: 'create' | 'edit'
    editingId: string | null
  }>({ open: false, mode: 'create', editingId: null })

  const [weekdayFilter, setWeekdayFilter] = useState<WeekdayFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [classFilter, setClassFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [selectedUniversities, setSelectedUniversities] = useState<Set<string>>(new Set())

  const teacherNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const teacher of teacherOptions) {
      map.set(teacher.id, teacher.name ?? teacher.email ?? '이름 없음')
    }
    return map
  }, [teacherOptions])

  const run = (
    action: () => Promise<FormationActionResult>,
    onOk?: (result: Extract<FormationActionResult, { ok: true }>) => void
  ) => {
    startTransition(async () => {
      const result = await action()
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      if (result.message) {
        toast.success(result.message)
      }
      onOk?.(result)
      router.refresh()
    })
  }

  const goToPlan = (planId: string) => {
    router.push(`${BASE_PATH}?plan=${planId}`)
  }

  const handleCreatePlan = (name: string) => {
    run(
      () => createPlanAction({ name }),
      (result) => {
        setPlanDialog((prev) => ({ ...prev, open: false }))
        if (result.planId) goToPlan(result.planId)
        toast.success('반편성안을 만들었습니다.')
      }
    )
  }

  const handleRenamePlan = (name: string) => {
    if (!activePlanId) return
    run(
      () => renamePlanAction({ planId: activePlanId, name }),
      () => {
        setPlanDialog((prev) => ({ ...prev, open: false }))
        toast.success('이름을 수정했습니다.')
      }
    )
  }

  const handleDeletePlan = () => {
    if (!activePlanId) return
    if (!window.confirm('이 반편성안을 삭제할까요? 배치 내역이 모두 삭제됩니다. (반영된 실제 반은 유지됩니다.)')) {
      return
    }
    run(
      () => deletePlanAction(activePlanId),
      () => {
        toast.success('반편성안을 삭제했습니다.')
        const remaining = plans.filter((plan) => plan.id !== activePlanId)
        if (remaining.length > 0) {
          goToPlan(remaining[0].id)
        } else {
          router.push(BASE_PATH)
        }
      }
    )
  }

  const handleSubmitGroup = (values: GroupFormValues) => {
    if (!activePlanId) return
    if (groupDialog.mode === 'create') {
      run(
        () =>
          createGroupAction({
            planId: activePlanId,
            name: values.name,
            weekday: values.weekday,
            homeroomTeacherId: values.homeroomTeacherId,
            note: values.note ?? undefined,
          }),
        () => {
          setGroupDialog((prev) => ({ ...prev, open: false }))
          toast.success('반을 추가했습니다.')
        }
      )
    } else if (groupDialog.editingId) {
      run(
        () =>
          updateGroupAction({
            groupId: groupDialog.editingId as string,
            name: values.name,
            weekday: values.weekday,
            homeroomTeacherId: values.homeroomTeacherId,
            note: values.note ?? undefined,
          }),
        () => {
          setGroupDialog((prev) => ({ ...prev, open: false }))
          toast.success('반 정보를 수정했습니다.')
        }
      )
    }
  }

  const handleDeleteGroup = (groupId: string) => {
    if (!window.confirm('이 반을 삭제할까요? 배치된 학생은 미배정으로 돌아갑니다.')) return
    run(() => deleteGroupAction(groupId), () => toast.success('반을 삭제했습니다.'))
  }

  const handleAssign = (studentId: string, groupId: string) => {
    if (!activePlanId) return
    run(() => assignStudentAction({ planId: activePlanId, groupId, studentId }))
  }

  const handleUnassign = (studentId: string) => {
    if (!activePlanId) return
    run(() => unassignStudentAction({ planId: activePlanId, studentId }))
  }

  const handleReorderMembers = (groupId: string, orderedStudentIds: string[]) => {
    if (!activePlanId) return
    run(() => reorderGroupMembersAction({ planId: activePlanId, groupId, orderedStudentIds }))
  }

  const handleMaterialize = () => {
    if (!activePlanId) return
    if (
      !window.confirm(
        '현재 반편성안을 실제 반으로 반영할까요?\n학생이 배치된 각 반이 생성/갱신되고, 담임과 학생이 배정됩니다.'
      )
    ) {
      return
    }
    run(() => materializePlanAction(activePlanId))
  }

  // ── 파생 데이터 ────────────────────────────────────────────────────────────
  const students = board?.students ?? []
  const groups = board?.groups ?? []
  const assignments = board?.assignments ?? {}

  const studentsById = useMemo(() => {
    const map = new Map<string, FormationStudent>()
    for (const student of students) map.set(student.studentId, student)
    return map
  }, [students])

  const universityOptions = useMemo<UniversityOption[]>(() => {
    const map = new Map<string, string>()
    for (const student of students) {
      for (const u of student.universities) {
        const key = u.universityId ?? u.universityName
        if (!map.has(key)) map.set(key, u.shortName ?? u.universityName)
      }
    }
    return Array.from(map.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ko'))
  }, [students])

  const classOptions = useMemo(() => {
    const set = new Set<string>()
    for (const student of students) {
      if (student.className) set.add(student.className)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'))
  }, [students])

  const assignedCount = Object.keys(assignments).length
  const unassignedStudents = useMemo(
    () => students.filter((student) => !assignments[student.studentId]),
    [students, assignments]
  )

  const filteredPool = useMemo(() => {
    const term = search.trim().toLowerCase()
    return unassignedStudents
      .filter((student) => {
        if (weekdayFilter !== 'all' && !student.weekdayPreferences.includes(weekdayFilter)) {
          return false
        }
        if (categoryFilter !== 'all' && !student.universities.some((u) => u.category === categoryFilter)) {
          return false
        }
        if (classFilter !== 'all' && student.className !== classFilter) {
          return false
        }
        if (selectedUniversities.size > 0) {
          const match = student.universities.some((u) =>
            selectedUniversities.has(u.universityId ?? u.universityName)
          )
          if (!match) return false
        }
        if (term) {
          const haystack = [
            student.studentName,
            student.email,
            ...student.universities.map((u) => `${u.universityName} ${u.shortName ?? ''} ${u.programName}`),
          ]
            .join(' ')
            .toLowerCase()
          if (!haystack.includes(term)) return false
        }
        return true
      })
      .sort((a, b) => a.studentName.localeCompare(b.studentName, 'ko'))
  }, [unassignedStudents, weekdayFilter, categoryFilter, classFilter, selectedUniversities, search])

  const groupDialogInitial = useMemo<GroupFormValues>(() => {
    if (groupDialog.mode === 'edit' && groupDialog.editingId) {
      const group = groups.find((g) => g.id === groupDialog.editingId)
      if (group) {
        return {
          name: group.name,
          weekday: group.weekday,
          homeroomTeacherId: group.homeroomTeacherId,
          note: group.note,
        }
      }
    }
    return DEFAULT_GROUP_VALUES
  }, [groupDialog, groups])

  const activePlan = plans.find((plan) => plan.id === activePlanId) ?? null

  const hasActiveFilters =
    weekdayFilter !== 'all' ||
    categoryFilter !== 'all' ||
    classFilter !== 'all' ||
    search.trim() !== '' ||
    selectedUniversities.size > 0

  const resetFilters = () => {
    setWeekdayFilter('all')
    setCategoryFilter('all')
    setClassFilter('all')
    setSearch('')
    setSelectedUniversities(new Set())
  }

  const toggleUniversity = (key: string) => {
    setSelectedUniversities((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // ── 반편성안이 없을 때 ───────────────────────────────────────────────────────
  if (!board || !activePlan) {
    return (
      <>
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
            <Users className="size-10 text-slate-300" />
            <div className="space-y-1">
              <p className="text-base font-semibold text-slate-800">반편성안이 없습니다</p>
              <p className="text-sm text-slate-500">
                반편성안을 만들어 확정 완료 학생을 반에 배치하세요.
              </p>
            </div>
            <Button onClick={() => setPlanDialog({ open: true, mode: 'create' })} disabled={isPending}>
              <Plus className="size-4" /> 새 반편성안 만들기
            </Button>
          </CardContent>
        </Card>
        <PlanFormDialog
          open={planDialog.open}
          mode={planDialog.mode}
          initialName=""
          disabled={isPending}
          onOpenChange={(open) => setPlanDialog((prev) => ({ ...prev, open }))}
          onSubmit={handleCreatePlan}
        />
      </>
    )
  }

  return (
    <div className="space-y-4">
      {/* 상단 바: 반편성안 선택 + 액션 */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">반편성안</span>
          <Select value={activePlan.id} onValueChange={goToPlan}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {plans.map((plan) => (
                <SelectItem key={plan.id} value={plan.id}>
                  {plan.name}
                  {plan.status === 'finalized' ? ' (확정)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 px-2"
            onClick={() => setPlanDialog({ open: true, mode: 'rename' })}
            disabled={isPending}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 px-2 text-rose-600 hover:bg-rose-50"
            onClick={handleDeletePlan}
            disabled={isPending}
          >
            <Trash2 className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 gap-1"
            onClick={() => setPlanDialog({ open: true, mode: 'create' })}
            disabled={isPending}
          >
            <Plus className="size-3.5" /> 새 안
          </Button>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-slate-600">
            전체 {students.length}
          </Badge>
          <Badge className="bg-emerald-100 text-emerald-700">배치 {assignedCount}</Badge>
          <Badge className="bg-amber-100 text-amber-800">미배치 {students.length - assignedCount}</Badge>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={() => setGroupDialog({ open: true, mode: 'create', editingId: null })}
            disabled={isPending}
          >
            <Plus className="size-4" /> 반 추가
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-1 bg-emerald-600 hover:bg-emerald-700"
            onClick={handleMaterialize}
            disabled={isPending || groups.length === 0}
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            반 생성(확정)
          </Button>
        </div>
      </div>

      {/* 필터 바 */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3">
        <label className="relative flex items-center">
          <Search className="absolute left-2.5 size-4 text-slate-400" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="학생·대학 검색"
            className="w-48 pl-8"
          />
        </label>

        <Select value={weekdayFilter} onValueChange={(value) => setWeekdayFilter(value as WeekdayFilter)}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 요일</SelectItem>
            {WEEKDAY_PREFERENCE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={categoryFilter} onValueChange={(value) => setCategoryFilter(value as CategoryFilter)}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 계열</SelectItem>
            <SelectItem value="general">{CATEGORY_LABELS.general}</SelectItem>
            <SelectItem value="specialized">{CATEGORY_LABELS.specialized}</SelectItem>
            <SelectItem value="karts">{CATEGORY_LABELS.karts}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={classFilter} onValueChange={setClassFilter}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="all">전체 반</SelectItem>
            {classOptions.map((className) => (
              <SelectItem key={className} value={className}>
                {className}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="gap-1">
              지원 대학
              {selectedUniversities.size > 0 ? (
                <Badge className="ml-1 bg-sky-100 text-sky-700">{selectedUniversities.size}</Badge>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="max-h-80 w-64 overflow-y-auto p-2">
            {universityOptions.length === 0 ? (
              <p className="p-2 text-xs text-slate-400">지원 대학 데이터가 없습니다.</p>
            ) : (
              universityOptions.map((option) => (
                <label
                  key={option.key}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50"
                >
                  <Checkbox
                    checked={selectedUniversities.has(option.key)}
                    onChange={() => toggleUniversity(option.key)}
                  />
                  <span className="truncate text-slate-700">{option.label}</span>
                </label>
              ))
            )}
          </PopoverContent>
        </Popover>

        {hasActiveFilters ? (
          <Button type="button" variant="ghost" size="sm" className="gap-1 text-slate-500" onClick={resetFilters}>
            <RotateCcw className="size-3.5" /> 초기화
          </Button>
        ) : null}
      </div>

      {/* 본문: 미배정 풀 + 편성 반 보드 */}
      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold text-slate-700">미배정 학생</h2>
            <Badge variant="outline" className="text-slate-500">
              {filteredPool.length}/{unassignedStudents.length}
            </Badge>
          </div>
          <div className="space-y-2">
            {filteredPool.length === 0 ? (
              <Card className="border-dashed border-slate-200 shadow-none">
                <CardContent className="p-6 text-center text-xs text-slate-400">
                  {unassignedStudents.length === 0
                    ? '모든 학생이 반에 배치되었습니다.'
                    : '조건에 맞는 미배정 학생이 없습니다.'}
                </CardContent>
              </Card>
            ) : (
              filteredPool.map((student) => (
                <StudentPoolCard
                  key={student.studentId}
                  student={student}
                  groups={groups}
                  disabled={isPending}
                  onAssign={(groupId) => handleAssign(student.studentId, groupId)}
                />
              ))
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold text-slate-700">편성 반 ({groups.length})</h2>
          </div>
          {groups.length === 0 ? (
            <Card className="border-dashed border-slate-200 shadow-none">
              <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
                <p className="text-sm text-slate-500">아직 편성된 반이 없습니다.</p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setGroupDialog({ open: true, mode: 'create', editingId: null })}
                  disabled={isPending}
                >
                  <Plus className="size-4" /> 첫 반 추가
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {groups.map((group) => (
                <GroupCard
                  key={group.id}
                  group={group}
                  members={group.memberIds
                    .map((id) => studentsById.get(id))
                    .filter((member): member is FormationStudent => Boolean(member))}
                  allGroups={groups}
                  teacherName={group.homeroomTeacherId ? teacherNameById.get(group.homeroomTeacherId) ?? null : null}
                  disabled={isPending}
                  onEdit={() => setGroupDialog({ open: true, mode: 'edit', editingId: group.id })}
                  onDelete={() => handleDeleteGroup(group.id)}
                  onMoveStudent={(studentId, targetGroupId) => handleAssign(studentId, targetGroupId)}
                  onRemoveStudent={(studentId) => handleUnassign(studentId)}
                  onReorderMembers={(orderedStudentIds) => handleReorderMembers(group.id, orderedStudentIds)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <PlanFormDialog
        open={planDialog.open}
        mode={planDialog.mode}
        initialName={planDialog.mode === 'rename' ? activePlan.name : ''}
        disabled={isPending}
        onOpenChange={(open) => setPlanDialog((prev) => ({ ...prev, open }))}
        onSubmit={planDialog.mode === 'create' ? handleCreatePlan : handleRenamePlan}
      />

      <GroupFormDialog
        open={groupDialog.open}
        mode={groupDialog.mode}
        initialValues={groupDialogInitial}
        teacherOptions={teacherOptions}
        disabled={isPending}
        onOpenChange={(open) => setGroupDialog((prev) => ({ ...prev, open }))}
        onSubmit={handleSubmitGroup}
      />
    </div>
  )
}
