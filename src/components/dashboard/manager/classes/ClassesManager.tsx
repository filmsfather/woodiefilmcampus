'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { deleteClassAction } from '@/app/dashboard/manager/classes/actions'
import { ClassesTable } from '@/components/dashboard/manager/classes/ClassesTable'
import { ClassEditor } from '@/components/dashboard/manager/classes/ClassEditor'
import { ClassesToolbar } from '@/components/dashboard/manager/classes/ClassesToolbar'
import type { ClassSummary, ProfileOption } from '@/types/class'
import { useGlobalTransition } from '@/hooks/use-global-loading'

type EditorState =
  | { mode: 'create' }
  | { mode: 'edit'; classId: string }

interface ClassesManagerProps {
  classes: ClassSummary[]
  teacherOptions: ProfileOption[]
  studentOptions: ProfileOption[]
  searchTerm: string
}

type FeedbackState = {
  type: 'success' | 'error'
  message: string
}

export function ClassesManager({
  classes,
  teacherOptions,
  studentOptions,
  searchTerm,
}: ClassesManagerProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [searchValue, setSearchValue] = useState(searchTerm)
  const [editorState, setEditorState] = useState<EditorState | null>(null)
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [, startTransition] = useGlobalTransition()

  useEffect(() => {
    setSearchValue(searchTerm)
  }, [searchTerm])

  const handleSearchSubmit = () => {
    const nextParams = new URLSearchParams(searchParams?.toString() ?? '')
    const trimmed = searchValue.trim()

    if (trimmed) {
      nextParams.set('search', trimmed)
    } else {
      nextParams.delete('search')
    }

    const query = nextParams.toString()
    const target = query ? `${pathname}?${query}` : pathname
    router.replace(target, { scroll: false })
  }

  const handleResetSearch = () => {
    setSearchValue('')
    router.replace(pathname, { scroll: false })
  }

  const handleCreate = () => {
    setEditorState({ mode: 'create' })
    setFeedback(null)
  }

  const handleEdit = (classId: string) => {
    setEditorState({ mode: 'edit', classId })
    setFeedback(null)
  }

  const handleDelete = (classId: string, className: string) => {
    const confirmed = window.confirm(`정말로 "${className}" 반을 삭제하시겠습니까?`)

    if (!confirmed) {
      return
    }

    setDeletingId(classId)
    startTransition(() => {
      void (async () => {
        const result = await deleteClassAction(classId)
        await router.refresh()
        setDeletingId(null)

        if (result.status === 'success') {
          setFeedback({ type: 'success', message: result.message ?? '반을 삭제했습니다.' })
        } else if (result.status === 'error') {
          setFeedback({ type: 'error', message: result.message ?? '반 삭제 중 오류가 발생했습니다.' })
        }
      })()
    })
  }

  const handleEditorCompleted = (message: string) => {
    setEditorState(null)
    setFeedback({ type: 'success', message })
    void router.refresh()
  }

  const activeClass = useMemo(() => {
    if (editorState?.mode === 'edit') {
      return classes.find((item) => item.id === editorState.classId)
    }

    return undefined
  }, [classes, editorState])

  return (
    <div className="space-y-6">
      <ClassesToolbar
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        onSearchSubmit={handleSearchSubmit}
        onResetSearch={handleResetSearch}
        onCreate={handleCreate}
      />

      {feedback && (
        <div
          className={`rounded-md border px-4 py-2 text-sm ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-destructive/40 bg-destructive/10 text-destructive'
          }`}
        >
          {feedback.message}
        </div>
      )}

      {editorState && (editorState.mode === 'create' || activeClass) ? (
        <ClassEditor
          key={editorState.mode === 'edit' ? editorState.classId : 'create'}
          mode={editorState.mode}
          classData={editorState.mode === 'edit' ? activeClass : undefined}
          teacherOptions={teacherOptions}
          studentOptions={studentOptions}
          onCancel={() => setEditorState(null)}
          onCompleted={handleEditorCompleted}
        />
      ) : null}

      <ClassesTable
        classes={classes}
        onEdit={handleEdit}
        onDelete={handleDelete}
        deletingId={deletingId}
      />
    </div>
  )
}
