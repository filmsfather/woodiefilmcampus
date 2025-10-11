'use client'

import { useEffect, useMemo, useState, useTransition, type ChangeEvent } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  type Control,
  type FieldErrorsImpl,
  type UseFormSetValue,
  useFieldArray,
  useForm,
  useWatch,
  type Resolver,
  type FieldPath,
} from 'react-hook-form'
import { AlertCircle, Check, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { createWorkbook } from '@/app/dashboard/workbooks/actions'
import {
  WORKBOOK_SUBJECTS,
  WORKBOOK_TITLES,
  WORKBOOK_TYPES,
  WORKBOOK_TYPE_DESCRIPTIONS,
  buildNormalizedWorkbookPayload,
  parseTagsInput,
  workbookFormSchema,
  type WorkbookFormValues,
  type WorkbookItemFormValues,
  type WorkbookChoiceFormValues,
  type SrsAnswerType,
  type NormalizedWorkbookAssetPayload,
} from '@/lib/validation/workbook'
import { createClient as createBrowserSupabase } from '@/lib/supabase/client'

const steps = [
  { id: 'basic', title: '기본 정보' },
  { id: 'items', title: '문항 구성' },
  { id: 'review', title: '검토 및 저장' },
] as const

const STORAGE_BUCKET = 'workbook-assets'
const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB

type UploadedAsset = {
  id: string
  bucket: string
  path: string
  mimeType: string
  size: number
  name: string
  previewUrl?: string
  order: number
}

const formatFileSize = (size: number) => {
  if (!size) {
    return '0B'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  let value = size
  let index = 0

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }

  const formatted = value >= 10 || units[index] === 'B' ? value.toFixed(0) : value.toFixed(1)
  return `${formatted} ${units[index]}`
}

const stepFieldMap: Record<(typeof steps)[number]['id'], string[]> = {
  basic: [
    'title',
    'subject',
    'type',
    'weekLabel',
    'tagsInput',
    'description',
    'srsSettings.allowMultipleCorrect',
    'pdfSettings.instructions',
    'writingSettings.instructions',
    'writingSettings.maxCharacters',
    'filmSettings.noteCount',
    'filmSettings.country',
    'filmSettings.director',
    'filmSettings.genre',
    'filmSettings.subgenre',
    'lectureSettings.youtubeUrl',
    'lectureSettings.instructions',
  ],
  items: ['items'],
  review: [],
}

const createEmptyChoice = () => ({
  content: '',
  isCorrect: false,
})

const createEmptyShortField = () => ({
  label: '',
  answer: '',
})

const createEmptyItem = (withChoices: boolean) => ({
  prompt: '',
  explanation: '',
  ...(withChoices
    ? {
        answerType: 'multiple_choice' as SrsAnswerType,
        choices: [createEmptyChoice(), createEmptyChoice(), createEmptyChoice(), createEmptyChoice()],
        shortFields: [],
      }
    : {}),
})

const defaultValues: WorkbookFormValues = {
  title: '',
  subject: WORKBOOK_SUBJECTS[0],
  type: WORKBOOK_TYPES[0],
  weekLabel: '',
  tagsInput: '',
  description: '',
  srsSettings: {
    allowMultipleCorrect: true,
  },
  pdfSettings: {
    instructions: '',
  },
  writingSettings: {
    instructions: '',
    maxCharacters: '',
  },
  filmSettings: {
    noteCount: 1,
    country: '',
    director: '',
    genre: '',
    subgenre: '',
  },
  lectureSettings: {
    youtubeUrl: '',
    instructions: '',
  },
  items: [createEmptyItem(true)],
}

export default function WorkbookWizard({ teacherId }: { teacherId: string }) {
  const form = useForm<WorkbookFormValues>({
    resolver: zodResolver(workbookFormSchema) as Resolver<WorkbookFormValues>,
    defaultValues,
    mode: 'onBlur',
  })
  const [stepIndex, setStepIndex] = useState(0)
  const [submitState, setSubmitState] = useState<'idle' | 'success' | 'error'>('idle')
  const [isSubmitting, startTransition] = useTransition()
  const supabase = useMemo(() => createBrowserSupabase(), [])
  const [assetState, setAssetState] = useState<Record<string, UploadedAsset[]>>({})
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [successWorkbookId, setSuccessWorkbookId] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  const { control, watch, setValue, unregister, formState } = form
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  })

  useEffect(() => {
    setAssetState((prev) => {
      const next = { ...prev }
      fields.forEach((field) => {
        if (!next[field.id]) {
          next[field.id] = []
        }
      })
      return next
    })
  }, [fields])

  const watchedValues = watch()
  const selectedType = watch('type')
  const allowMultipleCorrect = watch('srsSettings.allowMultipleCorrect')

  useEffect(() => {
    const itemsValues = watchedValues.items ?? []

    if (selectedType === 'srs') {
      itemsValues.forEach((item, index) => {
        const answerType = (item?.answerType as SrsAnswerType | undefined) ?? 'multiple_choice'

        if (!item?.answerType) {
          setValue(
            `items.${index}.answerType` as FieldPath<WorkbookFormValues>,
            answerType as unknown as WorkbookFormValues['items'][number]['answerType'],
            { shouldDirty: false }
          )
        }

        if (answerType === 'multiple_choice') {
          if (!item?.choices || item.choices.length === 0) {
            setValue(
              `items.${index}.choices` as FieldPath<WorkbookFormValues>,
              [createEmptyChoice(), createEmptyChoice(), createEmptyChoice(), createEmptyChoice()] as unknown as WorkbookFormValues['items'][number]['choices'],
              { shouldDirty: false }
            )
          }

          if (item?.shortFields && item.shortFields.length > 0) {
            const path = `items.${index}.shortFields` as FieldPath<WorkbookFormValues>
            setValue(
              path,
              undefined as unknown as WorkbookFormValues['items'][number]['shortFields'],
              { shouldDirty: false, shouldValidate: false }
            )
            unregister(path)
          }
        } else {
          if (!item?.shortFields || item.shortFields.length === 0) {
            setValue(
              `items.${index}.shortFields` as FieldPath<WorkbookFormValues>,
              [createEmptyShortField()] as unknown as WorkbookFormValues['items'][number]['shortFields'],
              { shouldDirty: false }
            )
          }

          if (item?.choices && item.choices.length > 0) {
            const path = `items.${index}.choices` as FieldPath<WorkbookFormValues>
            setValue(
              path,
              undefined as unknown as WorkbookFormValues['items'][number]['choices'],
              { shouldDirty: false, shouldValidate: false }
            )
            unregister(path)
          }
        }
      })
      return
    }

    itemsValues.forEach((item, index) => {
      if (item?.answerType) {
        const path = `items.${index}.answerType` as FieldPath<WorkbookFormValues>
        setValue(
          path,
          undefined as unknown as WorkbookFormValues['items'][number]['answerType'],
          { shouldDirty: false, shouldValidate: false }
        )
        unregister(path)
      }

      if (item?.choices && item.choices.length > 0) {
        const path = `items.${index}.choices` as FieldPath<WorkbookFormValues>
        setValue(
          path,
          undefined as unknown as WorkbookFormValues['items'][number]['choices'],
          { shouldDirty: false, shouldValidate: false }
        )
        unregister(path)
      }

      if (item?.shortFields && item.shortFields.length > 0) {
        const path = `items.${index}.shortFields` as FieldPath<WorkbookFormValues>
        setValue(
          path,
          undefined as unknown as WorkbookFormValues['items'][number]['shortFields'],
          { shouldDirty: false, shouldValidate: false }
        )
        unregister(path)
      }
    })
  }, [selectedType, watchedValues.items, setValue, unregister])

  const currentStep = steps[stepIndex]

  const attachmentsForPreview = useMemo<NormalizedWorkbookAssetPayload[]>(
    () =>
      fields.flatMap((field, index) =>
        (assetState[field.id] ?? []).map((asset, order) => ({
          bucket: asset.bucket,
          path: asset.path,
          mimeType: asset.mimeType,
          size: asset.size,
          name: asset.name,
          itemPosition: index + 1,
          order,
        }))
      ),
    [assetState, fields]
  )

  const normalizedPreview = useMemo(
    () => buildNormalizedWorkbookPayload(watchedValues, { assets: attachmentsForPreview }),
    [watchedValues, attachmentsForPreview]
  )

  const tagsPreview = useMemo(
    () => parseTagsInput(watchedValues.tagsInput),
    [watchedValues.tagsInput]
  )

  const revokeAssetPreview = (asset: UploadedAsset) => {
    if (asset.previewUrl) {
      URL.revokeObjectURL(asset.previewUrl)
    }
  }

  const removeAssetsFromStorage = async (assets: UploadedAsset[]) => {
    if (!assets.length) {
      return
    }

    try {
      const grouped = new Map<string, string[]>()
      assets.forEach(({ bucket, path }) => {
        if (!bucket || !path) {
          return
        }
        const list = grouped.get(bucket) ?? []
        list.push(path)
        grouped.set(bucket, list)
      })

      for (const [bucket, paths] of grouped.entries()) {
        if (!paths.length) {
          continue
        }
        await supabase.storage.from(bucket).remove(paths)
      }
    } catch (error) {
      console.error('[workbook] remove storage error', error)
    }
  }

  const handleFileInputChange = async (fieldId: string, event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files?.length) {
      return
    }

    setUploadError(null)
    setIsUploading(true)

    const ownerSegment = teacherId ? teacherId : 'anonymous'

    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE) {
        setUploadError('파일 크기는 최대 20MB까지 업로드할 수 있습니다.')
        continue
      }

      const ext = file.name.includes('.') ? file.name.split('.').pop() ?? '' : ''
      const safeBase = `${Date.now()}-${crypto.randomUUID()}`
      const safeName = ext ? `${safeBase}.${ext.toLowerCase()}` : safeBase
      const tempPath = `pending/${ownerSegment}/${safeName}`

      const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(tempPath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type,
      })

      if (error) {
        console.error('[workbook] upload error', error)
        setUploadError('파일 업로드 중 오류가 발생했습니다.')
        continue
      }

      const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
      const newAsset: UploadedAsset = {
        id: crypto.randomUUID(),
        bucket: STORAGE_BUCKET,
        path: tempPath,
        mimeType: file.type,
        size: file.size,
        name: file.name,
        previewUrl,
        order: (assetState[fieldId]?.length ?? 0),
      }

      setAssetState((prev) => {
        const next = { ...prev }
        const list = [...(next[fieldId] ?? [])]
        list.push(newAsset)
        next[fieldId] = list
        return next
      })
    }

    setIsUploading(false)
    event.target.value = ''
  }

  const handleRemoveAsset = async (fieldId: string, assetId: string) => {
    const target = (assetState[fieldId] ?? []).find((asset) => asset.id === assetId)
    if (!target) {
      return
    }

    await removeAssetsFromStorage([target])
    revokeAssetPreview(target)

    setAssetState((prev) => {
      const next = { ...prev }
      const list = (next[fieldId] ?? []).filter((asset) => asset.id !== assetId)
      next[fieldId] = list.map((asset, index) => ({ ...asset, order: index }))
      return next
    })
  }

  const handleRemoveItem = async (index: number) => {
    const field = fields[index]
    if (!field) {
      return
    }

    const assetsForItem = assetState[field.id] ?? []
    if (assetsForItem.length > 0) {
      await removeAssetsFromStorage(assetsForItem)
      assetsForItem.forEach(revokeAssetPreview)
    }

    setAssetState((prev) => {
      const next = { ...prev }
      delete next[field.id]
      return next
    })

    remove(index)
  }

  const handleNext = async () => {
    const currentFields = stepFieldMap[currentStep.id]
    const isValid = await form.trigger(currentFields as FieldPath<WorkbookFormValues>[], { shouldFocus: true })

    if (!isValid) {
      return
    }

    setServerError(null)
    setSuccessWorkbookId(null)
    setSubmitState('idle')
    setStepIndex((index) => Math.min(index + 1, steps.length - 1))
  }

  const handlePrevious = () => {
    setServerError(null)
    setSuccessWorkbookId(null)
    setSubmitState('idle')
    setStepIndex((index) => Math.max(index - 1, 0))
  }

  const handleAddItem = () => {
    append(createEmptyItem(selectedType === 'srs'))
  }

  const handleSubmit = (values: WorkbookFormValues) => {
    const attachmentPayload = attachmentsForPreview
    const payload = buildNormalizedWorkbookPayload(values, { assets: attachmentPayload })

    setServerError(null)
    setSuccessWorkbookId(null)

    startTransition(async () => {
      setSubmitState('idle')
      const result = await createWorkbook(payload)

      if (result?.error) {
        Object.values(assetState).forEach((assets) => assets.forEach(revokeAssetPreview))
        setAssetState({})
        setSubmitState('error')
        setServerError(result.error)
        return
      }

      setSuccessWorkbookId(result?.workbookId ?? null)
      setSubmitState('success')
      setStepIndex(0)
      Object.values(assetState).forEach((assets) => assets.forEach(revokeAssetPreview))
      setUploadError(null)
      setServerError(null)
      form.reset(defaultValues)
      setAssetState({})
    })
  }

  const renderTypeSpecificFields = () => {
    switch (selectedType) {
      case 'srs':
        return (
          <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-slate-900">SRS 옵션</h3>
              <p className="text-xs text-slate-500">
                간격 반복 로직에 따라 정답 streak을 관리합니다. 복수 정답 허용 여부를 설정하세요.
              </p>
            </div>
            <FormField
              control={form.control}
              name="srsSettings.allowMultipleCorrect"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4">
                  <div className="space-y-1">
                    <FormLabel className="text-sm font-medium">복수 정답 허용</FormLabel>
                    <FormDescription>
                      복수 정답을 허용하면 학생이 여러 선택지를 동시에 정답으로 제출할 수 있습니다.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onChange={(event) => field.onChange(event.target.checked)}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        )
      case 'pdf':
        return (
          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-900">PDF 제출 안내</h3>
            <FormField
              control={form.control}
              name="pdfSettings.instructions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>제출 안내</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="예: PDF 파일은 A4 용지 기준으로 작성해주세요."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )
      case 'writing':
        return (
          <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-900">서술형 옵션</h3>
            <FormField
              control={form.control}
              name="writingSettings.instructions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>작성 안내</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="예: 최소 5문장 이상 작성해주세요." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="writingSettings.maxCharacters"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>제한 글자 수 (선택)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="예: 800"
                      inputMode="numeric"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>비워두면 제한 없이 제출 가능합니다.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )
      case 'film':
        return (
          <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-900">감상 노트 조건</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="filmSettings.noteCount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>필수 감상 노트 수</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={5}
                        value={field.value}
                        onChange={(event) => field.onChange(Number(event.target.value))}
                      />
                    </FormControl>
                    <FormDescription>최소 1개, 최대 5개까지 지정할 수 있습니다.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="filmSettings.country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>국가 필터 (선택)</FormLabel>
                    <FormControl>
                      <Input placeholder="예: 한국" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="filmSettings.director"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>감독 필터 (선택)</FormLabel>
                    <FormControl>
                      <Input placeholder="예: 봉준호" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="filmSettings.genre"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>장르 필터 (선택)</FormLabel>
                    <FormControl>
                      <Input placeholder="예: 드라마" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="filmSettings.subgenre"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>하위 장르 (선택)</FormLabel>
                    <FormControl>
                      <Input placeholder="예: 청춘" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
        )
      case 'lecture':
        return (
          <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-900">강의 시청형 옵션</h3>
            <FormField
              control={form.control}
              name="lectureSettings.youtubeUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>유튜브 링크 (선택)</FormLabel>
                  <FormControl>
                    <Input placeholder="https://" {...field} />
                  </FormControl>
                  <FormDescription>공유 링크를 등록하면 학생이 바로 접속할 수 있습니다.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="lectureSettings.instructions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>요약 작성 안내</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="예: 핵심 내용을 3문장 이상으로 요약하세요." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )
      default:
        return null
    }
  }

  const renderTypeReview = () => {
    switch (normalizedPreview.type) {
      case 'srs':
        return (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <p>
              정답 방식: {normalizedPreview.config.srs?.allowMultipleCorrect ? '복수 정답 허용' : '단일 정답'}
            </p>
          </div>
        )
      case 'pdf':
        return normalizedPreview.config.pdf?.instructions ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <p className="font-medium text-slate-900">제출 안내</p>
            <p className="whitespace-pre-line text-sm text-slate-700">
              {normalizedPreview.config.pdf.instructions}
            </p>
          </div>
        ) : null
      case 'writing':
        return (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            {normalizedPreview.config.writing?.instructions && (
              <p className="mb-2">
                작성 안내: {normalizedPreview.config.writing.instructions}
              </p>
            )}
            {normalizedPreview.config.writing?.maxCharacters && (
              <p>제한 글자 수: {normalizedPreview.config.writing.maxCharacters.toLocaleString()}자</p>
            )}
          </div>
        )
      case 'film':
        return (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <p>필수 감상 노트 수: {normalizedPreview.config.film?.noteCount ?? '-'}개</p>
            <ul className="mt-2 space-y-1">
              {Object.entries(normalizedPreview.config.film?.filters ?? {})
                .filter(([, value]) => value)
                .map(([key, value]) => (
                  <li key={key} className="text-sm text-slate-600">
                    {key}: {value}
                  </li>
                ))}
            </ul>
          </div>
        )
      case 'lecture':
        return (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            {normalizedPreview.config.lecture?.youtubeUrl && (
              <p className="mb-1">강의 링크: {normalizedPreview.config.lecture.youtubeUrl}</p>
            )}
            {normalizedPreview.config.lecture?.instructions && (
              <p className="whitespace-pre-line text-sm text-slate-700">
                {normalizedPreview.config.lecture.instructions}
              </p>
            )}
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        {steps.map((step, index) => {
          const isActive = index === stepIndex
          const isCompleted = index < stepIndex

          return (
            <div key={step.id} className="flex items-center gap-2">
              <div
                className={`flex size-8 items-center justify-center rounded-full border text-sm ${
                  isActive
                    ? 'border-primary text-primary'
                    : isCompleted
                      ? 'border-green-600 bg-green-50 text-green-700'
                      : 'border-slate-200 text-slate-500'
                }`}
              >
                {isCompleted ? <Check className="size-4" /> : index + 1}
              </div>
              <span className={`text-sm font-medium ${isActive ? 'text-slate-900' : 'text-slate-500'}`}>
                {step.title}
              </span>
              {index < steps.length - 1 && <span className="text-slate-300">/</span>}
            </div>
          )
        })}
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          {currentStep.id === 'basic' && (
            <Card>
              <CardHeader>
                <CardTitle>문제집 기본 정보</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>제목</FormLabel>
                      <FormControl>
                        <Input placeholder="예: 3주차 스토리보드 실습" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 md:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="subject"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>과목</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="과목 선택" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {WORKBOOK_SUBJECTS.map((subject) => (
                              <SelectItem key={subject} value={subject}>
                                {subject}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>문제집 유형</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="유형 선택" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {WORKBOOK_TYPES.map((type) => (
                              <SelectItem key={type} value={type}>
                                {WORKBOOK_TITLES[type]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          {WORKBOOK_TYPE_DESCRIPTIONS[field.value as keyof typeof WORKBOOK_TYPE_DESCRIPTIONS]}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="weekLabel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>주차 / 공통 라벨</FormLabel>
                        <FormControl>
                          <Input placeholder="예: 3주차 또는 공통" {...field} />
                        </FormControl>
                        <FormDescription>주차 또는 공통 과제 여부를 표현합니다.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="tagsInput"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>태그</FormLabel>
                      <FormControl>
                        <Input placeholder="쉼표(,)로 구분하여 입력" {...field} />
                      </FormControl>
                      {tagsPreview.length > 0 && (
                        <FormDescription>
                          입력된 태그: {tagsPreview.map((tag) => `#${tag}`).join(' ')}
                        </FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>설명 (선택)</FormLabel>
                      <FormControl>
                        <Textarea placeholder="문제집에 대한 간단한 안내를 입력하세요." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {renderTypeSpecificFields()}
              </CardContent>
            </Card>
          )}

          {currentStep.id === 'items' && (
            <Card>
              <CardHeader className="flex flex-col space-y-2">
                <CardTitle>문항 구성</CardTitle>
                <p className="text-sm text-slate-600">
                  각 문항에 대한 문제 내용과 해설(선택)을 입력하세요. 유형별 상세 필드는 차후 단계에서 확장됩니다.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {fields.map((field, index) => {
                  const answerType: SrsAnswerType =
                    ((watchedValues.items ?? [])[index]?.answerType as SrsAnswerType | undefined) ?? 'multiple_choice'
                  const choicesPath = `items.${index}.choices` as FieldPath<WorkbookFormValues>
                  const shortFieldsPath = `items.${index}.shortFields` as FieldPath<WorkbookFormValues>

                  return (
                    <Card key={field.id} className="border-slate-200">
                      <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-base font-semibold">문항 {index + 1}</CardTitle>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleRemoveItem(index)}
                          disabled={fields.length === 1 || isSubmitting || isUploading}
                        >
                          <Trash2 className="mr-1 size-4" /> 삭제
                        </Button>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <FormField
                          control={form.control}
                          name={`items.${index}.prompt`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>문항 내용</FormLabel>
                              <FormControl>
                                <Textarea
                                  rows={5}
                                  placeholder="문항에 대한 질문 또는 설명을 입력하세요."
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`items.${index}.explanation`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>해설 / 참고 (선택)</FormLabel>
                              <FormControl>
                                <Textarea rows={3} placeholder="정답 해설 또는 참고사항" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {selectedType === 'srs' && (
                          <div className="space-y-4">
                            <FormField
                              control={form.control}
                              name={`items.${index}.answerType`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>답안 유형</FormLabel>
                                  <Select
                                    value={(field.value as SrsAnswerType | undefined) ?? answerType}
                                    onValueChange={(value) => {
                                      const nextValue = value as SrsAnswerType
                                      field.onChange(nextValue)

                                      if (nextValue === 'multiple_choice') {
                                        const currentChoices = (watchedValues.items ?? [])[index]?.choices
                                        if (!currentChoices || currentChoices.length === 0) {
                                          setValue(
                                            choicesPath,
                                            [
                                              createEmptyChoice(),
                                              createEmptyChoice(),
                                              createEmptyChoice(),
                                              createEmptyChoice(),
                                            ] as unknown as WorkbookFormValues['items'][number]['choices'],
                                            { shouldDirty: true, shouldValidate: true }
                                          )
                                        }

                                        setValue(shortFieldsPath, undefined)
                                        unregister(shortFieldsPath)
                                      } else {
                                        const currentShortFields = (watchedValues.items ?? [])[index]?.shortFields
                                        if (!currentShortFields || currentShortFields.length === 0) {
                                          setValue(
                                            shortFieldsPath,
                                            [createEmptyShortField()] as unknown as WorkbookFormValues['items'][number]['shortFields'],
                                            { shouldDirty: true, shouldValidate: true }
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
                                  <FormDescription>문항별로 답안 유형을 설정하세요.</FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {answerType === 'multiple_choice' ? (
                              <SrsChoicesEditor
                                control={control}
                                itemIndex={index}
                                allowMultipleCorrect={allowMultipleCorrect}
                                setValue={setValue}
                                errors={formState.errors}
                              />
                            ) : (
                              <SrsShortFieldsEditor
                                control={control}
                                itemIndex={index}
                                errors={formState.errors}
                              />
                            )}
                          </div>
                        )}

                        <div className="space-y-2">
                          <FormLabel>첨부 파일</FormLabel>
                          <Input
                            type="file"
                            multiple
                            accept="image/*,application/pdf"
                            disabled={isSubmitting || isUploading}
                            onChange={(event) => handleFileInputChange(field.id, event)}
                          />
                          <p className="text-xs text-slate-500">이미지 또는 PDF 파일을 최대 20MB까지 업로드할 수 있습니다.</p>
                          {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
                          {(assetState[field.id]?.length ?? 0) > 0 && (
                            <div className="flex flex-wrap gap-3">
                              {assetState[field.id]?.map((asset) => (
                                <div
                                  key={asset.id}
                                  className="flex w-40 flex-col gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600"
                                >
                                  {asset.previewUrl ? (
                                    <Image
                                      src={asset.previewUrl}
                                      alt={asset.name}
                                      width={160}
                                      height={120}
                                      className="h-24 w-full rounded object-cover"
                                      unoptimized
                                    />
                                  ) : (
                                    <span className="truncate">{asset.name}</span>
                                  )}
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="truncate">
                                      {asset.name}
                                      <br />
                                      {formatFileSize(asset.size)}
                                    </span>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleRemoveAsset(field.id, asset.id)}
                                      disabled={isSubmitting || isUploading}
                                      aria-label={`${asset.name} 삭제`}
                                    >
                                      <Trash2 className="size-4 text-destructive" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddItem}
                  className="gap-2"
                  disabled={isSubmitting || isUploading}
                >
                  <Plus className="size-4" /> 문항 추가
                </Button>
              </CardContent>
            </Card>
          )}

          {currentStep.id === 'review' && (
            <Card>
              <CardHeader>
                <CardTitle>검토</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <p className="text-xs uppercase text-slate-500">제목</p>
                    <p className="text-base font-semibold text-slate-900">{normalizedPreview.title}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs uppercase text-slate-500">과목</p>
                    <p className="text-base text-slate-900">{normalizedPreview.subject}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs uppercase text-slate-500">유형</p>
                    <p className="text-base text-slate-900">{WORKBOOK_TITLES[normalizedPreview.type]}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs uppercase text-slate-500">주차/라벨</p>
                    <p className="text-base text-slate-900">
                      {normalizedPreview.weekLabel ? normalizedPreview.weekLabel : '미입력'}
                    </p>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-xs uppercase text-slate-500">태그</p>
                  <p className="text-sm text-slate-700">
                    {normalizedPreview.tags.length > 0
                      ? normalizedPreview.tags.map((tag) => `#${tag}`).join(' ')
                      : '태그 없음'}
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="text-xs uppercase text-slate-500">설명</p>
                  <p className="whitespace-pre-line text-sm text-slate-700">
                    {normalizedPreview.description && normalizedPreview.description.length > 0
                      ? normalizedPreview.description
                      : '설명 없음'}
                  </p>
                </div>

                {renderTypeReview()}

                <div className="space-y-3">
                  <p className="text-xs uppercase text-slate-500">
                    문항 ({normalizedPreview.items.length}개)
                  </p>
                  <div className="space-y-3">
                    {normalizedPreview.items.map((item, index) => (
                      <div key={index} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <p className="text-sm font-medium text-slate-900">문항 {index + 1}</p>
                        <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{item.prompt}</p>
                        {item.explanation && (
                          <p className="mt-2 whitespace-pre-line text-xs text-slate-500">
                            해설: {item.explanation}
                          </p>
                        )}
                        {normalizedPreview.type === 'srs' && item.answerType === 'multiple_choice' && item.choices && item.choices.length > 0 && (
                          <ul className="mt-3 space-y-1">
                            {item.choices.map((choice, choiceIndex) => (
                              <li
                                key={choiceIndex}
                                className={`flex items-center gap-2 text-sm ${
                                  choice.isCorrect ? 'text-green-700' : 'text-slate-600'
                                }`}
                              >
                                {choice.isCorrect ? (
                                  <Check className="size-4 text-green-600" />
                                ) : (
                                  <span className="inline-block size-2 rounded-full bg-slate-300" />
                                )}
                                <span>{choice.content}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {normalizedPreview.type === 'srs' && item.answerType === 'short_answer' && item.shortFields && item.shortFields.length > 0 && (
                          <div className="mt-3 space-y-1">
                            <p className="text-xs font-medium text-slate-500">단답 필드</p>
                            <ul className="space-y-1 text-sm text-slate-700">
                              {item.shortFields.map((field, fieldIndex) => (
                                <li key={fieldIndex} className="flex flex-col gap-0.5 rounded border border-slate-200 bg-white px-3 py-2">
                                  {field.label && <span className="text-xs font-medium text-slate-500">{field.label}</span>}
                                  <span>{field.answer}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {item.assets && item.assets.length > 0 && (
                          <div className="mt-3 space-y-1 text-xs text-slate-600">
                            <p className="font-medium text-slate-500">첨부 파일</p>
                            <ul className="space-y-1">
                              {item.assets.map((asset, assetIndex) => (
                                <li key={assetIndex} className="flex items-center justify-between gap-2">
                                  <span>{asset.name}</span>
                                  <span className="text-slate-400">{formatFileSize(asset.size)}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {submitState === 'success' && (
            <div className="space-y-2 rounded-md border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">
              <div className="flex items-center gap-2">
                <Check className="size-4" /> 문제집을 정상적으로 저장했습니다.
              </div>
              {successWorkbookId && (
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline" className="bg-white text-green-700 hover:bg-white">
                    <Link href={`/dashboard/workbooks/${successWorkbookId}`}>상세 보기</Link>
                  </Button>
                  <Button asChild size="sm" className="bg-green-600 text-white hover:bg-green-600/90">
                    <Link href={`/dashboard/assignments/new?workbookId=${successWorkbookId}`}>
                      바로 출제하기
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          )}

          {submitState === 'error' && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="size-4" /> {serverError ?? '저장 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'}
            </div>
          )}

          <div className="flex justify-between">
            <Button type="button" variant="outline" onClick={handlePrevious} disabled={stepIndex === 0}>
              <ChevronLeft className="mr-2 size-4" /> 이전 단계
            </Button>

            {currentStep.id !== 'review' ? (
              <Button type="button" onClick={handleNext} disabled={isSubmitting || isUploading}>
                다음 단계 <ChevronRight className="ml-2 size-4" />
              </Button>
            ) : (
              <Button type="submit" className="gap-2" disabled={isSubmitting || isUploading}>
                {isSubmitting ? '저장 중…' : '문제집 저장'}
              </Button>
            )}
          </div>
        </form>
      </Form>
    </div>
  )
}

interface SrsChoicesEditorProps {
  control: Control<WorkbookFormValues>
  itemIndex: number
  allowMultipleCorrect: boolean
  setValue: UseFormSetValue<WorkbookFormValues>
  errors: FieldErrorsImpl<WorkbookFormValues>
}

interface SrsShortFieldsEditorProps {
  control: Control<WorkbookFormValues>
  itemIndex: number
  errors: FieldErrorsImpl<WorkbookFormValues>
}

function SrsShortFieldsEditor({ control, itemIndex, errors }: SrsShortFieldsEditorProps) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `items.${itemIndex}.shortFields` as const,
  })

  const shortFields = useWatch({
    control,
    name: `items.${itemIndex}.shortFields` as const,
  })

  const itemErrors = (errors.items?.[itemIndex] as FieldErrorsImpl<WorkbookItemFormValues> | undefined) ?? {}
  const shortFieldsErrorMessage = (itemErrors?.shortFields as { message?: string } | undefined)?.message

  const handleAddField = () => {
    append(createEmptyShortField())
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-900">단답 필드</h4>
        <Button type="button" variant="outline" size="sm" onClick={handleAddField} className="gap-2">
          <Plus className="size-4" /> 단답 추가
        </Button>
      </div>

      <div className="space-y-3">
        {fields.map((field, fieldIndex) => (
          <div key={field.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <FormField
                control={control}
                name={`items.${itemIndex}.shortFields.${fieldIndex}.label`}
                render={({ field }) => (
                  <FormItem className="sm:w-1/3">
                    <FormLabel>라벨 (선택)</FormLabel>
                    <FormControl>
                      <Input placeholder="예: 1번 공란" {...field} />
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
                      <Input placeholder="정확하게 일치해야 하는 답안을 입력하세요." {...field} />
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
                disabled={(shortFields?.length ?? 0) <= 1}
                aria-label={`단답 ${fieldIndex + 1} 삭제`}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {shortFieldsErrorMessage && <p className="text-sm text-destructive">{shortFieldsErrorMessage}</p>}
    </div>
  )
}

function SrsChoicesEditor({
  control,
  itemIndex,
  allowMultipleCorrect,
  setValue,
  errors,
}: SrsChoicesEditorProps) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `items.${itemIndex}.choices` as const,
  })

  const choices = useWatch({
    control,
    name: `items.${itemIndex}.choices` as const,
  })

  const itemErrors = (errors.items?.[itemIndex] as FieldErrorsImpl<WorkbookItemFormValues> | undefined) ?? {}
  const choicesErrorMessage = (itemErrors?.choices as { message?: string } | undefined)?.message

  const handleAddChoice = () => {
    append(createEmptyChoice())
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-900">보기</h4>
        <Button type="button" variant="outline" size="sm" onClick={handleAddChoice} className="gap-2">
          <Plus className="size-4" /> 보기 추가
        </Button>
      </div>

      <div className="space-y-3">
        {fields.map((choice, choiceIndex) => (
          <div key={choice.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <FormField
                control={control}
                name={`items.${itemIndex}.choices.${choiceIndex}.content`}
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
                name={`items.${itemIndex}.choices.${choiceIndex}.isCorrect`}
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center gap-2 sm:w-40">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onChange={(event) => {
                          const checked = event.target.checked

                          if (!allowMultipleCorrect && checked) {
                            (choices ?? []).forEach((_: WorkbookChoiceFormValues, idx: number) => {
                              if (idx !== choiceIndex && choices?.[idx]?.isCorrect) {
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
                disabled={(choices?.length ?? 0) <= 2}
                aria-label={`보기 ${choiceIndex + 1} 삭제`}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {choicesErrorMessage && (
        <p className="text-sm text-destructive">{choicesErrorMessage}</p>
      )}
    </div>
  )
}
