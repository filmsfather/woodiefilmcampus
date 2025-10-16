'use client'

import { useMemo, useState, useTransition } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Eye, EyeOff, Loader2, Sparkles, Star, Trash2 } from 'lucide-react'

import type { AtelierPostListItem } from '@/lib/atelier-posts'
import type { UserRole } from '@/types/user'
import { toggleAtelierFeatured, toggleAtelierHidden, removeAtelierPost } from '@/app/dashboard/atelier/actions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface AtelierPostListProps {
  items: AtelierPostListItem[]
  viewerId: string
  viewerRole: UserRole
}

type PendingAction = {
  id: string
  type: 'hide' | 'feature' | 'unfeature' | 'delete'
}

function formatDateTime(value: string) {
  try {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return '-'
    }
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  } catch (error) {
    console.error('[AtelierPostList] invalid date', error)
    return '-'
  }
}

export function AtelierPostList({ items, viewerId, viewerRole }: AtelierPostListProps) {
  const router = useRouter()
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [featureDialogState, setFeatureDialogState] = useState<{
    item: AtelierPostListItem
    mode: 'add' | 'edit'
  } | null>(null)
  const [featureComment, setFeatureComment] = useState('')
  const [viewCommentItem, setViewCommentItem] = useState<AtelierPostListItem | null>(null)
  const [isPending, startTransition] = useTransition()

  const isTeacherView = viewerRole !== 'student'

  const sortedItems = useMemo(
    () => items.slice().sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()),
    [items]
  )

  const handleHiddenToggle = (postId: string, nextHidden: boolean) => {
    setPendingAction({ id: postId, type: 'hide' })
    setErrorMessage(null)
    startTransition(async () => {
      const result = await toggleAtelierHidden({ postId, hidden: nextHidden })
      if (!result.success) {
        setErrorMessage(result.error ?? '숨김 변경에 실패했습니다.')
      }
      setPendingAction(null)
      router.refresh()
    })
  }

  const openFeatureDialog = (item: AtelierPostListItem, mode: 'add' | 'edit') => {
    setFeatureDialogState({ item, mode })
    setFeatureComment(item.featuredComment ?? '')
    setErrorMessage(null)
  }

  const closeFeatureDialog = () => {
    setFeatureDialogState(null)
    setFeatureComment('')
  }

  const handleFeatureSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!featureDialogState) {
      return
    }

    const comment = featureComment.trim()
    if (!comment) {
      setErrorMessage('추천 코멘트를 입력해주세요.')
      return
    }

    const { item } = featureDialogState
    const postId = item.id

    setPendingAction({ id: postId, type: 'feature' })
    setErrorMessage(null)
    startTransition(async () => {
      const result = await toggleAtelierFeatured({
        postId,
        featured: true,
        comment,
      })
      if (!result.success) {
        setErrorMessage(result.error ?? '추천 상태 변경에 실패했습니다.')
        setPendingAction(null)
        return
      }
      setPendingAction(null)
      closeFeatureDialog()
      router.refresh()
    })
  }

  const handleUnfeature = (postId: string) => {
    setPendingAction({ id: postId, type: 'unfeature' })
    setErrorMessage(null)
    startTransition(async () => {
      const result = await toggleAtelierFeatured({ postId, featured: false })
      if (!result.success) {
        setErrorMessage(result.error ?? '추천 상태 변경에 실패했습니다.')
        setPendingAction(null)
        return
      }
      setPendingAction(null)
      closeFeatureDialog()
      router.refresh()
    })
  }

  const isFeatureFormPending = Boolean(featureDialogState) &&
    isPending &&
    pendingAction?.id === featureDialogState?.item.id &&
    pendingAction?.type === 'feature'

  const featureDialogTitle = featureDialogState?.mode === 'edit' ? '추천 코멘트 수정' : '추천 코멘트 작성'
  const isDialogUnfeaturePending = Boolean(featureDialogState) &&
    isPending &&
    pendingAction?.id === featureDialogState?.item.id &&
    pendingAction?.type === 'unfeature'

  const handleDelete = (postId: string) => {
    if (!window.confirm('이 게시물을 목록에서 삭제할까요? 삭제 후에도 제출물 자체는 보관됩니다.')) {
      return
    }

    setPendingAction({ id: postId, type: 'delete' })
    setErrorMessage(null)
    startTransition(async () => {
      const result = await removeAtelierPost({ postId })
      if (!result.success) {
        setErrorMessage(result.error ?? '삭제에 실패했습니다.')
      }
      setPendingAction(null)
      router.refresh()
    })
  }

  const renderActions = (item: AtelierPostListItem) => {
    const actions: ReactElement[] = []

    if (item.download) {
      actions.push(
        <Button key="download" asChild size="sm" variant="outline">
          <a href={item.download.url} target="_blank" rel="noreferrer">
            <Download className="h-4 w-4" />
          </a>
        </Button>
      )
    }

    const isOwner = item.studentId === viewerId

    if (!isTeacherView && isOwner) {
      const hidden = item.hiddenByStudent
      const isRowPending = isPending && pendingAction?.id === item.id && pendingAction.type === 'hide'

      actions.push(
        <Button
          key="hide"
          size="sm"
          variant="ghost"
          onClick={() => handleHiddenToggle(item.id, !hidden)}
          disabled={isPending}
          className="gap-1"
        >
          {isRowPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : hidden ? (
            <Eye className="h-4 w-4" />
          ) : (
            <EyeOff className="h-4 w-4" />
          )}
          <span>{hidden ? '다시 보이기' : '숨기기'}</span>
        </Button>
      )
    }

    if (isTeacherView) {
      const isFeatured = item.isFeatured
      const isFeaturePending = isPending && pendingAction?.id === item.id && pendingAction.type === 'feature'
      const isUnfeaturePending = isPending && pendingAction?.id === item.id && pendingAction.type === 'unfeature'
      const isDeletePending = isPending && pendingAction?.id === item.id && pendingAction.type === 'delete'

      actions.push(
        <Button
          key="feature-manage"
          size="sm"
          variant={isFeatured ? 'default' : 'outline'}
          onClick={() => openFeatureDialog(item, isFeatured ? 'edit' : 'add')}
          disabled={isPending && pendingAction?.id === item.id && pendingAction.type !== 'feature'}
          className="gap-1"
        >
          {isFeaturePending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Star className={`h-4 w-4 ${isFeatured ? 'fill-yellow-400 text-yellow-500' : ''}`} />
          )}
          <span>{isFeatured ? '코멘트 수정' : '추천하기'}</span>
        </Button>
      )

      if (isFeatured) {
        actions.push(
          <Button
            key="unfeature"
            size="sm"
            variant="ghost"
            onClick={() => handleUnfeature(item.id)}
            disabled={isPending}
            className="gap-1"
          >
            {isUnfeaturePending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Star className="h-4 w-4" />
            )}
            <span>추천 해제</span>
          </Button>
        )
      }

      actions.push(
        <Button
          key="delete"
          size="sm"
          variant="destructive"
          onClick={() => handleDelete(item.id)}
          disabled={isPending}
          className="gap-1"
        >
          {isDeletePending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          <span>삭제</span>
        </Button>
      )
    }

    return <div className="flex flex-wrap gap-2">{actions}</div>
  }

  return (
    <div className="space-y-4">
      {errorMessage && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[160px] whitespace-nowrap">학생</TableHead>
              <TableHead className="w-[140px] whitespace-nowrap">반</TableHead>
              <TableHead className="w-[220px] whitespace-nowrap">문제집</TableHead>
              <TableHead className="w-[120px] whitespace-nowrap">과목</TableHead>
              <TableHead className="w-[120px] whitespace-nowrap">주차</TableHead>
              <TableHead className="w-[160px] whitespace-nowrap">제출일</TableHead>
              <TableHead className="w-[140px] whitespace-nowrap text-center">상태</TableHead>
              <TableHead className="w-[240px] whitespace-nowrap">작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-sm text-slate-500">
                  표시할 게시물이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              sortedItems.map((item) => {
                const download = item.download
                const isOwner = item.studentId === viewerId
                const hidden = item.hiddenByStudent

                return (
                  <TableRow key={item.id} className={hidden ? 'bg-slate-50' : undefined}>
                    <TableCell className="flex flex-col gap-1 whitespace-nowrap text-sm text-slate-700">
                      <span className="font-medium text-slate-900">{item.studentName}</span>
                      {isOwner ? <Badge variant="outline">내 제출</Badge> : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-slate-600">
                      {item.className ? item.className : <span className="text-slate-400">미지정</span>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-slate-700">
                      {item.workbookTitle ? item.workbookTitle : <span className="text-slate-400">제목 없음</span>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-slate-600">
                      {item.workbookSubject ? item.workbookSubject : <span className="text-slate-400">-</span>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-slate-600">
                      {item.weekLabel ? item.weekLabel : <span className="text-slate-400">-</span>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-slate-600">
                      {formatDateTime(item.submittedAt)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-center">
                      <div className="flex flex-col items-center gap-1 text-xs">
                        {item.isFeatured ? (
                          isTeacherView ? (
                            <Badge className="bg-amber-100 text-amber-800">
                              <Sparkles className="mr-1 h-3 w-3" /> 추천
                            </Badge>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="gap-1"
                              onClick={() => setViewCommentItem(item)}
                            >
                              <Sparkles className="h-4 w-4" />
                              <span>추천</span>
                            </Button>
                          )
                        ) : null}
                        {hidden ? (
                          <Badge variant="outline" className="text-slate-500">
                            숨김
                          </Badge>
                        ) : null}
                        {download ? null : (
                          <Badge variant="outline" className="text-red-500">
                            파일 없음
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-slate-700">
                      {renderActions(item)}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={featureDialogState !== null} onOpenChange={(open) => (!open ? closeFeatureDialog() : undefined)}>
        <SheetContent side="bottom" className="mx-auto w-full max-w-xl rounded-t-lg border-t border-slate-200 bg-white pb-6">
          <SheetHeader className="pb-0">
            <SheetTitle>{featureDialogTitle}</SheetTitle>
            <SheetDescription>
              {featureDialogState?.item.studentName} 학생의 제출물에 교사 코멘트를 남길 수 있습니다.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleFeatureSubmit} className="flex flex-col gap-4 px-4 pt-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="feature-comment">추천 코멘트</Label>
              <Textarea
                id="feature-comment"
                value={featureComment}
                onChange={(event) => setFeatureComment(event.target.value)}
                placeholder="학생에게 전달할 메시지를 입력하세요."
                rows={5}
                disabled={isFeatureFormPending}
              />
              <p className="text-xs text-slate-500">작성한 코멘트는 추천된 학생에게 그대로 보여집니다.</p>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={closeFeatureDialog} disabled={isFeatureFormPending}>
                취소
              </Button>
              <Button type="submit" size="sm" className="gap-1" disabled={isFeatureFormPending || featureComment.trim().length === 0}>
                {isFeatureFormPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                <span>{featureDialogState?.mode === 'edit' ? '코멘트 저장' : '추천하기'}</span>
              </Button>
            </div>

            {featureDialogState?.item.isFeatured ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="self-start"
                onClick={() => (featureDialogState ? handleUnfeature(featureDialogState.item.id) : undefined)}
                disabled={!featureDialogState || isPending}
              >
                {isDialogUnfeaturePending ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Star className="mr-1 h-4 w-4" />
                )}
                추천 해제
              </Button>
            ) : null}
          </form>
        </SheetContent>
      </Sheet>

      <Sheet open={viewCommentItem !== null} onOpenChange={(open) => (!open ? setViewCommentItem(null) : undefined)}>
        <SheetContent side="bottom" className="mx-auto w-full max-w-xl rounded-t-lg border-t border-slate-200 bg-white pb-6">
          <SheetHeader className="pb-0">
            <SheetTitle>추천 코멘트</SheetTitle>
            <SheetDescription>
              {viewCommentItem?.studentName} 학생에게 전달된 추천 코멘트입니다.
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-4 px-4 pt-4">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 whitespace-pre-wrap">
              {viewCommentItem?.featuredComment ?? '등록된 코멘트가 없습니다.'}
            </div>
            {viewCommentItem?.featuredCommentedAt ? (
              <p className="text-xs text-slate-500">작성일: {formatDateTime(viewCommentItem.featuredCommentedAt)}</p>
            ) : null}
            <div className="flex justify-end">
              <Button type="button" size="sm" variant="ghost" onClick={() => setViewCommentItem(null)}>
                닫기
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
