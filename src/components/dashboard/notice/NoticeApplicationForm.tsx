'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { ApplicationConfig, ApplicationFormData, validateApplicationForm } from '@/lib/notice-application'
import { applyNotice, cancelApplication } from '@/app/dashboard/teacher/notices/actions'

interface NoticeApplicationFormProps {
    noticeId: string
    config: ApplicationConfig
    initialData?: {
        id: string
        status: string
        formData: ApplicationFormData
    } | null
    isDeadlinePassed?: boolean
}

export function NoticeApplicationForm({ noticeId, config, initialData, isDeadlinePassed }: NoticeApplicationFormProps) {
    const router = useRouter()
    const [formData, setFormData] = useState<ApplicationFormData>(initialData?.formData ?? {})
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    const isApplied = !!initialData
    const isCanceled = initialData?.status === 'canceled'

    const handleChange = (id: string, value: string | boolean | string[]) => {
        setFormData((prev) => ({ ...prev, [id]: value }))
        setError(null)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)

        const validation = validateApplicationForm(config, formData)
        if (!validation.success) {
            setError(validation.error ?? '입력 내용을 확인해주세요.')
            return
        }

        startTransition(async () => {
            const result = await applyNotice(noticeId, formData)
            if (result.error) {
                setError(result.error)
            } else {
                router.refresh()
            }
        })
    }

    const handleCancel = async () => {
        if (!confirm('신청을 취소하시겠습니까?')) return

        startTransition(async () => {
            const result = await cancelApplication(noticeId)
            if (result.error) {
                setError(result.error)
            } else {
                router.refresh()
            }
        })
    }

    if (isApplied && !isCanceled) {
        return (
            <Card className="border-primary/20 bg-primary/5">
                <CardHeader>
                    <CardTitle className="text-lg text-primary">신청 완료</CardTitle>
                    <CardDescription>
                        신청이 접수되었습니다. 내용을 수정하려면 취소 후 다시 신청해주세요.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-4 rounded-md border border-primary/10 bg-white p-4">
                        {config.fields.map((field) => (
                            <div key={field.id} className="space-y-1">
                                <p className="text-xs font-medium text-slate-500">{field.label}</p>
                                <p className="text-sm text-slate-900">
                                    {field.type === 'checkbox'
                                        ? formData[field.id] ? '예' : '아니오'
                                        : String(formData[field.id] ?? '-')}
                                </p>
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-end">
                        <Button
                            variant="outline"
                            onClick={handleCancel}
                            disabled={isPending || isDeadlinePassed}
                            className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200"
                        >
                            {isPending ? <LoadingSpinner className="mr-2 h-4 w-4" /> : null}
                            신청 취소
                        </Button>
                    </div>
                </CardContent>
            </Card>
        )
    }

    const hasGroupedCheckboxChoice = config.fields.some((f) => {
        const gid = f.type === "checkbox" ? f.checkboxGroupId?.trim() : ""
        if (!gid) return false
        return config.fields.filter(
            (x) => x.type === "checkbox" && (x.checkboxGroupId?.trim() ?? "") === gid,
        ).length > 1
    })

    return (
        <Card className="border-slate-200">
            <CardHeader>
                <CardTitle className="text-lg text-slate-900">신청하기</CardTitle>
                <CardDescription className="space-y-2">
                    <span className="block">이 공지는 신청이 필요합니다. 아래 내용을 작성하여 제출해주세요.</span>
                    {hasGroupedCheckboxChoice ? (
                        <span className="block text-slate-600">
                            같은 그룹으로 묶인 일정은 그중 하나만 선택해도 됩니다.
                        </span>
                    ) : null}
                </CardDescription>
            </CardHeader>
            <CardContent>
                {error && (
                    <Alert variant="destructive" className="mb-4">
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-4">
                        {config.fields.map((field) => (
                            <div key={field.id} className="space-y-2">
                                {field.type !== "checkbox" ? (
                                    <Label className={field.required ? "after:content-['*'] after:ml-0.5 after:text-rose-500" : ""}>
                                        {field.label}
                                    </Label>
                                ) : null}

                                {field.type === 'text' && (
                                    <Input
                                        value={(formData[field.id] as string) ?? ''}
                                        onChange={(e) => handleChange(field.id, e.target.value)}
                                        placeholder={field.placeholder}
                                        required={field.required}
                                        disabled={isPending}
                                    />
                                )}

                                {field.type === 'textarea' && (
                                    <Textarea
                                        value={(formData[field.id] as string) ?? ''}
                                        onChange={(e) => handleChange(field.id, e.target.value)}
                                        placeholder={field.placeholder}
                                        required={field.required}
                                        disabled={isPending}
                                    />
                                )}

                                {field.type === 'select' && (
                                    <Select
                                        value={(formData[field.id] as string) ?? ''}
                                        onValueChange={(value) => handleChange(field.id, value)}
                                        disabled={isPending}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="선택해주세요" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {field.options?.map((option) => (
                                                <SelectItem key={option} value={option}>
                                                    {option}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}

                                {field.type === 'checkbox' && (
                                    <div className="flex items-start gap-2">
                                        <Checkbox
                                            id={field.id}
                                            className="mt-1 shrink-0"
                                            checked={(formData[field.id] as boolean) ?? false}
                                            onChange={(e) => handleChange(field.id, e.target.checked)}
                                            disabled={isPending}
                                        />
                                        <label
                                            htmlFor={field.id}
                                            className="text-sm font-medium leading-relaxed text-slate-900 peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                        >
                                            <span
                                                className={
                                                    field.required
                                                        ? "after:ml-0.5 after:text-rose-500 after:content-['*']"
                                                        : ""
                                                }
                                            >
                                                {field.label}
                                            </span>
                                            <span className="font-normal text-slate-600">에 동의합니다</span>
                                        </label>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="flex justify-end">
                        <Button type="submit" disabled={isPending || isDeadlinePassed}>
                            {isPending ? (
                                <span className="flex items-center gap-2">
                                    <LoadingSpinner className="h-4 w-4" /> 제출 중...
                                </span>
                            ) : (
                                '신청하기'
                            )}
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    )
}
