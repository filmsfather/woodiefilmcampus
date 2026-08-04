import Link from 'next/link'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { StudentSpecialLectureRequestButton } from '@/components/dashboard/special-lectures/StudentSpecialLectureRequestButton'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAuthForDashboard } from '@/lib/auth'
import {
  fetchMySpecialLectureRequests,
  fetchSpecialLectureAccessWindows,
  fetchSpecialLectures,
  type SpecialLecture,
  type SpecialLectureAccessWindow,
  type SpecialLectureMyRequest,
} from '@/lib/special-lectures'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

function formatKoreanDate(iso: string) {
  if (!iso) return ''
  return new Intl.DateTimeFormat('ko', { dateStyle: 'medium' }).format(new Date(iso))
}

function formatKoreanDateTime(iso: string) {
  if (!iso) return ''
  return new Intl.DateTimeFormat('ko', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso)
  )
}

type CardState =
  | { kind: 'watchable'; expiresAt: string | null }
  | { kind: 'scheduled'; startsAt: string; expiresAt: string }
  | { kind: 'pending'; requestId: string }
  | { kind: 'rejected'; reason: string | null }
  | { kind: 'closed' }
  | { kind: 'open' }
  | { kind: 'unavailable' }

function resolveCardState(
  lecture: SpecialLecture,
  request: SpecialLectureMyRequest | undefined,
  accessWindow: SpecialLectureAccessWindow | undefined
): CardState {
  // RLS가 시청 권한이 없는 학생에게는 영상 정보를 내려주지 않는다.
  if (lecture.video_asset) {
    return { kind: 'watchable', expiresAt: accessWindow?.expiresAt ?? null }
  }

  // 승인은 되었지만 아직 공개 시작 전인 경우
  if (accessWindow && new Date(accessWindow.startsAt).getTime() > Date.now()) {
    return {
      kind: 'scheduled',
      startsAt: accessWindow.startsAt,
      expiresAt: accessWindow.expiresAt,
    }
  }

  if (request?.status === 'requested') {
    return { kind: 'pending', requestId: request.id }
  }

  if (request?.status === 'rejected') {
    return { kind: 'rejected', reason: request.rejectReason }
  }

  if (request?.status === 'approved') {
    return { kind: 'closed' }
  }

  if (lecture.applications_open) {
    return { kind: 'open' }
  }

  return { kind: 'unavailable' }
}

