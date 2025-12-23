import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import WorkbookMetadataForm, { type TeacherOption } from '@/components/dashboard/workbooks/WorkbookMetadataForm'
import WorkbookItemsEditor, {
  type WorkbookItemsEditorItem,
} from '@/components/dashboard/workbooks/WorkbookItemsEditor'
import { Button } from '@/components/ui/button'
import { requireAuthForDashboard } from '@/lib/auth'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import {
  WORKBOOK_TITLES,
  type WorkbookMetadataFormValues,
} from '@/lib/validation/workbook'

type WorkbookConfig = {
  srs?: {
    allowMultipleCorrect?: boolean
  }
  pdf?: {
    instructions?: string
  }
  writing?: {
    instructions?: string
    maxCharacters?: number
  }
  film?: {
    noteCount?: number
    filters?: {
      country?: string
      director?: string
      genre?: string
      subgenre?: string
    }
  }
  lecture?: {
    youtubeUrl?: string
    instructions?: string
  }
}

export const metadata: Metadata = {
  title: '문제집 편집 | Woodie Film Campus',
  description: '생성된 문제집의 기본 정보를 수정하세요.',
}

interface WorkbookEditPageProps {
  params: Promise<{
    workbookId: string
  }>
}

export default async function WorkbookEditPage({ params }: WorkbookEditPageProps) {
  const { profile } = await requireAuthForDashboard(['teacher', 'manager'])
  const { workbookId } = await params
  const supabase = await createServerSupabase()

  const { data: workbook, error } = await supabase
    .from('workbooks')
    .select(
      `id, teacher_id, author_id, title, subject, type, week_label, tags, description, config,
       workbook_items(id, position, prompt, explanation, answer_type,
        workbook_item_choices(content, is_correct),
        workbook_item_short_fields(label, answer, position)
      )`
    )
    .eq('id', workbookId)
    .maybeSingle()

  if (error) {
    console.error('[workbooks/edit] fetch error', error)
  }

  const canManageWorkbook = profile && ['teacher', 'manager', 'principal'].includes(profile.role)

  if (!workbook || !canManageWorkbook) {
    notFound()
  }

  // Fetch teachers and principals for author selection
  const { data: teacherData } = await supabase
    .from('profiles')
    .select('id, name')
    .in('role', ['teacher', 'principal'])
    .order('name', { ascending: true })

  const teachers: TeacherOption[] = (teacherData ?? [])
    .filter((t): t is { id: string; name: string } => !!t.name)
    .map((t) => ({ id: t.id, name: t.name }))

  const formDefaults = buildMetadataFormDefaults(workbook)

  const itemsForEditor: WorkbookItemsEditorItem[] = [...(workbook.workbook_items ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((item) => ({
      id: item.id,
      position: item.position,
      prompt: item.prompt,
      explanation: item.explanation,
      choices:
        workbook.type === 'srs' && item.answer_type === 'multiple_choice'
          ? (item.workbook_item_choices ?? []).map((choice) => ({
            content: choice.content,
            isCorrect: choice.is_correct,
          }))
          : undefined,
      answerType: workbook.type === 'srs' ? (item.answer_type ?? 'multiple_choice') : undefined,
      shortFields:
        workbook.type === 'srs' && item.answer_type === 'short_answer'
          ? (item.workbook_item_short_fields ?? [])
            .sort((a, b) => (a?.position ?? 0) - (b?.position ?? 0))
            .map((field) => ({
              label: field?.label ?? '',
              answer: field?.answer ?? '',
            }))
          : undefined,
    }))

  const allowMultipleCorrect = Boolean(workbook.config?.srs?.allowMultipleCorrect)

  return (
    <section className="space-y-8">
      <div className="space-y-3">
        <DashboardBackLink fallbackHref="/dashboard/workbooks" label="문제집 목록으로 돌아가기" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-slate-900">문제집 편집</h1>
            <p className="text-sm text-slate-600">
              {workbook.title} · {WORKBOOK_TITLES[workbook.type as keyof typeof WORKBOOK_TITLES] ?? workbook.type}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href={`/dashboard/workbooks/${workbook.id}`}>상세 보기</Link>
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        <WorkbookMetadataForm workbookId={workbook.id} defaultValues={formDefaults} teachers={teachers} />
        <WorkbookItemsEditor
          workbookId={workbook.id}
          workbookType={workbook.type as 'srs' | 'pdf' | 'writing' | 'film' | 'lecture'}
          allowMultipleCorrect={allowMultipleCorrect}
          items={itemsForEditor}
        />
      </div>
    </section>
  )
}

type WorkbookRecord = {
  id: string
  teacher_id: string
  author_id: string | null
  title: string
  subject: string
  type: string
  week_label: string | null
  tags: string[] | null
  description: string | null
  config: WorkbookConfig | null
  workbook_items?: Array<{
    id: string
    position: number
    prompt: string
    explanation: string | null
    workbook_item_choices?: Array<{
      content: string
      is_correct: boolean
    }>
    workbook_item_short_fields?: Array<{
      label?: string | null
      answer?: string | null
      position?: number | null
    }>
    answer_type?: string | null
  }>
}

const buildMetadataFormDefaults = (workbook: WorkbookRecord): WorkbookMetadataFormValues => {
  const config = workbook.config ?? {}
  const filmConfig = config.film ?? {}
  const filmFilters = filmConfig.filters ?? {}
  const writingConfig = config.writing ?? {}

  return {
    title: workbook.title,
    subject: workbook.subject as WorkbookMetadataFormValues['subject'],
    type: workbook.type as WorkbookMetadataFormValues['type'],
    authorId: workbook.author_id ?? '',
    weekLabel: workbook.week_label ?? '',
    tagsInput: (workbook.tags ?? []).join(', '),
    description: workbook.description ?? '',
    srsSettings: {
      allowMultipleCorrect: config.srs?.allowMultipleCorrect ?? true,
    },
    pdfSettings: {
      instructions: config.pdf?.instructions ?? '',
    },
    writingSettings: {
      instructions: writingConfig.instructions ?? '',
      maxCharacters: writingConfig.maxCharacters ? String(writingConfig.maxCharacters) : '',
    },
    filmSettings: {
      noteCount: typeof filmConfig.noteCount === 'number' ? filmConfig.noteCount : 1,
      country: filmFilters.country ?? '',
      director: filmFilters.director ?? '',
      genre: filmFilters.genre ?? '',
      subgenre: filmFilters.subgenre ?? '',
    },
    lectureSettings: {
      youtubeUrl: config.lecture?.youtubeUrl ?? '',
      instructions: config.lecture?.instructions ?? '',
    },
  }
}
