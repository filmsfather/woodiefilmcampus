'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronUp, FileText, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { fetchAllAssignmentsForClass } from '@/app/dashboard/teacher/actions'
import type { ClassAssignmentListItem } from '@/components/dashboard/teacher/ClassOverview'

const TYPE_LABELS: Record<string, string> = {
  srs: 'SRS',
  pdf: 'PDF',
  writing: '서술형',
  film: '영화감상',
  lecture: '강의',
  image: '이미지',
}

type ExpandState = 'collapsed' | 'expanded' | 'all'

function AssignmentRow({
  item,
  classId,
}: {
  item: ClassAssignmentListItem
  classId: string
}) {
  return (
    <Link
      href={`/dashboard/teacher/review/${classId}?assignment=${item.id}`}
      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-slate-50"
    >
      <FileText className="h-4 w-4 shrink-0 text-slate-400" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-slate-700">{item.title}</p>
        {(item.subject || item.type) && (
          <p className="truncate text-xs text-slate-500">
            {[item.subject, item.type ? TYPE_LABELS[item.type] ?? item.type : null].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
      <div className="shrink-0 text-right text-xs text-slate-500">
        <p>출제 {item.publishedAtLabel ?? '-'}</p>
        <p>마감 {item.dueAtLabel ?? '없음'}</p>
      </div>
    </Link>
  )
}

export function ClassAssignmentExpandable({
  classId,
  recentAssignments,
}: {
  classId: string
  recentAssignments: ClassAssignmentListItem[]
}) {
  const [state, setState] = useState<ExpandState>('collapsed')
  const [allAssignments, setAllAssignments] = useState<ClassAssignmentListItem[]>([])
  const [isPending, startTransition] = useTransition()

  if (recentAssignments.length === 0 && state === 'collapsed') {
    return null
  }

  const handleToggle = () => {
    setState((prev) => (prev === 'collapsed' ? 'expanded' : 'collapsed'))
  }

  const handleLoadAll = () => {
    startTransition(async () => {
      const result = await fetchAllAssignmentsForClass(classId)
      setAllAssignments(result)
      setState('all')
    })
  }

  const displayItems = state === 'all' ? allAssignments : recentAssignments

  return (
    <div className="border-t border-slate-100">
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center justify-center gap-1 px-3 py-2 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
      >
        {state === 'collapsed' ? (
          <>
            지난 과제 ({recentAssignments.length}건)
            <ChevronDown className="h-3.5 w-3.5" />
          </>
        ) : (
          <>
            접기
            <ChevronUp className="h-3.5 w-3.5" />
          </>
        )}
      </button>

      {state !== 'collapsed' && (
        <div className="space-y-0.5 px-1 pb-2">
          {displayItems.map((item) => (
            <AssignmentRow key={item.id} item={item} classId={classId} />
          ))}

          {displayItems.length === 0 && (
            <p className="px-3 py-2 text-center text-xs text-slate-400">
              과제가 없습니다.
            </p>
          )}

          {state === 'expanded' && (
            <div className="px-3 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full text-xs"
                onClick={handleLoadAll}
                disabled={isPending}
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    불러오는 중...
                  </>
                ) : (
                  '전체 기간 보기'
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
