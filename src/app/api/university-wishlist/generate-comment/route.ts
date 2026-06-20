import { NextRequest, NextResponse } from 'next/server'

import { requireAuthForDashboard } from '@/lib/auth'
import {
  generateWishlistConsultComment,
  type WishlistConsultItem,
} from '@/lib/gemini'

const VALID_CATEGORIES: WishlistConsultItem['category'][] = [
  'general',
  'specialized',
  'karts',
]

function sanitizeItems(raw: unknown): WishlistConsultItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry): WishlistConsultItem | null => {
      if (!entry || typeof entry !== 'object') return null
      const value = entry as Record<string, unknown>
      const category = value.category
      if (typeof category !== 'string' || !VALID_CATEGORIES.includes(category as WishlistConsultItem['category'])) {
        return null
      }
      return {
        category: category as WishlistConsultItem['category'],
        universityName: typeof value.universityName === 'string' ? value.universityName : '',
        programName: typeof value.programName === 'string' ? value.programName : '',
        admissionTrack: typeof value.admissionTrack === 'string' ? value.admissionTrack : '',
        region: typeof value.region === 'string' ? value.region : null,
      }
    })
    .filter((item): item is WishlistConsultItem => item !== null)
}

export async function POST(request: NextRequest) {
  try {
    const { profile } = await requireAuthForDashboard(['principal', 'manager'])
    if (!profile) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
    }

    const body = await request.json()
    const { studentName, consultDirection, isGed, ruralEligible, lowIncomeEligible, extraNote } = body

    if (!studentName || typeof studentName !== 'string') {
      return NextResponse.json({ error: '학생 이름이 필요합니다.' }, { status: 400 })
    }

    const items = sanitizeItems(body.items)
    if (items.length === 0) {
      return NextResponse.json(
        { error: 'AI 작성을 위해 추천 대학을 먼저 추가해주세요.' },
        { status: 400 }
      )
    }

    const result = await generateWishlistConsultComment({
      studentName,
      consultDirection: typeof consultDirection === 'string' ? consultDirection : null,
      isGed: Boolean(isGed),
      ruralEligible: Boolean(ruralEligible),
      lowIncomeEligible: Boolean(lowIncomeEligible),
      items,
      extraNote: typeof extraNote === 'string' ? extraNote : null,
    })

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({ comment: result.comment })
  } catch (error) {
    console.error('[wishlist/generate-comment] Error:', error)
    return NextResponse.json({ error: 'AI 코멘트 생성에 실패했습니다.' }, { status: 500 })
  }
}
