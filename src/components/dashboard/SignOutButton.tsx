'use client'

import { useState, type ComponentProps } from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

interface SignOutButtonProps {
  className?: string
  variant?: ComponentProps<typeof Button>['variant']
  size?: ComponentProps<typeof Button>['size']
}

export function SignOutButton({
  className,
  variant = 'outline',
  size = 'default',
}: SignOutButtonProps = {}) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  const handleSignOut = async () => {
    setLoading(true)
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={handleSignOut}
      disabled={loading}
    >
      {loading ? '로그아웃 중...' : '로그아웃'}
    </Button>
  )
}
