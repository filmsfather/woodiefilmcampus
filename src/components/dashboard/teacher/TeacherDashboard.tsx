'use client'

import Link from 'next/link'

import { DashboardCard } from '../DashboardCard'
import { StatsCard } from '../StatsCard'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  BookOpen,
  Users,
  Clock,
  FileText,
  MessageSquare,
  BarChart3,
} from 'lucide-react'

export function TeacherDashboard() {
  const myClasses = [
    { id: 1, name: '초급 영어', students: 12, assignments: 3, pendingGrades: 5 },
    { id: 2, name: '중급 영어', students: 8, assignments: 2, pendingGrades: 2 },
  ]

  const recentSubmissions = [
    { student: '김철수', assignment: '영어 에세이 1', submittedAt: '2시간 전', status: 'pending' },
    { student: '이영희', assignment: '문법 연습', submittedAt: '4시간 전', status: 'graded' },
    { student: '박민수', assignment: '영어 에세이 1', submittedAt: '1일 전', status: 'pending' },
  ]

  return (
    <div className="space-y-6">
      {/* 안내 메시지 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-medium text-blue-900">선생님 대시보드</h3>
        <p className="text-sm text-blue-700 mt-1">
          현재 선생님 기능은 개발 중입니다. 추후 업데이트를 통해 제공될 예정입니다.
        </p>
      </div>

      {/* 통계 카드들 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="담당 반"
          value={myClasses.length}
          description="현재 담당하고 있는 반"
          icon={BookOpen}
        />
        <StatsCard
          title="총 학생 수"
          value={myClasses.reduce((sum, cls) => sum + cls.students, 0)}
          description="모든 반의 학생 합계"
          icon={Users}
        />
        <StatsCard
          title="진행 중인 과제"
          value={myClasses.reduce((sum, cls) => sum + cls.assignments, 0)}
          description="현재 활성 과제"
          icon={FileText}
        />
        <StatsCard
          title="채점 대기"
          value={myClasses.reduce((sum, cls) => sum + cls.pendingGrades, 0)}
          description="채점이 필요한 과제"
          icon={Clock}
        />
      </div>

      {/* 내 반 관리 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <DashboardCard
          title="내 반 관리"
          description="담당하고 있는 반의 현황"
          icon={BookOpen}
        >
          <div className="space-y-3">
            {myClasses.map((classItem) => (
              <div key={classItem.id} className="p-3 bg-gray-50 rounded-lg">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-medium">{classItem.name}</h4>
                  <Badge variant="outline">{classItem.students}명</Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                  <span>진행 과제: {classItem.assignments}개</span>
                  <span>채점 대기: {classItem.pendingGrades}개</span>
                </div>
                <Button size="sm" className="w-full mt-2">
                  반 관리하기
                </Button>
              </div>
            ))}
          </div>
        </DashboardCard>

        <DashboardCard
          title="최근 제출물"
          description="학생들의 최근 과제 제출 현황"
          icon={FileText}
        >
          <div className="space-y-3">
            {recentSubmissions.map((submission, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-sm">{submission.student}</p>
                  <p className="text-xs text-gray-600">{submission.assignment}</p>
                  <p className="text-xs text-gray-500">{submission.submittedAt}</p>
                </div>
                <div className="text-right">
                  <Badge 
                    variant={submission.status === 'graded' ? 'default' : 'secondary'}
                    className="text-xs"
                  >
                    {submission.status === 'graded' ? '채점완료' : '채점대기'}
                  </Badge>
                  {submission.status === 'pending' && (
                    <Button size="sm" className="ml-2">
                      채점하기
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </DashboardCard>
      </div>

      {/* 빠른 작업 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <DashboardCard
          title="과제 관리"
          description="새 과제 생성 및 관리"
          icon={FileText}
        >
          <div className="space-y-2">
           <Button className="w-full">새 과제 만들기</Button>
            <Button className="w-full" variant="outline" asChild>
              <Link href="/dashboard/workbooks/new">문제집 만들기</Link>
            </Button>
            <Button className="w-full" variant="outline">과제 목록</Button>
            <Button className="w-full" variant="outline">채점하기</Button>
          </div>
        </DashboardCard>

        <DashboardCard
          title="학생 관리"
          description="학생 출결 및 성적 관리"
          icon={Users}
        >
          <div className="space-y-2">
            <Button className="w-full">출결 관리</Button>
            <Button className="w-full" variant="outline">성적 입력</Button>
            <Button className="w-full" variant="outline">학생 목록</Button>
          </div>
        </DashboardCard>

        <DashboardCard
          title="소통"
          description="학생 및 학부모와의 소통"
          icon={MessageSquare}
        >
          <div className="space-y-2">
            <Button className="w-full">공지사항</Button>
            <Button className="w-full" variant="outline">메시지</Button>
            <Button className="w-full" variant="outline">피드백</Button>
          </div>
        </DashboardCard>
      </div>

      {/* 성과 분석 */}
      <DashboardCard
        title="반별 성과 분석"
        description="담당 반의 학습 성과 및 진도 현황"
        icon={BarChart3}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {myClasses.map((classItem) => (
            <div key={classItem.id} className="p-4 bg-gray-50 rounded-lg">
              <h4 className="font-medium mb-3">{classItem.name}</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>평균 출석률</span>
                  <span className="font-medium">92%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>과제 제출률</span>
                  <span className="font-medium">87%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>평균 성적</span>
                  <span className="font-medium">B+</span>
                </div>
              </div>
              <Button size="sm" className="w-full mt-3" variant="outline">
                상세 분석 보기
              </Button>
            </div>
          ))}
        </div>
      </DashboardCard>
    </div>
  )
}
