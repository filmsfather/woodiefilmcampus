'use client'

import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  SPECIAL_LECTURE_AUDIENCE_LABELS,
  SPECIAL_LECTURE_AUDIENCE_MODES,
  type SpecialLectureAudienceMode,
} from '@/lib/special-lectures-shared'

export interface AudienceClassOption {
  id: string
  name: string
  studentCount: number
}

export interface AudienceStudentOption {
  id: string
  name: string | null
  email: string | null
  classNames?: string[]
}

interface AudienceSelectorProps {
  classes: AudienceClassOption[]
  students: AudienceStudentOption[]
  defaultMode?: SpecialLectureAudienceMode
  defaultClassIds?: string[]
  defaultStudentIds?: string[]
  disabled?: boolean
}

function studentDisplayName(student: AudienceStudentOption) {
  return student.name ?? student.email ?? '이름 없음'
}

export function AudienceSelector({
  classes,
  students,
  defaultMode = 'class',
  defaultClassIds = [],
  defaultStudentIds = [],
  disabled = false,
}: AudienceSelectorProps) {
  const [mode, setMode] = useState<SpecialLectureAudienceMode>(defaultMode)
  const [studentSearch, setStudentSearch] = useState('')
  const [selectedClasses, setSelectedClasses] = useState<Set<string>>(new Set(defaultClassIds))
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set(defaultStudentIds))

  const sortedClasses = useMemo(() => {
    return [...classes].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }, [classes])

  const filteredStudents = useMemo(() => {
    const keyword = studentSearch.trim().toLowerCase()
    const list = [...students].sort((a, b) =>
      studentDisplayName(a).localeCompare(studentDisplayName(b), 'ko')
    )
    if (!keyword) return list
    return list.filter((student) => {
      const haystack = [
        student.name ?? '',
        student.email ?? '',
        ...(student.classNames ?? []),
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(keyword)
    })
  }, [students, studentSearch])

  const toggleClass = (id: string) => {
    if (disabled) return
    setSelectedClasses((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleStudent = (id: string) => {
    if (disabled) return
    setSelectedStudents((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const showClassSection = mode === 'class' || mode === 'student'
  const showStudentSection = mode === 'class' || mode === 'student'

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>공개 대상</Label>
        <div className="grid gap-2 sm:grid-cols-3">
          {SPECIAL_LECTURE_AUDIENCE_MODES.map((value) => (
            <label
              key={value}
              className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition ${
                mode === value
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'
              } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              <input
                type="radio"
                name="audience_mode"
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
                disabled={disabled}
                className="sr-only"
              />
              <span className="font-medium">
                {SPECIAL_LECTURE_AUDIENCE_LABELS[value]}
              </span>
            </label>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          전체 학생: 모든 학생에게 공개 / 특정 반: 선택한 반의 학생에게 공개 / 특정 학생: 선택한 학생에게 공개. 반과 학생을 함께 선택하면 두 그룹 모두 시청할 수 있습니다.
        </p>
      </div>

      {showClassSection ? (
        <div className="space-y-2">
          <Label>허용할 반</Label>
          <div className="rounded-md border border-slate-200 p-3 shadow-inner">
            {sortedClasses.length === 0 ? (
              <p className="text-xs text-slate-400">등록된 반이 없습니다.</p>
            ) : (
              <div className="grid max-h-56 gap-2 overflow-y-auto pr-1 text-sm">
                {sortedClasses.map((klass) => (
                  <label key={klass.id} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        name="classIds"
                        value={klass.id}
                        checked={selectedClasses.has(klass.id)}
                        onChange={() => toggleClass(klass.id)}
                        disabled={disabled}
                        className="size-4 rounded border-slate-300 text-slate-600 focus:ring-slate-400"
                      />
                      <span>{klass.name}</span>
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      학생 {klass.studentCount}명
                    </Badge>
                  </label>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs text-slate-400">
            선택한 반에 속한 학생들은 자동으로 시청 권한을 가집니다.
          </p>
        </div>
      ) : null}

      {showStudentSection ? (
        <div className="space-y-2">
          <Label>개별 허용 학생</Label>
          <Input
            placeholder="학생 이름·이메일로 검색"
            value={studentSearch}
            onChange={(event) => setStudentSearch(event.target.value)}
            disabled={disabled}
          />
          <div className="rounded-md border border-slate-200 p-3 shadow-inner">
            {filteredStudents.length === 0 ? (
              <p className="text-xs text-slate-400">
                {students.length === 0 ? '등록된 학생이 없습니다.' : '검색 결과가 없습니다.'}
              </p>
            ) : (
              <div className="grid max-h-56 gap-2 overflow-y-auto pr-1 text-sm">
                {filteredStudents.map((student) => (
                  <label key={student.id} className="flex items-start justify-between gap-2">
                    <span className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        name="studentIds"
                        value={student.id}
                        checked={selectedStudents.has(student.id)}
                        onChange={() => toggleStudent(student.id)}
                        disabled={disabled}
                        className="mt-0.5 size-4 rounded border-slate-300 text-slate-600 focus:ring-slate-400"
                      />
                      <span className="flex flex-col">
                        <span>{studentDisplayName(student)}</span>
                        {student.classNames && student.classNames.length > 0 ? (
                          <span className="text-xs text-slate-400">
                            {student.classNames.join(', ')}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs text-slate-400">
            반과 무관하게 추가 시청 권한을 부여하려는 학생을 선택하세요.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 text-xs text-slate-500">
        <Badge variant="outline" className="border-slate-300 text-slate-600">
          모드: {SPECIAL_LECTURE_AUDIENCE_LABELS[mode]}
        </Badge>
        {showClassSection ? (
          <Badge variant="outline" className="border-slate-300 text-slate-600">
            반 {selectedClasses.size}개
          </Badge>
        ) : null}
        {showStudentSection ? (
          <Badge variant="outline" className="border-slate-300 text-slate-600">
            학생 {selectedStudents.size}명
          </Badge>
        ) : null}
      </div>
    </div>
  )
}
