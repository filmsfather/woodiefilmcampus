'use client'

import { useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { AlertCircle, Check } from 'lucide-react'
import { useRouter } from 'next/navigation'

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
import {
  WORKBOOK_SUBJECTS,
  WORKBOOK_TITLES,
  WORKBOOK_TYPE_DESCRIPTIONS,
  buildWorkbookMetadataPayload,
  parseTagsInput,
  workbookMetadataFormSchema,
  type WorkbookMetadataFormValues,
} from '@/lib/validation/workbook'
import { updateWorkbook } from '@/app/dashboard/workbooks/actions'
import { useGlobalAsyncTask } from '@/hooks/use-global-loading'

interface WorkbookMetadataFormProps {
  workbookId: string
  defaultValues: WorkbookMetadataFormValues
}

export default function WorkbookMetadataForm({ workbookId, defaultValues }: WorkbookMetadataFormProps) {
  const router = useRouter()
  const form = useForm<WorkbookMetadataFormValues>({
    resolver: zodResolver(workbookMetadataFormSchema),
    defaultValues,
    mode: 'onBlur',
  })
  const [submitState, setSubmitState] = useState<'idle' | 'success' | 'error'>('idle')
  const [serverError, setServerError] = useState<string | null>(null)
  const { runWithLoading, isLoading: isPending } = useGlobalAsyncTask()

  const tagsInput = form.watch('tagsInput')
  const selectedType = form.watch('type')
  const tagsPreview = useMemo(() => parseTagsInput(tagsInput), [tagsInput])

  const handleSubmit = (values: WorkbookMetadataFormValues) => {
    const payload = buildWorkbookMetadataPayload(values)

    setServerError(null)
    setSubmitState('idle')

    void runWithLoading(async () => {
      const result = await updateWorkbook({
        workbookId,
        title: payload.title,
        subject: payload.subject,
        weekLabel: payload.weekLabel,
        tags: payload.tags,
        description: payload.description,
        config: payload.config,
      })

      if (result?.error) {
        setServerError(result.error)
        setSubmitState('error')
        return
      }

      await router.refresh()
      setSubmitState('success')
    })
  }

  const renderTypeSpecificFields = () => {
    switch (selectedType) {
      case 'srs':
        return (
          <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-slate-900">SRS 옵션</h3>
              <p className="text-xs text-slate-500">복수 정답 허용 여부를 조정할 수 있습니다.</p>
            </div>
            <FormField
              control={form.control}
              name="srsSettings.allowMultipleCorrect"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4">
                  <div className="space-y-1">
                    <FormLabel className="text-sm font-medium">복수 정답 허용</FormLabel>
                    <FormDescription>여러 선택지를 동시에 정답으로 표시하려면 활성화하세요.</FormDescription>
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
                    <Textarea rows={3} placeholder="예: PDF 파일은 A4 용지 기준으로 작성해주세요." {...field} />
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
                    <Input placeholder="예: 800" inputMode="numeric" {...field} />
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

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <input type="hidden" {...form.register('type')} />
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
                    <Input placeholder="문제집 제목을 입력하세요." {...field} />
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

              <FormItem>
                <FormLabel>문제집 유형</FormLabel>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <p className="font-medium text-slate-900">{WORKBOOK_TITLES[selectedType]}</p>
                  <p className="text-xs text-slate-500">
                    {WORKBOOK_TYPE_DESCRIPTIONS[selectedType]}
                  </p>
                </div>
              </FormItem>

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

        {submitState === 'success' && (
          <div className="flex items-center gap-2 rounded-md border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">
            <Check className="size-4" /> 변경 사항을 저장했습니다.
          </div>
        )}

        {submitState === 'error' && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="size-4" /> {serverError ?? '저장 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'}
          </div>
        )}

        <div className="flex justify-end">
          <Button type="submit" className="gap-2" disabled={isPending}>
            {isPending ? '저장 중…' : '변경 사항 저장'}
          </Button>
        </div>
      </form>
    </Form>
  )
}
