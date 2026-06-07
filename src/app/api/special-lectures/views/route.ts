import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getAuthContext } from '@/lib/auth'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

const payloadSchema = z.object({
  lectureId: z.string().uuid('유효한 특강 ID가 아닙니다.'),
})

export async function POST(request: Request) {
  try {
    const { profile } = await getAuthContext()
    if (!profile?.id) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const body = (await request.json().catch(() => null)) as unknown
    const parsed = payloadSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_payload', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const supabase = await createServerSupabase()

    const { data: allowed, error: allowError } = await supabase.rpc('can_view_special_lecture', {
      uid: profile.id,
      lecture_id: parsed.data.lectureId,
    })

    if (allowError) {
      console.error('[special-lectures] views permission check failed', allowError)
      return NextResponse.json({ error: 'permission_check_failed' }, { status: 500 })
    }

    if (!allowed) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const userAgent = request.headers.get('user-agent') ?? null
    const forwarded = request.headers.get('x-forwarded-for')
    const ip = forwarded ? forwarded.split(',')[0]?.trim() : request.headers.get('x-real-ip')

    const { error: insertError } = await supabase.from('special_lecture_views').insert({
      special_lecture_id: parsed.data.lectureId,
      viewer_id: profile.id,
      user_agent: userAgent,
      ip: ip ?? null,
    })

    if (insertError) {
      console.error('[special-lectures] failed to insert view log', insertError)
      return NextResponse.json({ error: 'log_failed' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[special-lectures] views unexpected error', error)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
