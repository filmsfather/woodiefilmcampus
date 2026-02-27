"use client"

import { useState } from "react"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface ChangePasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function translateUpdateError(input: string) {
  const normalized = input.trim().toLowerCase()
  if (normalized.includes("password should be at least")) {
    return "비밀번호는 최소 6자 이상이어야 합니다."
  }
  if (normalized.includes("password should contain")) {
    return "비밀번호 복잡도 요구사항을 충족하지 못했습니다."
  }
  if (normalized.includes("same password")) {
    return "현재 비밀번호와 동일한 비밀번호는 사용할 수 없습니다."
  }
  return input
}

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: ChangePasswordDialogProps) {
  const supabase = createClient()

  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [formError, setFormError] = useState("")
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const reset = () => {
    setNewPassword("")
    setConfirmPassword("")
    setFormError("")
    setSuccess(false)
    setSubmitting(false)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFormError("")

    const trimmed = newPassword.trim()
    const trimmedConfirm = confirmPassword.trim()

    if (!trimmed || trimmed.length < 6) {
      setFormError("비밀번호는 최소 6자 이상이어야 합니다.")
      return
    }

    if (trimmed !== trimmedConfirm) {
      setFormError("비밀번호가 일치하지 않습니다.")
      return
    }

    try {
      setSubmitting(true)
      const { error } = await supabase.auth.updateUser({ password: trimmed })
      if (error) throw error
      setSuccess(true)
    } catch (error: unknown) {
      const fallback =
        error instanceof Error
          ? translateUpdateError(error.message)
          : "비밀번호 변경 중 오류가 발생했습니다."
      setFormError(fallback)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>비밀번호 변경</DialogTitle>
          <DialogDescription>
            새로운 비밀번호를 입력해주세요.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="space-y-4">
            <Alert>
              <AlertDescription>
                비밀번호가 변경되었습니다.
              </AlertDescription>
            </Alert>
            <Button
              className="w-full"
              onClick={() => handleOpenChange(false)}
            >
              닫기
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="change-new-pw">새 비밀번호</Label>
              <Input
                id="change-new-pw"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                minLength={6}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="change-confirm-pw">비밀번호 확인</Label>
              <Input
                id="change-confirm-pw"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                minLength={6}
                required
              />
            </div>
            {formError && (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "변경 중..." : "비밀번호 변경"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
