"use client"

import { useRef, useState, useTransition } from "react"

import { updateApplicationMemo } from "@/app/dashboard/teacher/notices/actions"
import { cn } from "@/lib/utils"

interface ApplicationMemoCellProps {
  applicationId: string
  initialMemo: string | null
}

export default function ApplicationMemoCell({ applicationId, initialMemo }: ApplicationMemoCellProps) {
  const [editing, setEditing] = useState(false)
  const [memo, setMemo] = useState(initialMemo ?? "")
  const [saved, setSaved] = useState(initialMemo ?? "")
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  function startEditing() {
    if (isPending) return
    setEditing(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function save() {
    setEditing(false)
    const trimmed = memo.trim()
    if (trimmed === saved) {
      setMemo(saved)
      return
    }
    startTransition(async () => {
      const result = await updateApplicationMemo(applicationId, trimmed)
      if (result.success) {
        setSaved(trimmed)
        setMemo(trimmed)
      } else {
        setMemo(saved)
      }
    })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault()
      inputRef.current?.blur()
    }
    if (e.key === "Escape") {
      setMemo(saved)
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        onBlur={save}
        onKeyDown={handleKeyDown}
        className="h-7 w-full min-w-[120px] rounded border border-slate-300 bg-white px-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
        maxLength={200}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      disabled={isPending}
      className={cn(
        "block w-full min-w-[120px] cursor-text truncate rounded px-1 py-0.5 text-left text-sm hover:bg-slate-100",
        isPending && "opacity-50",
        !saved && "text-slate-400"
      )}
    >
      {isPending ? "저장 중…" : saved || "메모 입력"}
    </button>
  )
}
