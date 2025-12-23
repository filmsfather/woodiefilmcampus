'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

export function AuthForm() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isResetPassword, setIsResetPassword] = useState(false)
  const [showEmailLogin, setShowEmailLogin] = useState(false)
  const [loading, setLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState<'google' | 'kakao' | null>(null)
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
      return '이미 가입된 이메일입니다.'
    }

    if (normalized.includes('over email send rate limit')) {
      return '이메일 발송 제한에 도달했습니다. 잠시 후 다시 시도해주세요.'
    }

    if (normalized.includes('password should be at least')) {
      return '비밀번호는 최소 6자 이상이어야 합니다.'
    }

    return input
  }

  const handleOAuthLogin = async (provider: 'google' | 'kakao') => {
    setOauthLoading(provider)
    setMessage('')

    try {
      const redirectTo =
        process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ??
        (typeof window !== 'undefined' ? window.location.origin : '')

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${redirectTo}/auth/callback`,
        },
      })

      if (error) throw error
    } catch (error: unknown) {
      const fallback =
        error instanceof Error
          ? translateAuthError(error.message)
          : '로그인 중 오류가 발생했습니다.'
      setMessage(fallback)
      setOauthLoading(null)
    }
  }

  const handleEmailLogin = async (e: React.FormEvent) => {
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

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) throw error
      router.push('/dashboard')
      router.refresh()
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

  return (
    <Card className="w-full max-w-md mx-auto border-0 shadow-none bg-transparent">
      <CardHeader className="pb-4">
        <CardTitle className="text-center text-xl">시작하기</CardTitle>
        <CardDescription className="text-center">
          간편하게 로그인하고 캠퍼스에 접속하세요
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* OAuth 버튼들 */}
        <div className="space-y-3">
          {/* 카카오 로그인 버튼 */}
          <Button
            type="button"
            className="w-full h-12 text-base font-medium bg-[#FEE500] hover:bg-[#FDD800] text-[#191919] border-0"
            onClick={() => handleOAuthLogin('kakao')}
            disabled={oauthLoading !== null}
          >
            {oauthLoading === 'kakao' ? (
              '연결 중...'
            ) : (
              <span className="flex items-center justify-center gap-2">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M10 3C5.58172 3 2 5.79086 2 9.2C2 11.3894 3.38899 13.3133 5.5 14.4L4.5 17.5C4.44772 17.6657 4.55228 17.8343 4.71569 17.8866C4.80392 17.9133 4.89608 17.8866 4.96569 17.8268L8.5 15.3C8.99099 15.3667 9.49099 15.4 10 15.4C14.4183 15.4 18 12.6091 18 9.2C18 5.79086 14.4183 3 10 3Z"
                    fill="#191919"
                  />
                </svg>
                카카오로 시작하기
              </span>
            )}
          </Button>

          {/* 구글 로그인 버튼 */}
          <Button
            type="button"
            variant="outline"
            className="w-full h-12 text-base font-medium bg-white hover:bg-gray-50 border-gray-300"
            onClick={() => handleOAuthLogin('google')}
            disabled={oauthLoading !== null}
          >
            {oauthLoading === 'google' ? (
              '연결 중...'
            ) : (
              <span className="flex items-center justify-center gap-2">
                <svg width="20" height="20" viewBox="0 0 20 20">
                  <path
                    d="M19.6 10.23c0-.68-.06-1.34-.17-1.97H10v3.73h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.89-1.74 2.98-4.3 2.98-7.28z"
                    fill="#4285F4"
                  />
                  <path
                    d="M10 20c2.7 0 4.96-.9 6.62-2.42l-3.24-2.5c-.9.6-2.04.95-3.38.95-2.6 0-4.8-1.76-5.58-4.12H1.08v2.58A9.99 9.99 0 0 0 10 20z"
                    fill="#34A853"
                  />
                  <path
                    d="M4.42 11.91A6.01 6.01 0 0 1 4.1 10c0-.66.11-1.31.32-1.91V5.51H1.08A9.99 9.99 0 0 0 0 10c0 1.61.39 3.14 1.08 4.49l3.34-2.58z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M10 3.98c1.47 0 2.79.5 3.82 1.5l2.87-2.87A9.99 9.99 0 0 0 10 0 9.99 9.99 0 0 0 1.08 5.51l3.34 2.58C5.2 5.74 7.4 3.98 10 3.98z"
                    fill="#EA4335"
                  />
                </svg>
                Google로 계속하기
              </span>
            )}
          </Button>
        </div>

        {/* 구분선 */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-3 bg-card text-muted-foreground">또는</span>
          </div>
        </div>

        {/* 이메일 로그인 토글 */}
        {!showEmailLogin && !isResetPassword ? (
          <Button
            type="button"
            variant="ghost"
            className="w-full text-muted-foreground hover:text-foreground"
            onClick={() => setShowEmailLogin(true)}
          >
            이메일로 로그인 ▾
          </Button>
        ) : (
          <div className="space-y-4 pt-2">
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm">
                  이메일
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="h-11"
                  placeholder="email@example.com"
                />
              </div>

              {!isResetPassword && (
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm">
                    비밀번호
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="h-11"
                  />
                </div>
              )}

              {!isResetPassword && (
                <div className="text-right">
                  <Button
                    type="button"
                    variant="link"
                    className="px-0 text-sm text-muted-foreground"
                    onClick={() => {
                      setIsResetPassword(true)
                      setMessage('')
                      setPassword('')
                    }}
                  >
                    비밀번호를 잊으셨나요?
                  </Button>
                </div>
              )}

              {message && (
                <Alert variant={message.includes('전송했습니다') ? 'default' : 'destructive'}>
                  <AlertDescription>{message}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" className="w-full h-11" disabled={loading}>
                {loading
                  ? '처리 중...'
                  : isResetPassword
                    ? '재설정 링크 보내기'
                    : '로그인'}
              </Button>
            </form>

            <div className="flex justify-center gap-4 text-sm">
              {isResetPassword ? (
                <Button
                  type="button"
                  variant="link"
                  className="px-0 text-muted-foreground"
                  onClick={() => {
                    setIsResetPassword(false)
                    setMessage('')
                  }}
                >
                  로그인으로 돌아가기
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="link"
                  className="px-0 text-muted-foreground"
                  onClick={() => {
                    setShowEmailLogin(false)
                    setMessage('')
                    setEmail('')
                    setPassword('')
                  }}
                >
                  접기 ▴
                </Button>
              )}
            </div>
          </div>
        )}

        {/* 안내 문구 */}
        <p className="text-center text-xs text-muted-foreground pt-4">
          처음이신가요? 카카오 또는 Google로 시작하면
          <br />
          자동으로 계정이 생성됩니다.
        </p>
      </CardContent>
    </Card>
  )
}
