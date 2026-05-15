'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Pencil, Trash2 } from 'lucide-react'

import {
  deleteCourses,
  updateCourses,
} from '@/app/dashboard/student/university-report/actions'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import type { CourseRow } from '@/lib/university-report/data'
import {
  ACHIEVEMENTS,
  COURSE_TYPES,
  SUBJECT_AREAS,
  type Achievement,
  type CourseType,
  type SubjectArea,
} from '@/lib/university-report/types'

const ACHIEVEMENT_NONE = '__none__'

export interface SubjectRowSnapshot {
  grade: number
  subjectArea: string
  rawSubjectName: string
  courseType: string
  isPassFail: boolean
  firstSemester: CourseRow | null
  secondSemester: CourseRow | null
}

interface CourseRowEditorProps {
  studentId: string
  subjectRow: SubjectRowSnapshot
}

interface SemesterFormState {
  credits: string
  rank: string
  achievement: string
  rawScore: string
  subjectMean: string
  stdDev: string
  studentCount: string
}

function toSemesterForm(course: CourseRow | null): SemesterFormState {
  return {
    credits: course?.credits != null ? String(course.credits) : '',
    rank: course?.rank != null ? String(course.rank) : '',
    achievement: course?.achievement ?? ACHIEVEMENT_NONE,
    rawScore: course?.rawScore != null ? String(course.rawScore) : '',
    subjectMean: course?.subjectMean != null ? String(course.subjectMean) : '',
    stdDev: course?.stdDev != null ? String(course.stdDev) : '',
    studentCount: course?.studentCount != null ? String(course.studentCount) : '',
  }
}

function parseSemesterForm(state: SemesterFormState) {
  const parseNum = (v: string) => {
    const trimmed = v.trim()
    if (!trimmed) return null
    const n = Number(trimmed)
    return Number.isFinite(n) ? n : null
  }
  const parseInteger = (v: string) => {
    const n = parseNum(v)
    return n == null ? null : Math.round(n)
  }
  return {
    credits: parseNum(state.credits),
    rank: parseInteger(state.rank),
    achievement:
      state.achievement === ACHIEVEMENT_NONE
        ? null
        : (state.achievement as Achievement),
    rawScore: parseNum(state.rawScore),
    subjectMean: parseNum(state.subjectMean),
    stdDev: parseNum(state.stdDev),
    studentCount: parseInteger(state.studentCount),
  }
}

