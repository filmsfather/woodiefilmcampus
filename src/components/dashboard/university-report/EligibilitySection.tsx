'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'

import EligibilitySurvey from '@/components/dashboard/university-report/EligibilitySurvey'
import EligibilitySummary from '@/components/dashboard/university-report/EligibilitySummary'
import { Button } from '@/components/ui/button'
import type { ReportEligibility } from '@/lib/university-report/types'

interface EligibilitySectionProps {
  studentId: string
  eligibility: ReportEligibility | null
  isViewingOther?: boolean
}

export default function EligibilitySection({
  studentId,
  eligibility,
  isViewingOther = false,
}: EligibilitySectionProps) {
  const [editing, setEditing] = useState(eligibility === null)

  if (editing) {
    return (
      <EligibilitySurvey
        studentId={studentId}
        initial={eligibility}
        isViewingOther={isViewingOther}
      />
    )
  }

  return (
    <EligibilitySummary
      eligibility={eligibility}
      footer={
        <div className="flex justify-end pt-1">
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setEditing(true)}>
            <Pencil className="size-4" />
            다시 응답하기
          </Button>
        </div>
      }
    />
  )
}
