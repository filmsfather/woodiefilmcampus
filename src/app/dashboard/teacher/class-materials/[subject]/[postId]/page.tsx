import Link from 'next/link'
import { notFound } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import DateUtil from '@/lib/date-util'
import {
  CLASS_MATERIALS_BUCKET,
  type ClassMaterialAssetType,
  ClassMaterialSubject,
  getClassMaterialSubjectLabel,
  isClassMaterialSubject,
} from '@/lib/class-materials'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { ClassMaterialPrintRequestForm } from '@/components/dashboard/class-materials/ClassMaterialPrintRequestForm'
import {
  cancelClassMaterialPrintRequest,
  createClassMaterialPrintRequest,
} from '@/app/dashboard/teacher/class-materials/actions'

interface PrintRequestItemRow {
  id: string
  asset_type: ClassMaterialAssetType
  asset_filename: string | null
  downloadUrl: string | null
}

interface PrintRequestRow {
  id: string
  status: 'requested' | 'done' | 'canceled'
  copies: number
  color_mode: 'bw' | 'color'
  desired_date: string | null
  desired_period: string | null
  notes: string | null
  requested_by: string
  created_at: string
  updated_at: string
  requester?: {
    id: string
    name: string | null
    email: string | null
  } | null
  items: PrintRequestItemRow[]
}

interface PostAttachmentSummary {
  id: string
  kind: ClassMaterialAssetType
  name: string
  order: number
  downloadUrl: string | null
}

interface ClassMaterialPostDetail {
  id: string
  subject: ClassMaterialSubject
  week_label: string | null
  title: string
  description: string | null
  created_at: string
  updated_at: string
  author?: {
    id: string
    name: string | null
    email: string | null
  } | null
  attachments: PostAttachmentSummary[]
  print_requests: PrintRequestRow[]
}

