"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Trash2, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { deleteCulturePick } from "@/app/dashboard/culture-picks/actions"

interface DeletePickButtonProps {
  pickId: string
}

export function DeletePickButton({ pickId }: DeletePickButtonProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const handleDelete = () => {
    if (!confirm("이 콘텐츠를 삭제하시겠습니까?\n관련된 모든 한줄평과 댓글도 함께 삭제됩니다.")) {
      return
    }

    startTransition(async () => {
      const result = await deleteCulturePick(pickId)
      if (result.success) {
        router.push("/dashboard/culture-picks")
      } else {
        alert(result.error ?? "삭제에 실패했습니다.")
      }
    })
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleDelete}
      disabled={isPending}
      className="text-red-600 hover:text-red-700 hover:bg-red-50"
    >
      {isPending ? (
        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
      ) : (
        <Trash2 className="mr-1 h-4 w-4" />
      )}
      삭제
    </Button>
  )
}

