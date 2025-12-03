import type { UserRole } from '@/lib/supabase'

export interface NavigationLink {
  label: string
  href: string
  description?: string
}

export interface NavigationSection {
  id: string
  title: string
  items: NavigationLink[]
}

export const ROLE_LABELS: Record<UserRole, string> = {
  principal: '원장',
  manager: '실장',
  teacher: '선생님',
  student: '학생',
}

const principalCoreSections: NavigationSection[] = [
  {
    id: 'principal-home',
    title: '원장 대시보드',
    items: [
      { label: '원장 대시보드 홈', href: '/dashboard/principal' },
    ],
  },
  {
    id: 'principal-students',
    title: '학생 관리',
    items: [{ label: '퇴원생 관리', href: '/dashboard/principal/withdrawn-students' }],
  },
  {
    id: 'principal-work',
    title: '근무일지 승인',
    items: [
      { label: '근무일지 관리', href: '/dashboard/principal/work-logs' },
      { label: '임금관리', href: '/dashboard/principal/payroll' },
    ],
  },
  {
    id: 'principal-learning',
    title: '학습일지 현황',
    items: [
      { label: '승인 대기 목록', href: '/dashboard/principal/learning-journal/review' },
      { label: '학습일지 관리', href: '/dashboard/principal/learning-journal' },
    ],
  },
]

const managerSections: NavigationSection[] = [
  {
    id: 'manager-home',
    title: '대시보드 이동',
    items: [
      { label: '실장 대시보드', href: '/dashboard/manager' },
    ],
  },
  {
    id: 'manager-registration',
    title: '등록관리',
    items: [
      { label: '등록원서 보기', href: '/dashboard/manager/enrollment' },
      { label: '상담관리 열기', href: '/dashboard/manager/counseling/slots' },
      { label: '구성원 관리', href: '/dashboard/manager/members' },
    ],
  },
  {
    id: 'manager-classes',
    title: '반 관리',
    items: [
      { label: '반관리 열기', href: '/dashboard/manager/classes' },
      { label: '결석확인', href: '/dashboard/manager/absences' },
      { label: '학습일지 관리', href: '/dashboard/manager/learning-journal' },
    ],
  },
  {
    id: 'manager-learning-journal',
    title: '학습일지 관리',
    items: [
      { label: '학습일지 생성', href: '/dashboard/manager/learning-journal' },
      { label: '학습일지 열람', href: '/dashboard/principal/learning-journal/review' },
    ],
  },
  {
    id: 'manager-operations',
    title: '업무관리',
    items: [
      { label: '인쇄요청 관리', href: '/dashboard/manager/print-requests' },
      { label: '교사 대시보드 열기', href: '/dashboard/teacher' },
    ],
  },
]

const teacherSections: NavigationSection[] = [
  {
    id: 'teacher-home',
    title: '대시보드 이동',
    items: [
      { label: '교사용 허브', href: '/dashboard/teacher' },
    ],
  },
  {
    id: 'teacher-schedule',
    title: '일정관리',
    items: [
      { label: '연간 일정', href: '/dashboard/learning-journal/annual-schedule' },
      { label: '월간 학습 계획', href: '/dashboard/teacher/learning-journal/templates' },
      { label: '수업 시간표', href: '/dashboard/teacher/timetable' },
    ],
  },
  {
    id: 'teacher-work',
    title: '근무관리',
    items: [
      { label: '결석확인', href: '/dashboard/teacher/absences' },
      { label: '근무일지 작성', href: '/dashboard/teacher/work-journal' },
      { label: '학습일지 작성', href: '/dashboard/teacher/learning-journal' },
      { label: '공지사항', href: '/dashboard/teacher/notices' },
    ],
  },
  {
    id: 'teacher-assignments',
    title: '과제관리',
    items: [
      { label: '과제 출제하기', href: '/dashboard/assignments/new' },
      { label: '과제 검사하기', href: '/dashboard/teacher/review' },
      { label: '학생 아틀리에', href: '/dashboard/teacher/atelier' },
    ],
  },
  {
    id: 'teacher-materials',
    title: '수업자료',
    items: [
      { label: '수업자료 아카이브', href: '/dashboard/teacher/class-materials' },
      { label: '입시자료 아카이브', href: '/dashboard/teacher/admission-materials' },
    ],
  },
  {
    id: 'teacher-workbooks',
    title: '문제집 관리',
    items: [
      { label: '문제집 만들기', href: '/dashboard/workbooks/new' },
      { label: '출판된 문제집 확인', href: '/dashboard/workbooks' },
    ],
  },
]

const studentSections: NavigationSection[] = [
  {
    id: 'student-home',
    title: '대시보드 이동',
    items: [
      { label: '학생 대시보드', href: '/dashboard/student' },
    ],
  },
  {
    id: 'student-todo',
    title: '해야할 일',
    items: [
      { label: '연간 학습 일정', href: '/dashboard/learning-journal/annual-schedule' },
      { label: '이번달 학습 계획', href: '/dashboard/student/monthly-plan' },
      { label: '이번주 문제집 풀기', href: '/dashboard/student/tasks' },
      { label: '공지사항 게시판', href: '/dashboard/student/notices' },
    ],
  },
  {
    id: 'student-done',
    title: '해냈던 일',
    items: [
      { label: '지난달 학습 일지', href: '/dashboard/student/learning-journal' },
      { label: '영화 감상 일지', href: '/dashboard/student/film-notes' },
      { label: '작품 아틀리에', href: '/dashboard/student/atelier' },
    ],
  },
]

const principalExtendedSections: NavigationSection[] = [
  ...principalCoreSections,
  {
    id: 'principal-manager-home',
    title: '실장 대시보드',
    items: [{ label: '실장 대시보드 홈', href: '/dashboard/manager' }],
  },
  ...managerSections
    .filter((section) => section.id !== 'manager-home')
    .map((section) => ({
      id: `principal-${section.id}`,
      title: `실장 · ${section.title}`,
      items: section.items.map((item) => ({ ...item })),
    })),
  {
    id: 'principal-teacher-home',
    title: '교사 대시보드',
    items: [{ label: '교사 대시보드 홈', href: '/dashboard/teacher' }],
  },
  ...teacherSections
    .filter((section) => section.id !== 'teacher-home')
    .map((section) => ({
      id: `principal-${section.id}`,
      title: `교사 · ${section.title}`,
      items: section.items.map((item) => ({ ...item })),
    })),
  {
    id: 'principal-student-home',
    title: '학생 대시보드',
    items: [{ label: '학생 대시보드 홈', href: '/dashboard/student' }],
  },
  ...studentSections
    .filter((section) => section.id !== 'student-home')
    .map((section) => ({
      id: `principal-${section.id}`,
      title: `학생 · ${section.title}`,
      items: section.items.map((item) => ({ ...item })),
    })),
]

const roleNavigation: Record<UserRole, NavigationSection[]> = {
  principal: principalExtendedSections,
  manager: managerSections,
  teacher: teacherSections,
  student: studentSections,
}

export function getNavigationSections(role: UserRole): NavigationSection[] {
  return roleNavigation[role]
}
