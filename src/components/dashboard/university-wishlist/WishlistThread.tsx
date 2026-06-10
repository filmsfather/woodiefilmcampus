'use client'

import { MessageSquare } from 'lucide-react'

import type { WishlistMessage } from '@/lib/university-wishlist/data'

function formatDateTime(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const ROLE_LABEL: Record<WishlistMessage['authorRole'], string> = {
  principal: '원장',
  teacher: '선생님',
  student: '학생·학부모',
}

interface WishlistThreadProps {
  messages: WishlistMessage[]
  /** 학생 화면이면 학생 메시지를 오른쪽 정렬한다. */
  viewerSide?: 'staff' | 'student'
}

export default function WishlistThread({ messages, viewerSide = 'staff' }: WishlistThreadProps) {
  if (messages.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">
        아직 주고받은 의견이 없습니다.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {messages.map((m) => {
        const isStudent = m.authorRole === 'student'
        const mine = viewerSide === 'student' ? isStudent : !isStudent
        return (
          <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                isStudent
                  ? 'bg-indigo-50 text-indigo-900'
                  : 'bg-sky-50 text-sky-900'
              }`}
            >
              <div className="mb-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                <MessageSquare className="size-3" />
                <span className="font-medium">{m.authorName}</span>
                <span>({ROLE_LABEL[m.authorRole]})</span>
                <span>· {formatDateTime(m.createdAt)}</span>
              </div>
              <p className="whitespace-pre-line">{m.body}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
