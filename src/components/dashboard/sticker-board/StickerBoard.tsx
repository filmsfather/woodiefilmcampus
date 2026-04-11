'use client'

import { useState, useTransition, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Film,
  Clapperboard,
  Heart,
  Trophy,
  Crown,
  Plus,
  Settings,
  Check,
} from 'lucide-react'

import {
  fetchStudentNotes,
  toggleLike,
  createPeriodAction,
  updateHallOfFameAction,
} from '@/app/dashboard/sticker-board/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FILM_NOTE_FIELDS, FILM_NOTE_TEXT_AREAS } from '@/lib/film-notes'
import type {
  StickerBoardStudent,
  StickerBoardNote,
  StickerPeriod,
  HallOfFameEntry,
} from '@/lib/sticker-board'

interface StickerBoardProps {
  students: StickerBoardStudent[]
  currentStudentId: string | null
  periods: StickerPeriod[]
  currentPeriod: StickerPeriod | null
  previousPeriodHallOfFame: HallOfFameEntry[]
  previousPeriodLabel: string | null
  previousPeriodStudents: StickerBoardStudent[]
  isStaff: boolean
  currentPeriodHallOfFame: HallOfFameEntry[]
  currentPeriodHallOfFameIds: string[]
}

function GoldSticker() {
  return (
    <span className="relative inline-flex h-7 w-7 items-center justify-center">
      <span className="absolute inset-0 rounded-full bg-gradient-to-br from-yellow-300 via-amber-400 to-orange-500 shadow-md shadow-amber-300/40" />
      <Clapperboard className="relative h-4 w-4 text-white drop-shadow-sm" />
    </span>
  )
}

function NormalSticker() {
  return <Film className="h-5 w-5 text-amber-500" />
}

function StickerIcons({ count }: { count: number }) {
  if (count === 0) {
    return <span className="text-sm text-slate-400">아직 없음</span>
  }

  const goldCount = Math.floor(count / 10)
  const normalCount = count % 10

  return (
    <span className="flex flex-wrap items-center gap-1">
      {Array.from({ length: goldCount }).map((_, i) => (
        <GoldSticker key={`g-${i}`} />
      ))}
      {Array.from({ length: normalCount }).map((_, i) => (
        <NormalSticker key={`n-${i}`} />
      ))}
    </span>
  )
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700">
        <Trophy className="h-4 w-4" />
      </span>
    )
  }
  if (rank === 2) {
    return (
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-slate-600 text-sm font-bold">
        2
      </span>
    )
  }
  if (rank === 3) {
    return (
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-orange-600 text-sm font-bold">
        3
      </span>
    )
  }
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 text-sm font-medium">
      {rank}
    </span>
  )
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(value))
  } catch {
    return value
  }
}

