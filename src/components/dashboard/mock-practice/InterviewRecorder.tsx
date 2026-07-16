'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, CircleStop, Loader2, Video } from 'lucide-react'

import { completeInterviewRecordingAction } from '@/app/dashboard/teacher/mock-practice/interview/actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { INTERVIEW_RECORDINGS_BUCKET } from '@/lib/storage/buckets'
import { buildPendingStoragePath, uploadFileToStorageViaClient } from '@/lib/storage-upload'

const MAX_VIDEO_SIZE = 200 * 1024 * 1024 // 버킷 file_size_limit와 동일

// 용량 최소화 설정: 480p / 15fps / VP9 0.5Mbps (10분 녹화 기준 약 40MB)
const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 640 },
  height: { ideal: 480 },
  frameRate: { ideal: 15, max: 24 },
}

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  channelCount: 1,
  echoCancellation: true,
  noiseSuppression: true,
}

const MIME_TYPE_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
]

function pickSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') {
    return undefined
  }
  return MIME_TYPE_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type))
}

function formatElapsed(seconds: number) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function describeGetUserMediaError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : null

  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return '카메라/마이크 권한이 거부되었습니다. 브라우저 주소창의 권한 설정을 확인해주세요. (에디터 내장 브라우저에서는 권한 요청이 차단될 수 있으니 일반 Chrome에서 열어주세요.)'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return '연결된 카메라 또는 마이크를 찾을 수 없습니다. 웹캠 연결 상태를 확인해주세요.'
    case 'NotReadableError':
    case 'TrackStartError':
      return '카메라를 다른 프로그램(Zoom, 카메라 앱 등)이 사용 중입니다. 해당 프로그램을 종료한 뒤 다시 시도해주세요.'
    case 'OverconstrainedError':
      return '카메라가 요청한 해상도(480p)를 지원하지 않습니다. 다른 웹캠으로 시도해주세요.'
    case 'SecurityError':
      return '보안 정책으로 카메라 접근이 차단되었습니다. localhost 또는 HTTPS 환경에서 접속해주세요.'
    default:
      return `웹캠/마이크를 열 수 없습니다. 카메라 연결과 브라우저 권한을 확인해주세요.${name ? ` (${name})` : ''}`
  }
}

type RecorderPhase = 'idle' | 'ready' | 'recording' | 'uploading' | 'done'

interface InterviewRecorderProps {
  attemptId: string
  sessionId: string
  studentName: string
  uploaderId: string
}

