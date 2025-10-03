import { AuthForm } from '@/components/auth/AuthForm'
import { redirectAuthenticatedUser } from '@/lib/auth'

export default async function LoginPage() {
  await redirectAuthenticatedUser()

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-gray-900">대시보드 로그인</h1>
          <p className="text-gray-600">
            Supabase 계정으로 로그인하거나 새 계정을 만들고 역할별 대시보드를 확인하세요.
          </p>
        </div>
        <AuthForm />
      </div>
    </div>
  )
}
