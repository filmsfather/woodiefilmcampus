"use client"

import { useCallback, useMemo, useState } from "react"
import Image from "next/image"
import { User, RotateCcw, ArrowLeft, ChevronDown, ImageIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import DashboardBackLink from "@/components/dashboard/DashboardBackLink"
import { PROFILE_PHOTOS_BUCKET } from "@/lib/storage/buckets"

import type { NameQuizClass } from "@/app/dashboard/principal/name-quiz/page"

function getPhotoPublicUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${PROFILE_PHOTOS_BUCKET}/${path}`
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

interface NameQuizClientProps {
  classes: NameQuizClass[]
}

type Phase = "select" | "quiz" | "done"

export function NameQuizClient({ classes }: NameQuizClientProps) {
  const [selectedClassIds, setSelectedClassIds] = useState<Set<string>>(new Set())
  const [phase, setPhase] = useState<Phase>("select")
  const [quizStudents, setQuizStudents] = useState<
    Array<{ id: string; name: string; photo_url: string | null; className: string }>
  >([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showName, setShowName] = useState(false)

  const { totalStudentCount, totalWithPhoto } = useMemo(() => {
    const selected = classes.filter((c) => selectedClassIds.has(c.id))
    return {
      totalStudentCount: selected.reduce((sum, c) => sum + c.students.length, 0),
      totalWithPhoto: selected.reduce(
        (sum, c) => sum + c.students.filter((s) => s.photo_url).length,
        0
      ),
    }
  }, [classes, selectedClassIds])

  const toggleClass = useCallback((classId: string) => {
    setSelectedClassIds((prev) => {
      const next = new Set(prev)
      if (next.has(classId)) {
        next.delete(classId)
      } else {
        next.add(classId)
      }
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelectedClassIds(new Set(classes.map((c) => c.id)))
  }, [classes])

  const deselectAll = useCallback(() => {
    setSelectedClassIds(new Set())
  }, [])

  const startQuiz = useCallback(() => {
    const students = classes
      .filter((c) => selectedClassIds.has(c.id))
      .flatMap((c) => c.students.map((s) => ({ ...s, className: c.name })))

    const uniqueMap = new Map(students.map((s) => [s.id, s]))
    setQuizStudents(shuffle(Array.from(uniqueMap.values())))
    setCurrentIndex(0)
    setShowName(false)
    setPhase("quiz")
  }, [classes, selectedClassIds])

  const handleNext = useCallback(() => {
    if (currentIndex + 1 >= quizStudents.length) {
      setPhase("done")
      return
    }
    setCurrentIndex((i) => i + 1)
    setShowName(false)
  }, [currentIndex, quizStudents.length])

  const handleRestart = useCallback(() => {
    setQuizStudents(shuffle(quizStudents))
    setCurrentIndex(0)
    setShowName(false)
    setPhase("quiz")
  }, [quizStudents])

  const handleBackToSelect = useCallback(() => {
    setPhase("select")
    setQuizStudents([])
    setCurrentIndex(0)
    setShowName(false)
  }, [])

  if (phase === "select") {
    return (
      <section className="space-y-6">
        <DashboardBackLink
          fallbackHref="/dashboard/principal"
          label="원장 대시보드"
        />
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">학생 이름외우기</h1>
          <p className="text-sm text-slate-500">
            외울 반을 선택한 뒤 시작하기를 눌러주세요.
          </p>
        </header>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-between sm:w-80">
              <span>
                {selectedClassIds.size === 0
                  ? "반 선택"
                  : `${selectedClassIds.size}개 반 선택됨`}
              </span>
              <ChevronDown className="ml-2 size-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 p-2">
            <div className="flex gap-2 border-b border-slate-100 px-2 pb-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={selectAll}>
                전체 선택
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={deselectAll}>
                전체 해제
              </Button>
            </div>
            <div className="max-h-60 overflow-y-auto py-1">
              {classes.map((c) => {
                const checked = selectedClassIds.has(c.id)
                const photoCount = c.students.filter((s) => s.photo_url).length
                return (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-slate-50"
                  >
                    <Checkbox
                      checked={checked}
                      onChange={() => toggleClass(c.id)}
                    />
                    <div className="flex min-w-0 flex-1 items-center justify-between">
                      <span className="font-medium text-slate-900">{c.name}</span>
                      <span className="flex items-center gap-1.5 text-xs text-slate-500">
                        <span>{c.students.length}명</span>
                        <span className="text-slate-300">|</span>
                        <ImageIcon className="size-3" />
                        <span>{photoCount}</span>
                      </span>
                    </div>
                  </label>
                )
              })}
            </div>
          </PopoverContent>
        </Popover>

        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
          <div className="flex items-center gap-4 text-sm text-slate-500">
            <span>
              선택된 학생: <span className="font-semibold text-slate-700">{totalStudentCount}명</span>
            </span>
            <span className="flex items-center gap-1">
              <ImageIcon className="size-3.5" />
              사진 등록: <span className="font-semibold text-slate-700">{totalWithPhoto}명</span>
            </span>
          </div>
          <Button
            size="lg"
            disabled={selectedClassIds.size === 0}
            onClick={startQuiz}
          >
            시작하기
          </Button>
        </div>
      </section>
    )
  }

  if (phase === "done") {
    return (
      <section className="flex min-h-[60vh] flex-col items-center justify-center gap-6">
        <h2 className="text-2xl font-semibold text-slate-900">완료!</h2>
        <p className="text-slate-500">
          총 {quizStudents.length}명의 학생 이름을 모두 확인했습니다.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleBackToSelect}>
            <ArrowLeft className="mr-2 size-4" />
            반 다시 선택
          </Button>
          <Button onClick={handleRestart}>
            <RotateCcw className="mr-2 size-4" />
            다시하기
          </Button>
        </div>
      </section>
    )
  }

  const student = quizStudents[currentIndex]

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={handleBackToSelect}>
          <ArrowLeft className="mr-1 size-4" />
          반 선택으로
        </Button>
        <span className="text-sm font-medium text-slate-500">
          {currentIndex + 1} / {quizStudents.length}
        </span>
      </div>

      <Card className="mx-auto max-w-sm border-slate-200 shadow-sm">
        <CardHeader className="items-center pb-2">
          <CardTitle className="text-lg text-slate-900">이 학생의 이름은?</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-6 pb-8">
          <p className="text-sm font-medium text-indigo-600">{student.className}</p>
          <div className="relative h-48 w-48 overflow-hidden rounded-full border-4 border-slate-200 bg-slate-100">
            {student.photo_url ? (
              <Image
                src={getPhotoPublicUrl(student.photo_url)}
                alt="학생 사진"
                fill
                className="object-cover"
                sizes="192px"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center">
                <User className="h-20 w-20 text-slate-300" />
              </span>
            )}
          </div>

          {showName ? (
            <p className="text-2xl font-bold text-slate-900">{student.name}</p>
          ) : (
            <Button variant="outline" size="lg" onClick={() => setShowName(true)}>
              이름보기
            </Button>
          )}

          {showName && (
            <Button size="lg" onClick={handleNext}>
              {currentIndex + 1 >= quizStudents.length ? "완료" : "다음"}
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="mx-auto max-w-sm">
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-indigo-500 transition-all duration-300"
            style={{
              width: `${((currentIndex + 1) / quizStudents.length) * 100}%`,
            }}
          />
        </div>
      </div>
    </section>
  )
}
