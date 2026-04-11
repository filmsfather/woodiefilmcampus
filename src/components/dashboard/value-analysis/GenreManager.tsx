"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Plus, Trash2, Settings } from "lucide-react"

import type { ValueAnalysisGenre } from "@/lib/value-analysis"
import {
  createGenre,
  deleteGenre,
} from "@/app/dashboard/value-analysis/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

interface GenreManagerProps {
  genres: ValueAnalysisGenre[]
}

export function GenreManager({ genres: initialGenres }: GenreManagerProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [genres, setGenres] = useState(initialGenres)
  const [newGenreName, setNewGenreName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleCreate = () => {
    const trimmed = newGenreName.trim()
    if (!trimmed) return

    setError(null)
    startTransition(async () => {
      const result = await createGenre({ name: trimmed })
      if (result.success && result.id) {
        setGenres((prev) => [
          ...prev,
          { id: result.id!, name: trimmed, sort_order: prev.length + 1 },
        ])
        setNewGenreName("")
        router.refresh()
      } else {
        setError(result.error ?? "장르 추가에 실패했습니다.")
      }
    })
  }

  const handleDelete = (genreId: string) => {
    if (!window.confirm("이 장르를 삭제할까요?")) return

    setDeletingId(genreId)
    setError(null)
    startTransition(async () => {
      const result = await deleteGenre(genreId)
      if (result.success) {
        setGenres((prev) => prev.filter((g) => g.id !== genreId))
        router.refresh()
      } else {
        setError(result.error ?? "장르 삭제에 실패했습니다.")
      }
      setDeletingId(null)
    })
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <Settings className="h-4 w-4" />
          <span>장르 관리</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full max-w-md">
        <SheetHeader>
          <SheetTitle>장르 관리</SheetTitle>
          <SheetDescription>
            가치분석 게시판에서 사용할 장르를 추가하거나 삭제합니다.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 pt-6">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Input
              value={newGenreName}
              onChange={(e) => setNewGenreName(e.target.value)}
              placeholder="새 장르 이름"
              maxLength={50}
              disabled={isPending}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  handleCreate()
                }
              }}
            />
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={isPending || !newGenreName.trim()}
            >
              {isPending && !deletingId ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            {genres.map((genre) => {
              const isDeleting = deletingId === genre.id
              return (
                <div
                  key={genre.id}
                  className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2"
                >
                  <Badge variant="secondary">{genre.name}</Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(genre.id)}
                    disabled={isPending}
                  >
                    {isDeleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 text-red-500" />
                    )}
                  </Button>
                </div>
              )
            })}
            {genres.length === 0 && (
              <p className="py-4 text-center text-sm text-slate-500">
                등록된 장르가 없습니다.
              </p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
