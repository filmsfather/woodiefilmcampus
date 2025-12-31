"use client"

import { useRouter } from "next/navigation"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface ClassOption {
  id: string
  name: string
}

interface PeriodOption {
  id: string
  label: string | null
  start_date: string
  end_date: string
}

interface StudentEntry {
  id: string
  studentName: string | null
  studentEmail: string | null
  status: "submitted" | "draft" | "published" | "archived"
  periodLabel: string | null
  periodStartDate: string
  periodEndDate: string
}

interface ClassPeriodSelectorProps {
  classes: ClassOption[]
  periods: PeriodOption[]
  students?: StudentEntry[]
  selectedClassId: string | null
  selectedPeriodId: string
  selectedEntryId?: string | null
  basePath: string
}

const STATUS_LABEL: Record<string, string> = {
  submitted: "승인 대기",
  draft: "작성 중",
  published: "공개 완료",
  archived: "보관",
}

export function ClassPeriodSelector({
  classes,
  periods,
  students = [],
  selectedClassId,
  selectedPeriodId,
  selectedEntryId,
  basePath,
}: ClassPeriodSelectorProps) {
  const router = useRouter()

  const handleClassChange = (classId: string) => {
    const params = new URLSearchParams()
    params.set("class", classId)
    params.set("period", "all")
    router.push(`${basePath}?${params.toString()}`)
  }

  const handlePeriodChange = (periodId: string) => {
    if (!selectedClassId) return
    const params = new URLSearchParams()
    params.set("class", selectedClassId)
    params.set("period", periodId)
    router.push(`${basePath}?${params.toString()}`)
  }

  const handleStudentChange = (entryId: string) => {
    if (!selectedClassId) return
    const params = new URLSearchParams()
    params.set("class", selectedClassId)
    if (selectedPeriodId !== "all") {
      params.set("period", selectedPeriodId)
    }
    params.set("entry", entryId)
    router.push(`${basePath}?${params.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {selectedClassId && periods.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-600">기간</span>
          <Select
            value={selectedPeriodId}
            onValueChange={handlePeriodChange}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="기간 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 기간</SelectItem>
              {periods.map((period) => (
                <SelectItem key={period.id} value={period.id}>
                  {period.label ?? `${period.start_date} ~ ${period.end_date}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-slate-600">반</span>
        <Select
          value={selectedClassId ?? undefined}
          onValueChange={handleClassChange}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="반 선택" />
          </SelectTrigger>
          <SelectContent>
            {classes.map((classItem) => (
              <SelectItem key={classItem.id} value={classItem.id}>
                {classItem.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedClassId && students.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-600">학생</span>
          <Select
            value={selectedEntryId ?? undefined}
            onValueChange={handleStudentChange}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="학생 선택" />
            </SelectTrigger>
            <SelectContent>
              {students.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  <span className="flex items-center gap-2">
                    <span>{entry.studentName ?? entry.studentEmail ?? "학생 정보 없음"}</span>
                    <span className="text-xs text-slate-400">
                      ({STATUS_LABEL[entry.status] ?? entry.status})
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {selectedClassId && periods.length === 0 && (
        <p className="text-xs text-slate-500">
          선택한 반에는 등록된 학습일지 주기가 없습니다.
        </p>
      )}
    </div>
  )
}

