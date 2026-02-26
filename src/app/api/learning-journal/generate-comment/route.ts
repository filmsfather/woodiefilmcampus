import { NextRequest, NextResponse } from 'next/server'
import { generateLearningJournalComment } from '@/lib/gemini'
import { requireAuthForDashboard } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const { profile } = await requireAuthForDashboard(['teacher', 'manager', 'principal'])
    if (!profile) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
    }

    const body = await request.json()
    const { studentName, subject, teacherContext, previousComment } = body

    if (!studentName || typeof studentName !== 'string') {
      return NextResponse.json({ error: '학생 이름이 필요합니다.' }, { status: 400 })
    }
    if (!subject || typeof subject !== 'string') {
      return NextResponse.json({ error: '과목 정보가 필요합니다.' }, { status: 400 })
    }
    if (!teacherContext || typeof teacherContext !== 'string' || !teacherContext.trim()) {
      return NextResponse.json({ error: '코멘트 작성을 위한 키워드/메모를 입력해주세요.' }, { status: 400 })
    }

    const result = await generateLearningJournalComment({
      studentName,
      subject,
      teacherContext: teacherContext.trim(),
      previousComment: typeof previousComment === 'string' ? previousComment : undefined,
    })

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({ comment: result.comment })
  } catch (error) {
    console.error('[generate-comment] Error:', error)
    return NextResponse.json({ error: 'AI 코멘트 생성에 실패했습니다.' }, { status: 500 })
  }
}
