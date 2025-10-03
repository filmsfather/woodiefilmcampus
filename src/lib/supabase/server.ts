import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

type CookieStore = Awaited<ReturnType<typeof cookies>>
type MutableCookieStore = CookieStore & {
  set: (name: string, value: string, options?: Record<string, unknown>) => void
}

function hasSetCapability(store: CookieStore): store is MutableCookieStore {
  return typeof (store as { set?: unknown }).set === 'function'
}

export function createClient() {
  const cookieStore = cookies()
  const cookieStorePromise = Promise.resolve(cookieStore)

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        async getAll() {
          const store = await cookieStorePromise
          return store.getAll()
        },
        async setAll(cookiesToSet) {
          const store = await cookieStorePromise
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              if (hasSetCapability(store)) {
                store.set(name, value, options)
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
