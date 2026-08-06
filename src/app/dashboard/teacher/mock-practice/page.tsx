import type { Metadata } from 'next'
import Link from 'next/link'
import { CalendarClock, ClipboardList, Library, PenLine, Video } from 'lucide-react'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAuthForDashboard } from '@/lib/auth'

export const metadata: Metadata = {
  title: '모의실기 | Woodie Film Campus',
  description: '모의 면접 등 실기 연습을 관리하세요.',
}

export default async function MockPracticePage() {
  await requireAuthForDashboard(['teacher', 'manager'])

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink fallbackHref="/dashboard/teacher" label="교사용 허브로 돌아가기" />
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-slate-900">모의실기</h1>
          <p className="text-sm text-slate-600">
            실기 시험을 대비한 연습을 준비하고, 학생별 진행 상황을 관리하세요.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-slate-200 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
          <CardHeader className="space-y-2">
            <CardTitle className="flex items-center gap-2 text-lg text-slate-900">
              <Library className="h-5 w-5" />
              입시 모의실기 문제 은행
            </CardTitle>
            <CardDescription className="text-sm text-slate-500">
              대학별로 작법형/면접형 연습문제를 쌓아둡니다. 1:1 피드백 예약 시 학생마다 아직 안 푼 문제가 순서대로
              자동 배정됩니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild className="w-full">
              <Link href="/dashboard/teacher/mock-practice/problems">문제 은행 관리</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/dashboard/teacher/mock-practice/problems/new">문제 추가</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
          <CardHeader className="space-y-2">
            <CardTitle className="flex items-center gap-2 text-lg text-slate-900">
              <CalendarClock className="h-5 w-5" />
              입시 1:1 피드백
            </CardTitle>
            <CardDescription className="text-sm text-slate-500">
              15분 단위 슬롯에 학생을 배정하고, 제출된 원고나 면접 답안을 보며 그 자리에서 피드백과 채점을 남깁니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild className="w-full">
              <Link href="/dashboard/teacher/practice-feedback/today">오늘 진행 일정</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/dashboard/teacher/practice-feedback/board">예약 보드</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
          <CardHeader className="space-y-2">
            <CardTitle className="flex items-center gap-2 text-lg text-slate-900">
              <Video className="h-5 w-5" />
              모의 면접
            </CardTitle>
            <CardDescription className="text-sm text-slate-500">
              면접 문제를 만들어 출제하고, 웹캠으로 면접을 녹화하면 학생에게 복기 과제가 자동 생성됩니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild className="w-full">
              <Link href="/dashboard/teacher/mock-practice/interview">모의 면접 관리</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/dashboard/teacher/mock-practice/interview/new">시험문제 만들기</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
          <CardHeader className="space-y-2">
            <CardTitle className="flex items-center gap-2 text-lg text-slate-900">
              <PenLine className="h-5 w-5" />
              모의 작문
            </CardTitle>
            <CardDescription className="text-sm text-slate-500">
              제한시간을 설정해 출제하면 학생이 집에서 시험을 시작하고, 손글씨 원고 사진을 제출하면 AI가 텍스트로
              변환합니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild className="w-full">
              <Link href="/dashboard/teacher/mock-practice/writing">모의 작문 관리</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/dashboard/teacher/mock-practice/writing/new">시험문제 만들기</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
          <CardHeader className="space-y-2">
            <CardTitle className="flex items-center gap-2 text-lg text-slate-900">
              <ClipboardList className="h-5 w-5" />
              면접지
            </CardTitle>
            <CardDescription className="text-sm text-slate-500">
              학생마다 면접지 1장이 제공됩니다. 학생 스스로 질문과 답변을 채우고, 선생님이 질문을 추가하거나
              답변에 피드백을 남길 수 있습니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild className="w-full">
              <Link href="/dashboard/teacher/mock-practice/interview-sheet">면접지 관리</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/dashboard/teacher/mock-practice/interview-sheet/templates">템플릿 관리</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
