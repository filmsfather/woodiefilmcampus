import { Metadata } from 'next'

import { EnrollmentApplicationForm } from '@/components/enrollment/EnrollmentApplicationForm'
import { fetchAllAnnualSchedules } from '@/lib/learning-journals'

export const metadata: Metadata = {
  title: '등록원서 접수 | Woodie Film Campus',
  description: '희망 반을 선택하고 등록원서를 제출하면 개강 안내를 받아볼 수 있습니다.',
}

export default async function EnrollmentApplicationPage() {
  const annualSchedules = await fetchAllAnnualSchedules()

  return (
    <main className="min-h-screen bg-muted">
      <EnrollmentApplicationForm annualSchedules={annualSchedules} />
    </main>
  )
}
