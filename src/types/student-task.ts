export type StudentTaskStatus = 'pending' | 'not_started' | 'in_progress' | 'completed' | 'canceled'

export interface StudentTaskWorkbookSummary {
  id: string
  title: string
  subject: string
  type: string
  weekLabel: string | null
  tags: string[]
  description?: string | null
  config: Record<string, unknown> | null
}

export interface StudentTaskAssignmentSummary {
  id: string
  dueAt: string | null
  createdAt: string
  targetScope: string
  workbook: StudentTaskWorkbookSummary
}

export interface StudentTaskItemSummary {
  id: string
  completedAt: string | null
  nextReviewAt: string | null
}

export interface StudentTaskSummary {
  id: string
  status: StudentTaskStatus
  completionAt: string | null
  createdAt: string
  updatedAt: string
  progressMeta: Record<string, unknown> | null
  assignment: StudentTaskAssignmentSummary | null
  summary: {
    totalItems: number
    completedItems: number
    remainingItems: number
  }
  due: {
    dueAt: string | null
    isOverdue: boolean
    isDueSoon: boolean
  }
}

export interface StudentTaskItemDetail extends StudentTaskItemSummary {
  streak: number
  lastResult: string | null
  workbookItem: {
    id: string
    position: number
    prompt: string
    answerType: string
    explanation: string | null
    srsSettings: Record<string, unknown> | null
    choices: Array<{
      id: string
      label: string | null
      content: string
      isCorrect: boolean
    }>
    shortFields: Array<{
      id: string
      label: string | null
      answer: string
      position: number
    }>
    media: Array<{
      id: string
      position: number
      asset: {
        id: string
        bucket: string
        path: string
        mimeType: string | null
        size: number | null
      }
    }>
  }
  submission: StudentTaskSubmission | null
}

export interface StudentTaskDetail extends StudentTaskSummary {
  items: StudentTaskItemDetail[]
  submissions: StudentTaskSubmission[]
}

export interface StudentTaskSubmission {
  id: string
  submissionType: string
  content: string | null
  mediaAssetId: string | null
  score: string | null
  feedback: string | null
  evaluatedBy: string | null
  evaluatedAt: string | null
  createdAt: string
  updatedAt: string
  itemId: string | null
}
