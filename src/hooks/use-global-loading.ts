'use client'

import { useEffect, useId, useTransition } from 'react'

import { useGlobalLoadingStore } from '@/lib/global-loading-store'

export function useTrackGlobalLoading(active: boolean) {
  const key = useId()
  const add = useGlobalLoadingStore((state) => state.add)
  const remove = useGlobalLoadingStore((state) => state.remove)

  useEffect(() => {
    if (active) {
      add(key)
    } else {
      remove(key)
    }

    return () => {
      remove(key)
    }
  }, [active, add, remove, key])
}

export function useGlobalTransition(): ReturnType<typeof useTransition> {
  const [isPending, startTransition] = useTransition()
  useTrackGlobalLoading(isPending)
  return [isPending, startTransition]
}
