'use client'

import { useState, useTransition, useMemo } from 'react'
import { ChevronDown, ChevronUp, Film, Clapperboard, Heart, Trophy } from 'lucide-react'

import { fetchStudentNotes, toggleLike } from '@/app/dashboard/sticker-board/actions'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { FILM_NOTE_FIELDS, FILM_NOTE_TEXT_AREAS } from '@/lib/film-notes'
import type { StickerBoardStudent, StickerBoardNote } from '@/lib/sticker-board'

interface StickerBoardProps {
  students: StickerBoardStudent[]
  currentStudentId: string | null
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

export function StickerBoard({ students, currentStudentId }: StickerBoardProps) {
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

    if (notesCache[studentId]) {
      return
    }

    setLoadingId(studentId)
    startTransition(async () => {
      const result = await fetchStudentNotes({ studentId })
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

  return (
    <div className="space-y-6">
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
                                {formatDate(note.createdAt)}
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

      <Dialog open={!!selectedNote} onOpenChange={(open) => !open && setSelectedNote(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          {selectedNote && (
            <>
              <DialogHeader>
                <DialogTitle className="text-lg text-slate-900">
                  {selectedNote.content.title || '감상지'}
                </DialogTitle>
                <DialogDescription>
                  {formatDate(selectedNote.createdAt)}
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
