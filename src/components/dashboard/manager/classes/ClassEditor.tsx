'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'

import { createClassAction, updateClassAction } from '@/app/dashboard/manager/classes/actions'
import { initialActionState } from '@/app/dashboard/manager/classes/action-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ClassSummary, ProfileOption } from '@/types/class'

type EditorMode = 'create' | 'edit'

interface ClassEditorProps {
  mode: EditorMode
  classData?: ClassSummary
  teacherOptions: ProfileOption[]
  studentOptions: ProfileOption[]
  onCancel: () => void
  onCompleted: (message: string) => void
}

function displayName(profile: ProfileOption) {
  return profile.name ?? profile.email ?? '이름 없음'
}

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages || messages.length === 0) {
    return null
  }

  return (
    <p className="mt-1 text-sm text-destructive">{messages[0]}</p>
  )
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" disabled={pending}>
      {pending ? '처리 중...' : label}
    </Button>
  )
}

export function ClassEditor({
  mode,
  classData,
  teacherOptions,
  studentOptions,
  onCancel,
  onCompleted,
}: ClassEditorProps) {
  const action = mode === 'create' ? createClassAction : updateClassAction
  const [state, formAction] = useFormState(action, initialActionState)
  const formRef = useRef<HTMLFormElement>(null)
  const [localError, setLocalError] = useState<string | null>(null)

  const defaultTeacherIds = useMemo(() => {
    if (mode === 'edit' && classData) {
      return classData.teachers.map((teacher) => teacher.id)
    }

    return [] as string[]
  }, [mode, classData])

  const defaultStudentIds = useMemo(() => {
    if (mode === 'edit' && classData) {
      return classData.students.map((student) => student.id)
    }

    return [] as string[]
  }, [mode, classData])

  const defaultHomeroom = mode === 'edit' && classData ? classData.homeroomTeacherId ?? '' : ''

  useEffect(() => {
    if (state.status === 'success') {
      onCompleted(state.message ?? '저장되었습니다.')
      formRef.current?.reset()
    } else if (state.status === 'error') {
      setLocalError(state.message ?? null)
    } else {
      setLocalError(null)
    }
  }, [state, onCompleted])

  const title = mode === 'create' ? '새 반 만들기' : '반 정보 수정'
  const submitLabel = mode === 'create' ? '반 생성' : '변경 사항 저장'

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500">
          담임을 포함한 담당 교사와 학생 배정을 설정하세요. 담임으로 지정된 교사는 자동으로 담당 교사 목록에도 포함됩니다.
        </p>
      </div>

      {localError && (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {localError}
        </div>
      )}

      <form
        ref={formRef}
        action={formAction}
        key={mode === 'edit' ? classData?.id ?? 'edit' : 'create'}
        className="space-y-6"
      >
        {mode === 'edit' && classData && (
          <input type="hidden" name="classId" value={classData.id} />
        )}

        <div className="space-y-2">
          <Label htmlFor="class-name">반 이름</Label>
          <Input
            id="class-name"
            name="name"
            defaultValue={mode === 'edit' ? classData?.name ?? '' : ''}
            placeholder="예) 2024 영화 연출 A반"
            required
          />
          <FieldError messages={state.fieldErrors?.name} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="class-description">설명</Label>
          <textarea
            id="class-description"
            name="description"
            defaultValue={mode === 'edit' ? classData?.description ?? '' : ''}
            placeholder="반에 대한 간단한 설명을 입력하세요."
            className="min-h-[96px] w-full rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
          />
          <FieldError messages={state.fieldErrors?.description} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="class-homeroom">담임 교사</Label>
          <select
            id="class-homeroom"
            name="homeroomTeacherId"
            defaultValue={defaultHomeroom}
            required
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
          >
            <option value="" disabled>
              담임 교사를 선택하세요
            </option>
            {teacherOptions.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {displayName(teacher)}
              </option>
            ))}
          </select>
          <FieldError messages={state.fieldErrors?.homeroomTeacherId} />
        </div>

        <div className="space-y-2">
          <Label>담당 교사</Label>
          <div className="rounded-md border border-slate-200 p-3 shadow-inner">
            <p className="mb-2 text-xs text-slate-500">
              복수 선택이 가능합니다. 담임 교사는 자동으로 포함됩니다.
            </p>
            <div className="grid max-h-48 gap-2 overflow-y-auto pr-1 text-sm">
              {teacherOptions.map((teacher) => (
                <label key={teacher.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="teacherIds"
                    value={teacher.id}
                    defaultChecked={defaultTeacherIds.includes(teacher.id)}
                    className="size-4 rounded border-slate-300 text-slate-600 focus:ring-slate-400"
                  />
                  <span>{displayName(teacher)}</span>
                </label>
              ))}
            </div>
          </div>
          <FieldError messages={state.fieldErrors?.teacherIds} />
        </div>

        <div className="space-y-2">
          <Label>학생 배정</Label>
          <div className="rounded-md border border-slate-200 p-3 shadow-inner">
            <p className="mb-2 text-xs text-slate-500">필요한 학생을 선택하세요. 선택하지 않으면 빈 반으로 생성됩니다.</p>
            <div className="grid max-h-48 gap-2 overflow-y-auto pr-1 text-sm">
              {studentOptions.map((student) => (
                <label key={student.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="studentIds"
                    value={student.id}
                    defaultChecked={defaultStudentIds.includes(student.id)}
                    className="size-4 rounded border-slate-300 text-slate-600 focus:ring-slate-400"
                  />
                  <span>{displayName(student)}</span>
                </label>
              ))}
            </div>
          </div>
          <FieldError messages={state.fieldErrors?.studentIds} />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            취소
          </Button>
          <SubmitButton label={submitLabel} />
        </div>
      </form>
    </div>
  )
}
