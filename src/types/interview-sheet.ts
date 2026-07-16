export type InterviewSheetItemSource = 'template' | 'student' | 'teacher'

export type InterviewSheetAssetKind = 'file' | 'link'

export interface InterviewSheetItemAsset {
  id: string
  kind: InterviewSheetAssetKind
  orderIndex: number
  /** kind === 'file'일 때 서명된 다운로드 URL */
  url: string | null
  mimeType: string | null
  /** kind === 'link'일 때 외부 URL */
  externalUrl: string | null
  title: string | null
  createdBy: string | null
}

export interface InterviewSheetItem {
  id: string
  orderIndex: number
  prompt: string
  answer: string | null
  source: InterviewSheetItemSource
  createdBy: string | null
  answeredAt: string | null
  teacherFeedback: string | null
  feedbackAt: string | null
  feedbackByName: string | null
  assets: InterviewSheetItemAsset[]
}

export interface InterviewSheetDetail {
  id: string
  studentId: string
  studentName: string
  updatedAt: string
  items: InterviewSheetItem[]
}

export interface InterviewSheetTemplateItem {
  id: string
  orderIndex: number
  prompt: string
}

export interface InterviewSheetTemplateSummary {
  id: string
  title: string
  description: string | null
  isDefault: boolean
  itemCount: number
  createdAt: string
  createdByName: string | null
}

export interface InterviewSheetTemplateDetail {
  id: string
  title: string
  description: string | null
  isDefault: boolean
  items: InterviewSheetTemplateItem[]
}

/** 다른 화면(예: 모의 면접 회차)에서 곁들여 보여주는 간단한 면접지 요약 */
export interface InterviewSheetOverview {
  sheetId: string
  items: Array<{
    id: string
    orderIndex: number
    prompt: string
    answer: string | null
    source: InterviewSheetItemSource
  }>
}

export interface InterviewSheetStudentRow {
  studentId: string
  studentName: string
  classes: Array<{ id: string; name: string }>
  sheetId: string | null
  itemCount: number
  answeredCount: number
  updatedAt: string | null
}
