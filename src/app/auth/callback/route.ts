import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'
  const action = searchParams.get('action')

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {
              // Server Component에서는 쿠키 설정이 안 될 수 있음
            }
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // 계정 연결(link) 액션인 경우 - 바로 next로 리다이렉트
      if (action === 'link') {
        return NextResponse.redirect(`${origin}${next}?linked=true`)
      }

      // 세션 교환 성공 - 프로필 완성 여부에 따라 리다이렉트
      const { data: userData } = await supabase.auth.getUser()

      if (userData.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('name, student_phone, academic_record, status, role')
          .eq('id', userData.user.id)
          .maybeSingle()

        // 프로필이 없거나 필수 정보가 없으면 프로필 완성 페이지로
        const isProfileComplete =
          profile &&
          profile.name &&
          profile.student_phone &&
          profile.academic_record

        if (!isProfileComplete) {
          return NextResponse.redirect(`${origin}/complete-profile`)
        }

        // 프로필 완성됨 - 상태 확인
        if (profile.status !== 'approved') {
          return NextResponse.redirect(`${origin}/pending-approval`)
        }

        // 승인된 사용자 - 역할별 대시보드로
        const dashboardPath = profile.role
          ? `/dashboard/${profile.role}`
          : '/dashboard'
        return NextResponse.redirect(`${origin}${dashboardPath}`)
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // 에러 발생 시 로그인 페이지로
  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`)
}

