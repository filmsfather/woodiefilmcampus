"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Book, Film, Music, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import {
  CULTURE_PICK_CATEGORIES,
  CULTURE_PICK_CATEGORY_LABELS,
  type CulturePickCategory,
  type CulturePickInput,
  getRecentPeriodLabels,
} from "@/lib/validation/culture-pick"
import { createCulturePick, updateCulturePick } from "@/app/dashboard/culture-picks/actions"

const categoryIcons = {
  book: Book,
  movie: Film,
  music: Music,
}

interface CulturePickFormProps {
  mode: "create" | "edit"
  pickId?: string
  defaultValues?: Partial<CulturePickInput>
}

export function CulturePickForm({ mode, pickId, defaultValues }: CulturePickFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [category, setCategory] = useState<CulturePickCategory>(
    defaultValues?.category ?? "book"
  )
  const [title, setTitle] = useState(defaultValues?.title ?? "")
  const [creator, setCreator] = useState(defaultValues?.creator ?? "")
  const [description, setDescription] = useState(defaultValues?.description ?? "")
  const [coverUrl, setCoverUrl] = useState(defaultValues?.coverUrl ?? "")
  const [externalLink, setExternalLink] = useState(defaultValues?.externalLink ?? "")
  const [periodLabel, setPeriodLabel] = useState(
    defaultValues?.periodLabel ?? getRecentPeriodLabels(1)[0]
  )

  const periodOptions = getRecentPeriodLabels(12)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const input: CulturePickInput = {
      category,
      title: title.trim(),
      creator: creator.trim(),
      description: description.trim() || null,
      coverUrl: coverUrl.trim() || null,
      externalLink: externalLink.trim() || null,
      periodLabel,
    }

    startTransition(async () => {
      const result = mode === "create"
        ? await createCulturePick(input)
        : await updateCulturePick(pickId!, input)

      if (result.success) {
        router.push(`/dashboard/culture-picks/${result.id}`)
      } else {
        setError(result.error ?? "저장에 실패했습니다.")
      }
    })
  }

  const creatorLabel = category === "book" ? "저자" : category === "movie" ? "감독" : "아티스트"

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 카테고리 선택 */}
      <div className="space-y-3">
        <Label className="text-base">카테고리 *</Label>
        <div className="grid grid-cols-3 gap-3">
          {CULTURE_PICK_CATEGORIES.map((cat) => {
            const Icon = categoryIcons[cat]
            const isSelected = category === cat
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all",
                  isSelected
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-slate-200 hover:border-slate-300"
                )}
              >
                <Icon className="h-8 w-8" />
                <span className="font-medium">{CULTURE_PICK_CATEGORY_LABELS[cat]}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 기간 */}
      <div className="space-y-2">
        <Label htmlFor="period">기간 *</Label>
        <Select value={periodLabel} onValueChange={setPeriodLabel}>
          <SelectTrigger id="period">
            <SelectValue placeholder="기간 선택" />
          </SelectTrigger>
          <SelectContent>
            {periodOptions.map((period) => (
              <SelectItem key={period} value={period}>
                {period}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 제목 */}
      <div className="space-y-2">
        <Label htmlFor="title">제목 *</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="책/영화/음악 제목"
          maxLength={200}
          required
        />
      </div>

      {/* 저자/감독/아티스트 */}
      <div className="space-y-2">
        <Label htmlFor="creator">{creatorLabel} *</Label>
        <Input
          id="creator"
          value={creator}
          onChange={(e) => setCreator(e.target.value)}
          placeholder={`${creatorLabel} 이름`}
          maxLength={100}
          required
        />
      </div>

      {/* 표지/포스터 이미지 URL */}
      <div className="space-y-2">
        <Label htmlFor="coverUrl">표지/포스터 이미지 URL (선택)</Label>
        <Input
          id="coverUrl"
          type="url"
          value={coverUrl}
          onChange={(e) => setCoverUrl(e.target.value)}
          placeholder="https://example.com/cover.jpg"
        />
        {coverUrl && (
          <Card className="overflow-hidden w-32">
            <CardContent className="p-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={coverUrl}
                alt="미리보기"
                className="aspect-[3/4] w-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = "none"
                }}
              />
            </CardContent>
          </Card>
        )}
      </div>

      {/* 추천 이유 */}
      <div className="space-y-2">
        <Label htmlFor="description">추천 이유 (선택)</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="이 작품을 추천하는 이유를 적어주세요..."
          rows={4}
          maxLength={2000}
        />
        <p className="text-xs text-slate-400 text-right">{description.length}/2000</p>
      </div>

      {/* 외부 링크 */}
      <div className="space-y-2">
        <Label htmlFor="externalLink">외부 링크 (선택)</Label>
        <Input
          id="externalLink"
          type="url"
          value={externalLink}
          onChange={(e) => setExternalLink(e.target.value)}
          placeholder="https://www.netflix.com/... 또는 멜론, Yes24 등"
        />
      </div>

      {/* 에러 메시지 */}
      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}

      {/* 제출 버튼 */}
      <div className="flex items-center justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isPending}
        >
          취소
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              저장 중...
            </>
          ) : mode === "create" ? (
            "등록하기"
          ) : (
            "수정하기"
          )}
        </Button>
      </div>
    </form>
  )
}

