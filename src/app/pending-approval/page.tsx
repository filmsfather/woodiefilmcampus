import Link from 'next/link'
import { redirect } from 'next/navigation'

import { SignOutButton } from '@/components/dashboard/SignOutButton'
import { Badge } from '@/components/ui/badge'
import { getAuthContext, resolveDashboardPath } from '@/lib/auth'

const statusLabelMap: Record<'pending' | 'withdrawn' | 'graduated' | 'rejected', string> = {
  pending: '승인 대기 중',
  withdrawn: '퇴원 처리됨',
  graduated: '졸업 처리됨',
  rejected: '접근 제한',
}

export default async function PendingApprovalPage() {
  const { session, profile } = await getAuthContext()

  if (!session) {
    redirect('/login')
  }

  if (profile?.status === 'approved' && profile.role) {
    redirect(resolveDashboardPath(profile.role))
  }

  const status = (profile?.status as 'pending' | 'withdrawn' | 'graduated' | 'rejected' | 'approved' | undefined) ?? 'pending'
  const isPending = status === 'pending'
  const isInactive = status === 'withdrawn' || status === 'graduated'
  const isRejected = status === 'rejected'

  const badgeLabel = isPending ? statusLabelMap.pending : isInactive ? statusLabelMap[status] : statusLabelMap.rejected

  const heading = isPending
    ? '실장 확인을 기다리고 있어요'
    : isInactive
      ? '접근이 제한된 계정입니다'
      : '관리자 확인이 필요합니다'

  const description = isPending
    ? `${profile?.name ?? profile?.email ?? '회원'}님, 가입 신청이 접수되었습니다. 실장이 학원 구성원 여부를 확인한 뒤 승인하면 자동으로 알림 메일이 발송됩니다.`
    : isInactive
      ? `${profile?.name ?? profile?.email ?? '회원'}님 계정은 ${status === 'graduated' ? '졸업' : '퇴원'} 상태입니다. 학원 기록은 보존되지만 시스템에는 접속할 수 없습니다.`
      : '관리자가 계정 상태를 점검하고 있습니다. 자세한 안내는 학원으로 문의해주세요.'

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-2xl space-y-8 rounded-2xl bg-white p-10 shadow-sm border border-slate-200">
        <div className="space-y-3 text-center">
          <Badge variant="secondary" className="px-3 py-1 text-sm">{badgeLabel}</Badge>
          <h1 className="text-3xl font-bold text-slate-900">{heading}</h1>
          <p className="text-slate-600 leading-relaxed">{description}</p>
        </div>
        <div className="space-y-4 text-sm text-slate-600">
          {isPending ? (
            <>
              <p>빠른 승인을 원하시면 학원으로 연락해 가입하신 이메일과 이름을 알려주세요.</p>
              <p>승인 완료 전까지는 대시보드에 접근할 수 없습니다.</p>
            </>
          ) : isInactive ? (
            <>
              <p>퇴원생, 졸업생은 실장님께 문의해 주세요.</p>
              <p>복구가 필요한 경우 원장 또는 실장이 계정을 다시 승인해야 합니다.</p>
            </>
          ) : (
            <>
              <p>관리자가 계정 상태를 확인하고 있습니다.</p>
              <p>문의가 필요하면 학원으로 연락해주세요.</p>
            </>
          )}
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
