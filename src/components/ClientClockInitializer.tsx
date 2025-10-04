'use client'

import { useEffect } from 'react'

import DateUtil from '@/lib/date-util'

interface ClientClockInitializerProps {
  serverNow: string
}

export default function ClientClockInitializer({ serverNow }: ClientClockInitializerProps) {
  useEffect(() => {
    DateUtil.initClientClock(serverNow)

    return () => {
      DateUtil.clearClientClock()
    }
  }, [serverNow])

  return null
}
