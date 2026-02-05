'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { User } from 'lucide-react'

import { PROFILE_PHOTOS_BUCKET } from '@/lib/storage/buckets'
import { createClient } from '@/lib/supabase/client'
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
  photoUrl?: string | null
}

export function StudentSelector({
  currentEntryId,
  entries,
  availableClasses,
  currentClassId,
  photoUrl,
}: StudentSelectorProps) {
  const router = useRouter()
  const supabase = createClient()

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

  // 프로필 사진 URL 생성
  const getPublicUrl = (path: string) => {
    const { data } = supabase.storage.from(PROFILE_PHOTOS_BUCKET).getPublicUrl(path)
    return data.publicUrl
  }

  const displayPhotoUrl = photoUrl ? getPublicUrl(photoUrl) : null

  // 프로필 사진 컴포넌트 (포트레이트 비율 3:4)
  const ProfilePhoto = () => (
    <div className="relative h-32 w-24 shrink-0 overflow-hidden rounded-lg border-2 border-slate-200 bg-slate-100">
      {displayPhotoUrl ? (
        <Image
          src={displayPhotoUrl}
          alt={`${currentEntry?.studentName ?? '학생'} 사진`}
          fill
          className="object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <User className="h-10 w-10 text-slate-400" />
        </div>
      )}
    </div>
  )

  if (entries.length <= 1 && !showClassSelector) {
    // 학생이 1명이고 반도 1개면 드롭다운 없이 이름만 표시
    return (
      <div className="flex items-start gap-4">
        <ProfilePhoto />
        <div className="flex flex-col justify-center pt-2">
          <h1 className="text-2xl font-semibold text-slate-900">
            {currentEntry?.studentName ?? '학생'}
          </h1>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex items-start gap-4">
        <ProfilePhoto />
        <div className="flex flex-col justify-center gap-1 pt-2">
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
      </div>
    </div>
  )
}
