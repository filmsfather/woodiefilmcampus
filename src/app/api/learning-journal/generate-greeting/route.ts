import { NextRequest, NextResponse } from 'next/server'
import { generatePrincipalGreeting } from '@/lib/gemini'
import { requireAuthForDashboard } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    // 원장/매니저만 접근 가능
    const { profile } = await requireAuthForDashboard(['principal', 'manager'])
    if (!profile) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
    }

    const body = await request.json()
    const { monthToken, context } = body

    if (!monthToken || typeof monthToken !== 'string') {
      return NextResponse.json({ error: 'monthToken이 필요합니다.' }, { status: 400 })
    }

    const result = await generatePrincipalGreeting(monthToken, context)

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({ greeting: result.greeting })
  } catch (error) {
    console.error('[generate-greeting] Error:', error)
    return NextResponse.json({ error: 'AI 인사말 생성에 실패했습니다.' }, { status: 500 })
  }
}

