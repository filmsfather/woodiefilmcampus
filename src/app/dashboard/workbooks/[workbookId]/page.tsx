import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import DateUtil from '@/lib/date-util'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { requireAuthForDashboard } from '@/lib/auth'
import { WORKBOOK_TITLES } from '@/lib/validation/workbook'
import { duplicateWorkbook, deleteWorkbook } from '@/app/dashboard/workbooks/actions'
import { createAdminClient } from '@/lib/supabase/admin'

interface WorkbookDetailPageProps {
  params: {
    workbookId: string
  }
}

export default async function WorkbookDetailPage({ params }: WorkbookDetailPageProps) {
  const { profile } = await requireAuthForDashboard(['teacher', 'manager'])
  const supabase = createServerSupabase()

  const { data: workbook, error } = await supabase
    .from('workbooks')
    .select(
      `id, teacher_id, title, subject, type, week_label, tags, description, config, created_at, updated_at,
       teacher:profiles!workbooks_teacher_id_fkey(id, name, email),
       workbook_items(id, position, prompt, explanation, srs_settings, answer_type,
        workbook_item_choices(id, label, content, is_correct),
        workbook_item_short_fields(id, label, answer, position),
       workbook_item_media(id, position, asset_id, media_assets(id, bucket, path, mime_type, size))
      )`
    )
    .eq('id', params.workbookId)
    .maybeSingle()

  if (error) {
    console.error('[workbooks] detail fetch error', error)
  }

  if (!workbook) {
    notFound()
  }

  const canManageWorkbook =
    profile && ['teacher', 'manager', 'principal'].includes(profile.role)

  const teacherInfo = Array.isArray(workbook.teacher) ? workbook.teacher[0] : workbook.teacher
  const authorLabel = teacherInfo?.name ?? teacherInfo?.email ?? '작성자 정보 없음'

  const readableType = WORKBOOK_TITLES[workbook.type as keyof typeof WORKBOOK_TITLES] ?? workbook.type

  const formatDate = (value: string) =>
    DateUtil.formatForDisplay(value, {
      locale: 'ko-KR',
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  const sortedItems = [...(workbook.workbook_items ?? [])].sort((a, b) => a.position - b.position)

  const mediaRecords = sortedItems.flatMap((item) => item.workbook_item_media ?? [])

  const mediaAssetInfoMap = new Map<
    string,
    {
      bucket: string | null
      path: string | null
      mimeType: string | null
    }
  >()

  const missingAssetIds = new Set<string>()

  for (const media of mediaRecords) {
    const asset = media.media_assets as
      | {
          id?: string
          bucket?: string | null
          path?: string | null
          mime_type?: string | null
        }
      | null
      | undefined

    if (asset?.id) {
      mediaAssetInfoMap.set(asset.id, {
        bucket: asset.bucket ?? 'workbook-assets',
        path: asset.path ?? null,
        mimeType: asset.mime_type ?? null,
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
    const { data: fallbackAssets, error: fallbackFetchError } = await adminSupabase
      .from('media_assets')
      .select('id, bucket, path, mime_type')
      .in('id', Array.from(missingAssetIds))

    if (fallbackFetchError) {
      console.error('[workbooks] media asset fallback fetch error', fallbackFetchError)
    }

    for (const asset of fallbackAssets ?? []) {
      if (!asset?.id) {
        continue
      }

      mediaAssetInfoMap.set(asset.id, {
        bucket: (asset.bucket as string | null) ?? 'workbook-assets',
        path: (asset.path as string | null) ?? null,
        mimeType: (asset.mime_type as string | null) ?? null,
      })
    }
  }

  const mediaSignedUrlMap = new Map<
    string,
    {
      url: string
      mimeType: string | null
      filename: string
    }
  >()

  for (const [assetId, info] of mediaAssetInfoMap.entries()) {
    if (!info.path) {
      continue
    }

    const bucket = info.bucket ?? 'workbook-assets'
    const { data: signed, error: signedError } = await storageClient.storage
      .from(bucket)
      .createSignedUrl(info.path, 60 * 60)

    if (signedError) {
      console.error('[workbooks] media signed URL error', { assetId, bucket, path: info.path, signedError })
      continue
    }

    if (!signed?.signedUrl) {
      continue
    }

    const filename = info.path.split('/').pop() ?? '첨부파일'
    mediaSignedUrlMap.set(assetId, {
      url: signed.signedUrl,
      mimeType: info.mimeType,
      filename,
    })
  }

  return (
    <section className="space-y-6">
      <div className="space-y-4">
        <DashboardBackLink fallbackHref="/dashboard/workbooks" label="문제집 목록으로 돌아가기" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-slate-900">{workbook.title}</h1>
              <Badge variant="secondary">{readableType}</Badge>
              <Badge variant="outline">{workbook.subject}</Badge>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span className="font-medium text-slate-700">작성자</span>
              <span>{authorLabel}</span>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-slate-500">
              {workbook.week_label && <span className="rounded bg-slate-100 px-2 py-1">{workbook.week_label}</span>}
              {(workbook.tags ?? []).map((tag: string) => (
                <span key={tag} className="rounded bg-slate-100 px-2 py-1">#{tag}</span>
              ))}
            </div>
            <div className="text-xs text-slate-500">
              <p>생성일: {formatDate(workbook.created_at)}</p>
              <p>수정일: {formatDate(workbook.updated_at)}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canManageWorkbook && (
              <>
                <form
                  action={async () => {
                    'use server'
                    await duplicateWorkbook(workbook.id)
                  }}
                >
                  <Button type="submit" variant="outline">
                    복제
                  </Button>
                </form>
                <form
                  action={async () => {
                    'use server'
                    await deleteWorkbook(workbook.id)
                  }}
                >
                  <Button type="submit" variant="destructive">
                    삭제
                  </Button>
                </form>
                <Button asChild variant="outline">
                  <Link href={`/dashboard/workbooks/${workbook.id}/edit`}>편집</Link>
                </Button>
              </>
            )}
            <Button asChild>
              <Link href={`/dashboard/assignments/new?workbookId=${workbook.id}`}>출제하기</Link>
            </Button>
          </div>
        </div>
      </div>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle>유형별 설정</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-600">
          {workbook.type === 'srs' && (
            <div>
              <p className="font-medium text-slate-800">SRS 옵션</p>
              <p>복수 정답 허용: {workbook.config?.srs?.allowMultipleCorrect ? '예' : '아니오'}</p>
            </div>
          )}
          {workbook.type === 'pdf' && workbook.config?.pdf?.instructions && (
            <div>
              <p className="font-medium text-slate-800">PDF 제출 안내</p>
              <p className="whitespace-pre-line">{workbook.config.pdf.instructions}</p>
            </div>
          )}
          {workbook.type === 'writing' && (
            <div className="space-y-1">
              {workbook.config?.writing?.instructions && (
                <p>
                  <span className="font-medium text-slate-800">작성 안내:</span> {workbook.config.writing.instructions}
                </p>
              )}
              {workbook.config?.writing?.maxCharacters && (
                <p>
                  <span className="font-medium text-slate-800">글자 수 제한:</span> {workbook.config.writing.maxCharacters.toLocaleString()}자
                </p>
              )}
            </div>
          )}
          {workbook.type === 'film' && (
            <div className="space-y-1">
              <p>
                <span className="font-medium text-slate-800">필수 감상 노트 수:</span> {workbook.config?.film?.noteCount ?? '-'}개
              </p>
              <div className="flex flex-wrap gap-2 text-xs">
                {Object.entries(workbook.config?.film?.filters ?? {})
                  .filter(([, value]) => Boolean(value))
                  .map(([key, value]) => (
                    <span key={key} className="rounded bg-slate-100 px-2 py-1 text-slate-600">
                      {key}: {String(value)}
                    </span>
                  ))}
              </div>
            </div>
          )}
          {workbook.type === 'lecture' && (
            <div className="space-y-1">
              {workbook.config?.lecture?.youtubeUrl && (
                <p>
                  <span className="font-medium text-slate-800">강의 링크:</span>{' '}
                  <a
                    href={workbook.config.lecture.youtubeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline"
                  >
                    {workbook.config.lecture.youtubeUrl}
                  </a>
                </p>
              )}
              {workbook.config?.lecture?.instructions && (
                <p className="whitespace-pre-line">
                  <span className="font-medium text-slate-800">요약 안내:</span> {workbook.config.lecture.instructions}
                </p>
              )}
            </div>
          )}
          {(workbook.type === 'pdf' && !workbook.config?.pdf?.instructions) && (
            <p className="text-xs text-slate-500">제출 안내가 설정되지 않았습니다.</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle>문항 목록 ({sortedItems.length}개)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {sortedItems.map((item) => (
            <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-900">문항 {item.position}</p>
                  <p className="whitespace-pre-line text-sm text-slate-700">{item.prompt}</p>
                  {item.explanation && (
                    <p className="whitespace-pre-line text-xs text-slate-500">해설: {item.explanation}</p>
                  )}
                </div>
              </div>
              {workbook.type === 'srs' && item.answer_type === 'multiple_choice' && (item.workbook_item_choices?.length ?? 0) > 0 && (
                <div className="mt-3 space-y-2 rounded-md bg-slate-50 p-3">
                  <p className="text-xs font-medium text-slate-500">보기</p>
                  <ul className="space-y-1 text-sm">
                    {item.workbook_item_choices?.map((choice) => (
                      <li
                        key={choice.id}
                        className={`flex items-center gap-2 ${choice.is_correct ? 'text-green-700' : 'text-slate-600'}`}
                      >
                        {choice.is_correct ? (
                          <Badge variant="outline" className="border-green-500 text-green-600">
                            정답
                          </Badge>
                        ) : (
                          <span className="inline-block size-2 rounded-full bg-slate-300" />
                        )}
                        <span>{choice.label}. {choice.content}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {workbook.type === 'srs' && item.answer_type === 'short_answer' && (item.workbook_item_short_fields?.length ?? 0) > 0 && (
                <div className="mt-3 space-y-2 rounded-md bg-slate-50 p-3">
                  <p className="text-xs font-medium text-slate-500">단답 필드</p>
                  <ul className="space-y-1 text-sm text-slate-700">
                    {item.workbook_item_short_fields
                      ?.sort((a, b) => (a?.position ?? 0) - (b?.position ?? 0))
                      .map((field) => (
                        <li key={field?.id ?? `${item.id}-short-${field?.position ?? 0}`} className="rounded border border-slate-200 bg-white px-3 py-2">
                          {field?.label && <p className="text-xs font-medium text-slate-500">{field.label}</p>}
                          <p>{field?.answer}</p>
                        </li>
                      ))}
                  </ul>
                </div>
              )}

              {(item.workbook_item_media?.length ?? 0) > 0 && (
                <div className="mt-3 space-y-2 rounded-md bg-slate-50 p-3">
                  <p className="text-xs font-medium text-slate-500">첨부 자산</p>
                  <div className="flex flex-wrap gap-3">
                    {item.workbook_item_media?.map((media) => {
                      const asset = media.media_assets as { id?: string } | null | undefined
                      const assetId =
                        asset?.id ?? ((media as { asset_id?: string | null }).asset_id ?? null)

                      if (!assetId) {
                        return null
                      }

                      const signed = mediaSignedUrlMap.get(assetId)

                      if (!signed) {
                        return null
                      }

                      if (signed.mimeType?.startsWith('image/')) {
                        return (
                          <div key={media.id} className="flex max-w-xs flex-col gap-2 text-xs text-slate-600">
                            <Image
                              src={signed.url}
                              alt={signed.filename}
                              width={320}
                              height={240}
                              className="h-32 w-full rounded-md object-cover"
                              unoptimized
                            />
                            <span>{signed.filename}</span>
                          </div>
                        )
                      }

                      return (
                        <div key={media.id} className="flex items-center gap-2 text-sm text-slate-600">
                          <span>{signed.filename}</span>
                          <a
                            href={signed.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary underline"
                          >
                            다운로드
                          </a>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  )
}
