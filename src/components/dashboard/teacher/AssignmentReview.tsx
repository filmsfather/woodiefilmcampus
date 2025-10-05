'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import {
  AssignmentEvaluationPanel,
  type AssignmentEvaluationPanelProps,
} from '@/components/dashboard/teacher/AssignmentEvaluationPanel'

export type AssignmentReviewProps = AssignmentEvaluationPanelProps

export function AssignmentReview({ classContext, focusStudentTaskId, ...rest }: AssignmentReviewProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const handleFocusStudentTask = (studentTaskId: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (studentTaskId) {
      params.set('studentTask', studentTaskId)
    } else {
      params.delete('studentTask')
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <AssignmentEvaluationPanel
      {...rest}
      classContext={classContext}
      focusStudentTaskId={focusStudentTaskId}
      onFocusStudentTask={handleFocusStudentTask}
      showBackButton
    />
  )
}