function PeriodNavigator({
  periods,
  currentPeriod,
}: {
  periods: StickerPeriod[]
  currentPeriod: StickerPeriod | null
}) {
  const router = useRouter()

  if (!currentPeriod || periods.length === 0) return null

  const currentIdx = periods.findIndex((p) => p.id === currentPeriod.id)
  const hasNewer = currentIdx > 0
  const hasOlder = currentIdx < periods.length - 1

  const navigate = (periodId: string) => {
    router.push(`/dashboard/sticker-board?period=${periodId}`)
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
      <button
        type="button"
        disabled={!hasOlder}
        onClick={() => hasOlder && navigate(periods[currentIdx + 1].id)}
        className="flex items-center gap-1 text-sm text-slate-500 transition-colors hover:text-slate-700 disabled:opacity-30"
      >
        <ChevronLeft className="h-4 w-4" />
        <span className="hidden sm:inline">이전</span>
      </button>

      <div className="flex items-center gap-2">
        <span className="text-base font-semibold text-slate-900">
          {currentPeriod.label} 시네필 챌린지
        </span>
        {currentPeriod.isActive && (
          <Badge variant="secondary" className="text-xs bg-emerald-100 text-emerald-700">
            진행중
          </Badge>
        )}
      </div>

      <button
        type="button"
        disabled={!hasNewer}
        onClick={() => hasNewer && navigate(periods[currentIdx - 1].id)}
        className="flex items-center gap-1 text-sm text-slate-500 transition-colors hover:text-slate-700 disabled:opacity-30"
      >
        <span className="hidden sm:inline">다음</span>
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}

const RANK_MEDALS = ['🥇', '🥈', '🥉']

function HallOfFameCard({
  entries,
  periodLabel,
}: {
  entries: HallOfFameEntry[]
  periodLabel: string
}) {
  if (entries.length === 0) return null

  let rank = 0
  let prevCount = -1
  const ranked = entries.map((entry, idx) => {
    if (entry.stickerCount !== prevCount) {
      rank = idx + 1
      prevCount = entry.stickerCount
    }
    return { ...entry, rank }
  })

  return (
    <Card className="border-amber-300 bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-amber-800">
          <Crown className="h-5 w-5 text-amber-600" />
          {periodLabel}의 시네필
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {ranked.map((entry) => (
            <div
              key={entry.studentId}
              className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-white/80 px-3 py-1.5 text-sm font-medium text-amber-800 shadow-sm"
            >
              <span className="text-base leading-none">
                {entry.rank <= 3 ? RANK_MEDALS[entry.rank - 1] : `${entry.rank}위`}
              </span>
              {entry.name}
              <span className="text-xs text-amber-600/70">
                {entry.stickerCount}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function CreatePeriodForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = () => {
    if (!label || !startDate || !endDate) return
    setError(null)
    startTransition(async () => {
      const startIso = new Date(startDate + 'T00:00:00+09:00').toISOString()
      const endIso = new Date(endDate + 'T23:59:59+09:00').toISOString()
      const result = await createPeriodAction({
        label,
        startDate: startIso,
        endDate: endIso,
      })
      if (result.success) {
        setOpen(false)
        setLabel('')
        setStartDate('')
        setEndDate('')
        onCreated()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        새 기간 생성
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>새 챌린지 기간 생성</DialogTitle>
            <DialogDescription>
              새 기간을 생성하면 기존 활성 기간은 자동으로 종료됩니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="period-label">기간 이름</Label>
              <Input
                id="period-label"
                placeholder="예: 4월"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="period-start">시작일</Label>
                <Input
                  id="period-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="period-end">종료일</Label>
                <Input
                  id="period-end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                취소
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isPending || !label || !startDate || !endDate}
              >
                {isPending ? '생성 중...' : '기간 생성'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function HallOfFameManager({
  students,
  previousPeriodStudents,
  previousPeriodLabel,
  currentPeriod,
  initialSelectedIds,
}: {
  students: StickerBoardStudent[]
  previousPeriodStudents: StickerBoardStudent[]
  previousPeriodLabel: string | null
  currentPeriod: StickerPeriod
  initialSelectedIds: string[]
}) {
  const [open, setOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(initialSelectedIds))
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const router = useRouter()

  const toggleStudent = useCallback((studentId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(studentId)) {
        next.delete(studentId)
      } else {
        next.add(studentId)
      }
      return next
    })
    setSaved(false)
  }, [])

  const handleSave = () => {
    setError(null)
    startTransition(async () => {
      const result = await updateHallOfFameAction({
        periodId: currentPeriod.id,
        studentIds: Array.from(selectedIds),
      })
      if (result.success) {
        setSaved(true)
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  const prevCountMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of previousPeriodStudents) {
      map.set(s.studentId, s.stickerCount)
    }
    return map
  }, [previousPeriodStudents])

  const hasPrevData = previousPeriodStudents.length > 0

  const sortedStudents = useMemo(() => {
    const allStudentIds = new Set([
      ...students.map((s) => s.studentId),
      ...previousPeriodStudents.map((s) => s.studentId),
    ])

    const nameMap = new Map<string, string>()
    for (const s of students) nameMap.set(s.studentId, s.name)
    for (const s of previousPeriodStudents) nameMap.set(s.studentId, s.name)

    const merged = Array.from(allStudentIds).map((id) => ({
      studentId: id,
      name: nameMap.get(id) ?? '이름 없음',
      stickerCount: students.find((s) => s.studentId === id)?.stickerCount ?? 0,
      prevStickerCount: prevCountMap.get(id) ?? 0,
    }))

    if (hasPrevData) {
      return merged.sort((a, b) => b.prevStickerCount - a.prevStickerCount || a.name.localeCompare(b.name, 'ko'))
    }
    return merged.sort((a, b) => b.stickerCount - a.stickerCount || a.name.localeCompare(b.name, 'ko'))
  }, [students, previousPeriodStudents, prevCountMap, hasPrevData])

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Settings className="h-4 w-4" />
        명예의 전당 관리
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{currentPeriod.label} 명예의 전당 관리</DialogTitle>
            <DialogDescription>
              {hasPrevData && previousPeriodLabel
                ? `${previousPeriodLabel} 스티커 수 기준으로 정렬되어 있습니다.`
                : '이 기간의 명예의 전당에 올릴 학생을 선택하세요.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="max-h-[50vh] space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {sortedStudents.map((student) => {
                const isSelected = selectedIds.has(student.studentId)
                const displayCount = hasPrevData ? student.prevStickerCount : student.stickerCount
                return (
                  <button
                    key={student.studentId}
                    type="button"
                    onClick={() => toggleStudent(student.studentId)}
                    className={
                      'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors' +
                      (isSelected
                        ? ' bg-amber-50 text-amber-800'
                        : ' hover:bg-slate-50 text-slate-700')
                    }
                  >
                    <span
                      className={
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors' +
                        (isSelected
                          ? ' border-amber-500 bg-amber-500 text-white'
                          : ' border-slate-300')
                      }
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                    </span>
                    <span className="flex-1 font-medium">{student.name}</span>
                    <span className="text-xs text-slate-400">
                      {hasPrevData && previousPeriodLabel
                        ? `${previousPeriodLabel} 스티커 ${displayCount}`
                        : `스티커 ${displayCount}`}
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-slate-500">
              {selectedIds.size}명 선택됨
            </p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {saved && <p className="text-sm text-emerald-600">저장되었습니다.</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                닫기
              </Button>
              <Button onClick={handleSave} disabled={isPending}>
                {isPending ? '저장 중...' : '저장'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function StickerBoard({
  students,
  currentStudentId,
  periods,
  currentPeriod,
  previousPeriodHallOfFame,
  previousPeriodLabel,
  previousPeriodStudents,
  isStaff,
  currentPeriodHallOfFame,
  currentPeriodHallOfFameIds,
}: StickerBoardProps) {
  const router = useRouter()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [notesCache, setNotesCache] = useState<Record<string, StickerBoardNote[]>>({})
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [selectedNote, setSelectedNote] = useState<StickerBoardNote | null>(null)
  const [isLiking, setIsLiking] = useState(false)
  const [isPending, startTransition] = useTransition()

  const currentStudent = useMemo(
    () => (currentStudentId ? students.find((s) => s.studentId === currentStudentId) : null),
    [students, currentStudentId]
  )

  const rankedStudents = useMemo(() => {
    let rank = 0
    let prevCount = -1
    return students.map((s, idx) => {
      if (s.stickerCount !== prevCount) {
        rank = idx + 1
        prevCount = s.stickerCount
      }
      return { ...s, rank }
    })
  }, [students])

  const handleToggle = (studentId: string) => {
    if (expandedId === studentId) {
      setExpandedId(null)
      return
    }

    setExpandedId(studentId)

    if (notesCache[studentId] || !currentPeriod) {
      return
    }

    setLoadingId(studentId)
    startTransition(async () => {
      const result = await fetchStudentNotes({ studentId, periodId: currentPeriod.id })
      if (result.success) {
        setNotesCache((prev) => ({ ...prev, [studentId]: result.notes }))
      }
      setLoadingId(null)
    })
  }

  const isLoading = (id: string) => isPending && loadingId === id

  const handleLike = async (noteId: string) => {
    if (isLiking) return
    setIsLiking(true)
    try {
      const result = await toggleLike({ filmNoteId: noteId })
      if (result.success) {
        const update = (note: StickerBoardNote): StickerBoardNote =>
          note.id === noteId
            ? { ...note, likedByMe: result.liked, likeCount: result.likeCount }
            : note

        if (selectedNote?.id === noteId) {
          setSelectedNote((prev) => (prev ? update(prev) : prev))
        }

        setNotesCache((prev) => {
          const next = { ...prev }
          for (const key of Object.keys(next)) {
            next[key] = next[key].map(update)
          }
          return next
        })
      }
    } finally {
      setIsLiking(false)
    }
  }

  const noPeriods = periods.length === 0

  return (
    <div className="space-y-6">
      {isStaff && (
        <div className="flex flex-wrap items-center gap-2">
          <CreatePeriodForm onCreated={() => router.refresh()} />
          {currentPeriod && (
            <HallOfFameManager
              students={students}
              previousPeriodStudents={previousPeriodStudents}
              previousPeriodLabel={previousPeriodLabel}
              currentPeriod={currentPeriod}
              initialSelectedIds={currentPeriodHallOfFameIds}
            />
          )}
        </div>
      )}

      <PeriodNavigator periods={periods} currentPeriod={currentPeriod} />

      {previousPeriodLabel && previousPeriodHallOfFame.length > 0 && (
        <HallOfFameCard
          entries={previousPeriodHallOfFame}
          periodLabel={previousPeriodLabel}
        />
      )}

      {currentPeriod && currentPeriodHallOfFame.length > 0 && (
        <HallOfFameCard
          entries={currentPeriodHallOfFame}
          periodLabel={previousPeriodLabel ?? currentPeriod.label}
        />
      )}

      {noPeriods ? (
        <Card className="border-slate-200">
          <CardContent className="py-12 text-center">
            <p className="text-slate-500">
              {isStaff
                ? '아직 생성된 챌린지 기간이 없습니다. 위의 "새 기간 생성" 버튼으로 첫 기간을 만들어주세요.'
                : '아직 챌린지 기간이 설정되지 않았습니다.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {currentStudent && (
            <Card className="border-amber-200 bg-amber-50/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-amber-800">
                  <Film className="h-5 w-5" />
                  나의 스티커
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-4">
                  <div className="text-3xl font-bold text-amber-700">
                    {currentStudent.stickerCount}
                  </div>
                  <StickerIcons count={currentStudent.stickerCount} />
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <GoldSticker /> = 10편
                  </span>
                  <span className="flex items-center gap-1">
                    <NormalSticker /> = 1편
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-slate-900">
                전체 학생 스티커 현황
              </CardTitle>
            </CardHeader>
            <CardContent>
              {rankedStudents.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
                  아직 완료된 감상지가 없습니다.
                </div>
              ) : (
                <div className="space-y-2">
                  {rankedStudents.map((student) => {
                    const isExpanded = expandedId === student.studentId
                    const isMe = student.studentId === currentStudentId
                    const notes = notesCache[student.studentId]

                    return (
                      <div key={student.studentId}>
                        <button
                          type="button"
                          onClick={() => handleToggle(student.studentId)}
                          className={
                            'flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors hover:bg-slate-50' +
                            (isMe ? ' border-amber-200 bg-amber-50/30' : ' border-slate-200')
                          }
                        >
                          <RankBadge rank={student.rank} />
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <span className="font-medium text-slate-800">
                              {student.name}
                              {isMe && (
                                <Badge variant="secondary" className="ml-2 text-xs">
                                  나
                                </Badge>
                              )}
                            </span>
                            <StickerIcons count={student.stickerCount} />
                          </div>
                          <span className="shrink-0 text-slate-400">
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </span>
                        </button>

                        {isExpanded && (
                          <div className="ml-11 mt-1 space-y-1 pb-2">
                            {isLoading(student.studentId) ? (
                              <div className="py-4 text-center text-sm text-slate-400">
                                불러오는 중...
                              </div>
                            ) : notes && notes.length > 0 ? (
                              notes.map((note) => (
                                <button
                                  key={note.id}
                                  type="button"
                                  onClick={() => setSelectedNote(note)}
                                  className="flex w-full items-center gap-3 rounded-md border border-slate-100 bg-white px-3 py-2 text-left text-sm transition-colors hover:border-amber-200 hover:bg-amber-50/30"
                                >
                                  <Film className="h-4 w-4 shrink-0 text-amber-500" />
                                  <span className="min-w-0 flex-1 truncate font-medium text-slate-700">
                                    {note.content.title || '제목 없음'}
                                  </span>
                                  {note.likeCount > 0 && (
                                    <span className="flex shrink-0 items-center gap-0.5 text-xs text-rose-500">
                                      <Heart className="h-3 w-3 fill-rose-500" />
                                      {note.likeCount}
                                    </span>
                                  )}
                                  <span className="shrink-0 text-xs text-slate-400">
                                    {formatDate(note.watchedDate ?? note.createdAt)}
                                  </span>
                                </button>
                              ))
                            ) : notes && notes.length === 0 ? (
                              <div className="py-3 text-center text-sm text-slate-400">
                                감상지가 없습니다.
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={!!selectedNote} onOpenChange={(open) => !open && setSelectedNote(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          {selectedNote && (
            <>
              <DialogHeader>
                <DialogTitle className="text-lg text-slate-900">
                  {selectedNote.content.title || '감상지'}
                </DialogTitle>
                <DialogDescription>
                  {formatDate(selectedNote.watchedDate ?? selectedNote.createdAt)}
                  {' · '}
                  {selectedNote.source === 'assignment' ? '과제 감상지' : '개인 감상지'}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="grid gap-3 sm:grid-cols-2">
                  {FILM_NOTE_FIELDS.map((field) => (
                    <div key={field.key} className="space-y-1">
                      <p className="text-xs font-medium text-slate-500">{field.label}</p>
                      <p className="break-words text-sm text-slate-800">
                        {selectedNote.content[field.key] || '미입력'}
                      </p>
                    </div>
                  ))}
                </div>
                {FILM_NOTE_TEXT_AREAS.map((field) => (
                  <div key={field.key} className="space-y-1">
                    <p className="text-xs font-medium text-slate-500">{field.label}</p>
                    <p className="whitespace-pre-line break-words text-sm text-slate-800">
                      {selectedNote.content[field.key] || '미입력'}
                    </p>
                  </div>
                ))}
                <div className="flex items-center justify-end border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() => handleLike(selectedNote.id)}
                    disabled={isLiking}
                    className="flex items-center gap-1.5 rounded-full border border-slate-200 px-4 py-2 text-sm transition-colors hover:border-rose-200 hover:bg-rose-50 disabled:opacity-50"
                  >
                    <Heart
                      className={
                        'h-4 w-4 transition-colors' +
                        (selectedNote.likedByMe
                          ? ' fill-rose-500 text-rose-500'
                          : ' text-slate-400')
                      }
                    />
                    <span className={selectedNote.likedByMe ? 'font-medium text-rose-600' : 'text-slate-600'}>
                      좋아요{selectedNote.likeCount > 0 ? ` ${selectedNote.likeCount}` : ''}
                    </span>
                  </button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
