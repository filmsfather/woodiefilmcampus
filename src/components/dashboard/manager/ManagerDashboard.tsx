'use client'

import { DashboardCard } from '../DashboardCard'
import { StatsCard } from '../StatsCard'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  UserPlus, 
  Users, 
  Building, 
  UserX, 
  Settings,
  Shield,
  BookOpen
} from 'lucide-react'

export function ManagerDashboard() {
  const pendingUsers = [
    { id: 1, name: '이영희', email: 'younghee@example.com', requestedRole: 'teacher' },
    { id: 2, name: '박민수', email: 'minsu@example.com', requestedRole: 'student' },
    { id: 3, name: '최지혜', email: 'jihye@example.com', requestedRole: 'student' },
  ]

  const classes = [
    { id: 1, name: '초급 영어', teacher: '김선생님', students: 12 },
    { id: 2, name: '중급 수학', teacher: '이선생님', students: 8 },
    { id: 3, name: '고급 과학', teacher: null, students: 0 },
  ]

  return (
    <div className="space-y-6">
      {/* 통계 카드들 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="가입 대기"
          value={pendingUsers.length}
          description="승인 대기 중인 사용자"
          icon={UserPlus}
        />
        <StatsCard
          title="활성 사용자"
          value="95"
          description="현재 활성 상태"
          icon={Users}
        />
        <StatsCard
          title="운영 중인 반"
          value={classes.filter(c => c.teacher).length}
          description="선생님이 배정된 반"
          icon={Building}
        />
        <StatsCard
          title="배정 대기 반"
          value={classes.filter(c => !c.teacher).length}
          description="선생님 배정 필요"
          icon={UserX}
        />
      </div>

      {/* 주요 관리 기능 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <DashboardCard
          title="가입 권한 관리"
          description="새로운 사용자 가입 승인 및 역할 부여"
          icon={Shield}
        >
          <div className="space-y-3">
            {pendingUsers.length > 0 ? (
              pendingUsers.map((user) => (
                <div key={user.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium">{user.name}</p>
                    <p className="text-sm text-gray-600">{user.email}</p>
                    <Badge variant="outline" className="mt-1">
                      {user.requestedRole === 'teacher' ? '선생님' : '학생'} 요청
                    </Badge>
                  </div>
                  <div className="space-x-2">
                    <Button size="sm">승인</Button>
                    <Button size="sm" variant="outline">거부</Button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-4">대기 중인 가입 요청이 없습니다</p>
            )}
          </div>
        </DashboardCard>

        <DashboardCard
          title="반 관리"
          description="반 생성, 선생님 배정, 학생 배정 관리"
          icon={Building}
        >
          <div className="space-y-3">
            <Button className="w-full">새 반 생성</Button>
            <div className="space-y-2">
              {classes.map((classItem) => (
                <div key={classItem.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <div>
                    <p className="font-medium text-sm">{classItem.name}</p>
                    <p className="text-xs text-gray-600">
                      {classItem.teacher ? classItem.teacher : '선생님 미배정'} • {classItem.students}명
                    </p>
                  </div>
                  <Button size="sm" variant="outline">관리</Button>
                </div>
              ))}
            </div>
          </div>
        </DashboardCard>
      </div>

      {/* 사용자 관리 */}
      <DashboardCard
        title="사용자 역할 관리"
        description="기존 사용자의 역할 변경 및 권한 관리"
        icon={Users}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-blue-50 rounded-lg">
            <h4 className="font-medium text-blue-900">선생님 관리</h4>
            <p className="text-sm text-blue-700 mt-1">8명 활성</p>
            <Button size="sm" className="mt-2 w-full" variant="outline">
              선생님 목록
            </Button>
          </div>
          <div className="p-4 bg-green-50 rounded-lg">
            <h4 className="font-medium text-green-900">학생 관리</h4>
            <p className="text-sm text-green-700 mt-1">87명 활성</p>
            <Button size="sm" className="mt-2 w-full" variant="outline">
              학생 목록
            </Button>
          </div>
          <div className="p-4 bg-purple-50 rounded-lg">
            <h4 className="font-medium text-purple-900">역할 변경</h4>
            <p className="text-sm text-purple-700 mt-1">권한 수정</p>
            <Button size="sm" className="mt-2 w-full" variant="outline">
              역할 관리
            </Button>
          </div>
        </div>
      </DashboardCard>

      {/* 최근 관리 활동 */}
      <DashboardCard
        title="최근 관리 활동"
        description="실장이 수행한 최근 관리 작업"
        icon={BookOpen}
      >
        <div className="space-y-3">
          <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium">사용자 승인</p>
              <p className="text-sm text-gray-600">홍길동님을 학생으로 승인함</p>
            </div>
            <span className="text-sm text-gray-500">1시간 전</span>
          </div>
          <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium">반 생성</p>
              <p className="text-sm text-gray-600">고급 영어 반을 새로 생성함</p>
            </div>
            <span className="text-sm text-gray-500">2일 전</span>
          </div>
          <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium">선생님 배정</p>
              <p className="text-sm text-gray-600">김선생님을 수학 고급반에 배정함</p>
            </div>
            <span className="text-sm text-gray-500">3일 전</span>
          </div>
        </div>
      </DashboardCard>
    </div>
  )
}