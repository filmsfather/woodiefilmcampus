'use client'

import { useEffect } from 'react'

interface DebugAlertProps {
  messages: string[]
}

export function DebugAlert({ messages }: DebugAlertProps) {
  useEffect(() => {
    if (messages.length === 0) {
      return
    }

    const text = messages.join('\n')
    alert(text)
  }, [messages])

  return null
}
