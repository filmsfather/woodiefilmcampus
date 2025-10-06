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
  taskItem: {
    id: string | null
    workbookItemId: string | null
  }
  noteSlots: FilmNoteEntry[]
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
      id: (typeof base.id === 'string' && base.id.length > 0) ? base.id : null,
      workbookItemId:
        (linked && typeof linked.id === 'string' && linked.id.length > 0)
          ? linked.id
          : (typeof base.item_id === 'string' && base.item_id.length > 0)
            ? base.item_id
            : null,
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
  const noteSlots: FilmNoteEntry[] = []

  for (let index = 0; index < configuredNoteCount; index += 1) {
    const row = rowMap.get(index) ?? null
    const content = row ? sanitizeFilmEntry(coerceFilmEntry(row.content)) : createEmptyFilmEntry()
    noteSlots.push(content)
    entries.push({
      noteIndex: index,
      content,
      completed: Boolean(row?.completed),
      createdAt: row?.created_at ?? null,
      updatedAt: row?.updated_at ?? null,
    })
  }

  const completedEntries = entries.filter((entry) => entry.completed)
  const completedCount = completedEntries.length

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
    taskItem: {
      id: firstItem?.id ?? null,
      workbookItemId,
    },
    noteSlots,
    entries: completedEntries,
    completedCount,
  }
}


export interface StudentFilmNoteListItem {
  id: string
  source: 'assignment' | 'personal'
  content: FilmNoteEntry
  completed: boolean
  noteIndex: number | null
  createdAt: string
  updatedAt: string
  assignment: {
    id: string
    dueAt: string | null
    workbookTitle: string | null
    workbookType: string | null
    prompt: string | null
    studentTaskId: string | null
  } | null
}

export async function fetchStudentFilmNotesList(studentId: string): Promise<StudentFilmNoteListItem[]> {
  const supabase = createServerSupabase()

  const { data, error } = await supabase
    .from('film_notes')
    .select(
      'id, source, assignment_id, student_task_id, workbook_item_id, note_index, content, completed, created_at, updated_at'
    )
    .eq('student_id', studentId)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[fetchStudentFilmNotesList] failed to load film_notes', error)
    throw new Error('감상지 목록을 불러오지 못했습니다.')
  }

  const rows = (data ?? []) as Array<{
    id: string
    source: string
    assignment_id: string | null
    student_task_id: string | null
    workbook_item_id: string | null
    note_index: number | null
    content: unknown
    completed: boolean | null
    created_at: string
    updated_at: string
  }>

  if (rows.length === 0) {
    return []
  }

  const assignmentIdSet = new Set<string>()
  const workbookItemIdSet = new Set<string>()

  for (const row of rows) {
    if (row.source === 'assignment') {
      if (typeof row.assignment_id === 'string' && row.assignment_id.length > 0) {
        assignmentIdSet.add(row.assignment_id)
      }
      if (typeof row.workbook_item_id === 'string' && row.workbook_item_id.length > 0) {
        workbookItemIdSet.add(row.workbook_item_id)
      }
    }
  }

  const adminClient = createAdminClient()

  const assignmentMap = new Map<string, RawAssignmentRow>()
  if (assignmentIdSet.size > 0) {
    const { data: assignmentRows, error: assignmentError } = await adminClient
      .from('assignments')
      .select('id, workbook_id, due_at')
      .in('id', Array.from(assignmentIdSet))

    if (assignmentError) {
      console.error('[fetchStudentFilmNotesList] failed to load assignments', assignmentError)
      throw new Error('감상지 목록을 불러오지 못했습니다.')
    }

    for (const row of assignmentRows ?? []) {
      assignmentMap.set((row as RawAssignmentRow).id, row as RawAssignmentRow)
    }
  }

  const workbookIdSet = new Set<string>()
  for (const assignment of assignmentMap.values()) {
    if (typeof assignment.workbook_id === 'string' && assignment.workbook_id.length > 0) {
      workbookIdSet.add(assignment.workbook_id)
    }
  }

  const workbookMap = new Map<string, RawWorkbookRow>()
  if (workbookIdSet.size > 0) {
    const { data: workbookRows, error: workbookError } = await adminClient
      .from('workbooks')
      .select('id, title, type, config')
      .in('id', Array.from(workbookIdSet))

    if (workbookError) {
      console.error('[fetchStudentFilmNotesList] failed to load workbooks', workbookError)
      throw new Error('감상지 목록을 불러오지 못했습니다.')
    }

    for (const row of workbookRows ?? []) {
      workbookMap.set((row as RawWorkbookRow).id, row as RawWorkbookRow)
    }
  }

  const workbookItemMap = new Map<string, { prompt: string | null; workbookId: string | null }>()
  if (workbookItemIdSet.size > 0) {
    const { data: workbookItemRows, error: workbookItemError } = await adminClient
      .from('workbook_items')
      .select('id, prompt, workbook_id')
      .in('id', Array.from(workbookItemIdSet))

    if (workbookItemError) {
      console.error('[fetchStudentFilmNotesList] failed to load workbook items', workbookItemError)
      throw new Error('감상지 목록을 불러오지 못했습니다.')
    }

    for (const row of workbookItemRows ?? []) {
      const record = row as { id: string; prompt: string | null; workbook_id: string | null }
      workbookItemMap.set(record.id, { prompt: record.prompt ?? null, workbookId: record.workbook_id ?? null })
    }
  }

  return rows.map((row) => {
    const normalizedContent = sanitizeFilmEntry(coerceFilmEntry(row.content))
    const source = row.source === 'assignment' ? 'assignment' : 'personal'
    const noteIndex = typeof row.note_index === 'number' ? row.note_index : null

    let assignmentMeta: StudentFilmNoteListItem['assignment'] = null

    if (source === 'assignment' && row.assignment_id) {
      const assignment = assignmentMap.get(row.assignment_id)
      const workbook = assignment?.workbook_id ? workbookMap.get(assignment.workbook_id) : null
      const workbookItem = row.workbook_item_id ? workbookItemMap.get(row.workbook_item_id) : null

      assignmentMeta = {
        id: row.assignment_id,
        dueAt: assignment?.due_at ?? null,
        workbookTitle: workbook?.title ?? null,
        workbookType: workbook?.type ?? null,
        prompt: workbookItem?.prompt ?? null,
        studentTaskId: row.student_task_id ?? null,
      }
    }

    return {
      id: row.id,
      source,
      content: normalizedContent,
      completed: Boolean(row.completed),
      noteIndex,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      assignment: assignmentMeta,
    }
  })
}
