"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

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
  onBulkPublish?: (entryIds: string[]) => Promise<{ success?: boolean; message?: string; error?: string }>
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
  onBulkPublish,
}: ClassPeriodSelectorProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null)

  // 승인 대기 중인 학생들
  const pendingStudents = students.filter((s) => s.status === "submitted")

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

  const handleBulkPublish = () => {
    if (!onBulkPublish || pendingStudents.length === 0) return

    startTransition(async () => {
      const entryIds = pendingStudents.map((s) => s.id)
      const result = await onBulkPublish(entryIds)

      if (result.error) {
        setFeedback({ type: "error", message: result.error })
      } else if (result.message) {
        setFeedback({ type: "success", message: result.message })
      }

      setTimeout(() => setFeedback(null), 5000)
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
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

        {onBulkPublish && pendingStudents.length > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="default"
                disabled={isPending}
                className="gap-1.5"
              >
                <CheckCircle className="h-4 w-4" />
                {isPending ? "승인 중..." : `일괄 승인 (${pendingStudents.length}명)`}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>일괄 승인 확인</AlertDialogTitle>
                <AlertDialogDescription>
                  승인 대기 중인 {pendingStudents.length}명의 학습일지를 모두 승인하시겠습니까?
                  <br />
                  승인 시 학부모에게 문자가 발송됩니다.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>취소</AlertDialogCancel>
                <AlertDialogAction onClick={handleBulkPublish}>
                  일괄 승인
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {selectedClassId && periods.length === 0 && (
          <p className="text-xs text-slate-500">
            선택한 반에는 등록된 학습일지 주기가 없습니다.
          </p>
        )}
      </div>

      {feedback && (
        <div
          className={
            feedback.type === "success"
              ? "rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"
              : "rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
          }
        >
          {feedback.message}
        </div>
      )}
    </div>
  )
}

