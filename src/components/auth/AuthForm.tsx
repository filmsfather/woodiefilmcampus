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
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      if (isSignUp) {
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
          password,
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
      const fallback = error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다."
      setMessage(fallback)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="text-center">
          {isSignUp ? '회원가입' : '로그인'}
        </CardTitle>
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
          {isSignUp && (
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
          {message && (
            <Alert>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? '처리 중...' : isSignUp ? '회원가입' : '로그인'}
          </Button>
        </form>
        <div className="mt-4 text-center">
          <Button
            variant="link"
            onClick={() => {
              setIsSignUp(!isSignUp)
              setMessage('')
              setStudentName('')
              setPhoneNumber('')
              setParentPhoneNumber('')
              setAcademicRecord('')
            }}
          >
            {isSignUp ? '이미 계정이 있으신가요? 로그인' : '계정이 없으신가요? 회원가입'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
