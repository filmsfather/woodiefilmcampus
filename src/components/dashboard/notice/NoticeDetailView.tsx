/* eslint-disable @next/next/no-img-element */
import Link from 'next/link'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { NoticeAcknowledgeButton } from '@/components/dashboard/teacher/notices/NoticeAcknowledgeButton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { NoticeDetail, fetchNoticeApplication } from '@/lib/notice-board'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { NoticeApplicationForm } from './NoticeApplicationForm'

function formatKoreanDate(dateIso: string) {
    if (!dateIso) {
        return ''
    }
    return new Intl.DateTimeFormat('ko', {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(dateIso))
}

const ROLE_LABEL: Record<'principal' | 'manager' | 'teacher' | 'student', string> = {
    principal: '원장',
    manager: '실장',
    teacher: '선생님',
    student: '학생',
}

interface NoticeDetailViewProps {
    notice: NoticeDetail
    viewerId: string
    viewerRole: string
    backLink: string
    backLabel: string
}

export async function NoticeDetailView({ notice, viewerId, viewerRole, backLink, backLabel }: NoticeDetailViewProps) {
    const supabase = createServerSupabase()
    let applicationData = null

    if (notice.isApplicationRequired && notice.applicationConfig) {
        applicationData = await fetchNoticeApplication(supabase, notice.id, viewerId)
    }

    const canManageNotice = viewerRole === 'principal' || notice.author.id === viewerId
    const viewerRecipient = notice.recipients.find((recipient) => recipient.isViewer)
    const canAcknowledge = Boolean(viewerRecipient && !viewerRecipient.acknowledgedAt && !notice.viewerIsAuthor)
    const shouldRenderAcknowledgement = Boolean(viewerRecipient)
    const acknowledgementLabel = notice.viewerIsAuthor
        ? '작성한 공지'
        : viewerRecipient?.acknowledgedAt
            ? '확인 완료'
            : '확인 대기'
    const acknowledgementVariant = notice.viewerIsAuthor
        ? 'secondary'
        : viewerRecipient?.acknowledgedAt
            ? 'default'
            : 'outline'

    return (
        <section className="space-y-6">
            <div className="space-y-3">
                <DashboardBackLink fallbackHref={backLink} label={backLabel} />
                <div className="space-y-1">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <h1 className="text-2xl font-semibold text-slate-900">{notice.title}</h1>
                        <div className="flex items-center gap-2">
                            <Badge variant={acknowledgementVariant}>{acknowledgementLabel}</Badge>
                            {canManageNotice ? (
                                <>
                                    <Button asChild variant="outline" size="sm">
                                        <Link href={`/dashboard/teacher/notices/${notice.id}/edit`}>공지 수정</Link>
                                    </Button>
                                    {notice.isApplicationRequired && (
                                        <Button asChild variant="default" size="sm">
                                            <Link href={`/dashboard/teacher/notices/${notice.id}/applications`}>신청 현황</Link>
                                        </Button>
                                    )}
                                </>
                            ) : null}
                        </div>
                    </div>
                    <p className="text-sm text-slate-600">
                        작성자 {notice.author.name} ({ROLE_LABEL[notice.author.role]}) · 등록일 {formatKoreanDate(notice.createdAt)} · 확인 현황
                        {` ${notice.acknowledgedCount}/${notice.totalRecipients}`}
                    </p>
                </div>
            </div>

            <Card className="border-slate-200">
                <CardHeader>
                    <CardTitle className="text-xl text-slate-900">공지 내용</CardTitle>
                    <CardDescription className="text-sm text-slate-600">
                        공유 대상에게 전달되는 본문과 첨부 파일입니다.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <article
                        className="prose prose-slate max-w-none text-sm leading-6 text-slate-800"
                        dangerouslySetInnerHTML={{ __html: notice.bodyHtml }}
                    />

                    {notice.attachments.length > 0 ? (
                        <div className="space-y-3">
                            <h2 className="text-sm font-medium text-slate-800">첨부 이미지</h2>
                            <div className="grid gap-4 md:grid-cols-2">
                                {notice.attachments.map((attachment) => (
                                    <figure key={attachment.id} className="space-y-2">
                                        {attachment.signedUrl ? (
                                            <img
                                                src={attachment.signedUrl}
                                                alt={attachment.originalName ?? '공지 첨부 이미지'}
                                                className="w-full rounded-md border border-slate-200 object-cover"
                                            />
                                        ) : (
                                            <div className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                                                첨부 이미지를 불러오지 못했습니다.
                                            </div>
                                        )}
                                        {attachment.originalName ? (
                                            <figcaption className="text-xs text-slate-500">{attachment.originalName}</figcaption>
                                        ) : null}
                                    </figure>
                                ))}
                            </div>
                        </div>
                    ) : null}

                    {shouldRenderAcknowledgement ? (
                        <NoticeAcknowledgeButton
                            noticeId={notice.id}
                            initialAcknowledgedAt={viewerRecipient?.acknowledgedAt ?? null}
                            disabled={!canAcknowledge}
                        />
                    ) : null}
                </CardContent>
            </Card>

            {notice.isApplicationRequired && notice.applicationConfig && (
                <NoticeApplicationForm
                    noticeId={notice.id}
                    config={notice.applicationConfig}
                    initialData={applicationData}
                />
            )}

            {(viewerRole === 'manager' || viewerRole === 'principal' || viewerRole === 'teacher') && (
                <Card className="border-slate-200">
                    <CardHeader>
                        <CardTitle className="text-xl text-slate-900">공유 대상 확인 현황</CardTitle>
                        <CardDescription className="text-sm text-slate-600">
                            공유 대상으로 지정된 사용자들의 확인 여부입니다.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[320px] table-fixed text-left text-sm">
                                <thead>
                                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                                        <th className="py-2">이름</th>
                                        <th className="py-2">역할</th>
                                        <th className="py-2">확인 상태</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {notice.recipients.map((recipient) => (
                                        <tr key={recipient.id} className="border-b border-slate-100 last:border-b-0">
                                            <td className="py-2 text-slate-800">{recipient.name}</td>
                                            <td className="py-2 text-slate-600">{ROLE_LABEL[recipient.role]}</td>
                                            <td className="py-2">
                                                {recipient.acknowledgedAt ? (
                                                    <Badge variant="default">{formatKoreanDate(recipient.acknowledgedAt)}</Badge>
                                                ) : (
                                                    <Badge variant="outline">미확인</Badge>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}
        </section>
    )
}
