import Link from 'next/link'
import { redirect } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { SpecialLectureRequestList } from '@/components/dashboard/special-lectures/SpecialLectureRequestList'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { requireAuthForDashboard, resolveDashboardPath } from '@/lib/auth'
import { ensureManagerProfile } from '@/lib/authz'
import { fetchSpecialLectureRequests, type SpecialLectureRequest } from '@/lib/special-lectures'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

interface LectureGroup {
  lectureId: string
  lectureTitle: string
  pending: SpecialLectureRequest[]
  decided: SpecialLectureRequest[]
}

function groupByLecture(requests: SpecialLectureRequest[]): LectureGroup[] {
  const groups = new Map<string, LectureGroup>()

  for (const request of requests) {
    const group = groups.get(request.specialLectureId) ?? {
      lectureId: request.specialLectureId,
      lectureTitle: request.lectureTitle,
      pending: [],
      decided: [],
    }
    if (request.status === 'requested') {
      group.pending.push(request)
    } else {
      group.decided.push(request)
    }
    groups.set(request.specialLectureId, group)
  }

  // 대기 건이 많은 특강을 위로 올린다.
  return Array.from(groups.values()).sort((a, b) => {
    if (a.pending.length !== b.pending.length) {
      return b.pending.length - a.pending.length
    }
    return a.lectureTitle.localeCompare(b.lectureTitle, 'ko')
  })
}

export default async function ManagerSpecialLectureRequestsPage() {
  const { profile } = await requireAuthForDashboard(['manager', 'principal'])
  const managerProfile = await ensureManagerProfile()
  if (!managerProfile) {
    redirect(resolveDashboardPath(profile?.role ?? 'manager'))
  }

  const supabase = await createServerSupabase()
  const requests = await fetchSpecialLectureRequests(supabase)
  const groups = groupByLecture(requests)
  const pendingTotal = requests.filter((request) => request.status === 'requested').length

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <DashboardBackLink
            fallbackHref="/dashboard/manager/special-lectures"
            label="특강 관리로 돌아가기"
          />
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-slate-900">특강 신청 관리</h1>
            <p className="text-sm text-slate-600">
              특강비 납부를 확인한 학생을 <span className="font-medium">열어주기</span>로 개별
              공개하세요. 공개 기간이 지나면 자동으로 비공개로 전환됩니다.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={pendingTotal > 0 ? 'default' : 'secondary'}>
            {pendingTotal > 0 ? `대기 ${pendingTotal}건` : '대기 없음'}
          </Badge>
          <Button asChild variant="outline">
            <Link href="/dashboard/manager/special-lectures">특강 목록</Link>
          </Button>
        </div>
      </div>

      {groups.length === 0 ? (
        <Card className="border-slate-200 bg-slate-50">
          <CardHeader>
            <CardTitle className="text-lg text-slate-800">아직 신청이 없습니다.</CardTitle>
            <CardDescription className="text-sm text-slate-600">
              특강 수정 화면에서 <span className="font-medium">신청 접수 중</span>을 켜면 학생이
              특강을 신청할 수 있습니다.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <Card key={group.lectureId} className="border-slate-200">
              <CardHeader className="space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <CardTitle className="text-lg text-slate-900">
                    <Link
                      href={`/dashboard/manager/special-lectures/${group.lectureId}/edit`}
                      className="hover:underline"
                    >
                      {group.lectureTitle}
                    </Link>
                  </CardTitle>
                  <Badge variant={group.pending.length > 0 ? 'default' : 'secondary'}>
                    {group.pending.length > 0 ? `대기 ${group.pending.length}건` : '대기 없음'}
                  </Badge>
                </div>
                <CardDescription className="text-xs text-slate-500">
                  누적 신청 {group.pending.length + group.decided.length}건
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {group.pending.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-slate-500">승인 대기</p>
                    <SpecialLectureRequestList requests={group.pending} />
                  </div>
                ) : null}

                {group.decided.length > 0 ? (
                  <details className="group">
                    <summary className="cursor-pointer text-xs font-medium text-slate-500 hover:text-slate-700">
                      처리 완료 {group.decided.length}건 보기
                    </summary>
                    <div className="mt-2">
                      <SpecialLectureRequestList requests={group.decided} />
                    </div>
                  </details>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  )
}
