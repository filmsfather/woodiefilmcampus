'use client'

import { useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { completeProfile, type CompleteProfileState } from './actions'

export default function CompleteProfilePage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [existingName, setExistingName] = useState<string>('')

  const [state, formAction, isPending] = useActionState<CompleteProfileState, FormData>(
    completeProfile,
    {}
  )

  useEffect(() => {
    async function checkAuth() {
      const { data: userData } = await supabase.auth.getUser()

      if (!userData.user) {
        router.push('/login')
        return
      }

      setUserEmail(userData.user.email ?? null)

      // OAuth로 로그인한 경우 Google/Kakao에서 받은 이름이 있을 수 있음
      const googleName = userData.user.user_metadata?.full_name
      const kakaoName = userData.user.user_metadata?.name
      const existingProfileName = userData.user.user_metadata?.name

      setExistingName(googleName || kakaoName || existingProfileName || '')
      setLoading(false)
    }

    checkAuth()
  }, [supabase, router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-slate-600">로딩 중...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4 py-12">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-2xl font-bold text-slate-900">
            프로필 완성하기
          </CardTitle>
          <CardDescription className="text-slate-600">
            서비스 이용을 위해 추가 정보를 입력해주세요.
            {userEmail && (
              <span className="block mt-1 text-sm font-medium text-slate-500">
                {userEmail}
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name">
                학생 이름 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                name="name"
                defaultValue={existingName}
                placeholder="홍길동"
                required
                autoComplete="name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="student_phone">
                핸드폰 번호 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="student_phone"
                name="student_phone"
                type="tel"
                placeholder="010-1234-5678"
                required
                autoComplete="tel"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="parent_phone">
                부모님 번호 <span className="text-slate-400">(선택)</span>
              </Label>
              <Input
                id="parent_phone"
                name="parent_phone"
                type="tel"
                placeholder="010-0000-0000"
                autoComplete="tel"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="academic_record">
                내신 성적 또는 검정고시 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="academic_record"
                name="academic_record"
                placeholder="예: 2.3 / 검정고시"
                required
              />
              <p className="text-xs text-slate-500">
                내신 등급 또는 검정고시 여부를 입력해주세요.
              </p>
            </div>

            {state.error && (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? '저장 중...' : '프로필 완성하기'}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-slate-500">
              프로필 완성 후 관리자 승인이 필요합니다.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

