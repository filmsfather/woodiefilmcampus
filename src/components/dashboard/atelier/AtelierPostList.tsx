'use client'

import { useMemo, useState, useTransition } from 'react'
import type { ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Eye, EyeOff, Loader2, Sparkles, Star, Trash2 } from 'lucide-react'

import type { AtelierPostListItem } from '@/lib/atelier-posts'
import type { UserRole } from '@/types/user'
import { toggleAtelierFeatured, toggleAtelierHidden, removeAtelierPost } from '@/app/dashboard/atelier/actions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
  type: 'hide' | 'feature' | 'delete'
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

  const handleFeaturedToggle = (postId: string, nextFeatured: boolean) => {
    setPendingAction({ id: postId, type: 'feature' })
    setErrorMessage(null)
    startTransition(async () => {
      const result = await toggleAtelierFeatured({ postId, featured: nextFeatured })
      if (!result.success) {
        setErrorMessage(result.error ?? '추천 상태 변경에 실패했습니다.')
      }
      setPendingAction(null)
      router.refresh()
    })
  }

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
      const isDeletePending = isPending && pendingAction?.id === item.id && pendingAction.type === 'delete'

      actions.push(
        <Button
          key="feature"
          size="sm"
          variant={isFeatured ? 'default' : 'outline'}
          onClick={() => handleFeaturedToggle(item.id, !isFeatured)}
          disabled={isPending}
          className="gap-1"
        >
          {isFeaturePending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Star className={`h-4 w-4 ${isFeatured ? 'fill-yellow-400 text-yellow-500' : ''}`} />
          )}
          <span>{isFeatured ? '추천 해제' : '추천하기'}</span>
        </Button>
      )

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
              <TableHead className="min-w-[140px]">학생</TableHead>
              <TableHead className="min-w-[120px]">반</TableHead>
              <TableHead className="min-w-[180px]">문제집</TableHead>
              <TableHead className="min-w-[100px]">과목</TableHead>
              <TableHead className="min-w-[100px]">주차</TableHead>
              <TableHead className="min-w-[140px]">제출일</TableHead>
              <TableHead className="min-w-[100px] text-center">상태</TableHead>
              <TableHead className="min-w-[200px]">작업</TableHead>
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
                    <TableCell className="flex flex-col gap-1 text-sm text-slate-700">
                      <span className="font-medium text-slate-900">{item.studentName}</span>
                      {isOwner ? <Badge variant="outline">내 제출</Badge> : null}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {item.className ?? <span className="text-slate-400">미지정</span>}
                    </TableCell>
                    <TableCell className="text-sm text-slate-700">
                      {item.workbookTitle ?? <span className="text-slate-400">제목 없음</span>}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {item.workbookSubject ?? <span className="text-slate-400">-</span>}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {item.weekLabel ?? <span className="text-slate-400">-</span>}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {formatDateTime(item.submittedAt)}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex flex-col items-center gap-1 text-xs">
                        {item.isFeatured ? (
                          <Badge className="bg-amber-100 text-amber-800">
                            <Sparkles className="mr-1 h-3 w-3" /> 추천
                          </Badge>
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
                    <TableCell className="text-sm text-slate-700">
                      {renderActions(item)}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
