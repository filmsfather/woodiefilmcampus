'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '../../../ui/switch'
import { ApplicationConfig, ApplicationField, ApplicationFieldType } from '@/lib/notice-application'

interface ApplicationFormBuilderProps {
    config: ApplicationConfig | null
    onChange: (config: ApplicationConfig | null) => void
    disabled?: boolean
}

const FIELD_TYPES: Record<ApplicationFieldType, string> = {
    text: '단답형 텍스트',
    textarea: '장문형 텍스트',
    select: '선택형 (드롭다운)',
    checkbox: '체크박스 (동의 등)',
}

export function ApplicationFormBuilder({ config, onChange, disabled }: ApplicationFormBuilderProps) {
    const [isEnabled, setIsEnabled] = useState(!!config)

    const handleToggle = (checked: boolean) => {
        setIsEnabled(checked)
        if (checked && !config) {
            onChange({
                fields: [],
                deadline: null,
                maxApplicants: null,
            })
        } else if (!checked) {
            onChange(null)
        }
    }

    const handleAddField = () => {
        if (!config) return
        const newField: ApplicationField = {
            id: crypto.randomUUID(),
            label: '새 항목',
            type: 'text',
            required: true,
        }
        onChange({
            ...config,
            fields: [...config.fields, newField],
        })
    }

    const handleRemoveField = (id: string) => {
        if (!config) return
        onChange({
            ...config,
            fields: config.fields.filter((f) => f.id !== id),
        })
    }

    const handleUpdateField = (id: string, updates: Partial<ApplicationField>) => {
        if (!config) return
        onChange({
            ...config,
            fields: config.fields.map((f) => (f.id === id ? { ...f, ...updates } : f)),
        })
    }

    const handleOptionsChange = (id: string, value: string) => {
        const options = value.split(',').map((s) => s.trim()).filter(Boolean)
        handleUpdateField(id, { options })
    }

    return (
        <div className="space-y-4 rounded-lg border border-slate-200 p-4">
            <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                    <Label className="text-base">신청 폼 설정</Label>
                    <p className="text-xs text-slate-500">이 공지에 대해 신청을 받으려면 활성화하세요.</p>
                </div>
                <Switch checked={isEnabled} onCheckedChange={handleToggle} disabled={disabled} />
            </div>

            {isEnabled && config && (
                <div className="space-y-4 pt-4">
                    <div className="space-y-2">
                        <Label>신청 항목 구성</Label>
                        <div className="space-y-3">
                            {config.fields.map((field) => (
                                <Card key={field.id} className="bg-slate-50">
                                    <CardContent className="p-3 space-y-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="grid flex-1 gap-2 md:grid-cols-2">
                                                <Input
                                                    value={field.label}
                                                    onChange={(e) => handleUpdateField(field.id, { label: e.target.value })}
                                                    placeholder="항목 이름 (예: 연락처)"
                                                    className="h-8 text-sm"
                                                />
                                                <Select
                                                    value={field.type}
                                                    onValueChange={(value) => handleUpdateField(field.id, { type: value as ApplicationFieldType })}
                                                >
                                                    <SelectTrigger className="h-8 text-sm">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {Object.entries(FIELD_TYPES).map(([value, label]) => (
                                                            <SelectItem key={value} value={value}>
                                                                {label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-slate-400 hover:text-destructive"
                                                onClick={() => handleRemoveField(field.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>

                                        {field.type === 'select' && (
                                            <Input
                                                value={field.options?.join(', ') ?? ''}
                                                onChange={(e) => handleOptionsChange(field.id, e.target.value)}
                                                placeholder="옵션 입력 (쉼표로 구분, 예: S, M, L, XL)"
                                                className="h-8 text-sm"
                                            />
                                        )}

                                        <div className="flex items-center gap-4">
                                            <label className="flex items-center gap-2 text-xs text-slate-600">
                                                <Switch
                                                    checked={field.required}
                                                    onCheckedChange={(checked: boolean) => handleUpdateField(field.id, { required: checked })}
                                                    className="scale-75"
                                                />
                                                필수 항목
                                            </label>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={handleAddField} className="w-full border-dashed">
                            <Plus className="mr-2 h-3 w-3" /> 항목 추가
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
