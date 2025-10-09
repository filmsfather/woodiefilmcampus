'use client'

import { useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  useFieldArray,
  useForm,
  useWatch,
  type Control,
  type FieldErrorsImpl,
  type FieldPath,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { updateWorkbookItems } from '@/app/dashboard/workbooks/actions'
import { useGlobalTransition } from '@/hooks/use-global-loading'

const answerTypeSchema = z.enum(['multiple_choice', 'short_answer'])

const choiceSchema = z.object({
  content: z.string().min(1, { message: '보기 내용을 입력해주세요.' }),
  isCorrect: z.boolean(),
})

const shortFieldSchema = z.object({
  label: z.string().optional(),
  answer: z.string().min(1, { message: '단답 정답을 입력해주세요.' }),
})

const itemSchema = z.object({
  id: z.string().uuid(),
  prompt: z.string().min(1, { message: '문항 내용을 입력해주세요.' }),
  explanation: z.string().optional(),
  answerType: answerTypeSchema.optional(),
  choices: z.array(choiceSchema).optional(),
  shortFields: z.array(shortFieldSchema).optional(),
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
  answerType?: 'multiple_choice' | 'short_answer'
  shortFields?: Array<{
    label?: string | null
    answer: string
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
  const [isPending, startTransition] = useGlobalTransition()

  const schema = useMemo(() => {
    if (workbookType !== 'srs') {
      return baseFormSchema
    }

    return baseFormSchema.superRefine((values, ctx) => {
      values.items.forEach((item, index) => {
        const answerType = item.answerType ?? 'multiple_choice'

        if (answerType === 'multiple_choice') {
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
        } else {
          const shortFields = item.shortFields ?? []

          if (shortFields.length === 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: '단답 필드를 최소 1개 이상 추가해주세요.',
              path: ['items', index, 'shortFields'],
            })
          }

          shortFields.forEach((field, fieldIndex) => {
            if (!field.answer || field.answer.trim().length === 0) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: '단답 정답을 입력해주세요.',
                path: ['items', index, 'shortFields', fieldIndex, 'answer'],
              })
            }
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
        .map((item) => {
          if (workbookType !== 'srs') {
            return {
              id: item.id,
              prompt: item.prompt,
              explanation: item.explanation ?? '',
            }
          }

          const answerType = (item.answerType ?? 'multiple_choice') as 'multiple_choice' | 'short_answer'

          return {
            id: item.id,
            prompt: item.prompt,
            explanation: item.explanation ?? '',
            answerType,
            choices: answerType === 'multiple_choice' ? item.choices ?? [] : undefined,
            shortFields:
              answerType === 'short_answer'
                ? (item.shortFields && item.shortFields.length > 0
                    ? item.shortFields.map((field) => ({
                        label: field.label ?? '',
                        answer: field.answer,
                      }))
                    : [{ label: '', answer: '' }])
                : undefined,
          }
        }),
    },
    mode: 'onBlur',
  })

  const { control, handleSubmit, setValue, formState, unregister } = form
  const { fields } = useFieldArray({ control, name: 'items' })
  const watchedItems = form.watch('items')

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
            answerType: workbookType === 'srs' ? (item.answerType ?? 'multiple_choice') : undefined,
            choices:
              workbookType === 'srs' && (item.answerType ?? 'multiple_choice') === 'multiple_choice'
                ? item.choices ?? []
                : undefined,
            shortFields:
              workbookType === 'srs' && (item.answerType ?? 'multiple_choice') === 'short_answer'
                ? item.shortFields ?? []
                : undefined,
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
            {fields.map((field, index) => {
              const answerType =
                (watchedItems?.[index]?.answerType as 'multiple_choice' | 'short_answer' | undefined) ?? 'multiple_choice'
              const itemErrors = formState.errors.items?.[index] as FieldErrorsImpl<FormValues['items'][number]> | undefined
              const choicesPath = `items.${index}.choices` as FieldPath<FormValues>
              const shortFieldsPath = `items.${index}.shortFields` as FieldPath<FormValues>

              return (
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
                      <div className="space-y-4">
                        <FormField
                          control={control}
                          name={`items.${index}.answerType`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>답안 유형</FormLabel>
                              <Select
                                value={(field.value as 'multiple_choice' | 'short_answer' | undefined) ?? answerType}
                                onValueChange={(value) => {
                                  const nextValue = value as 'multiple_choice' | 'short_answer'
                                  field.onChange(nextValue)

                                  if (nextValue === 'multiple_choice') {
                                    const currentChoices = watchedItems?.[index]?.choices
                                    if (!currentChoices || currentChoices.length === 0) {
                                      setValue(
                                        choicesPath,
                                        [
                                          { content: '', isCorrect: false },
                                          { content: '', isCorrect: false },
                                          { content: '', isCorrect: false },
                                          { content: '', isCorrect: false },
                                        ] as FormValues['items'][number]['choices']
                                      )
                                    }

                                    setValue(shortFieldsPath, undefined)
                                    unregister(shortFieldsPath)
                                  } else {
                                    const currentShortFields = watchedItems?.[index]?.shortFields
                                    if (!currentShortFields || currentShortFields.length === 0) {
                                      setValue(
                                        shortFieldsPath,
                                        [{ label: '', answer: '' }] as FormValues['items'][number]['shortFields']
                                      )
                                    }

                                    setValue(choicesPath, undefined)
                                    unregister(choicesPath)
                                  }
                                }}
                              >
                                <FormControl>
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder="답안 유형 선택" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="multiple_choice">다지선다</SelectItem>
                                  <SelectItem value="short_answer">단답형</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {answerType === 'multiple_choice' ? (
                          <SrsChoicesEditor
                            control={control}
                            setValue={setValue}
                            itemIndex={index}
                            allowMultipleCorrect={allowMultipleCorrect}
                            isPending={isPending}
                            error={itemErrors?.choices as { message?: string } | undefined}
                          />
                        ) : (
                          <SrsShortFieldsEditor
                            control={control}
                            itemIndex={index}
                            isPending={isPending}
                            error={itemErrors?.shortFields as { message?: string } | undefined}
                          />
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
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

interface SrsShortFieldsEditorProps {
  control: Control<FormValues>
  itemIndex: number
  isPending: boolean
  error?: { message?: string }
}

function SrsShortFieldsEditor({ control, itemIndex, isPending, error }: SrsShortFieldsEditorProps) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `items.${itemIndex}.shortFields` as const,
  })

  const shortFields = useWatch({
    control,
    name: `items.${itemIndex}.shortFields` as const,
  })

  const handleAddField = () => {
    append({ label: '', answer: '' })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-900">단답 필드</h4>
        <Button type="button" variant="outline" size="sm" onClick={handleAddField} className="gap-2" disabled={isPending}>
          <Plus className="size-4" /> 단답 추가
        </Button>
      </div>

      <div className="space-y-3">
        {fields.map((field, fieldIndex) => (
          <div key={field.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-start">
              <FormField
                control={control}
                name={`items.${itemIndex}.shortFields.${fieldIndex}.label`}
                render={({ field }) => (
                  <FormItem className="md:w-1/3">
                    <FormLabel>라벨 (선택)</FormLabel>
                    <FormControl>
                      <Input placeholder="예: 1번 공란" {...field} disabled={isPending} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={control}
                name={`items.${itemIndex}.shortFields.${fieldIndex}.answer`}
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>정답</FormLabel>
                    <FormControl>
                      <Input placeholder="정답을 입력하세요." {...field} disabled={isPending} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive"
                onClick={() => remove(fieldIndex)}
                disabled={isPending || (shortFields?.length ?? 0) <= 1}
                aria-label={`단답 ${fieldIndex + 1} 삭제`}
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
