'use client'

import { useState, useTransition } from 'react'
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
  const [isCreatePending, startCreateTransition] = useTransition()
  const [isMutating, startMutatingTransition] = useTransition()

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
    setListError(null)
    setEditError(null)
    setEditingNoteId(note.id)
    setEditEntry({ ...note.content })
  }

  const cancelEdit = () => {
    setEditingNoteId(null)
    setEditEntry(null)
    setEditError(null)
    setMutatingNoteId(null)
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

      setEditingNoteId(null)
      setEditEntry(null)
      setMutatingNoteId(null)
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

      if (editingNoteId === noteId) {
        setEditingNoteId(null)
        setEditEntry(null)
        setEditError(null)
      }

      setMutatingNoteId(null)
      router.refresh()
    })
  }

  const createDisabled = isCreatePending || !hasFilmEntryValue(createEntry)
  const editDisabled = isMutating || (editEntry ? !hasFilmEntryValue(editEntry) : true)

  const renderEntryFields = (
    values: FilmNoteEntry,
    onChange: (key: keyof FilmNoteEntry, value: string) => void,
    disabled: boolean
  ) => (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {FILM_NOTE_FIELDS.map((field) => (
          <div key={field.key} className="space-y-2">
            <label className="text-sm font-medium text-slate-700" htmlFor={`${field.key}-input`}>
              {field.label}
            </label>
            <Input
              id={`${field.key}-input`}
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
            <label className="text-sm font-medium text-slate-700" htmlFor={`${field.key}-textarea`}>
              {field.label}
            </label>
            <Textarea
              id={`${field.key}-textarea`}
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

  return (
    <div className="space-y-6">
      <Card className="border-slate-200">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base text-slate-800">
            <PlusCircle className="h-4 w-4" /> 새로운 감상지 추가
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {listError && (
            <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4" />
              <span>{listError}</span>
            </div>
          )}
          {createError && (
            <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4" />
              <span>{createError}</span>
            </div>
          )}
          {renderEntryFields(createEntry, handleCreateFieldChange, isCreatePending)}
          <div className="flex justify-end">
            <Button onClick={handleSubmitCreate} disabled={createDisabled} className="min-w-[120px]">
              {isCreatePending ? '저장 중...' : '감상지 추가'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {notes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
          아직 저장된 감상지가 없습니다. 상단에서 새로운 감상지를 작성해보세요.
        </div>
      ) : (
        <div className="space-y-4">
          {notes.map((note) => {
            const isEditing = editingNoteId === note.id && editEntry
            const isAssignment = note.source === 'assignment'
            const badgeVariant = note.completed ? 'secondary' : 'outline'

            return (
              <Card key={note.id} className="border-slate-200">
                <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg font-semibold text-slate-900">{note.assignment?.workbookTitle ?? '감상지'}</CardTitle>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" /> 저장: {formatDateTime(note.createdAt)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" /> 수정: {formatDateTime(note.updatedAt)}
                      </span>
                      {typeof note.noteIndex === 'number' && (
                        <span>노트 #{note.noteIndex + 1}</span>
                      )}
                      {note.assignment?.prompt && <span className="truncate">문항: {note.assignment.prompt}</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={isAssignment ? 'secondary' : 'default'}>{
                      isAssignment ? '과제 연동' : '개인 기록'
                    }</Badge>
                    <Badge variant={badgeVariant}>{note.completed ? '완료' : '작성 중'}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {isEditing && editEntry ? (
                    <>
                      {editError && (
                        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                          <AlertCircle className="h-4 w-4" />
                          <span>{editError}</span>
                        </div>
                      )}
                      {renderEntryFields(editEntry, handleEditFieldChange, isMutating)}
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
                          variant="default"
                          size="sm"
                          onClick={handleSubmitEdit}
                          disabled={editDisabled}
                          className="flex items-center gap-1"
                        >
                          {isMutating && mutatingNoteId === note.id ? '저장 중...' : <><Save className="h-4 w-4" /> 저장</>}
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
                              {note.content[field.key] ? note.content[field.key] : '미입력'}
                            </p>
                          </div>
                        ))}
                      </div>
                      <div className="space-y-4">
                        {FILM_NOTE_TEXT_AREAS.map((field) => (
                          <div key={field.key} className="space-y-1">
                            <p className="text-sm font-medium text-slate-700">{field.label}</p>
                            <p className="whitespace-pre-line break-words text-sm text-slate-600">
                              {note.content[field.key] ? note.content[field.key] : '미입력'}
                            </p>
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        {note.assignment?.studentTaskId ? (
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/dashboard/student/tasks/${note.assignment.studentTaskId}`} className="flex items-center gap-1">
                              과제 보기
                            </Link>
                          </Button>
                        ) : (
                          <span className="text-xs text-slate-500">개인 감상지</span>
                        )}
                        {!isAssignment && (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => beginEdit(note)}
                              disabled={isMutating && mutatingNoteId === note.id}
                              className="flex items-center gap-1"
                            >
                              <Edit3 className="h-4 w-4" /> 수정
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(note.id)}
                              disabled={isMutating && mutatingNoteId === note.id}
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
            )
          })}
        </div>
      )}
    </div>
  )
}
