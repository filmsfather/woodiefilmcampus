import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

type CookieStore = Awaited<ReturnType<typeof cookies>>
type MutableCookieStore = CookieStore & {
  set: (name: string, value: string, options?: Record<string, unknown>) => void
}

function hasSetCapability(store: CookieStore): store is MutableCookieStore {
  return typeof (store as { set?: unknown }).set === 'function'
}

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              if (hasSetCapability(cookieStore)) {
                cookieStore.set(name, value, options)
              }
            })
          } catch {
            // Server Components에서는 쿠키 set이 지원되지 않을 수 있음
          }
        },
      },
    }
  )
}
