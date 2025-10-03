'use client'

import { DashboardCard } from '../DashboardCard'
import { StatsCard } from '../StatsCard'
import { Button } from '@/components/ui/button'
import { 
  Users, 
  BookOpen, 
  Settings, 
  BarChart3, 
  UserCheck, 
  GraduationCap,
  Building
} from 'lucide-react'

export function PrincipalDashboard() {
  return (
    <div className="space-y-6">
      {/* 통계 카드들 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="전체 학생"
          value="124"
          description="이번 달 신규 가입 12명"
          icon={Users}
          trend={{ value: 8.2, isPositive: true }}
        />
        <StatsCard
          title="전체 선생님"
          value="8"
          description="활성 강사진"
          icon={GraduationCap}
        />
        <StatsCard
          title="운영 중인 반"
          value="15"
          description="총 개설 클래스"
          icon={Building}
        />
        <StatsCard
          title="시스템 사용률"
          value="87%"
          description="월간 활성 사용률"
          icon={BarChart3}
          trend={{ value: 12.5, isPositive: true }}
        />
      </div>

      {/* 주요 기능 카드들 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <DashboardCard
          title="대시보드 전환"
          description="다른 권한의 대시보드로 이동"
          icon={UserCheck}
        >
          <div className="space-y-2">
            <Button className="w-full" variant="outline">
              실장 대시보드로 이동
            </Button>
            <Button className="w-full" variant="outline">
              선생님 대시보드로 이동
            </Button>
            <Button className="w-full" variant="outline">
              학생 대시보드로 이동
            </Button>
          </div>
        </DashboardCard>

        <DashboardCard
          title="전체 시스템 관리"
          description="모든 권한과 기능에 접근"
          icon={Settings}
        >
          <div className="space-y-2">
            <Button className="w-full">사용자 관리</Button>
            <Button className="w-full" variant="outline">반 관리</Button>
            <Button className="w-full" variant="outline">시스템 설정</Button>
          </div>
        </DashboardCard>

        <DashboardCard
          title="통계 및 리포트"
          description="전체 플랫폼 사용 현황"
          icon={BarChart3}
        >
          <div className="space-y-2">
            <Button className="w-full">사용량 리포트</Button>
            <Button className="w-full" variant="outline">학습 진도</Button>
            <Button className="w-full" variant="outline">성과 분석</Button>
          </div>
        </DashboardCard>
      </div>

      {/* 최근 활동 */}
      <DashboardCard
        title="최근 플랫폼 활동"
        description="시스템 전체 활동 로그"
        icon={BookOpen}
      >
        <div className="space-y-3">
          <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium">새로운 학생 가입</p>
              <p className="text-sm text-gray-600">홍길동님이 3학년 A반에 배정됨</p>
            </div>
            <span className="text-sm text-gray-500">2시간 전</span>
          </div>
          <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium">새로운 반 개설</p>
              <p className="text-sm text-gray-600">김선생님이 고급 수학 반을 개설함</p>
            </div>
            <span className="text-sm text-gray-500">1일 전</span>
          </div>
          <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium">시스템 업데이트</p>
              <p className="text-sm text-gray-600">새로운 기능이 추가되었습니다</p>
            </div>
            <span className="text-sm text-gray-500">3일 전</span>
          </div>
        </div>
      </DashboardCard>
    </div>
  )
}