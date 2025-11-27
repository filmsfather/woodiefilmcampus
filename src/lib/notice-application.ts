import { z } from 'zod'

export type ApplicationFieldType = 'text' | 'textarea' | 'select' | 'checkbox'

export interface ApplicationField {
    id: string
    label: string
    type: ApplicationFieldType
    required: boolean
    options?: string[] // For select type
    placeholder?: string
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
    type: z.enum(['text', 'textarea', 'select', 'checkbox']),
    required: z.boolean(),
    options: z.array(z.string()).optional(),
    placeholder: z.string().optional(),
})

export const ApplicationConfigSchema = z.object({
    fields: z.array(ApplicationFieldSchema),
    deadline: z.string().nullable().optional(),
    maxApplicants: z.number().nullable().optional(),
})

export function validateApplicationForm(config: ApplicationConfig, data: ApplicationFormData): { success: boolean; error?: string } {
    for (const field of config.fields) {
        const value = data[field.id]

        if (field.required) {
            if (value === undefined || value === null || value === '') {
                return { success: false, error: `${field.label} 항목은 필수입니다.` }
            }
            if (Array.isArray(value) && value.length === 0) {
                return { success: false, error: `${field.label} 항목은 필수입니다.` }
            }
            if (field.type === 'checkbox' && value !== true) {
                // Checkbox required usually means "must check this box" (e.g. consent)
                // If it's just a boolean field that can be true or false, required might mean "must make a choice" but for checkbox it's usually "must be true" if required.
                // Let's assume required checkbox means "must be checked".
                return { success: false, error: `${field.label} 항목에 동의해야 합니다.` }
            }
        }
    }
    return { success: true }
}
