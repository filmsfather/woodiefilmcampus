import Link from 'next/link'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export function ManagerQuickLinks() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader className="gap-2">
          <CardTitle className="text-lg">상담 관리</CardTitle>
          <CardDescription>
            상담 예약 가능한 시간을 설정하고 신청 현황을 주·일별로 확인합니다.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild>
            <Link href="/dashboard/manager/counseling/slots">상담 관리 열기</Link>
          </Button>
        </CardFooter>
      </Card>
      <Card>
        <CardHeader className="gap-2">
          <CardTitle className="text-lg">구성원 관리</CardTitle>
          <CardDescription>
            승인된 학생과 교사의 연락처, 반 배정을 한 화면에서 편집하고 삭제할 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild>
            <Link href="/dashboard/manager/members">구성원 관리 열기</Link>
          </Button>
        </CardFooter>
      </Card>
      <Card>
        <CardHeader className="gap-2">
          <CardTitle className="text-lg">인쇄 요청 관리</CardTitle>
          <CardDescription>
            주간 인쇄 요청을 확인하고 완료·취소 상태를 업데이트하세요.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild>
            <Link href="/dashboard/manager/print-requests">인쇄 요청 열기</Link>
          </Button>
        </CardFooter>
      </Card>
      <Card>
        <CardHeader className="gap-2">
          <CardTitle className="text-lg">반 관리</CardTitle>
          <CardDescription>
            반을 생성하고 담임·담당 교사 및 학생 배정을 한 곳에서 처리할 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild>
            <Link href="/dashboard/manager/classes">반 관리 열기</Link>
          </Button>
        </CardFooter>
      </Card>
      <Card>
        <CardHeader className="gap-2">
          <CardTitle className="text-lg">학습일지 관리</CardTitle>
          <CardDescription>
            반별 4주 주기를 설정하고 주요 학사 일정을 등록해 교사 학습일지 작성을 지원하세요.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild>
            <Link href="/dashboard/manager/learning-journal">학습일지 관리</Link>
          </Button>
        </CardFooter>
      </Card>
      <Card>
        <CardHeader className="gap-2">
          <CardTitle className="text-lg">교사 업무 도구</CardTitle>
          <CardDescription>
            근무일지, 수업자료, 입시자료 등 교사 대시보드를 바로 열 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild variant="secondary">
            <Link href="/dashboard/teacher">교사 대시보드 열기</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
