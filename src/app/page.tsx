import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import DateUtil from "@/lib/date-util"
import { Shield, Users, GraduationCap, BookOpen, LogIn } from "lucide-react"

export default function Home() {
  const roles = [
    {
      title: "원장",
      description: "캠퍼스 전체 관리를 위한 핵심 지표와 사용자 권한 조정",
      icon: Shield,
      badgeClassName: "bg-purple-100 text-purple-800",
    },
    {
      title: "실장",
      description: "회원 가입 승인, 역할 배정과 반 편성을 빠르게 처리",
      icon: Users,
      badgeClassName: "bg-blue-100 text-blue-800",
    },
    {
      title: "선생님",
      description: "수업 일정과 학생 관리 기능을 중심으로 구성",
      icon: GraduationCap,
      badgeClassName: "bg-green-100 text-green-800",
    },
    {
      title: "학생",
      description: "모바일 최적화된 학습 현황과 과제 확인",
      icon: BookOpen,
      badgeClassName: "bg-yellow-100 text-yellow-800",
    },
  ]

  const steps = [
    {
      title: "시작 페이지",
      description: "Woodie Film Campus 소개와 이용 안내",
    },
    {
      title: "로그인",
      description: "Supabase 기반 인증으로 본인 확인",
    },
    {
      title: "역할별 대시보드",
      description: "부여된 권한에 맞는 화면으로 자동 이동",
    },
  ]

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white">
        <div className="container mx-auto max-w-6xl px-6 py-20 text-center">
          <Badge variant="secondary" className="mb-6 inline-flex items-center gap-2 text-base">
            <LogIn className="h-4 w-4" /> Woodie Film Campus
          </Badge>
          <h1 className="text-4xl font-bold sm:text-5xl">
            역할 기반 학습관리 플랫폼
          </h1>
          <p className="mt-4 text-lg text-slate-600 sm:text-xl">
            로그인 한 번으로 권한에 맞는 대시보드를 바로 만나보세요.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/login">
                로그인으로 이동
              </Link>
            </Button>
            <span className="text-sm text-slate-500">
              계정이 없으면 관리자에게 권한을 요청해주세요.
            </span>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-6xl space-y-16 px-6 py-16">
        <section className="grid gap-6 md:grid-cols-3">
          {steps.map((step, index) => (
            <Card key={step.title} className="h-full border-slate-200">
              <CardHeader>
                <CardTitle className="text-lg font-semibold">
                  {index + 1}. {step.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-600">{step.description}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        <section>
          <div className="mb-8 text-center">
            <h2 className="text-3xl font-semibold">권한별 대시보드 구성</h2>
            <p className="mt-2 text-slate-600">
              로그인 시 부여된 역할에 맞춰 자동으로 대시보드가 열립니다.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {roles.map((role) => (
              <Card key={role.title} className="h-full border-slate-200">
                <CardHeader className="items-center text-center">
                  <role.icon className="mb-4 h-12 w-12 text-slate-500" />
                  <CardTitle className="text-xl">{role.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  <Badge className={`${role.badgeClassName} mb-3`}>{role.title}</Badge>
                  <p className="text-sm text-slate-600">{role.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section>
          <Card className="border-slate-200 bg-slate-900 text-slate-50">
            <CardContent className="flex flex-col items-center gap-4 p-8 text-center sm:flex-row sm:justify-between sm:text-left">
              <div>
                <h3 className="text-2xl font-semibold">지금 바로 로그인하고 캠퍼스를 관리하세요.</h3>
                <p className="mt-2 text-slate-200">
                  Supabase 인증을 통해 안전하게 접속하고, 필요한 기능에 바로 접근할 수 있습니다.
                </p>
              </div>
              <Button asChild size="lg" variant="secondary" className="w-full sm:w-auto">
                <Link href="/login">로그인</Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="border-t bg-white">
        <div className="container mx-auto max-w-6xl px-6 py-6 text-center text-sm text-slate-500">
          © {DateUtil.nowUTC().getUTCFullYear()} Woodie Film Campus. 모든 권한이 예약되어 있습니다.
        </div>
      </footer>
    </div>
  )
}
