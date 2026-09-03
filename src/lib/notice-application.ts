import { z } from 'zod'

export type ApplicationFieldType = 'text' | 'textarea' | 'select' | 'multiselect' | 'checkbox'

/** 선택지 목록(options)이 필요한 항목 형식인지. */
export function fieldHasOptions(type: ApplicationFieldType): boolean {
    return type === 'select' || type === 'multiselect'
}

export interface ApplicationField {
    id: string
    label: string
    type: ApplicationFieldType
    required: boolean
    options?: string[] // For select / multiselect type
    placeholder?: string
    /** 같은 값을 가진 체크박스끼리 묶어, 그중 하나만 체크해도 필수를 만족합니다. 비우면 기존처럼 항목마다 개별 동의가 필요합니다. */
    checkboxGroupId?: string | null
}

export interface ApplicationConfig {
    fields: ApplicationField[]
    deadline?: string | null
    maxApplicants?: number | null
}

export interface ApplicationFormData {
    [fieldId: string]: string | boolean | string[]
}

export const ApplicationFieldSchema = z.object({
    id: z.string(),
    label: z.string().min(1, '라벨을 입력해주세요.'),
    type: z.enum(['text', 'textarea', 'select', 'multiselect', 'checkbox']),
    required: z.boolean(),
    options: z.array(z.string()).optional(),
    placeholder: z.string().optional(),
    checkboxGroupId: z.string().nullable().optional(),
})

export const ApplicationConfigSchema = z.object({
    fields: z.array(ApplicationFieldSchema),
    deadline: z.string().nullable().optional(),
    maxApplicants: z.number().nullable().optional(),
})

/** 신청 응답값을 화면에 보여줄 문자열로 바꿉니다. */
export function formatApplicationValue(
    type: ApplicationFieldType,
    value: string | boolean | string[] | undefined | null,
): string {
    if (type === 'checkbox') {
        return value === true ? '예' : '아니오'
    }
    if (Array.isArray(value)) {
        return value.length > 0 ? value.join(', ') : '-'
    }
    if (value === undefined || value === null || value === '') {
        return '-'
    }
    return String(value)
}

function normalizedCheckboxGroupId(field: ApplicationField): string | null {
    if (field.type !== "checkbox") return null
    const raw = field.checkboxGroupId?.trim()
    return raw && raw.length > 0 ? raw : null
}

export function validateApplicationForm(config: ApplicationConfig, data: ApplicationFormData): { success: boolean; error?: string } {
    const checkboxGroupedFieldIds = new Set<string>()
    for (const field of config.fields) {
        if (normalizedCheckboxGroupId(field)) {
            checkboxGroupedFieldIds.add(field.id)
        }
    }

    for (const field of config.fields) {
        const value = data[field.id]
        const skipIndividualCheckboxRequired =
            field.type === "checkbox" && checkboxGroupedFieldIds.has(field.id)

        if (field.required && !skipIndividualCheckboxRequired) {
            if (value === undefined || value === null || value === '') {
                return { success: false, error: `${field.label} 항목은 필수입니다.` }
            }
            if (Array.isArray(value) && value.length === 0) {
                return { success: false, error: `${field.label} 항목은 필수입니다.` }
            }
            if (field.type === 'checkbox' && value !== true) {
                return { success: false, error: `${field.label} 항목에 동의해야 합니다.` }
            }
        }

        if (field.type === 'multiselect' && value !== undefined && value !== null) {
            if (!Array.isArray(value)) {
                return { success: false, error: `${field.label} 항목의 응답 형식이 올바르지 않습니다.` }
            }
            const allowed = new Set(field.options ?? [])
            if (value.some((option) => !allowed.has(option))) {
                return { success: false, error: `${field.label} 항목에 선택할 수 없는 값이 있습니다.` }
            }
        }
    }

    const groupToFields = new Map<string, ApplicationField[]>()
    for (const field of config.fields) {
        const gid = normalizedCheckboxGroupId(field)
        if (!gid) continue
        const list = groupToFields.get(gid) ?? []
        list.push(field)
        groupToFields.set(gid, list)
    }

    for (const [, fields] of groupToFields) {
        const needsAnyChecked = fields.some((f) => f.required)
        if (!needsAnyChecked) continue
        const anyChecked = fields.some((f) => data[f.id] === true)
        if (!anyChecked) {
            const labels = fields.map((f) => f.label).join(", ")
            return { success: false, error: `${labels} 중 하나를 선택해야 합니다.` }
        }
    }

    return { success: true }
}
