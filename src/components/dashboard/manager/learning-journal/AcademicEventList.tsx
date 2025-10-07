'use client'

import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  deleteLearningJournalAcademicEventAction,
} from '@/app/dashboard/manager/learning-journal/actions'
import {
  initialActionState,
  type ActionState,
} from '@/app/dashboard/manager/classes/action-state'
import type { LearningJournalAcademicEvent } from '@/types/learning-journal'

interface AcademicEventListProps {
  events: LearningJournalAcademicEvent[]
}

export function AcademicEventList({ events }: AcademicEventListProps) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    deleteLearningJournalAcademicEventAction,
    initialActionState
  )

  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
        등록된 일정이 없습니다. 새로운 일정을 추가해 주세요.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {state.status === 'error' && state.message ? (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      {state.status === 'success' && state.message ? (
        <Alert>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      <ul className="space-y-3">
        {events.map((event) => (
          <li key={event.id} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm font-medium text-slate-900">{event.title}</p>
                <p className="text-xs text-slate-500">
                  {event.startDate}
                  {event.endDate ? ` ~ ${event.endDate}` : ''}
                </p>
                {event.memo ? (
                  <p className="mt-2 text-sm text-slate-600 whitespace-pre-wrap">{event.memo}</p>
                ) : null}
              </div>
              <form action={formAction} className="flex justify-end">
                <input type="hidden" name="eventId" value={event.id} />
                <Button type="submit" size="sm" variant="ghost" disabled={isPending}>
                  {isPending ? '삭제 중...' : '삭제'}
                </Button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
