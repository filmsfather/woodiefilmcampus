'use client'

import { useActionState, useState } from 'react'

import { agreeCctvConsent, type CctvConsentState } from './actions'
import { SignOutButton } from '@/components/dashboard/SignOutButton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import type { CctvConsentSection } from '@/lib/consents'

interface CctvConsentClientProps {
  heading: string
  intro: string
  sections: CctvConsentSection[]
  agreementLabel: string
  memberName: string
}

export function CctvConsentClient({
  heading,
  intro,
  sections,
  agreementLabel,
  memberName,
}: CctvConsentClientProps) {
  const [state, formAction, isPending] = useActionState<CctvConsentState, FormData>(
    agreeCctvConsent,
    {}
  )
  const [agreed, setAgreed] = useState(false)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 px-4 py-12">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
            개인정보 수집·이용 동의
          </h1>
          <p className="text-sm text-slate-600 sm:text-base">
            {memberName ? `${memberName}님, ` : ''}서비스 이용 전에 아래 동의서를 확인해주세요.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="space-y-4 text-sm leading-relaxed text-slate-700">
            <p>{intro}</p>
            <p className="text-base font-semibold text-slate-900">{heading}</p>
            <div className="max-h-[420px] space-y-4 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-5">
              {sections.map((section) => (
                <section key={section.title} className="space-y-2">
                  <h2 className="text-sm font-semibold text-slate-900">{section.title}</h2>
                  <ul className="space-y-1 text-sm text-slate-700">
                    {section.items.map((item) => (
                      <li key={item} className="leading-relaxed">
                        {item}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>

          <form action={formAction} className="mt-6 space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <Checkbox
                id="cctv-consent-agree"
                name="agreed"
                checked={agreed}
                onChange={(event) => setAgreed(event.target.checked)}
                className="mt-1"
              />
              <Label
                htmlFor="cctv-consent-agree"
                className="text-sm font-medium text-slate-800"
              >
                {agreementLabel}
              </Label>
            </div>

            {state.error && (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            )}

            <p className="text-xs text-slate-500">
              동의하지 않으면 학원 시스템 이용이 제한되며, 다른 페이지로 이동할 수 없습니다.
            </p>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <SignOutButton variant="ghost" size="sm" />
              <Button type="submit" disabled={!agreed || isPending} className="sm:min-w-[180px]">
                {isPending ? '저장 중...' : '동의하고 계속하기'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
