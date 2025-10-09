'use client'

import { useCallback, useEffect, useId, useRef, useState, useTransition } from 'react'

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

export function useGlobalAsyncTask() {
  const add = useGlobalLoadingStore((state) => state.add)
  const remove = useGlobalLoadingStore((state) => state.remove)
  const baseKey = useId()
  const tokenCounterRef = useRef(0)
  const pendingCountRef = useRef(0)
  const [isLoading, setIsLoading] = useState(false)

  const runWithLoading = useCallback(
    async <T>(task: () => Promise<T>): Promise<T> => {
      const token = `${baseKey}-${tokenCounterRef.current++}`
      pendingCountRef.current += 1
      if (pendingCountRef.current === 1) {
        setIsLoading(true)
      }
      add(token)
      try {
        return await task()
      } finally {
        remove(token)
        pendingCountRef.current = Math.max(0, pendingCountRef.current - 1)
        if (pendingCountRef.current === 0) {
          setIsLoading(false)
        }
      }
    },
    [add, remove, baseKey],
  )

  return { runWithLoading, isLoading }
}