export default async function StudentSpecialLecturesPage() {
  const { profile } = await requireAuthForDashboard('student')

  const supabase = await createServerSupabase()
  // RLS의 can_view_special_lecture가 유효 grant 기준으로 시청 권한을 판정하고,
  // 신청 접수 중인 특강은 제목·설명만 목록에 노출됩니다.
  const [lectures, myRequests, accessWindows] = await Promise.all([
    fetchSpecialLectures(supabase),
    fetchMySpecialLectureRequests(supabase, profile?.id ?? ''),
    fetchSpecialLectureAccessWindows(supabase, profile?.id ?? ''),
  ])

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink fallbackHref="/dashboard/student" label="대시보드로 돌아가기" />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">특강</h1>
          <p className="text-sm text-slate-600">
            신청 접수 중인 특강을 신청하면 특강비 확인 후 실장이 영상을 열어드립니다.
          </p>
        </div>
      </div>

      {lectures.length === 0 ? (
        <Card className="border-slate-200 bg-slate-50">
          <CardHeader>
            <CardTitle className="text-lg text-slate-800">표시할 특강이 없습니다.</CardTitle>
            <CardDescription className="text-sm text-slate-600">
              새 특강이 열리면 이곳에서 확인할 수 있습니다.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {lectures.map((lecture) => {
            const state = resolveCardState(
              lecture,
              myRequests.get(lecture.id),
              accessWindows.get(lecture.id)
            )
            const isWatchable = state.kind === 'watchable'

            const card = (
              <Card
                className={`flex h-full flex-col overflow-hidden border-slate-200 shadow-sm ${
                  isWatchable ? 'transition group-hover:-translate-y-1 group-hover:shadow-md' : ''
                }`}
              >
                <div className="relative aspect-video w-full bg-slate-900">
                  <div className="absolute inset-0 flex items-center justify-center">
                    {isWatchable ? (
                      <div className="rounded-full bg-white/90 p-4 shadow-lg transition group-hover:scale-110">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          className="h-7 w-7 text-slate-900"
                        >
                          <path
                            fillRule="evenodd"
                            d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                    ) : (
                      <span className="rounded-full bg-white/15 px-3 py-1 text-center text-xs text-white/80">
                        {state.kind === 'scheduled'
                          ? `${formatKoreanDateTime(state.startsAt)}부터 시청 가능`
                          : '승인 후 시청할 수 있습니다'}
                      </span>
                    )}
                  </div>
                </div>
                <CardHeader className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle
                      className={`line-clamp-2 text-lg text-slate-900 ${
                        isWatchable ? 'group-hover:text-blue-600 group-hover:underline' : ''
                      }`}
                    >
                      {lecture.title}
                    </CardTitle>
                    <StateBadge state={state} />
                  </div>
                  <CardDescription className="text-xs text-slate-500">
                    {formatKoreanDate(lecture.created_at)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="mt-auto space-y-3 p-4 pt-0">
                  <p className="line-clamp-2 text-sm text-slate-600">
                    {lecture.description ?? '설명 없음'}
                  </p>
                  {state.kind === 'rejected' && state.reason ? (
                    <p className="text-xs text-rose-600">반려 사유: {state.reason}</p>
                  ) : null}
                  {state.kind === 'watchable' && state.expiresAt ? (
                    <p className="text-xs text-slate-500">
                      {formatKoreanDateTime(state.expiresAt)}까지 시청할 수 있습니다.
                    </p>
                  ) : null}
                  {state.kind === 'scheduled' ? (
                    <p className="text-xs text-slate-600">
                      공개 기간 {formatKoreanDateTime(state.startsAt)} ~{' '}
                      {formatKoreanDateTime(state.expiresAt)}
                    </p>
                  ) : null}
                  {state.kind === 'closed' ? (
                    <p className="text-xs text-slate-500">
                      공개 기간이 종료되었습니다. 다시 시청하려면 실장님께 문의해주세요.
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            )

            return (
              <div key={lecture.id} className="flex h-full flex-col gap-2">
                {isWatchable ? (
                  <Link
                    href={`/dashboard/student/special-lectures/${lecture.id}`}
                    className="group block h-full"
                  >
                    {card}
                  </Link>
                ) : (
                  card
                )}

                {state.kind === 'open' ? (
                  <StudentSpecialLectureRequestButton lectureId={lecture.id} mode="request" />
                ) : null}
                {state.kind === 'pending' ? (
                  <StudentSpecialLectureRequestButton
                    lectureId={lecture.id}
                    requestId={state.requestId}
                    mode="cancel"
                  />
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function StateBadge({ state }: { state: CardState }) {
  switch (state.kind) {
    case 'watchable':
      return <Badge variant="default">시청 가능</Badge>
    case 'scheduled':
      return (
        <Badge variant="outline" className="border-emerald-300 text-emerald-700">
          공개 예정
        </Badge>
      )
    case 'pending':
      return <Badge variant="secondary">승인 대기</Badge>
    case 'rejected':
      return (
        <Badge variant="outline" className="border-rose-300 text-rose-700">
          반려됨
        </Badge>
      )
    case 'closed':
      return (
        <Badge variant="outline" className="border-slate-300 text-slate-600">
          공개 종료
        </Badge>
      )
    case 'open':
      return (
        <Badge variant="outline" className="border-blue-300 text-blue-700">
          신청 가능
        </Badge>
      )
    default:
      return null
  }
}
