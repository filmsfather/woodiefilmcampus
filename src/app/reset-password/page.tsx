'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

type ViewState = 'verifying' | 'ready' | 'error' | 'success'

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordFallback />}>
      <ResetPasswordContent />
    </Suspense>
  )
}

function ResetPasswordFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-primary/15 via-background to-secondary/10 px-6 py-12">
      <Card className="w-full max-w-lg border border-border/80 bg-card/80 shadow">
        <CardHeader>
          <CardTitle className="text-center">비밀번호 재설정</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground">링크를 검증하고 있습니다...</p>
        </CardContent>
      </Card>
    </div>
  )
}

function ResetPasswordContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const code = searchParams.get('code')
  const type = searchParams.get('type')

  const supabase = useMemo(() => createClient(), [])

  const [status, setStatus] = useState<ViewState>('verifying')
  const [errorMessage, setErrorMessage] = useState('')
  const [formError, setFormError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const translateRecoveryError = (input: string) => {
    const normalized = input.trim().toLowerCase()

    if (normalized.includes('invalid or expired')) {
      return '유효하지 않은 또는 만료된 링크입니다.'
    }

    if (normalized.includes('session not found')) {
      return '로그인 세션을 확인할 수 없습니다. 링크를 다시 요청해주세요.'
    }

    if (normalized.includes('invalid authentication credentials')) {
      return '인증 정보가 올바르지 않습니다.'
    }

    return input
  }

  const translateUpdateError = (input: string) => {
    const normalized = input.trim().toLowerCase()

    if (normalized.includes('password should be at least')) {
      return '비밀번호는 최소 6자 이상이어야 합니다.'
    }

    if (normalized.includes('password should contain')) {
      return '비밀번호 복잡도 요구사항을 충족하지 못했습니다.'
    }

    return input
  }

  useEffect(() => {
    if (status !== 'verifying') {
      return
    }

    const verifyRecovery = async () => {
      try {
        if (code && type === 'recovery') {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) {
            throw error
          }
          setStatus('ready')
          return
        }

        if (typeof window !== 'undefined') {
          const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
          const hashType = hashParams.get('type')
          const accessToken = hashParams.get('access_token')
          const refreshToken = hashParams.get('refresh_token')

          if (hashType === 'recovery' && accessToken && refreshToken) {
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            })
            if (error) {
              throw error
            }
            setStatus('ready')
            return
          }
        }

        throw new Error('유효하지 않은 또는 만료된 링크입니다.')
      } catch (error: unknown) {
        const fallback =
          error instanceof Error
            ? translateRecoveryError(error.message)
            : '비밀번호 재설정 링크 확인 중 오류가 발생했습니다.'
        setErrorMessage(fallback)
        setStatus('error')
      }
    }

    void verifyRecovery()
  }, [code, supabase, type, status])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError('')
    setSuccessMessage('')

    const trimmedPassword = newPassword.trim()
    const trimmedConfirm = confirmPassword.trim()

    if (!trimmedPassword || trimmedPassword.length < 6) {
      setFormError('비밀번호는 최소 6자 이상이어야 합니다.')
      return
    }

    if (trimmedPassword !== trimmedConfirm) {
      setFormError('비밀번호가 일치하지 않습니다.')
      return
    }

    try {
      setSubmitting(true)
      const { error } = await supabase.auth.updateUser({
        password: trimmedPassword,
      })
      if (error) {
        throw error
      }
      await supabase.auth.signOut()
      setSuccessMessage('비밀번호가 변경되었습니다. 새 비밀번호로 다시 로그인해주세요.')
      setStatus('success')
    } catch (error: unknown) {
      const fallback =
        error instanceof Error
          ? translateUpdateError(error.message)
          : '비밀번호 변경 중 오류가 발생했습니다.'
      setFormError(fallback)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-primary/15 via-background to-secondary/10 px-6 py-12">
      <Card className="w-full max-w-lg border border-border/80 bg-card/80 shadow">
        <CardHeader>
          <CardTitle className="text-center">비밀번호 재설정</CardTitle>
        </CardHeader>
        <CardContent>
          {status === 'verifying' && (
            <p className="text-center text-muted-foreground">링크를 검증하고 있습니다...</p>
          )}

          {status === 'error' && (
            <div className="space-y-4">
              <Alert variant="destructive">
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
              <Button className="w-full" onClick={() => router.push('/login')}>
                로그인으로 이동
              </Button>
            </div>
          )}

          {status === 'ready' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">새 비밀번호</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">비밀번호 확인</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
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
                {submitting ? '변경 중...' : '비밀번호 변경하기'}
              </Button>
            </form>
          )}

          {status === 'success' && (
            <div className="space-y-4 text-center">
              <Alert>
                <AlertDescription>{successMessage}</AlertDescription>
              </Alert>
              <Button className="w-full" onClick={() => router.push('/login')}>
                로그인으로 이동
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
