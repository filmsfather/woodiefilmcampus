'use client'

import { useState } from 'react'
import { Check, Copy, ExternalLink, LinkIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface ShareLinkBoxProps {
  token: string
}

function buildUrl(base: string, token: string): string {
  return `${base.replace(/\/$/, '')}/r/${token}`
}

export default function ShareLinkBox({ token }: ShareLinkBoxProps) {
  const [copied, setCopied] = useState(false)

  // 공유(복사)용 링크는 운영 도메인을 우선 사용해 학부모에게 안정적으로 전달한다.
  const envBase = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '')
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : ''
  const shareUrl = buildUrl(envBase && envBase.length > 0 ? envBase : currentOrigin, token)
  // 미리보기는 지금 접속 중인 호스트로 열어 개발 환경에서도 즉시 확인할 수 있게 한다.
  const previewUrl = buildUrl(currentOrigin || envBase || '', token)
  const isPreviewDifferent = previewUrl !== shareUrl

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50 p-4">
      <div className="flex items-center gap-2">
        <LinkIcon className="size-4 text-sky-600" />
        <span className="text-sm font-semibold text-sky-900">공유 링크</span>
      </div>
      <p className="text-xs text-sky-800">
        로그인하지 않은 학부모님도 이 링크로 리포트를 볼 수 있습니다.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          readOnly
          value={shareUrl}
          onFocus={(e) => e.currentTarget.select()}
          className="h-9 flex-1 bg-white text-xs"
        />
        <Button onClick={handleCopy} size="sm" variant="outline" className="gap-2">
          {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
          {copied ? '복사됨' : '복사'}
        </Button>
        <Button asChild size="sm" className="gap-2">
          <a href={previewUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="size-4" />
            미리보기
          </a>
        </Button>
      </div>
      {isPreviewDifferent ? (
        <p className="text-[11px] text-sky-700">
          미리보기는 현재 접속 중인 주소({currentOrigin})로 열립니다. 위 복사 링크는 운영 도메인 기준입니다.
        </p>
      ) : null}
    </div>
  )
}
