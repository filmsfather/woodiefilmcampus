import { notFound } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchNoticeApplications, fetchNoticeDetail } from '@/lib/notice-board'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

export default async function NoticeApplicationsPage({ params }: { params: Promise<{ noticeId: string }> }) {
    const { profile } = await requireAuthForDashboard(['manager', 'principal', 'teacher'])

    if (!profile) {
        return null
    }

    const { noticeId } = await params
    const supabase = await createServerSupabase()
    const notice = await fetchNoticeDetail(supabase, noticeId, profile.id)

    if (!notice) {
        notFound()
    }

    const canManage = profile.role === 'manager' || profile.role === 'principal' || profile.role === 'teacher'
    if (!canManage) {
        return <div className="p-8 text-center text-slate-600">접근 권한이 없습니다.</div>
    }

    const applications = await fetchNoticeApplications(supabase, noticeId)
    const config = notice.applicationConfig

    return (
        <section className="space-y-6">
            <DashboardBackLink fallbackHref={`/dashboard/teacher/notices/${notice.id}`} label="공지 상세로 돌아가기" />
            <div className="space-y-1">
                <h1 className="text-2xl font-semibold text-slate-900">{notice.title} - 신청 현황</h1>
                <p className="text-sm text-slate-600">총 {applications.length}명이 신청했습니다.</p>
            </div>

            <Card className="border-slate-200">
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[100px]">신청자</TableHead>
                                    <TableHead className="w-[180px]">신청일시</TableHead>
                                    {config?.fields.map((field) => (
                                        <TableHead key={field.id} className="min-w-[120px]">
                                            {field.label}
                                        </TableHead>
                                    ))}
                                    <TableHead className="w-[100px]">상태</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {applications.map((app) => (
                                    <TableRow key={app.id}>
                                        <TableCell className="font-medium">
                                            {app.applicant.name}
                                            <span className="ml-1 text-xs text-slate-500">({app.applicant.role === 'student' ? '학생' : '선생님'})</span>
                                        </TableCell>
                                        <TableCell className="text-slate-600">
                                            {new Date(app.createdAt).toLocaleString('ko-KR', {
                                                dateStyle: 'medium',
                                                timeStyle: 'short',
                                            })}
                                        </TableCell>
                                        {config?.fields.map((field) => (
                                            <TableCell key={field.id}>
                                                {field.type === 'checkbox'
                                                    ? app.formData[field.id]
                                                        ? '예'
                                                        : '아니오'
                                                    : String(app.formData[field.id] ?? '-')}
                                            </TableCell>
                                        ))}
                                        <TableCell>
                                            <Badge variant={app.status === 'canceled' ? 'destructive' : 'default'}>
                                                {app.status === 'applied' ? '신청완료' : app.status}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {applications.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={2 + (config?.fields.length ?? 0) + 1} className="h-24 text-center text-slate-500">
                                            신청 내역이 없습니다.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </section>
    )
}
