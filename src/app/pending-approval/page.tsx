import Link from 'next/link'
import { redirect } from 'next/navigation'

import { SignOutButton } from '@/components/dashboard/SignOutButton'
import { Badge } from '@/components/ui/badge'
import { getAuthContext, resolveDashboardPath } from '@/lib/auth'

export default async function PendingApprovalPage() {
  const { session, profile } = await getAuthContext()

  if (!session) {
    redirect('/login')
  }

  if (profile?.status === 'approved' && profile.role) {
    redirect(resolveDashboardPath(profile.role))
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-2xl space-y-8 rounded-2xl bg-white p-10 shadow-sm border border-slate-200">
        <div className="space-y-3 text-center">
          <Badge variant="secondary" className="px-3 py-1 text-sm">승인 대기 중</Badge>
          <h1 className="text-3xl font-bold text-slate-900">실장 확인을 기다리고 있어요</h1>
          <p className="text-slate-600 leading-relaxed">
            {profile?.name ?? profile?.email ?? '회원'}님, 가입 신청이 접수되었습니다.
            실장이 학원 구성원 여부를 확인한 뒤 승인하면 자동으로 알림 메일이 발송됩니다.
          </p>
        </div>
        <div className="space-y-4 text-sm text-slate-600">
          <p>빠른 승인을 원하시면 학원으로 연락해 가입하신 이메일과 이름을 알려주세요.</p>
          <p>승인 완료 전까지는 대시보드에 접근할 수 없습니다.</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-sm text-slate-500">
            잘못 가입하셨나요?&nbsp;
            <Link href="/login" className="font-medium text-slate-900 underline-offset-2 hover:underline">
              다른 계정으로 로그인
            </Link>
          </div>
          <SignOutButton />
        </div>
      </div>
    </div>
  )
}
