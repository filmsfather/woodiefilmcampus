'use client'

import { DashboardCard } from '../DashboardCard'
import { StatsCard } from '../StatsCard'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { 
  BookOpen, 
  Clock, 
  CheckCircle, 
  Calendar,
  Award,
  Bell,
  BarChart3
} from 'lucide-react'

export function StudentDashboard() {
  const myClasses = [
    { 
      id: 1, 
      name: '초급 영어', 
      teacher: '김선생님', 
      progress: 75,
      nextClass: '2024-01-15 14:00',
      assignments: 2
    }
  ]

  const assignments = [
    { 
      id: 1, 
      title: '영어 에세이 1', 
      subject: '초급 영어',
      dueDate: '2024-01-20', 
      status: 'pending',
      submitted: false
    },
    { 
      id: 2, 
      title: '문법 연습 과제', 
      subject: '초급 영어',
      dueDate: '2024-01-18', 
      status: 'graded',
      submitted: true,
      grade: 'A-'
    }
  ]

  const notifications = [
    { id: 1, message: '새로운 과제가 등록되었습니다', time: '1시간 전' },
    { id: 2, message: '다음 수업이 2시간 후에 있습니다', time: '2시간 전' },
    { id: 3, message: '과제 채점이 완료되었습니다', time: '1일 전' }
  ]

  return (
    <div className="space-y-6">
      {/* 모바일 최적화 안내 */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 md:hidden">
        <h3 className="font-medium text-green-900">📱 모바일 최적화</h3>
        <p className="text-sm text-green-700 mt-1">
          학생 대시보드는 모바일 환경에 최적화되어 있습니다.
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-medium text-blue-900">학생 대시보드</h3>
        <p className="text-sm text-blue-700 mt-1">
          현재 학생 기능은 개발 중입니다. 추후 업데이트를 통해 제공될 예정입니다.
        </p>
      </div>

      {/* 통계 카드들 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard
          title="수강 중인 강의"
          value={myClasses.length}
          description="현재 등록된 강의"
          icon={BookOpen}
        />
        <StatsCard
          title="진행률"
          value="75%"
          description="전체 강의 평균"
          icon={BarChart3}
        />
        <StatsCard
          title="제출할 과제"
          value={assignments.filter(a => !a.submitted).length}
          description="마감일 임박"
          icon={Clock}
        />
        <StatsCard
          title="완료한 과제"
          value={assignments.filter(a => a.submitted).length}
          description="이번 달 완료"
          icon={CheckCircle}
        />
      </div>

      {/* 내 강의 */}
      <DashboardCard
        title="내 강의"
        description="현재 수강 중인 강의 목록"
        icon={BookOpen}
      >
        <div className="space-y-4">
          {myClasses.map((classItem) => (
            <div key={classItem.id} className="p-4 bg-gray-50 rounded-lg">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h4 className="font-medium">{classItem.name}</h4>
                  <p className="text-sm text-gray-600">{classItem.teacher}</p>
                </div>
                <Badge variant="outline">진행 중</Badge>
              </div>
              
              <div className="space-y-2 mb-3">
                <div className="flex justify-between text-sm">
                  <span>진행률</span>
                  <span>{classItem.progress}%</span>
                </div>
                <Progress value={classItem.progress} className="h-2" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-600 mb-3">
                <div className="flex items-center">
                  <Calendar className="h-4 w-4 mr-1" />
                  <span>다음 수업: {classItem.nextClass}</span>
                </div>
                <div className="flex items-center">
                  <Clock className="h-4 w-4 mr-1" />
                  <span>미제출 과제: {classItem.assignments}개</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" className="w-full">강의실 입장</Button>
                <Button size="sm" variant="outline" className="w-full">과제 보기</Button>
              </div>
            </div>
          ))}
        </div>
      </DashboardCard>

      {/* 과제 및 알림 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <DashboardCard
          title="과제 현황"
          description="제출할 과제와 완료된 과제"
          icon={CheckCircle}
        >
          <div className="space-y-3">
            {assignments.map((assignment) => (
              <div key={assignment.id} className="p-3 bg-gray-50 rounded-lg">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h5 className="font-medium text-sm">{assignment.title}</h5>
                    <p className="text-xs text-gray-600">{assignment.subject}</p>
                  </div>
                  <Badge 
                    variant={assignment.submitted ? 'default' : 'destructive'}
                    className="text-xs"
                  >
                    {assignment.submitted ? '제출완료' : '미제출'}
                  </Badge>
                </div>
                
                <div className="flex justify-between items-center text-xs text-gray-600 mb-2">
                  <span>마감일: {assignment.dueDate}</span>
                  {assignment.grade && <span>성적: {assignment.grade}</span>}
                </div>

                {!assignment.submitted && (
                  <Button size="sm" className="w-full">과제 제출하기</Button>
                )}
                {assignment.submitted && (
                  <Button size="sm" variant="outline" className="w-full">
                    제출 내역 보기
                  </Button>
                )}
              </div>
            ))}
          </div>
        </DashboardCard>

        <DashboardCard
          title="알림"
          description="최근 알림 및 공지사항"
          icon={Bell}
        >
          <div className="space-y-3">
            {notifications.map((notification) => (
              <div key={notification.id} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                <Bell className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm">{notification.message}</p>
                  <p className="text-xs text-gray-500 mt-1">{notification.time}</p>
                </div>
              </div>
            ))}
            <Button variant="outline" className="w-full" size="sm">
              모든 알림 보기
            </Button>
          </div>
        </DashboardCard>
      </div>

      {/* 빠른 액션 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Button className="h-20 flex flex-col items-center justify-center space-y-2">
          <BookOpen className="h-6 w-6" />
          <span className="text-sm">강의실</span>
        </Button>
        <Button variant="outline" className="h-20 flex flex-col items-center justify-center space-y-2">
          <CheckCircle className="h-6 w-6" />
          <span className="text-sm">과제</span>
        </Button>
        <Button variant="outline" className="h-20 flex flex-col items-center justify-center space-y-2">
          <Calendar className="h-6 w-6" />
          <span className="text-sm">시간표</span>
        </Button>
        <Button variant="outline" className="h-20 flex flex-col items-center justify-center space-y-2">
          <Award className="h-6 w-6" />
          <span className="text-sm">성적</span>
        </Button>
      </div>

      {/* 학습 현황 */}
      <DashboardCard
        title="이번 주 학습 현황"
        description="주간 학습 활동 요약"
        icon={BarChart3}
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">5</div>
            <div className="text-sm text-blue-600">수업 참여</div>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">3</div>
            <div className="text-sm text-green-600">과제 제출</div>
          </div>
          <div className="text-center p-4 bg-yellow-50 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">2h</div>
            <div className="text-sm text-yellow-600">학습 시간</div>
          </div>
          <div className="text-center p-4 bg-purple-50 rounded-lg">
            <div className="text-2xl font-bold text-purple-600">A-</div>
            <div className="text-sm text-purple-600">평균 성적</div>
          </div>
        </div>
      </DashboardCard>
    </div>
  )
}