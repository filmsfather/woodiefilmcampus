'use client'

import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  WEEKDAY_PREFERENCE_OPTIONS,
  type WeekdayPreference,
} from '@/lib/university-confirmation/constants'
import type { TeacherOption } from '@/types/class-formation'

const WEEKDAY_NONE = 'none'
const TEACHER_NONE = 'none'

export interface GroupFormValues {
  name: string
  weekday: WeekdayPreference | null
  homeroomTeacherId: string | null
  note: string | null
}

export function PlanFormDialog({
  open,
  mode,
  initialName,
  disabled,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  mode: 'create' | 'rename'
  initialName: string
  disabled: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (name: string) => void
}) {
  const [name, setName] = useState(initialName)

  useEffect(() => {
    if (open) setName(initialName)
  }, [open, initialName])

  const handleSubmit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onSubmit(trimmed)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? '새 반편성안' : '반편성안 이름 수정'}</DialogTitle>
          <DialogDescription>
            반편성안은 편성 초안 세션입니다. 여러 안을 만들어 비교할 수 있습니다.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="plan-name">이름</Label>
          <Input
            id="plan-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 2026 수시 반편성"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit()
            }}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={disabled || !name.trim()}>
            {mode === 'create' ? '생성' : '저장'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function GroupFormDialog({
  open,
  mode,
  initialValues,
  teacherOptions,
  disabled,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  mode: 'create' | 'edit'
  initialValues: GroupFormValues
  teacherOptions: TeacherOption[]
  disabled: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: GroupFormValues) => void
}) {
  const [name, setName] = useState(initialValues.name)
  const [weekday, setWeekday] = useState<string>(initialValues.weekday ?? WEEKDAY_NONE)
  const [homeroom, setHomeroom] = useState<string>(initialValues.homeroomTeacherId ?? TEACHER_NONE)
  const [note, setNote] = useState(initialValues.note ?? '')

  useEffect(() => {
    if (open) {
      setName(initialValues.name)
      setWeekday(initialValues.weekday ?? WEEKDAY_NONE)
      setHomeroom(initialValues.homeroomTeacherId ?? TEACHER_NONE)
      setNote(initialValues.note ?? '')
    }
  }, [open, initialValues])

  const handleSubmit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onSubmit({
      name: trimmed,
      weekday: weekday === WEEKDAY_NONE ? null : (weekday as WeekdayPreference),
      homeroomTeacherId: homeroom === TEACHER_NONE ? null : homeroom,
      note: note.trim() ? note.trim() : null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? '반 추가' : '반 정보 수정'}</DialogTitle>
          <DialogDescription>
            반 이름과 수업 요일, 담임을 지정합니다. 확정하면 실제 반으로 반영됩니다.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="group-name">반 이름</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 평일 A반"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>수업 요일</Label>
              <Select value={weekday} onValueChange={setWeekday}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={WEEKDAY_NONE}>미지정</SelectItem>
                  {WEEKDAY_PREFERENCE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>담임</Label>
              <Select value={homeroom} onValueChange={setHomeroom}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value={TEACHER_NONE}>미지정</SelectItem>
                  {teacherOptions.map((teacher) => (
                    <SelectItem key={teacher.id} value={teacher.id}>
                      {teacher.name ?? teacher.email ?? '이름 없음'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="group-note">메모 (선택)</Label>
            <Textarea
              id="group-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="편성 기준 등 메모"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={disabled || !name.trim()}>
            {mode === 'create' ? '추가' : '저장'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
