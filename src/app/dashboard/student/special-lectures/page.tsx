import Link from 'next/link'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchSpecialLectures } from '@/lib/special-lectures'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

function formatKoreanDate(iso: string) {
  if (!iso) return ''
  return new Intl.DateTimeFormat('ko', { dateStyle: 'medium' }).format(new Date(iso))
}

export default async function StudentSpecialLecturesPage() {
  await requireAuthForDashboard('student')

  const supabase = await createServerSupabase()
  // RLS가 자동으로 시청 가능한 특강만 반환합니다.
  const lectures = (await fetchSpecialLectures(supabase)).filter((lecture) => lecture.is_published)

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink fallbackHref="/dashboard/student" label="대시보드로 돌아가기" />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">특강</h1>
          <p className="text-sm text-slate-600">
            허용된 특강이 아래 목록에 표시됩니다. 카드를 눌러 시청해보세요.
          </p>
        </div>
      </div>

      {lectures.length === 0 ? (
        <Card className="border-slate-200 bg-slate-50">
          <CardHeader>
            <CardTitle className="text-lg text-slate-800">시청 가능한 특강이 없습니다.</CardTitle>
            <CardDescription className="text-sm text-slate-600">
              새 특강이 열리면 이곳에서 확인할 수 있습니다.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {lectures.map((lecture) => (
            <Link
              key={lecture.id}
              href={`/dashboard/student/special-lectures/${lecture.id}`}
              className="group block h-full"
            >
              <Card className="flex h-full flex-col overflow-hidden border-slate-200 shadow-sm transition group-hover:-translate-y-1 group-hover:shadow-md">
                <div className="relative aspect-video w-full bg-slate-900">
                  <div className="absolute inset-0 flex items-center justify-center">
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
                  </div>
                </div>
                <CardHeader className="space-y-2 p-4">
                  <CardTitle className="line-clamp-2 text-lg text-slate-900 group-hover:text-blue-600 group-hover:underline">
                    {lecture.title}
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    {formatKoreanDate(lecture.created_at)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="mt-auto p-4 pt-0">
                  <p className="line-clamp-2 text-sm text-slate-600">
                    {lecture.description ?? '설명 없음'}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
