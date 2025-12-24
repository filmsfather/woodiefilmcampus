'use client'

import { useRouter } from 'next/navigation'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface StudentEntry {
  id: string
  studentId: string
  studentName: string
}

interface ClassOption {
  periodId: string
  classId: string
  className: string
  firstEntryId: string | null
}

interface StudentSelectorProps {
  currentEntryId: string
  entries: StudentEntry[]
  availableClasses?: ClassOption[]
  currentClassId?: string
}

export function StudentSelector({
  currentEntryId,
  entries,
  availableClasses,
  currentClassId,
}: StudentSelectorProps) {
  const router = useRouter()

  const handleStudentNavigate = (entryId: string) => {
    router.push(`/dashboard/teacher/learning-journal/entries/${entryId}`)
  }

  const handleClassNavigate = (classId: string) => {
    const selectedClass = availableClasses?.find((c) => c.classId === classId)
    if (selectedClass?.firstEntryId) {
      router.push(`/dashboard/teacher/learning-journal/entries/${selectedClass.firstEntryId}`)
    }
  }

  const currentEntry = entries.find((e) => e.id === currentEntryId)
  const currentClass = availableClasses?.find((c) => c.classId === currentClassId)
  const showClassSelector = availableClasses && availableClasses.length > 1 && currentClassId

  if (entries.length <= 1 && !showClassSelector) {
    // 학생이 1명이고 반도 1개면 드롭다운 없이 이름만 표시
    return (
      <h1 className="text-2xl font-semibold text-slate-900">
        {currentEntry?.studentName ?? '학생'}
      </h1>
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        {/* 반 선택 드롭다운 */}
        {showClassSelector ? (
          <Select value={currentClassId} onValueChange={handleClassNavigate}>
            <SelectTrigger className="h-auto w-auto gap-1 border-none bg-transparent p-0 text-2xl font-semibold text-slate-900 shadow-none hover:text-slate-700 focus:ring-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start">
              {availableClasses.map((cls) => (
                <SelectItem key={cls.classId} value={cls.classId}>
                  {cls.className}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : currentClass ? (
          <span className="text-2xl font-semibold text-slate-900">{currentClass.className}</span>
        ) : null}

        {/* 구분자 */}
        {(showClassSelector || currentClass) && entries.length > 0 ? (
          <span className="text-2xl font-light text-slate-300">/</span>
        ) : null}

        {/* 학생 선택 드롭다운 */}
        {entries.length > 1 ? (
          <Select value={currentEntryId} onValueChange={handleStudentNavigate}>
            <SelectTrigger className="h-auto w-auto gap-1 border-none bg-transparent p-0 text-2xl font-semibold text-slate-900 shadow-none hover:text-slate-700 focus:ring-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start">
              {entries.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {entry.studentName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-2xl font-semibold text-slate-900">
            {currentEntry?.studentName ?? '학생'}
          </span>
        )}
      </div>
      <p className="text-xs text-slate-400">
        {showClassSelector && entries.length > 1
          ? '▼ 눌러서 반 또는 학생 선택'
          : showClassSelector
            ? '▼ 눌러서 반 선택'
            : '▼ 눌러서 학생 선택'}
      </p>
    </div>
  )
}

