import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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
  assignment_id: string | null
  progress_meta: Record<string, unknown> | null
}

interface RawAssignmentRow {
  id: string
  workbook_id: string | null
  due_at: string | null
}

interface RawWorkbookRow {
  id: string
  title: string | null
  type: string | null
  config: Record<string, unknown> | null
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

export async function fetchFilmNoteHistory(
  studentTaskId: string,
  studentId: string
): Promise<FilmNoteHistorySummary | null> {
  const supabase = createServerSupabase()

  const { data: taskRow, error: taskError } = await supabase
    .from('student_tasks')
    .select('id, status, assignment_id, progress_meta')
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

  const adminClient = createAdminClient()

  const { data: assignmentRow, error: assignmentError } = await adminClient
    .from('assignments')
    .select('id, workbook_id, due_at')
    .eq('id', task.assignment_id)
    .maybeSingle()

  if (assignmentError) {
    console.error('[fetchFilmNoteHistory] failed to load assignment', assignmentError)
    throw new Error('감상지 히스토리를 불러오지 못했습니다.')
  }

  if (!assignmentRow?.workbook_id) {
    return null
  }

  const assignment = assignmentRow as RawAssignmentRow

  const { data: workbookRow, error: workbookError } = await adminClient
    .from('workbooks')
    .select('id, title, type, config')
    .eq('id', assignment.workbook_id)
    .maybeSingle()

  if (workbookError) {
    console.error('[fetchFilmNoteHistory] failed to load workbook', workbookError)
    throw new Error('감상지 히스토리를 불러오지 못했습니다.')
  }

  if (!workbookRow) {
    return null
  }

  const workbook = workbookRow as RawWorkbookRow
  const workbookType = typeof workbook.type === 'string' ? workbook.type.toLowerCase() : ''

  if (workbookType !== 'film') {
    return null
  }

  const { data: studentTaskItemRows, error: itemsError } = await adminClient
    .from('student_task_items')
    .select('id, item_id, workbook_items:workbook_items(id, prompt)')
    .eq('student_task_id', task.id)
    .order('created_at', { ascending: true })

  if (itemsError) {
    console.error('[fetchFilmNoteHistory] failed to load student_task_items', itemsError)
    throw new Error('감상지 히스토리를 불러오지 못했습니다.')
  }

  const firstItem = (studentTaskItemRows ?? []).map((row) => {
    const base = row as { id?: string; item_id?: string | null; workbook_items?: unknown }
    const rawLinked = base.workbook_items
    const linked = Array.isArray(rawLinked)
      ? (rawLinked[0] as { id: string | null; prompt: string | null } | undefined) ?? null
      : (rawLinked as { id: string | null; prompt: string | null } | null | undefined) ?? null

    return {
      id: base.id ?? '',
      workbookItemId: linked?.id ?? base.item_id ?? null,
      prompt: linked?.prompt ?? null,
    }
  })[0]

  const workbookItemId = firstItem?.workbookItemId ?? null

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

  const rowMap = new Map<number, RawFilmNoteHistoryRow>()

  if (workbookItemId) {
    const { data: historyRows, error: historyError } = await supabase
      .from('film_note_histories')
      .select('note_index, content, completed, created_at, updated_at')
      .eq('student_task_id', studentTaskId)
      .eq('workbook_item_id', workbookItemId)
      .order('note_index', { ascending: true })

    if (historyError) {
      console.error('[fetchFilmNoteHistory] failed to load note history', historyError)
      throw new Error('감상지 히스토리를 불러오지 못했습니다.')
    }

    for (const row of (historyRows ?? []) as RawFilmNoteHistoryRow[]) {
      rowMap.set(row.note_index, row)
    }
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
      prompt: firstItem?.prompt ?? null,
      noteCount: configuredNoteCount,
    },
    assignment: {
      dueAt: assignment?.due_at ?? null,
    },
    entries,
    completedCount,
  }
}