export function InterviewRecorder({ attemptId, sessionId, studentName, uploaderId }: InterviewRecorderProps) {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [phase, setPhase] = useState<RecorderPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [])

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop()
      }
      stopStream()
    }
  }, [stopStream])

  const handleEnableCamera = async () => {
    setError(null)

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('이 브라우저는 웹캠 녹화를 지원하지 않습니다. 최신 Chrome 사용을 권장합니다.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: VIDEO_CONSTRAINTS,
        audio: AUDIO_CONSTRAINTS,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => undefined)
      }
      setPhase('ready')
    } catch (err) {
      console.error('[interviews] failed to open webcam', err)
      setError(describeGetUserMediaError(err))
    }
  }

  const uploadRecording = useCallback(
    async (blob: Blob, mimeType: string) => {
      setPhase('uploading')

      try {
        if (blob.size === 0) {
          throw new Error('녹화된 영상이 비어 있습니다. 다시 시도해주세요.')
        }
        if (blob.size > MAX_VIDEO_SIZE) {
          throw new Error('녹화 영상이 200MB를 초과했습니다. 더 짧게 나눠서 녹화해주세요.')
        }

        const extension = mimeType.includes('mp4') ? 'mp4' : 'webm'
        const fileName = `interview-${attemptId}.${extension}`
        const file = new File([blob], fileName, { type: mimeType })

        const path = buildPendingStoragePath({ ownerId: uploaderId, prefix: 'pending', fileName })
        const uploaded = await uploadFileToStorageViaClient({
          bucket: INTERVIEW_RECORDINGS_BUCKET,
          file,
          path,
          maxSizeBytes: MAX_VIDEO_SIZE,
        })

        const result = await completeInterviewRecordingAction({
          attemptId,
          video: {
            bucket: INTERVIEW_RECORDINGS_BUCKET,
            path: uploaded.path,
            size: uploaded.size,
            mimeType: uploaded.mimeType,
            originalName: uploaded.originalName,
          },
        })

        if (!result.success) {
          throw new Error(result.error ?? '녹화 저장에 실패했습니다.')
        }

        setPhase('done')
        router.push(`/dashboard/teacher/mock-practice/interview/sessions/${sessionId}`)
        router.refresh()
      } catch (err) {
        console.error('[interviews] failed to upload recording', err)
        setError(err instanceof Error ? err.message : '영상 업로드에 실패했습니다.')
        setPhase('ready')
      }
    },
    [attemptId, router, sessionId, uploaderId]
  )

  const handleStartRecording = () => {
    const stream = streamRef.current
    if (!stream) {
      setError('카메라가 준비되지 않았습니다.')
      return
    }

    if (typeof MediaRecorder === 'undefined') {
      setError('이 브라우저는 녹화를 지원하지 않습니다. 최신 Chrome 사용을 권장합니다.')
      return
    }

    setError(null)
    chunksRef.current = []

    const mimeType = pickSupportedMimeType()

    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 500_000,
        audioBitsPerSecond: 48_000,
      })
    } catch (err) {
      console.error('[interviews] failed to create MediaRecorder', err)
      setError('녹화기를 시작할 수 없습니다. 브라우저를 확인해주세요.')
      return
    }

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunksRef.current.push(event.data)
      }
    }

    recorder.onstop = () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      const finalMimeType = recorder.mimeType || mimeType || 'video/webm'
      const blob = new Blob(chunksRef.current, { type: finalMimeType })
      chunksRef.current = []
      stopStream()
      void uploadRecording(blob, finalMimeType)
    }

    recorderRef.current = recorder
    recorder.start(5000) // 5초 단위 청크 수집 (탭 크래시 시 유실 최소화)

    setElapsedSeconds(0)
    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1)
    }, 1000)

    setPhase('recording')
  }

  const handleStopRecording = () => {
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
    }
  }

  return (
    <Card className="border-slate-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-slate-900">
          <Video className="h-4 w-4" />
          {studentName} 학생 모의 면접 녹화
        </CardTitle>
        <p className="text-xs text-slate-500">
          480p / 15fps / 0.5Mbps로 녹화됩니다. 녹화를 종료하면 영상이 업로드되고 복기 과제가 자동 생성됩니다.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-950">
          <video ref={videoRef} muted playsInline className="aspect-video w-full object-cover" />
          {phase === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-slate-300">
              <Camera className="h-8 w-8" />
              <p>카메라를 켜면 미리보기가 표시됩니다.</p>
            </div>
          )}
          {phase === 'recording' && (
            <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-red-600/90 px-3 py-1 text-xs font-medium text-white">
              <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
              REC {formatElapsed(elapsedSeconds)}
            </div>
          )}
          {phase === 'uploading' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/80 text-sm text-slate-200">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p>영상 업로드 및 복기 과제 생성 중...</p>
            </div>
          )}
        </div>

        <div className="flex justify-center gap-2">
          {phase === 'idle' && (
            <Button type="button" onClick={handleEnableCamera}>
              <Camera className="mr-2 h-4 w-4" /> 카메라 켜기
            </Button>
          )}
          {phase === 'ready' && (
            <Button type="button" onClick={handleStartRecording}>
              <Video className="mr-2 h-4 w-4" /> 녹화 시작
            </Button>
          )}
          {phase === 'recording' && (
            <Button type="button" variant="destructive" onClick={handleStopRecording}>
              <CircleStop className="mr-2 h-4 w-4" /> 녹화 종료 및 업로드
            </Button>
          )}
          {phase === 'uploading' && (
            <Button type="button" disabled>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 업로드 중...
            </Button>
          )}
          {phase === 'done' && (
            <Button type="button" disabled>
              업로드 완료
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