export default async function ClassMaterialDetailPage({
  params,
}: {
  params: { subject: string; postId: string }
}) {
  if (!isClassMaterialSubject(params.subject)) {
    notFound()
  }

  const subject = params.subject
  const supabase = createServerSupabase()

  const { data, error } = await supabase
    .from('class_material_posts')
    .select(
      `id,
       subject,
       week_label,
       title,
       description,
       created_at,
       updated_at,
       author:profiles!class_material_posts_created_by_fkey(id, name, email),
       attachments:class_material_post_assets!class_material_post_assets_post_id_fkey(
         id,
         kind,
         order_index,
         media_asset:media_assets(id, bucket, path, mime_type, metadata)
       ),
       print_requests:class_material_print_requests!class_material_print_requests_post_id_fkey(
         id,
         status,
         copies,
         color_mode,
         desired_date,
         desired_period,
         notes,
         requested_by,
         created_at,
         updated_at,
         requester:profiles!class_material_print_requests_requested_by_fkey(id, name, email),
         request_items:class_material_print_request_items!class_material_print_request_items_request_id_fkey(
           id,
           asset_type,
           asset_filename,
           media_asset:media_assets!class_material_print_request_items_media_asset_id_fkey(id, bucket, path, mime_type, metadata)
         )
       )
      `
    )
    .eq('id', params.postId)
    .maybeSingle()

  if (error) {
    console.error('[class-materials] detail fetch error', error)
    throw new Error('자료 정보를 불러오지 못했습니다.')
  }

  if (!data || data.subject !== subject) {
    notFound()
  }

  const authorRelation = Array.isArray(data.author) ? data.author[0] : data.author

  const attachmentRows = Array.isArray(data.attachments) ? data.attachments : []
  const normalizedAttachments: PostAttachmentSummary[] = await Promise.all(
    attachmentRows.map(async (attachment) => {
      const mediaRelation = Array.isArray(attachment.media_asset)
        ? attachment.media_asset[0]
        : attachment.media_asset
      const metadata = (mediaRelation?.metadata as { originalName?: string } | null) ?? null
      const fallbackName = mediaRelation?.path ? mediaRelation.path.split('/').pop() ?? mediaRelation.path : '첨부 파일'
      const downloadUrl = await signUrl(mediaRelation?.bucket ?? CLASS_MATERIALS_BUCKET, mediaRelation?.path ?? null)

      return {
        id: String(attachment.id),
        kind: (attachment.kind ?? 'class_material') as ClassMaterialAssetType,
        name: metadata?.originalName ?? fallbackName,
        order: Number(attachment.order_index ?? 0),
        downloadUrl,
      }
    })
  )
  normalizedAttachments.sort((a, b) => a.order - b.order)

  const normalizedPrintRequests: PrintRequestRow[] = Array.isArray(data.print_requests)
    ? await Promise.all(
        data.print_requests.map(async (request) => {
          const requesterRelation = Array.isArray(request.requester) ? request.requester[0] : request.requester
          const rawItems = Array.isArray(request.request_items) ? request.request_items : []

          const items: PrintRequestItemRow[] = await Promise.all(
            rawItems.map(async (item) => {
              const mediaAsset = Array.isArray(item.media_asset) ? item.media_asset[0] : item.media_asset
              let downloadUrl: string | null = null

              if (mediaAsset?.bucket && mediaAsset.path) {
                try {
                  const { data: signed, error: signedError } = await supabase.storage
                    .from(mediaAsset.bucket)
                    .createSignedUrl(mediaAsset.path, 60 * 60)
                  if (signedError) {
                    console.error('[class-materials] failed to sign request item url', signedError)
                  } else {
                    downloadUrl = signed?.signedUrl ?? null
                  }
                } catch (error) {
                  console.error('[class-materials] unexpected error signing request item url', error)
                }
              }

              return {
                id: String(item.id),
                asset_type: (item.asset_type ?? 'class_material') as ClassMaterialAssetType,
                asset_filename: (item.asset_filename ?? null) as string | null,
                downloadUrl,
              }
            })
          )

          return {
            id: String(request.id),
            status: (request.status ?? 'requested') as 'requested' | 'done' | 'canceled',
            copies: Number(request.copies ?? 1),
            color_mode: (request.color_mode ?? 'bw') as 'bw' | 'color',
            desired_date: request.desired_date ?? null,
            desired_period: request.desired_period ?? null,
            notes: request.notes ?? null,
            requested_by: String(request.requested_by),
            created_at: String(request.created_at),
            updated_at: String(request.updated_at),
            requester: requesterRelation
              ? {
                  id: String(requesterRelation.id),
                  name: (requesterRelation.name ?? null) as string | null,
                  email: (requesterRelation.email ?? null) as string | null,
                }
              : null,
            items,
          }
        })
      )
    : []

  const post: ClassMaterialPostDetail = {
    id: String(data.id),
    subject: data.subject as ClassMaterialSubject,
    week_label: (data.week_label ?? null) as string | null,
    title: String(data.title),
    description: (data.description ?? null) as string | null,
    created_at: String(data.created_at),
    updated_at: String(data.updated_at),
    author: authorRelation
      ? {
          id: String(authorRelation.id),
          name: (authorRelation.name ?? null) as string | null,
          email: (authorRelation.email ?? null) as string | null,
        }
      : null,
    attachments: normalizedAttachments,
    print_requests: normalizedPrintRequests,
  }

  const attachmentsByKind: Record<ClassMaterialAssetType, PostAttachmentSummary[]> = {
    class_material: post.attachments.filter((attachment) => attachment.kind === 'class_material'),
    student_handout: post.attachments.filter((attachment) => attachment.kind === 'student_handout'),
  }

  const availableAssets = post.attachments.map((attachment) => ({
    id: attachment.id,
    kind: attachment.kind,
    name: attachment.name,
    downloadUrl: attachment.downloadUrl,
  }))

  const signUrl = async (bucket: string | null | undefined, path: string | null | undefined) => {
    if (!bucket || !path) {
      return null
    }
    try {
      const { data: signed, error: signedError } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60)
      if (signedError) {
        console.error('[class-materials] failed to sign asset url', { bucket, path, signedError })
        return null
      }
      return signed?.signedUrl ?? null
    } catch (error) {
      console.error('[class-materials] unexpected error signing asset url', { bucket, path, error })
      return null
    }
  }

  const title = getClassMaterialSubjectLabel(subject)

  const formatDateTime = (value: string) =>
    DateUtil.formatForDisplay(value, {
      locale: 'ko-KR',
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  const formatStatus = (status: string) => {
    switch (status) {
      case 'done':
        return '완료'
      case 'canceled':
        return '취소'
      default:
        return '대기'
    }
  }

  return (
    <section className="space-y-6">
      <DashboardBackLink
        fallbackHref={`/dashboard/teacher/class-materials/${subject}`}
        label={`${title} 목록으로 돌아가기`}
      />

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3 text-sm text-slate-500">
              {post.week_label ? <Badge variant="outline">{post.week_label}</Badge> : null}
              <span>마지막 수정 {formatDateTime(post.updated_at)}</span>
            </div>
            <h1 className="text-2xl font-semibold text-slate-900">{post.title}</h1>
            <p className="text-sm text-slate-500">
              작성자 {post.author?.name ?? post.author?.email ?? '미상'} · 작성일 {formatDateTime(post.created_at)}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild variant="outline">
              <Link href={`/dashboard/teacher/class-materials/${subject}/${post.id}/edit`}>자료 수정</Link>
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-800">수업 설명</h2>
            {post.description ? (
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">{post.description}</p>
            ) : (
              <p className="text-sm text-slate-400">등록된 설명이 없습니다.</p>
            )}
          </div>

          <div className="space-y-4">
            {(['class_material', 'student_handout'] as const).map((kind) => {
              const attachments = attachmentsByKind[kind]
              const sectionLabel = kind === 'class_material' ? '수업자료' : '학생 유인물'
              const sectionDescription =
                kind === 'class_material'
                  ? '교재, 강의안 등 수업 진행에 필요한 자료입니다.'
                  : '학생에게 배포할 활동지나 참고 자료입니다.'

              return (
                <Card key={kind} className="border-slate-200">
                  <CardHeader className="space-y-1">
                    <CardTitle className="text-base text-slate-900">{sectionLabel}</CardTitle>
                    <p className="text-xs text-slate-500">{sectionDescription}</p>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {attachments.length === 0 ? (
                      <p className="text-sm text-slate-400">첨부된 파일이 없습니다.</p>
                    ) : (
                      attachments.map((attachment, index) => (
                        <div
                          key={attachment.id}
                          className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                        >
                          <div className="flex flex-col">
                            <span>
                              {index + 1}. {attachment.name}
                            </span>
                          </div>
                          {attachment.downloadUrl ? (
                            <Button asChild variant="outline" size="sm">
                              <a href={attachment.downloadUrl} target="_blank" rel="noreferrer">
                                다운로드
                              </a>
                            </Button>
                          ) : (
                            <span className="text-xs text-rose-400">URL 생성 실패</span>
                          )}
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </div>

      <ClassMaterialPrintRequestForm
        postId={post.id}
        onSubmit={createClassMaterialPrintRequest}
        availableAssets={availableAssets}
      />

      <Card className="border-slate-200">
        <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg text-slate-900">인쇄 요청 현황</CardTitle>
            <p className="text-xs text-slate-500">등록된 인쇄 요청과 처리 상태를 확인할 수 있습니다.</p>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {post.print_requests.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-400">등록된 인쇄 요청이 없습니다.</div>
          ) : (
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead>요청일</TableHead>
                  <TableHead>희망일/교시</TableHead>
                  <TableHead>부수</TableHead>
                  <TableHead>컬러</TableHead>
                  <TableHead>요청자</TableHead>
                  <TableHead>메모</TableHead>
                  <TableHead>파일</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="w-28 text-right">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...post.print_requests]
                  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                  .map((request) => {
                    const desiredLabel = request.desired_date
                      ? DateUtil.formatForDisplay(request.desired_date, { month: 'short', day: 'numeric' })
                      : '미지정'

                    return (
                      <TableRow key={request.id}>
                        <TableCell className="text-sm text-slate-700">{formatDateTime(request.created_at)}</TableCell>
                        <TableCell className="text-sm text-slate-600">
                          <div className="flex flex-col">
                            <span>{desiredLabel}</span>
                            <span className="text-xs text-slate-500">{request.desired_period ?? '미지정'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">{request.copies}부</TableCell>
                        <TableCell className="text-sm text-slate-600">{request.color_mode === 'color' ? '컬러' : '흑백'}</TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {request.requester?.name ?? request.requester?.email ?? '미상'}
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {request.notes ? request.notes : <span className="text-slate-400">메모 없음</span>}
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {request.items.length === 0 ? (
                            <span className="text-xs text-slate-400">선택된 파일 없음</span>
                          ) : (
                            <div className="flex flex-col gap-2">
                              {request.items.map((item) => (
                                <div key={item.id} className="flex items-center justify-between gap-3">
                                  <span className="text-xs text-slate-500">{item.asset_type === 'class_material' ? '수업자료' : '학생 유인물'}</span>
                                  {item.downloadUrl ? (
                                    <Button asChild size="sm" variant="outline">
                                      <a href={item.downloadUrl} target="_blank" rel="noreferrer">
                                        {item.asset_filename ?? '다운로드'}
                                      </a>
                                    </Button>
                                  ) : (
                                    <span className="text-xs text-slate-400">다운로드 불가</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={request.status === 'done' ? 'secondary' : request.status === 'canceled' ? 'outline' : 'destructive'}>
                            {formatStatus(request.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {request.status === 'requested' ? (
                            <form action={cancelClassMaterialPrintRequest} className="inline-flex">
                              <input type="hidden" name="requestId" value={request.id} />
                              <Button type="submit" size="sm" variant="outline">
                                취소
                              </Button>
                            </form>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
