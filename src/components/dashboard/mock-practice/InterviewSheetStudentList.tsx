'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import DateUtil from '@/lib/date-util'
import type { InterviewSheetStudentRow } from '@/types/interview-sheet'

const ALL_CLASSES = 'all'

function formatDate(value: string) {
  return DateUtil.formatForDisplay(value, {
    locale: 'ko-KR',
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function InterviewSheetStudentList({ rows }: { rows: InterviewSheetStudentRow[] }) {
  const [selectedClassId, setSelectedClassId] = useState(ALL_CLASSES)

  const classOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const row of rows) {
      for (const classInfo of row.classes) {
        map.set(classInfo.id, classInfo.name)
      }
    }
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name, 'ko')
    )
  }, [rows])

  const filteredRows = useMemo(() => {
    if (selectedClassId === ALL_CLASSES) {
      return rows
    }
    return rows.filter((row) => row.classes.some((classInfo) => classInfo.id === selectedClassId))
  }, [rows, selectedClassId])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Select value={selectedClassId} onValueChange={setSelectedClassId}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="반 선택" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CLASSES}>전체 반</SelectItem>
            {classOptions.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-slate-500">학생 {filteredRows.length}명</p>
      </div>

      {filteredRows.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
          {rows.length === 0 ? '담당 반에 학생이 없습니다.' : '선택한 반에 학생이 없습니다.'}
        </p>
      ) : (
        filteredRows.map((row) => (
          <Link
            key={row.studentId}
            href={`/dashboard/teacher/mock-practice/interview-sheet/${row.studentId}`}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-4 transition hover:border-primary hover:bg-primary/5"
          >
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-slate-900">{row.studentName}</p>
                {row.sheetId ? (
                  <Badge variant="outline" className="border-emerald-300 text-emerald-700">
                    면접지 있음
                  </Badge>
                ) : (
                  <Badge variant="secondary">시작 전</Badge>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {row.classes.map((classInfo) => classInfo.name).join(', ')}
                {row.updatedAt ? ` · 마지막 수정 ${formatDate(row.updatedAt)}` : ''}
              </p>
            </div>
            <p className="text-sm text-slate-600">
              답변{' '}
              <span className="font-semibold text-slate-900">
                {row.answeredCount}/{row.itemCount}
              </span>
            </p>
          </Link>
        ))
      )}
    </div>
  )
}
