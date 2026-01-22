'use client'
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Filter, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface SharedPhotoEntry {
  id: string
  assetId: string
  url: string
  createdAt: string
  studentId: string
  studentName: string
  classId: string | null
  className: string | null
  subject: string | null
}

interface FilterOptions {
  classes: Array<{ id: string; name: string }>
  students: Array<{ id: string; name: string }>
  subjects: string[]
}

interface SharedPhotoDiaryGridProps {
  photos: SharedPhotoEntry[]
  filters: FilterOptions
}

export function SharedPhotoDiaryGrid({ photos, filters }: SharedPhotoDiaryGridProps) {
  const [selectedClass, setSelectedClass] = useState<string | null>(null)
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null)
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null)

  const filteredPhotos = useMemo(() => {
    return photos.filter((photo) => {
      if (selectedClass && photo.classId !== selectedClass) return false
      if (selectedStudent && photo.studentId !== selectedStudent) return false
      if (selectedSubject && photo.subject !== selectedSubject) return false
      return true
    })
  }, [photos, selectedClass, selectedStudent, selectedSubject])

  const hasActiveFilters = selectedClass || selectedStudent || selectedSubject

  const handleClearFilters = () => {
    setSelectedClass(null)
    setSelectedStudent(null)
    setSelectedSubject(null)
  }

  // 선택된 반에 따라 학생 필터링
  const filteredStudents = useMemo(() => {
    if (!selectedClass) return filters.students
    const studentIdsInClass = new Set(
      photos
        .filter((p) => p.classId === selectedClass)
        .map((p) => p.studentId)
    )
    return filters.students.filter((s) => studentIdsInClass.has(s.id))
  }, [filters.students, photos, selectedClass])

  return (
    <div className="space-y-4">
      {/* 필터 UI */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3">
        <Filter className="h-4 w-4 text-slate-400" />
        
        {/* 반 필터 */}
        {filters.classes.length > 0 && (
          <Select
            value={selectedClass ?? 'all'}
            onValueChange={(value) => {
              setSelectedClass(value === 'all' ? null : value)
              // 반이 바뀌면 학생 선택 초기화
              if (value !== selectedClass) {
                setSelectedStudent(null)
              }
            }}
          >
            <SelectTrigger className="h-8 w-[120px] text-xs">
              <SelectValue placeholder="반" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">모든 반</SelectItem>
              {filters.classes.map((cls) => (
                <SelectItem key={cls.id} value={cls.id}>
                  {cls.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* 학생 필터 */}
        {filteredStudents.length > 0 && (
          <Select
            value={selectedStudent ?? 'all'}
            onValueChange={(value) => setSelectedStudent(value === 'all' ? null : value)}
          >
            <SelectTrigger className="h-8 w-[120px] text-xs">
              <SelectValue placeholder="학생" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">모든 학생</SelectItem>
              {filteredStudents.map((student) => (
                <SelectItem key={student.id} value={student.id}>
                  {student.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* 과목 필터 */}
        {filters.subjects.length > 0 && (
          <Select
            value={selectedSubject ?? 'all'}
            onValueChange={(value) => setSelectedSubject(value === 'all' ? null : value)}
          >
            <SelectTrigger className="h-8 w-[120px] text-xs">
              <SelectValue placeholder="과목" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">모든 과목</SelectItem>
              {filters.subjects.map((subject) => (
                <SelectItem key={subject} value={subject}>
                  {subject}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* 필터 초기화 */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearFilters}
            className="h-8 gap-1 px-2 text-xs text-slate-500"
          >
            <X className="h-3 w-3" />
            초기화
          </Button>
        )}

        {/* 결과 개수 */}
        <span className="ml-auto text-xs text-slate-500">
          {filteredPhotos.length}장
        </span>
      </div>

      {/* 활성 필터 표시 */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2">
          {selectedClass && (
            <Badge variant="secondary" className="gap-1">
              {filters.classes.find((c) => c.id === selectedClass)?.name}
              <button
                type="button"
                onClick={() => {
                  setSelectedClass(null)
                  setSelectedStudent(null)
                }}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {selectedStudent && (
            <Badge variant="secondary" className="gap-1">
              {filters.students.find((s) => s.id === selectedStudent)?.name}
              <button
                type="button"
                onClick={() => setSelectedStudent(null)}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {selectedSubject && (
            <Badge variant="secondary" className="gap-1">
              {selectedSubject}
              <button
                type="button"
                onClick={() => setSelectedSubject(null)}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
        </div>
      )}

      {/* 이미지 그리드 */}
      {filteredPhotos.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-16 text-center">
          <p className="text-sm text-slate-500">필터 조건에 맞는 사진이 없습니다.</p>
          <Button
            variant="link"
            size="sm"
            onClick={handleClearFilters}
            className="mt-2 text-xs"
          >
            필터 초기화
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filteredPhotos.map((photo) => (
            <Link
              key={photo.id}
              href={`/dashboard/shared-photo-diary/${photo.assetId}`}
              className="group relative aspect-square overflow-hidden rounded-lg bg-slate-100 transition-transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
            >
              <img
                src={photo.url}
                alt="공유된 사진"
                className="h-full w-full object-cover transition-opacity group-hover:opacity-90"
                loading="lazy"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

