'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  AlertCircle,
  CalendarDays,
  Clock,
  Edit3,
  PlusCircle,
  Save,
  Trash2,
  XCircle,
} from 'lucide-react'

import { createPersonalFilmNote, updatePersonalFilmNote, deletePersonalFilmNote } from '@/app/dashboard/student/film-notes/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  FILM_NOTE_FIELDS,
  FILM_NOTE_TEXT_AREAS,
  createEmptyFilmEntry,
  sanitizeFilmValue,
  type FilmNoteEntry,
  hasFilmEntryValue,
} from '@/lib/film-notes'
import type { StudentFilmNoteListItem } from '@/lib/film-history'

interface FilmNotesManagerProps {
  notes: StudentFilmNoteListItem[]
}

function formatDateTime(value: string | null) {
  if (!value) {
    return '-'
  }

  try {
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch (error) {
    console.error('[FilmNotesManager] failed to format date', error)
    return value
  }
}

export function FilmNotesManager({ notes }: FilmNotesManagerProps) {
  const router = useRouter()
  const [createEntry, setCreateEntry] = useState<FilmNoteEntry>(createEmptyFilmEntry())
  const [createError, setCreateError] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editEntry, setEditEntry] = useState<FilmNoteEntry | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [mutatingNoteId, setMutatingNoteId] = useState<string | null>(null)
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [filters, setFilters] = useState({
    releaseYear: '',
    country: '',
    director: '',
    genre: '',
    title: '',
  })
  const [isCreatePending, startCreateTransition] = useTransition()
  const [isMutating, startMutatingTransition] = useTransition()

  const handleFilterChange = (key: keyof typeof filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const filteredNotes = useMemo(() => {
    return notes.filter((note) => {
      const { releaseYear, country, director, genre, title } = filters
      const normalized = {
        releaseYear: note.content.releaseYear?.toLowerCase() ?? '',
        country: note.content.country?.toLowerCase() ?? '',
        director: note.content.director?.toLowerCase() ?? '',
        genre: note.content.genre?.toLowerCase() ?? '',
        title: note.content.title?.toLowerCase() ?? '',
      }

      if (releaseYear && !normalized.releaseYear.includes(releaseYear.toLowerCase())) {
        return false
      }
      if (country && !normalized.country.includes(country.toLowerCase())) {
        return false
      }
      if (director && !normalized.director.includes(director.toLowerCase())) {
        return false
      }
      if (genre && !normalized.genre.includes(genre.toLowerCase())) {
        return false
      }
      if (title && !normalized.title.includes(title.toLowerCase())) {
        return false
      }

      return true
    })
  }, [filters, notes])

  const selectedNote = useMemo(() => {
    if (!selectedNoteId) {
      return null
    }
    return notes.find((note) => note.id === selectedNoteId) ?? null
  }, [notes, selectedNoteId])

  const resetEditState = () => {
    setEditingNoteId(null)
    setEditEntry(null)
    setEditError(null)
    setMutatingNoteId(null)
  }

  const handleViewDetail = (note: StudentFilmNoteListItem) => {
    setSelectedNoteId(note.id)
    if (editingNoteId && editingNoteId !== note.id) {
      resetEditState()
    }
    setListError(null)
  }

  const handleCreateFieldChange = (key: keyof FilmNoteEntry, rawValue: string) => {
    const value = key === 'releaseYear' ? rawValue.replace(/[^0-9]/g, '').slice(0, 4) : rawValue
    setCreateEntry((prev) => ({ ...prev, [key]: value }))
  }

  const handleEditFieldChange = (key: keyof FilmNoteEntry, rawValue: string) => {
    if (!editEntry) {
      return
    }
    const value = key === 'releaseYear' ? rawValue.replace(/[^0-9]/g, '').slice(0, 4) : rawValue
    setEditEntry({ ...editEntry, [key]: value })
  }

  const handleSubmitCreate = () => {
    setCreateError(null)
    setListError(null)
    const sanitized = Object.fromEntries(
      Object.entries(createEntry).map(([key, value]) => [key, sanitizeFilmValue(value)])
    ) as FilmNoteEntry

    startCreateTransition(async () => {
      const result = await createPersonalFilmNote({ content: sanitized })

      if (!result.success) {
        setCreateError(result.error ?? '감상지를 저장하지 못했습니다.')
        return
      }

      setCreateEntry(createEmptyFilmEntry())
      router.refresh()
    })
  }

  const beginEdit = (note: StudentFilmNoteListItem) => {
    setSelectedNoteId(note.id)
    setListError(null)
    setEditError(null)
    setEditingNoteId(note.id)
    setEditEntry({ ...note.content })
    setMutatingNoteId(null)
  }

  const cancelEdit = () => {
    resetEditState()
  }

  const handleSubmitEdit = () => {
    if (!editingNoteId || !editEntry) {
      return
    }

    setEditError(null)
    setListError(null)
    const sanitized = Object.fromEntries(
      Object.entries(editEntry).map(([key, value]) => [key, sanitizeFilmValue(value)])
    ) as FilmNoteEntry

    setMutatingNoteId(editingNoteId)
    startMutatingTransition(async () => {
      const result = await updatePersonalFilmNote({ noteId: editingNoteId, content: sanitized })

      if (!result.success) {
        setEditError(result.error ?? '감상지를 수정하지 못했습니다.')
        setMutatingNoteId(null)
        return
      }

      resetEditState()
      router.refresh()
    })
  }

  const handleDelete = (noteId: string) => {
    setListError(null)
    setMutatingNoteId(noteId)
    startMutatingTransition(async () => {
      const result = await deletePersonalFilmNote({ noteId })
      if (!result.success) {
        setListError(result.error ?? '감상지를 삭제하지 못했습니다.')
        setMutatingNoteId(null)
        return
      }

      if (selectedNoteId === noteId) {
        setSelectedNoteId(null)
      }

      resetEditState()
      router.refresh()
    })
  }

  const createDisabled = isCreatePending || !hasFilmEntryValue(createEntry)
  const editDisabled = isMutating || (editEntry ? !hasFilmEntryValue(editEntry) : true)

  const renderEntryFields = (
    values: FilmNoteEntry,
    onChange: (key: keyof FilmNoteEntry, value: string) => void,
    disabled: boolean,
    idPrefix: string
  ) => (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {FILM_NOTE_FIELDS.map((field) => (
          <div key={field.key} className="space-y-2">
            <label className="text-sm font-medium text-slate-700" htmlFor={`${idPrefix}-${field.key}-input`}>
              {field.label}
            </label>
            <Input
              id={`${idPrefix}-${field.key}-input`}
              value={values[field.key] ?? ''}
              onChange={(event) => onChange(field.key, event.target.value)}
              placeholder={field.placeholder}
              disabled={disabled}
              {...(field.inputMode ? { inputMode: field.inputMode } : {})}
            />
          </div>
        ))}
      </div>
      <div className="space-y-4">
        {FILM_NOTE_TEXT_AREAS.map((field) => (
          <div key={field.key} className="space-y-2">
            <label className="text-sm font-medium text-slate-700" htmlFor={`${idPrefix}-${field.key}-textarea`}>
              {field.label}
            </label>
            <Textarea
              id={`${idPrefix}-${field.key}-textarea`}
              value={values[field.key] ?? ''}
              onChange={(event) => onChange(field.key, event.target.value)}
              placeholder={field.placeholder}
              disabled={disabled}
              rows={field.rows}
            />
          </div>
        ))}
      </div>
    </div>
  )

  const filterApplied = Object.values(filters).some((value) => value.trim().length > 0)
  const hasNotes = notes.length > 0

  return (
    <div className="space-y-6">
      <Card className="border-slate-200">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base text-slate-800">
            <PlusCircle className="h-4 w-4" /> 새로운 감상지 추가
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {createError && (
            <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4" />
              <span>{createError}</span>
            </div>
          )}
          {renderEntryFields(createEntry, handleCreateFieldChange, isCreatePending, 'create')}
          <div className="flex justify-end">
            <Button onClick={handleSubmitCreate} disabled={createDisabled} className="min-w-[120px]">
              {isCreatePending ? '저장 중...' : '감상지 추가'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader className="gap-2 pb-4">
          <CardTitle className="text-base font-semibold text-slate-900">감상지 목록</CardTitle>
          <p className="text-sm text-slate-600">필터 입력 후 원하는 감상지를 찾아보세요.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 md:grid-cols-5">
            <Input
              value={filters.releaseYear}
              onChange={(event) => handleFilterChange('releaseYear', event.target.value)}
              placeholder="연도 검색"
              inputMode="numeric"
            />
            <Input
              value={filters.country}
              onChange={(event) => handleFilterChange('country', event.target.value)}
              placeholder="국가 검색"
            />
            <Input
              value={filters.director}
              onChange={(event) => handleFilterChange('director', event.target.value)}
              placeholder="감독 검색"
            />
            <Input
              value={filters.genre}
              onChange={(event) => handleFilterChange('genre', event.target.value)}
              placeholder="장르 검색"
            />
            <Input
              value={filters.title}
              onChange={(event) => handleFilterChange('title', event.target.value)}
              placeholder="제목 검색"
            />
          </div>

          {listError && (
            <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4" />
              <span>{listError}</span>
            </div>
          )}

          {!hasNotes ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
              아직 저장된 감상지가 없습니다. 상단에서 새로운 감상지를 작성해보세요.
            </div>
          ) : filteredNotes.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
              {filterApplied ? '조건에 맞는 감상지가 없습니다. 필터를 조정해보세요.' : '감상지를 찾을 수 없습니다.'}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>연도</TableHead>
                  <TableHead>국가</TableHead>
                  <TableHead>감독</TableHead>
                  <TableHead>장르</TableHead>
                  <TableHead>제목</TableHead>
                  <TableHead className="text-right">기능</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredNotes.map((note) => {
                  const isSelected = selectedNoteId === note.id
                  const isAssignment = note.source === 'assignment'
                  const isMutatingCurrent = isMutating && mutatingNoteId === note.id

                  return (
                    <TableRow
                      key={note.id}
                      data-state={isSelected ? 'selected' : undefined}
                      className="cursor-pointer"
                      onClick={() => handleViewDetail(note)}
                    >
                      <TableCell className="text-slate-700">{note.content.releaseYear || '미입력'}</TableCell>
                      <TableCell className="text-slate-700">{note.content.country || '미입력'}</TableCell>
                      <TableCell className="text-slate-700">{note.content.director || '미입력'}</TableCell>
                      <TableCell className="text-slate-700">{note.content.genre || '미입력'}</TableCell>
                      <TableCell className="max-w-[220px] whitespace-normal break-words text-slate-700">
                        {note.content.title || '미입력'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(event) => {
                              event.stopPropagation()
                              handleViewDetail(note)
                            }}
                          >
                            상세보기
                          </Button>
                          <Button
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation()
                              if (isAssignment) {
                                return
                              }
                              beginEdit(note)
                            }}
                            disabled={isAssignment || isMutatingCurrent}
                          >
                            {isMutatingCurrent && editingNoteId === note.id ? '저장 중...' : '수정'}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selectedNote ? (
        <Card className="border-slate-200">
          <CardHeader className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg font-semibold text-slate-900">
                {selectedNote.assignment?.workbookTitle ?? (selectedNote.content.title || '감상지')}
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" /> 저장: {formatDateTime(selectedNote.createdAt)}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> 수정: {formatDateTime(selectedNote.updatedAt)}
                </span>
                {typeof selectedNote.noteIndex === 'number' && <span>노트 #{selectedNote.noteIndex + 1}</span>}
                {selectedNote.assignment?.prompt && <span className="truncate">문항: {selectedNote.assignment.prompt}</span>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={selectedNote.source === 'assignment' ? 'secondary' : 'default'}>
                {selectedNote.source === 'assignment' ? '과제 연동' : '개인 기록'}
              </Badge>
              <Badge variant={selectedNote.completed ? 'secondary' : 'outline'}>
                {selectedNote.completed ? '완료' : '작성 중'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {editingNoteId === selectedNote.id && editEntry ? (
              <>
                {editError && (
                  <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    <AlertCircle className="h-4 w-4" />
                    <span>{editError}</span>
                  </div>
                )}
                {renderEntryFields(editEntry, handleEditFieldChange, isMutating, 'edit')}
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={cancelEdit}
                    disabled={isMutating}
                    className="flex items-center gap-1"
                  >
                    <XCircle className="h-4 w-4" /> 취소
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSubmitEdit}
                    disabled={editDisabled}
                    className="flex items-center gap-1"
                  >
                    {isMutating && mutatingNoteId === selectedNote.id ? (
                      '저장 중...'
                    ) : (
                      <>
                        <Save className="h-4 w-4" /> 저장
                      </>
                    )}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  {FILM_NOTE_FIELDS.map((field) => (
                    <div key={field.key} className="space-y-1">
                      <p className="text-sm font-medium text-slate-700">{field.label}</p>
                      <p className="text-sm text-slate-600 break-words">
                        {selectedNote.content[field.key] ? selectedNote.content[field.key] : '미입력'}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="space-y-4">
                  {FILM_NOTE_TEXT_AREAS.map((field) => (
                    <div key={field.key} className="space-y-1">
                      <p className="text-sm font-medium text-slate-700">{field.label}</p>
                      <p className="whitespace-pre-line break-words text-sm text-slate-600">
                        {selectedNote.content[field.key] ? selectedNote.content[field.key] : '미입력'}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {selectedNote.assignment?.studentTaskId ? (
                    <Button asChild size="sm" variant="outline">
                      <Link
                        href={`/dashboard/student/tasks/${selectedNote.assignment.studentTaskId}`}
                        className="flex items-center gap-1"
                      >
                        과제 보기
                      </Link>
                    </Button>
                  ) : (
                    <span className="text-xs text-slate-500">개인 감상지</span>
                  )}
                  {selectedNote.source !== 'assignment' && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => beginEdit(selectedNote)}
                        disabled={isMutating && mutatingNoteId === selectedNote.id}
                        className="flex items-center gap-1"
                      >
                        <Edit3 className="h-4 w-4" /> 수정
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(selectedNote.id)}
                        disabled={isMutating && mutatingNoteId === selectedNote.id}
                        className="flex items-center gap-1 text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" /> 삭제
                      </Button>
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ) : hasNotes ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
          상세 정보를 보려면 목록에서 감상지를 선택하세요.
        </div>
      ) : null}
    </div>
  )
}
