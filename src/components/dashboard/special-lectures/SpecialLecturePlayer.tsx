'use client'

import { useEffect, useRef, useState } from 'react'

interface SpecialLecturePlayerProps {
  lectureId: string
  videoUrl: string
  posterAlt?: string
}

export function SpecialLecturePlayer({ lectureId, videoUrl, posterAlt }: SpecialLecturePlayerProps) {
  const loggedRef = useRef(false)
  const [logError, setLogError] = useState<string | null>(null)

  useEffect(() => {
    loggedRef.current = false
    setLogError(null)
  }, [lectureId])

  const handlePlay = async () => {
    if (loggedRef.current) return
    loggedRef.current = true
    try {
      const response = await fetch('/api/special-lectures/views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lectureId }),
        credentials: 'include',
      })
      if (!response.ok) {
        loggedRef.current = false
        setLogError('시청 기록을 저장하지 못했습니다.')
      }
    } catch (error) {
      console.error('[special-lectures] failed to log view', error)
      loggedRef.current = false
      setLogError('시청 기록을 저장하지 못했습니다.')
    }
  }

  return (
    <div className="overflow-hidden rounded-xl bg-black shadow-lg">
      <div className="relative aspect-video w-full">
        <video
          src={videoUrl}
          controls
          controlsList="nodownload noremoteplayback"
          disablePictureInPicture
          playsInline
          aria-label={posterAlt}
          onContextMenu={(event) => event.preventDefault()}
          onPlay={handlePlay}
          className="absolute inset-0 h-full w-full"
        />
      </div>
      {logError ? (
        <p className="bg-rose-50 px-4 py-2 text-xs text-rose-700">{logError}</p>
      ) : null}
    </div>
  )
}
