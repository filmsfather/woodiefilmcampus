'use client'

import { useState } from 'react'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { PrincipalDashboard } from '@/components/dashboard/principal/PrincipalDashboard'
import { ManagerDashboard } from '@/components/dashboard/manager/ManagerDashboard'
import { TeacherDashboard } from '@/components/dashboard/teacher/TeacherDashboard'
import { StudentDashboard } from '@/components/dashboard/student/StudentDashboard'
import { AuthForm } from '@/components/auth/AuthForm'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { UserRole } from '@/types/user'
import { Users, Shield, GraduationCap, BookOpen, Eye } from 'lucide-react'

export default function DemoPage() {
  const [selectedRole, setSelectedRole] = useState<UserRole | 'auth'>('auth')
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  const roles = [
    {
      key: 'principal' as UserRole,
      name: '원장',
      description: '모든 권한 보유, 다른 대시보드 이동 가능',
      icon: Shield,
      color: 'bg-purple-100 text-purple-800'
    },
    {
      key: 'manager' as UserRole,
      name: '실장',
      description: '가입 권한 관리, 역할 부여/해제, 반 관리',
      icon: Users,
      color: 'bg-blue-100 text-blue-800'
    },
    {
      key: 'teacher' as UserRole,
      name: '선생님',
      description: '추후 업데이트 예정',
      icon: GraduationCap,
      color: 'bg-green-100 text-green-800'
    },
    {
      key: 'student' as UserRole,
      name: '학생',
      description: '모바일 위주, 추후 업데이트 예정',
      icon: BookOpen,
      color: 'bg-yellow-100 text-yellow-800'
    }
  ]

  const renderDashboard = () => {
    if (!isLoggedIn) {
      return <AuthForm />
    }

    const currentRole = selectedRole as UserRole
    const roleData = roles.find(r => r.key === currentRole)

    const dashboardContent = () => {
      switch (currentRole) {
        case 'principal':
          return <PrincipalDashboard />
        case 'manager':
          return <ManagerDashboard />
        case 'teacher':
          return <TeacherDashboard />
        case 'student':
          return <StudentDashboard />
        default:
          return <div>선택된 역할이 없습니다.</div>
      }
    }

    return (
      <DashboardLayout
        userRole={currentRole}
        userName={`데모 ${roleData?.name}`}
        userEmail={`demo-${currentRole}@example.com`}
        onLogout={() => setIsLoggedIn(false)}
      >
        {dashboardContent()}
      </DashboardLayout>
    )
  }

  if (selectedRole !== 'auth' && isLoggedIn) {
    return renderDashboard()
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            학습관리 플랫폼 컴포넌트 데모
          </h1>
          <p className="text-lg text-gray-600 mb-8">
            권한별 대시보드와 컴포넌트들을 미리 확인해보세요
          </p>
        </div>

        {/* 인증 폼 데모 */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              인증 시스템 데모
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-medium mb-4">로그인/회원가입 폼</h3>
                <AuthForm />
              </div>
              <div className="space-y-4">
                <h3 className="font-medium">기능 설명</h3>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li>• Supabase Auth 연동</li>
                  <li>• 이메일 기반 인증</li>
                  <li>• 로그인/회원가입 전환</li>
                  <li>• 폼 validation</li>
                  <li>• 에러 메시지 표시</li>
                </ul>
                <Button 
                  onClick={() => {
                    setIsLoggedIn(true)
                    setSelectedRole('principal')
                  }}
                  className="w-full"
                >
                  로그인 없이 데모 시작하기
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 권한별 대시보드 선택 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              권한별 대시보드 데모
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {roles.map((role) => (
                <Card 
                  key={role.key}
                  className="cursor-pointer transition-all hover:shadow-md hover:scale-105"
                  onClick={() => {
                    setSelectedRole(role.key)
                    setIsLoggedIn(true)
                  }}
                >
                  <CardContent className="p-6 text-center">
                    <role.icon className="h-12 w-12 mx-auto mb-4 text-gray-600" />
                    <h3 className="font-semibold mb-2">{role.name}</h3>
                    <Badge className={`${role.color} mb-3`}>
                      {role.key}
                    </Badge>
                    <p className="text-sm text-gray-600 mb-4">
                      {role.description}
                    </p>
                    <Button variant="outline" className="w-full">
                      {role.name} 대시보드 보기
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 기술 스택 정보 */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>사용된 기술 스택</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="font-semibold text-blue-900">Next.js 15</div>
                <div className="text-sm text-blue-700">React Framework</div>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="font-semibold text-green-900">Supabase</div>
                <div className="text-sm text-green-700">Backend & Auth</div>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <div className="font-semibold text-purple-900">Tailwind CSS</div>
                <div className="text-sm text-purple-700">Styling</div>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="font-semibold text-gray-900">shadcn/ui</div>
                <div className="text-sm text-gray-700">UI Components</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}