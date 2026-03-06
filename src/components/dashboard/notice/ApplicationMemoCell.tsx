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
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function startEditing() {
    if (isPending) return
    setEditing(true)
    setTimeout(() => {
      const ta = textareaRef.current
      if (ta) {
        ta.focus()
        ta.selectionStart = ta.value.length
        resizeTextarea(ta)
      }
    }, 0)
  }

  function resizeTextarea(el: HTMLTextAreaElement) {
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
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
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      textareaRef.current?.blur()
    }
    if (e.key === "Escape") {
      setMemo(saved)
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <textarea
        ref={textareaRef}
        rows={1}
        value={memo}
        onChange={(e) => {
          setMemo(e.target.value)
          resizeTextarea(e.target)
        }}
        onBlur={save}
        onKeyDown={handleKeyDown}
        className="w-full min-w-[120px] resize-none rounded border border-slate-300 bg-white px-2 py-1 text-sm leading-snug outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
        maxLength={500}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      disabled={isPending}
      className={cn(
        "block w-full min-w-[120px] cursor-text whitespace-pre-wrap break-words rounded px-1 py-0.5 text-left text-sm hover:bg-slate-100",
        isPending && "opacity-50",
        !saved && "text-slate-400"
      )}
    >
      {isPending ? "저장 중…" : saved || "메모 입력"}
    </button>
  )
}