export default function CourseRowEditor({
  studentId,
  subjectRow,
}: CourseRowEditorProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [rawSubjectName, setRawSubjectName] = useState(subjectRow.rawSubjectName)
  const [subjectArea, setSubjectArea] = useState<SubjectArea>(
    subjectRow.subjectArea as SubjectArea
  )
  const [courseType, setCourseType] = useState<CourseType>(
    subjectRow.courseType as CourseType
  )
  const [isPassFail, setIsPassFail] = useState(subjectRow.isPassFail)
  const [sem1, setSem1] = useState<SemesterFormState>(toSemesterForm(subjectRow.firstSemester))
  const [sem2, setSem2] = useState<SemesterFormState>(toSemesterForm(subjectRow.secondSemester))

  const resetForm = () => {
    setRawSubjectName(subjectRow.rawSubjectName)
    setSubjectArea(subjectRow.subjectArea as SubjectArea)
    setCourseType(subjectRow.courseType as CourseType)
    setIsPassFail(subjectRow.isPassFail)
    setSem1(toSemesterForm(subjectRow.firstSemester))
    setSem2(toSemesterForm(subjectRow.secondSemester))
    setError(null)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      resetForm()
    }
    setOpen(next)
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)

    const courses: Array<Record<string, unknown>> = []
    if (subjectRow.firstSemester) {
      const semFields = parseSemesterForm(sem1)
      if (semFields.rank != null && (semFields.rank < 1 || semFields.rank > 9)) {
        setError('1학기 석차등급은 1~9 사이여야 합니다.')
        setSaving(false)
        return
      }
      courses.push({
        id: subjectRow.firstSemester.id,
        rawSubjectName,
        subjectArea,
        courseType,
        isPassFail,
        ...semFields,
      })
    }
    if (subjectRow.secondSemester) {
      const semFields = parseSemesterForm(sem2)
      if (semFields.rank != null && (semFields.rank < 1 || semFields.rank > 9)) {
        setError('2학기 석차등급은 1~9 사이여야 합니다.')
        setSaving(false)
        return
      }
      courses.push({
        id: subjectRow.secondSemester.id,
        rawSubjectName,
        subjectArea,
        courseType,
        isPassFail,
        ...semFields,
      })
    }

    if (courses.length === 0) {
      setError('수정할 데이터가 없습니다.')
      setSaving(false)
      return
    }

    const result = await updateCourses({ studentId, courses })
    if ('error' in result) {
      setError(result.error)
      setSaving(false)
      return
    }

    setSaving(false)
    setOpen(false)
    router.refresh()
  }

  const handleDelete = async () => {
    if (!confirm(`${rawSubjectName} 과목을 삭제하시겠습니까?`)) return
    setSaving(true)
    setError(null)

    const ids = [subjectRow.firstSemester?.id, subjectRow.secondSemester?.id].filter(
      (v): v is string => typeof v === 'string'
    )

    if (ids.length === 0) {
      setError('삭제할 데이터가 없습니다.')
      setSaving(false)
      return
    }

    const result = await deleteCourses({ studentId, courseIds: ids })
    if ('error' in result) {
      setError(result.error)
      setSaving(false)
      return
    }

    setSaving(false)
    setOpen(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="size-7 p-0 text-slate-500 hover:text-slate-900"
          aria-label="과목 수정"
        >
          <Pencil className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {subjectRow.grade}학년 · {subjectRow.rawSubjectName} 수정
          </DialogTitle>
          <DialogDescription>
            저장 시 두 학기 데이터에 공통 필드가 함께 적용되고, 학기별 필드는 따로 저장됩니다. 수정한 행은 표에서 빨간색으로 표시됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <section className="space-y-3">
            <h4 className="text-sm font-semibold text-slate-800">공통</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="과목명">
                <Input
                  value={rawSubjectName}
                  onChange={(e) => setRawSubjectName(e.target.value)}
                  maxLength={120}
                />
              </Field>
              <Field label="교과">
                <Select
                  value={subjectArea}
                  onValueChange={(v) => setSubjectArea(v as SubjectArea)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUBJECT_AREAS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="구분">
                <Select value={courseType} onValueChange={(v) => setCourseType(v as CourseType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COURSE_TYPES.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="P/F (이수 평가)">
                <div className="flex items-center gap-2 pt-1">
                  <Checkbox
                    id={`passfail-${subjectRow.firstSemester?.id ?? subjectRow.secondSemester?.id}`}
                    checked={isPassFail}
                    onChange={(e) => setIsPassFail(e.target.checked)}
                  />
                  <label
                    htmlFor={`passfail-${subjectRow.firstSemester?.id ?? subjectRow.secondSemester?.id}`}
                    className="text-xs text-slate-600"
                  >
                    P/F 또는 우수/보통/미흡 과목
                  </label>
                </div>
              </Field>
            </div>
          </section>

          {subjectRow.firstSemester ? (
            <SemesterFieldset
              label="1학기"
              state={sem1}
              onChange={setSem1}
              isPassFail={isPassFail}
            />
          ) : (
            <EmptySemesterNote label="1학기" />
          )}

          {subjectRow.secondSemester ? (
            <SemesterFieldset
              label="2학기"
              state={sem2}
              onChange={setSem2}
              isPassFail={isPassFail}
            />
          ) : (
            <EmptySemesterNote label="2학기" />
          )}

          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          ) : null}
        </div>

        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="outline"
            className="text-red-600 hover:text-red-700"
            onClick={handleDelete}
            disabled={saving}
          >
            <Trash2 className="mr-1 size-3.5" /> 행 삭제
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={saving}
            >
              취소
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
              저장
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium text-slate-600">{label}</Label>
      {children}
    </div>
  )
}

function EmptySemesterNote({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
      {label} 데이터가 없습니다. 이 학기 데이터를 추가하려면 새 PDF로 재업로드해 주세요.
    </div>
  )
}

function SemesterFieldset({
  label,
  state,
  onChange,
  isPassFail,
}: {
  label: string
  state: SemesterFormState
  onChange: (next: SemesterFormState) => void
  isPassFail: boolean
}) {
  const update = (patch: Partial<SemesterFormState>) => onChange({ ...state, ...patch })

  return (
    <section className="space-y-3 rounded-md border border-slate-200 p-3">
      <h4 className="text-sm font-semibold text-slate-800">{label}</h4>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="이수단위">
          <Input
            inputMode="decimal"
            value={state.credits}
            onChange={(e) => update({ credits: e.target.value })}
            placeholder="예: 4"
          />
        </Field>
        <Field label="원점수">
          <Input
            inputMode="decimal"
            value={state.rawScore}
            onChange={(e) => update({ rawScore: e.target.value })}
            placeholder="예: 95"
          />
        </Field>
        <Field label="과목 평균">
          <Input
            inputMode="decimal"
            value={state.subjectMean}
            onChange={(e) => update({ subjectMean: e.target.value })}
            placeholder="예: 67.5"
          />
        </Field>
        <Field label="표준편차">
          <Input
            inputMode="decimal"
            value={state.stdDev}
            onChange={(e) => update({ stdDev: e.target.value })}
            placeholder="예: 18.2"
          />
        </Field>
        <Field label={isPassFail ? '석차등급 (해당 없음 가능)' : '석차등급 (1~9)'}>
          <Input
            inputMode="numeric"
            value={state.rank}
            onChange={(e) => update({ rank: e.target.value })}
            placeholder="예: 2"
          />
        </Field>
        <Field label="성취도">
          <Select
            value={state.achievement}
            onValueChange={(v) => update({ achievement: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ACHIEVEMENT_NONE}>없음</SelectItem>
              {ACHIEVEMENTS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="수강자수">
          <Input
            inputMode="numeric"
            value={state.studentCount}
            onChange={(e) => update({ studentCount: e.target.value })}
            placeholder="예: 303"
          />
        </Field>
      </div>
    </section>
  )
}
