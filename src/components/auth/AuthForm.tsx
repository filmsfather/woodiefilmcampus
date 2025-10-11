'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

export function AuthForm() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [studentName, setStudentName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [parentPhoneNumber, setParentPhoneNumber] = useState('')
  const [academicRecord, setAcademicRecord] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [isResetPassword, setIsResetPassword] = useState(false)
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const translateAuthError = (input: string) => {
    const normalized = input.trim().toLowerCase()

    if (normalized.includes('invalid login credentials')) {
      return '이메일 또는 비밀번호를 다시 확인해주세요.'
    }

    if (normalized.includes('email not confirmed')) {
      return '이메일 인증이 완료되지 않았습니다. 받은 편지함을 확인해주세요.'
    }

    if (normalized.includes('user already registered')) {
      return '이미 가입된 이메일입니다. 로그인으로 이동해주세요.'
    }

    if (normalized.includes('over email send rate limit')) {
      return '이메일 발송 제한에 도달했습니다. 잠시 후 다시 시도해주세요.'
    }

    if (normalized.includes('password should be at least')) {
      return '비밀번호는 최소 6자 이상이어야 합니다.'
    }

    return input
  }

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      if (isResetPassword) {
        const trimmedEmail = email.trim()
        if (!trimmedEmail) {
          setMessage('이메일을 입력해주세요.')
          return
        }

        const baseUrl =
          process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ??
          (typeof window !== 'undefined' ? window.location.origin : '')

        if (!baseUrl) {
          throw new Error('비밀번호 재설정 URL을 확인할 수 없습니다.')
        }

        const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
          redirectTo: `${baseUrl}/reset-password`,
        })
        if (error) throw error
        setMessage('비밀번호 재설정 링크를 이메일로 전송했습니다.')
        return
      }

      if (isSignUp) {
        const trimmedPassword = password.trim()
        const trimmedConfirm = confirmPassword.trim()
        if (!trimmedPassword || !trimmedConfirm || trimmedPassword !== trimmedConfirm) {
          setMessage('비밀번호가 일치하는지 확인해주세요.')
          return
        }

        const trimmedName = studentName.trim()
        const trimmedPhone = phoneNumber.trim()
        const trimmedAcademicRecord = academicRecord.trim()
        const trimmedParentPhone = parentPhoneNumber.trim()

        if (!trimmedName || !trimmedPhone || !trimmedAcademicRecord) {
          setMessage('필수 정보를 모두 입력해주세요.')
          return
        }

        const { error } = await supabase.auth.signUp({
          email,
          password: trimmedPassword,
          options: {
            data: {
              name: trimmedName,
              student_phone: trimmedPhone,
              parent_phone: trimmedParentPhone || null,
              academic_record: trimmedAcademicRecord,
            },
          },
        })
        if (error) throw error
        setMessage('회원가입이 완료되었습니다. 이메일을 확인해주세요.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error
        router.push('/dashboard')
        router.refresh()
      }
    } catch (error: unknown) {
      const fallback =
        error instanceof Error
          ? translateAuthError(error.message)
          : '알 수 없는 오류가 발생했습니다.'
      setMessage(fallback)
    } finally {
      setLoading(false)
    }
  }

  const heading = isResetPassword ? '비밀번호 재설정' : isSignUp ? '회원가입' : '로그인'
  const submitLabel = isResetPassword
    ? '재설정 링크 보내기'
    : isSignUp
      ? '회원가입'
      : '로그인'

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="text-center">{heading}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleAuth} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">이메일</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          {!isResetPassword && (
            <div className="space-y-2">
              <Label htmlFor="password">비밀번호</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
              />
            </div>
          )}
          {isSignUp && !isResetPassword && (
            <div className="space-y-2">
              <Label htmlFor="confirm-password">비밀번호 확인</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
          )}
          {isSignUp && !isResetPassword && (
            <>
              <div className="space-y-2">
                <Label htmlFor="student-name">학생 이름</Label>
                <Input
                  id="student-name"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone-number">핸드폰 번호</Label>
                <Input
                  id="phone-number"
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  required
                  autoComplete="tel"
                  placeholder="010-1234-5678"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="parent-phone-number">부모님 번호 (선택)</Label>
                <Input
                  id="parent-phone-number"
                  type="tel"
                  value={parentPhoneNumber}
                  onChange={(e) => setParentPhoneNumber(e.target.value)}
                  autoComplete="tel"
                  placeholder="010-0000-0000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="academic-record">내신 성적 또는 검정고시</Label>
                <Input
                  id="academic-record"
                  value={academicRecord}
                  onChange={(e) => setAcademicRecord(e.target.value)}
                  required
                  placeholder="예: 2.3 / 검정고시"
                />
              </div>
            </>
          )}
          {!isSignUp && !isResetPassword && (
            <div className="text-right">
              <Button
                type="button"
                variant="link"
                className="px-0"
                onClick={() => {
                  setIsResetPassword(true)
                  setIsSignUp(false)
                  setMessage('')
                  setPassword('')
                  setConfirmPassword('')
                }}
              >
                비밀번호를 잊으셨나요?
              </Button>
            </div>
          )}
          {message && (
            <Alert>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? '처리 중...' : submitLabel}
          </Button>
        </form>
        <div className="mt-4 text-center">
          {isResetPassword ? (
            <Button
              variant="link"
              onClick={() => {
                setIsResetPassword(false)
                setMessage('')
              }}
            >
              로그인으로 돌아가기
            </Button>
          ) : (
            <Button
              variant="link"
              onClick={() => {
                const nextIsSignUp = !isSignUp
                setIsSignUp(nextIsSignUp)
                setIsResetPassword(false)
                setMessage('')
                setStudentName('')
                setPhoneNumber('')
                setParentPhoneNumber('')
                setAcademicRecord('')
                setConfirmPassword('')
              }}
            >
              {isSignUp ? '이미 계정이 있으신가요? 로그인' : '계정이 없으신가요? 회원가입'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
