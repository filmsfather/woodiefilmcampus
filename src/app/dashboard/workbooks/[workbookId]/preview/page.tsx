import { notFound } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { SrsTaskRunner } from '@/components/dashboard/student/tasks/SrsTaskRunner'
import { TextTaskRunner } from '@/components/dashboard/student/tasks/TextTaskRunner'
import { Card, CardContent } from '@/components/ui/card'
import { requireAuthForDashboard } from '@/lib/auth'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import type { StudentTaskDetail, StudentTaskItemDetail } from '@/types/student-task'
import { createAdminClient } from '@/lib/supabase/admin'

interface WorkbookPreviewPageProps {
    params: Promise<{
        workbookId: string
    }>
}

export default async function WorkbookPreviewPage(props: WorkbookPreviewPageProps) {
    const params = await props.params
    await requireAuthForDashboard(['teacher', 'manager'])
    const supabase = createServerSupabase()

    const { data: workbook, error } = await supabase
        .from('workbooks')
        .select(
            `id, teacher_id, title, subject, type, week_label, tags, description, config, created_at, updated_at,
       workbook_items(id, position, prompt, explanation, srs_settings, answer_type,
        workbook_item_choices(id, label, content, is_correct),
        workbook_item_short_fields(id, label, answer, position),
        workbook_item_media(id, position, asset_id, media_assets(id, bucket, path, mime_type, size, metadata))
      )`
        )
        .eq('id', params.workbookId)
        .maybeSingle()

    if (error) {
        console.error('[workbooks] preview fetch error', error)
    }

    if (!workbook) {
        notFound()
    }

    // Media signing logic (copied from WorkbookDetailPage)
    const sortedItems = [...(workbook.workbook_items ?? [])].sort((a, b) => a.position - b.position)
    const mediaRecords = sortedItems.flatMap((item) => item.workbook_item_media ?? [])
    const mediaAssetInfoMap = new Map<
        string,
        {
            bucket: string | null
            path: string | null
            mimeType: string | null
            size: number | null
            metadata: Record<string, unknown> | null
        }
    >()
    const missingAssetIds = new Set<string>()

    for (const media of mediaRecords) {
        const assetData = media.media_assets as unknown
        const asset = (Array.isArray(assetData) ? assetData[0] : assetData) as {
            id?: string
            bucket?: string | null
            path?: string | null
            mime_type?: string | null
            size?: number | null
            metadata?: Record<string, unknown> | null
        } | null

        if (asset?.id) {
            mediaAssetInfoMap.set(asset.id, {
                bucket: asset.bucket ?? 'workbook-assets',
                path: asset.path ?? null,
                mimeType: asset.mime_type ?? null,
                size: asset.size ?? null,
                metadata: asset.metadata ?? null,
            })
        }
        const assetId = (media as { asset_id?: string | null }).asset_id ?? null
        if (assetId && !mediaAssetInfoMap.has(assetId)) {
            missingAssetIds.add(assetId)
        }
    }

    const canUseAdminClient = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
    const adminSupabase = canUseAdminClient ? createAdminClient() : null
    const storageClient = adminSupabase ?? supabase

    if (missingAssetIds.size > 0 && adminSupabase) {
        const { data: fallbackAssets } = await adminSupabase
            .from('media_assets')
            .select('id, bucket, path, mime_type, size, metadata')
            .in('id', Array.from(missingAssetIds))

        for (const asset of fallbackAssets ?? []) {
            if (!asset?.id) continue
            mediaAssetInfoMap.set(asset.id, {
                bucket: asset.bucket ?? 'workbook-assets',
                path: asset.path ?? null,
                mimeType: asset.mime_type ?? null,
                size: asset.size ?? null,
                metadata: (asset.metadata as Record<string, unknown>) ?? null,
            })
        }
    }

    const mediaSignedUrlMap = new Map<string, string>()

    for (const [assetId, info] of mediaAssetInfoMap.entries()) {
        if (!info.path) continue
        const bucket = info.bucket ?? 'workbook-assets'
        const { data: signed } = await storageClient.storage
            .from(bucket)
            .createSignedUrl(info.path, 60 * 60)

        if (signed?.signedUrl) {
            mediaSignedUrlMap.set(assetId, signed.signedUrl)
        }
    }

    // Construct mock task
    const mockItems: StudentTaskItemDetail[] = sortedItems.map((item) => {
        const media = (item.workbook_item_media ?? []).map((m) => {
            const assetData = m.media_assets as unknown
            const asset = (Array.isArray(assetData) ? assetData[0] : assetData) as { id?: string } | null
            const assetId = m.asset_id ?? asset?.id
            const assetInfo = assetId ? mediaAssetInfoMap.get(assetId) : null

            // We need to construct the asset structure expected by StudentTaskItemDetail
            // But wait, StudentTaskItemDetail expects `asset` object, not signed URL directly in `media` array.
            // Actually, SrsTaskRunner doesn't seem to use media directly? 
            // Let's check SrsTaskRunner again. It uses `currentItem.workbookItem.prompt` etc.
            // It DOES NOT seem to render media in SrsTaskRunner!
            // Wait, let me check SrsTaskRunner.tsx content again.
            // It renders choices and short fields. It DOES NOT render media!
            // The `StudentTaskDetailPage` handles media attachments and passes them to `TextTaskRunner` or `PdfTaskPanel`.
            // But for `SrsTaskRunner`, does it handle media?
            // Looking at `SrsTaskRunner.tsx`:
            // It renders prompt, explanation, choices, shortFields.
            // It DOES NOT render media attachments.
            // So I can skip media processing for SrsTaskRunner for now, or if I need to support it later, I should add it.
            // But wait, if the SRS item has an image, where is it shown?
            // In `StudentTaskDetailPage`, `attachmentsByItem` is calculated.
            // But `SrsTaskRunner` props are `task` and `onSubmitAnswer`.
            // `SrsTaskRunner` uses `task.items`.
            // Does `SrsTaskRunner` display images?
            // I checked the code of `SrsTaskRunner.tsx` in step 50.
            // It has `CardContent` with `prompt`.
            // It does NOT seem to have any image rendering logic.
            // Wait, `StudentTaskDetailPage` passes `task` to `SrsTaskRunner`.
            // If `SrsTaskRunner` doesn't render images, then SRS items with images might be broken or images are just not shown?
            // Let's assume for now I just need to pass the structure.

            return {
                id: m.id,
                position: m.position,
                asset: {
                    id: assetId ?? '',
                    bucket: assetInfo?.bucket ?? '',
                    path: assetInfo?.path ?? '',
                    mimeType: assetInfo?.mimeType ?? null,
                    size: assetInfo?.size ?? null,
                    metadata: assetInfo?.metadata ?? null,
                }
            }
        })

        return {
            id: `mock-item-${item.id}`,
            completedAt: null,
            nextReviewAt: new Date().toISOString(), // Always due
            streak: 0,
            lastResult: null,
            submission: null,
            workbookItem: {
                id: item.id,
                position: item.position,
                prompt: item.prompt,
                answerType: item.answer_type,
                explanation: item.explanation,
                srsSettings: (item.srs_settings as Record<string, unknown>) ?? null,
                choices: (item.workbook_item_choices ?? []).map((c) => ({
                    id: c.id,
                    label: c.label,
                    content: c.content,
                    isCorrect: c.is_correct,
                })),
                shortFields: (item.workbook_item_short_fields ?? []).map((f) => ({
                    id: f.id,
                    label: f.label,
                    answer: f.answer,
                    position: f.position,
                })),
                media: media,
            },
        }
    })

    const mockTask: StudentTaskDetail = {
        id: 'mock-task-id',
        status: 'in_progress',
        statusSource: 'system',
        statusOverride: null,
        submittedLate: false,
        completionAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        progressMeta: null,
        assignment: {
            id: 'mock-assignment-id',
            dueAt: null,
            createdAt: new Date().toISOString(),
            targetScope: 'class',
            workbook: {
                id: workbook.id,
                title: workbook.title,
                subject: workbook.subject,
                type: workbook.type,
                weekLabel: workbook.week_label,
                tags: workbook.tags ?? [],
                description: workbook.description,
                config: (workbook.config as Record<string, unknown>) ?? null,
            },
        },
        summary: {
            totalItems: mockItems.length,
            completedItems: 0,
            remainingItems: mockItems.length,
        },
        due: {
            dueAt: null,
            isOverdue: false,
            isDueSoon: false,
        },
        items: mockItems,
        submissions: [],
    }

    const isSrs = workbook.type === 'srs'
    const isWriting = workbook.type === 'writing'

    return (
        <section className="space-y-6">
            <DashboardBackLink
                fallbackHref={`/dashboard/workbooks/${workbook.id}`}
                label="문제집 상세로 돌아가기"
            />

            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold text-slate-900">{workbook.title} - 미리보기</h1>
                {isSrs && (
                    <p className="whitespace-pre-line text-sm text-slate-600">
                        학생들이 보게 될 화면을 미리 체험해볼 수 있습니다. 정답을 맞춰도 기록되지 않습니다.
                        {'\n'}
                        실제 학생 학습 시에는 정답을 맞출 때마다 복습 간격이 늘어나며(10분 → 1일 → 완료), 오답 시에는 1분 뒤 다시 복습하게 됩니다. 3번 연속 정답을 맞추면 해당 문항은 완료 처리됩니다.
                    </p>
                )}
                {isWriting && (
                    <p className="whitespace-pre-line text-sm text-slate-600">
                        학생들이 보게 될 화면을 미리 체험해볼 수 있습니다. 제출 기록은 저장되지 않습니다.
                        {'\n'}
                        답안을 작성하고 제출하면 AI가 설정된 채점 기준에 따라 자동으로 평가하고 피드백을 제공합니다. (실제 AI 토큰이 사용됩니다)
                    </p>
                )}
                {!isSrs && !isWriting && (
                    <p className="text-sm text-slate-600">
                        학생들이 보게 될 화면을 미리 체험해볼 수 있습니다.
                    </p>
                )}
            </div>

            {isSrs ? (
                <SrsTaskRunner task={mockTask} mode="preview" />
            ) : isWriting ? (
                <TextTaskRunner
                    task={mockTask}
                    submissionType="writing"
                    instructions={(workbook.config as { writing?: { instructions?: string } })?.writing?.instructions}
                    maxCharacters={(workbook.config as { writing?: { maxCharacters?: number } })?.writing?.maxCharacters}
                    mode="preview"
                />
            ) : (
                <Card>
                    <CardContent className="py-10 text-center text-slate-500">
                        SRS 및 글쓰기(Writing) 유형의 문제집만 미리보기를 지원합니다.
                    </CardContent>
                </Card>
            )}
        </section>
    )
}
