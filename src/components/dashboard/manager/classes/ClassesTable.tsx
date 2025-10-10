'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { ClassSummary } from '@/types/class'

interface ClassesTableProps {
  classes: ClassSummary[]
  onEdit: (classId: string) => void
  onDelete: (classId: string, className: string) => void
  deletingId?: string | null
}

function displayName(name: string | null, fallback: string | null) {
  return name ?? fallback ?? '이름 없음'
}

function summarizeDescription(description: string, limit = 10) {
  return description.length <= limit ? description : `${description.slice(0, limit)}...`
}

export function ClassesTable({ classes, onEdit, onDelete, deletingId }: ClassesTableProps) {
  if (classes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
        검색 조건에 맞는 반이 없습니다. 새 반을 생성해 보세요.
      </div>
    )
  }

  return (
    <Table className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <TableHeader>
        <TableRow className="bg-slate-50">
          <TableHead>반 이름</TableHead>
          <TableHead>담임</TableHead>
          <TableHead>담당 교사</TableHead>
          <TableHead>학생 (최대 5명)</TableHead>
          <TableHead className="text-right">관리</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {classes.map((classItem) => {
          const homeroom = classItem.teachers.find((teacher) => teacher.isHomeroom)
          const studentPreview = classItem.students.slice(0, 5)
          const remainingStudents = Math.max(classItem.students.length - studentPreview.length, 0)
          const teacherPreview = classItem.teachers
            .slice()
            .sort((a, b) => Number(b.isHomeroom) - Number(a.isHomeroom))
            .map((teacher) => (
              <Badge
                key={teacher.id}
                variant={teacher.isHomeroom ? 'secondary' : 'outline'}
                className="mr-1 mb-1 inline-flex"
              >
                {displayName(teacher.name, teacher.email)}
              </Badge>
            ))

          if (teacherPreview.length === 0) {
            teacherPreview.push(
              <span key="empty" className="text-slate-400">
                담당 교사 없음
              </span>
            )
          }

          return (
            <TableRow key={classItem.id}>
              <TableCell className="align-top">
                <div className="font-medium text-slate-900">{classItem.name}</div>
                {classItem.description && (
                  <div className="mt-1 text-xs text-slate-500">
                    {summarizeDescription(classItem.description)}
                  </div>
                )}
              </TableCell>
              <TableCell className="align-top">
                {homeroom ? (
                  <div className="text-slate-900">
                    {displayName(homeroom.name, homeroom.email)}
                  </div>
                ) : (
                  <span className="text-slate-400">미지정</span>
                )}
              </TableCell>
              <TableCell className="align-top">
                <div className="flex flex-wrap gap-1">{teacherPreview}</div>
              </TableCell>
              <TableCell className="align-top">
                {studentPreview.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {studentPreview.map((student) => (
                      <Badge key={student.id} variant="outline" className="mr-1 mb-1">
                        {displayName(student.name, student.email)}
                      </Badge>
                    ))}
                    {remainingStudents > 0 && (
                      <Badge variant="secondary" className="mr-1 mb-1">
                        +{remainingStudents}
                      </Badge>
                    )}
                  </div>
                ) : (
                  <span className="text-slate-400">학생 배정 없음</span>
                )}
              </TableCell>
              <TableCell className="align-top text-right">
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => onEdit(classItem.id)}>
                    수정
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => onDelete(classItem.id, classItem.name)}
                    disabled={deletingId === classItem.id}
                  >
                    {deletingId === classItem.id ? '삭제 중...' : '삭제'}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
      <TableCaption>반 이름을 눌러 상세 내용을 확인하고 편집하세요.</TableCaption>
    </Table>
  )
}
