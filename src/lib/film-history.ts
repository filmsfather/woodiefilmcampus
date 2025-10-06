import { createClient as createServerSupabase } from '@/lib/supabase/server'
import {
  coerceFilmEntry,
  createEmptyFilmEntry,
  sanitizeFilmEntry,
  type FilmNoteEntry,
} from '@/lib/film-notes'
import type { StudentTaskStatus } from '@/types/student-task'

interface RawFilmNoteHistoryRow {
  note_index: number
  content: unknown
  completed: boolean | null
  created_at: string
  updated_at: string
}

interface RawStudentTaskRow {
  id: string
  status: StudentTaskStatus
  progress_meta: Record<string, unknown> | null
  assignments?:
    | {
        due_at: string | null
        workbooks?:
          | {
              id: string
              title: string | null
              type: string | null
              config: Record<string, unknown> | null
            }
          | Array<{
              id: string
              title: string | null
              type: string | null
              config: Record<string, unknown> | null
            }>
      }
    | Array<{
        due_at: string | null
        workbooks?:
          | {
              id: string
              title: string | null
              type: string | null
              config: Record<string, unknown> | null
            }
          | Array<{
              id: string
              title: string | null
              type: string | null
              config: Record<string, unknown> | null
            }>
      }>
  student_task_items?: Array<{
    id: string
    item_id: string | null
    workbook_items?:
      | {
          id: string
          prompt: string | null
        }
      | Array<{
          id: string
          prompt: string | null
        }>
  }>
}

export interface FilmNoteHistoryEntry {
  noteIndex: number
  content: FilmNoteEntry
  completed: boolean
  createdAt: string | null
  updatedAt: string | null
}

export interface FilmNoteHistorySummary {
  taskId: string
  status: StudentTaskStatus
  workbook: {
    id: string
    title: string
    prompt: string | null
    noteCount: number
  }
  assignment: {
    dueAt: string | null
  }
  entries: FilmNoteHistoryEntry[]
  completedCount: number
}

function unwrapSingle<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null
  }
  return Array.isArray(value) ? value[0] ?? null : value
}

export async function fetchFilmNoteHistory(
  studentTaskId: string,
  studentId: string
): Promise<FilmNoteHistorySummary | null> {
  const supabase = createServerSupabase()

  const { data: taskRow, error: taskError } = await supabase
    .from('student_tasks')
    .select(
      `id, status, progress_meta,
       assignments:assignments(due_at, workbooks:workbooks(id, title, type, config)),
       student_task_items(id, item_id, workbook_items:workbook_items(id, prompt))`
    )
    .eq('id', studentTaskId)
    .eq('student_id', studentId)
    .maybeSingle()

  if (taskError) {
    console.error('[fetchFilmNoteHistory] failed to load task', taskError)
    throw new Error('감상지 히스토리를 불러오지 못했습니다.')
  }

  if (!taskRow) {
    return null
  }

  const task = taskRow as RawStudentTaskRow
  const assignment = unwrapSingle(task.assignments)
  const workbook = assignment ? unwrapSingle(assignment.workbooks) : null

  if (!workbook || workbook.type !== 'film') {
    return null
  }

  const firstItem = (task.student_task_items ?? []).map((item) => ({
    id: item?.id ?? '',
    workbookItemId: unwrapSingle(item?.workbook_items)?.id ?? item?.item_id ?? null,
    prompt: unwrapSingle(item?.workbook_items)?.prompt ?? null,
  }))[0]

  if (!firstItem?.workbookItemId) {
    return null
  }

  const filmConfig = (() => {
    const rawConfig = workbook.config ?? {}
    if (!rawConfig || typeof rawConfig !== 'object') {
      return null
    }
    const film = (rawConfig as { film?: unknown }).film
    return film && typeof film === 'object' ? (film as Record<string, unknown>) : null
  })()

  const progressFilm = (() => {
    const meta = task.progress_meta
    if (!meta || typeof meta !== 'object') {
      return null
    }
    const film = (meta as { film?: unknown }).film
    if (!film || typeof film !== 'object') {
      return null
    }
    const total = Number((film as { total?: unknown }).total)
    const completed = Number((film as { completed?: unknown }).completed)
    return {
      total: Number.isFinite(total) && total > 0 ? total : null,
      completed: Number.isFinite(completed) ? Math.max(0, completed) : 0,
    }
  })()

  const configuredNoteCount = (() => {
    const candidate = Number(filmConfig?.noteCount)
    if (Number.isFinite(candidate) && candidate > 0) {
      return candidate
    }
    if (progressFilm?.total && progressFilm.total > 0) {
      return progressFilm.total
    }
    return 1
  })()

  const { data: historyRows, error: historyError } = await supabase
    .from('film_note_histories')
    .select('note_index, content, completed, created_at, updated_at')
    .eq('student_task_id', studentTaskId)
    .eq('workbook_item_id', firstItem.workbookItemId)
    .order('note_index', { ascending: true })

  if (historyError) {
    console.error('[fetchFilmNoteHistory] failed to load note history', historyError)
    throw new Error('감상지 히스토리를 불러오지 못했습니다.')
  }

  const rowMap = new Map<number, RawFilmNoteHistoryRow>()
  for (const row of (historyRows ?? []) as RawFilmNoteHistoryRow[]) {
    rowMap.set(row.note_index, row)
  }

  const entries: FilmNoteHistoryEntry[] = []

  for (let index = 0; index < configuredNoteCount; index += 1) {
    const row = rowMap.get(index) ?? null
    const content = row ? sanitizeFilmEntry(coerceFilmEntry(row.content)) : createEmptyFilmEntry()
    entries.push({
      noteIndex: index,
      content,
      completed: Boolean(row?.completed),
      createdAt: row?.created_at ?? null,
      updatedAt: row?.updated_at ?? null,
    })
  }

  const completedCount = entries.filter((entry) => entry.completed).length

  return {
    taskId: task.id,
    status: task.status,
    workbook: {
      id: workbook.id,
      title: workbook.title ?? '제목 미정',
      prompt: firstItem.prompt ?? null,
      noteCount: configuredNoteCount,
    },
    assignment: {
      dueAt: assignment?.due_at ?? null,
    },
    entries,
    completedCount,
  }
}
