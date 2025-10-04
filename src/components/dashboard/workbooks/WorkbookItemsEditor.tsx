'use client'

import { useMemo, useState, useTransition } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  useFieldArray,
  useForm,
  useWatch,
  type Control,
  type FieldErrorsImpl,
  type UseFormSetValue,
} from 'react-hook-form'
import { z } from 'zod'
import { AlertCircle, Check, Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { updateWorkbookItems } from '@/app/dashboard/workbooks/actions'

const choiceSchema = z.object({
  content: z.string().min(1, { message: '보기 내용을 입력해주세요.' }),
  isCorrect: z.boolean(),
})

const itemSchema = z.object({
  id: z.string().uuid(),
  prompt: z.string().min(1, { message: '문항 내용을 입력해주세요.' }),
  explanation: z.string().optional(),
  choices: z.array(choiceSchema).optional(),
})

const baseFormSchema = z.object({
  items: z.array(itemSchema).min(1, { message: '수정할 문항이 없습니다.' }),
})

type FormValues = z.infer<typeof baseFormSchema>

export interface WorkbookItemsEditorItem {
  id: string
  position: number
  prompt: string
  explanation?: string | null
  choices?: Array<{
    content: string
    isCorrect: boolean
  }>
}

interface WorkbookItemsEditorProps {
  workbookId: string
  workbookType: 'srs' | 'pdf' | 'writing' | 'film' | 'lecture'
  allowMultipleCorrect: boolean
  items: WorkbookItemsEditorItem[]
}

export default function WorkbookItemsEditor({
  workbookId,
  workbookType,
  allowMultipleCorrect,
  items,
}: WorkbookItemsEditorProps) {
  const [submitState, setSubmitState] = useState<'idle' | 'success' | 'error'>('idle')
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const schema = useMemo(() => {
    if (workbookType !== 'srs') {
      return baseFormSchema
    }

    return baseFormSchema.superRefine((values, ctx) => {
      values.items.forEach((item, index) => {
        const choices = item.choices ?? []

        if (choices.length < 2) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'SRS 문항은 최소 2개의 보기가 필요합니다.',
            path: ['items', index, 'choices'],
          })
        }

        const correctCount = choices.filter((choice) => choice.isCorrect).length
        if (correctCount === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: '정답을 최소 1개 이상 선택해주세요.',
            path: ['items', index, 'choices'],
          })
        }

        if (!allowMultipleCorrect && correctCount > 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: '단일 정답 모드에서는 하나의 정답만 설정할 수 있습니다.',
            path: ['items', index, 'choices'],
          })
        }
      })
    })
  }, [allowMultipleCorrect, workbookType])

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      items: [...items]
        .sort((a, b) => a.position - b.position)
        .map((item) => ({
          id: item.id,
          prompt: item.prompt,
          explanation: item.explanation ?? '',
          choices: item.choices ?? (workbookType === 'srs' ? [] : undefined),
        })),
    },
    mode: 'onBlur',
  })

  const { control, handleSubmit, setValue, formState } = form
  const { fields } = useFieldArray({ control, name: 'items' })

  const onSubmit = (values: FormValues) => {
    setSubmitState('idle')
    setServerError(null)

    startTransition(async () => {
      const result = await updateWorkbookItems({
        workbookId,
        items: values.items.map((item) => ({
          id: item.id,
          prompt: item.prompt,
          explanation: item.explanation ?? '',
          choices: workbookType === 'srs' ? (item.choices ?? []) : undefined,
        })),
      })

      if (result?.error) {
        setServerError(result.error)
        setSubmitState('error')
        return
      }

      setSubmitState('success')
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>문항 내용</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {fields.map((field, index) => (
              <Card key={field.id} className="border-slate-200">
                <CardHeader>
                  <CardTitle className="text-base font-semibold">문항 {index + 1}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={control}
                    name={`items.${index}.prompt`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>문항 내용</FormLabel>
                        <FormControl>
                          <Textarea rows={4} placeholder="문항 내용을 입력하세요." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={control}
                    name={`items.${index}.explanation`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>해설 / 참고 (선택)</FormLabel>
                        <FormControl>
                          <Textarea rows={3} placeholder="정답 해설 또는 참고 사항을 입력하세요." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {workbookType === 'srs' && (
                    <SrsChoicesEditor
                      control={control}
                      setValue={setValue}
                      itemIndex={index}
                      allowMultipleCorrect={allowMultipleCorrect}
                      isPending={isPending}
                      error={
                        (formState.errors.items?.[index] as FieldErrorsImpl<FormValues['items'][number]> | undefined)?.choices as
                          | { message?: string }
                          | undefined
                      }
                    />
                  )}
                </CardContent>
              </Card>
            ))}
          </CardContent>
        </Card>

        {submitState === 'success' && (
          <div className="flex items-center gap-2 rounded-md border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">
            <Check className="size-4" /> 문항을 저장했습니다.
          </div>
        )}

        {submitState === 'error' && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="size-4" /> {serverError ?? '문항 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'}
          </div>
        )}

        <div className="flex justify-end">
          <Button type="submit" className="gap-2" disabled={isPending}>
            {isPending ? '저장 중…' : '문항 저장'}
          </Button>
        </div>
      </form>
    </Form>
  )
}

interface SrsChoicesEditorProps {
  control: Control<FormValues>
  setValue: UseFormSetValue<FormValues>
  itemIndex: number
  allowMultipleCorrect: boolean
  isPending: boolean
  error?: { message?: string }
}

function SrsChoicesEditor({ control, setValue, itemIndex, allowMultipleCorrect, isPending, error }: SrsChoicesEditorProps) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `items.${itemIndex}.choices` as const,
  })

  const choices = (useWatch({
    control,
    name: `items.${itemIndex}.choices` as const,
  }) ?? []) as Array<{ isCorrect: boolean } | undefined>

  const handleAddChoice = () => {
    append({ content: '', isCorrect: false })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <FormLabel className="text-sm font-semibold text-slate-900">보기</FormLabel>
        <Button type="button" variant="outline" size="sm" onClick={handleAddChoice} disabled={isPending} className="gap-2">
          <Plus className="size-4" /> 보기 추가
        </Button>
      </div>

      <div className="space-y-3">
        {fields.map((choice, choiceIndex) => (
          <div key={choice.id ?? choiceIndex} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <FormField
                control={control}
                name={`items.${itemIndex}.choices.${choiceIndex}.content` as const}
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>보기 {choiceIndex + 1}</FormLabel>
                    <FormControl>
                      <Input placeholder="보기 내용을 입력하세요." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={control}
                name={`items.${itemIndex}.choices.${choiceIndex}.isCorrect` as const}
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center gap-2 sm:w-48">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onChange={(event) => {
                          const checked = event.target.checked

                          if (!allowMultipleCorrect && checked) {
                            choices.forEach((choiceValue, idx) => {
                              if (idx !== choiceIndex && choiceValue?.isCorrect) {
                                setValue(`items.${itemIndex}.choices.${idx}.isCorrect`, false, {
                                  shouldDirty: true,
                                  shouldValidate: true,
                                })
                              }
                            })
                          }

                          field.onChange(checked)
                        }}
                      />
                    </FormControl>
                    <span className="text-sm text-slate-600">정답</span>
                  </FormItem>
                )}
              />

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive"
                onClick={() => remove(choiceIndex)}
                disabled={isPending || fields.length <= 2}
                aria-label={`보기 ${choiceIndex + 1} 삭제`}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {error?.message && <p className="text-sm text-destructive">{error.message}</p>}
    </div>
  )
}
