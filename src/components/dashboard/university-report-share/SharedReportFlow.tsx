'use client'

import { useState, type ReactNode } from 'react'
import Image from 'next/image'
import { ArrowRight } from 'lucide-react'

import ClassificationIntro from '@/components/dashboard/university-report-share/ClassificationIntro'
import ClassificationSummary from '@/components/dashboard/university-report-share/ClassificationSummary'
import ConsultDirectionForm from '@/components/dashboard/university-report-share/ConsultDirectionForm'
import UniversityClassifier from '@/components/dashboard/university-report-share/UniversityClassifier'
import { Button } from '@/components/ui/button'
import type { ReportUniversityItem } from '@/lib/university-policy/report-view'

interface SharedReportFlowProps {
  studentName: string
  token: string
  publicationId: string
  classificationItems: ReportUniversityItem[]
  alreadySubmitted: boolean
  children: ReactNode
}

type FlowStep = 'cover' | 'greeting' | 'consult' | 'classifyIntro' | 'classify' | 'summary' | 'report'

const PRINCIPAL_GREETING = `안녕하세요, 우디쌤입니다.

어느덧 학생들이 참 많이 성장했습니다. 처음에는 영화에 대해 아무것도 모르던 친구들이, 이제는 일반 관객과는 확연히 다른 시선과 지식으로 한 편의 영화를 깊이 들여다볼 수 있게 되었습니다. 그 변화의 순간들을 가장 가까이에서 지켜보는 일은 늘 벅찬 보람입니다. 학생들이 마음껏 꿈꿀 수 있도록 가정에서 변함없는 지원과 격려를 보내주신 부모님께 진심으로 감사드립니다.

꿈을 현실로 바꾸는 길에는, 단계마다 반드시 견뎌내야 하는 힘든 시간이 찾아옵니다. 입시는 '영화인'이라는 꿈을 현실로 옮기는 그 첫 번째 걸음입니다. 결코 쉽지 않은 여정이지만, 끝까지 흔들리지 않고 이겨낼 수 있도록 곁에서 함께 뛰겠습니다. 많은 응원 부탁드립니다.

입시에 정답은 없습니다. 누군가에게는 올해 안에 대학에 합격하는 것이 목표일 수 있고, 또 누군가에게는 평생 마음에 품어 온 단 하나의 학교가 있을 수 있습니다. 농어촌 전형이 가능한 학생도, 학생부 종합을 꾸준히 관리해 온 학생도 있습니다. 저마다의 출발점과 방향이 다르기에, 모두에게 똑같은 정답을 드릴 수는 없습니다.

여러분이 입시에서 어떤 방향을 바라보고 있는지 솔직하게 들려주세요. 그 길에 가장 잘 어울리는 대학과 전략을 함께 고민하고 추천해 드리겠습니다.`

export default function SharedReportFlow({
  studentName,
  token,
  classificationItems,
  alreadySubmitted,
  children,
}: SharedReportFlowProps) {
  const [step, setStep] = useState<FlowStep>('cover')
  const [wishes, setWishes] = useState<Record<string, boolean>>({})
  const hasClassification = classificationItems.length > 0
  const showResume = alreadySubmitted && hasClassification

  if (step === 'cover') {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-white px-6 py-12">
        <div className="flex w-full max-w-md flex-col items-center gap-8 text-center">
          <Image
            src="/report_cover_logo_cropped.png"
            alt="Woodie Film 로고"
            width={1200}
            height={1437}
            sizes="(max-width: 640px) 180px, 220px"
            className="h-auto w-[180px] sm:w-[220px]"
            priority
          />
          <h1 className="text-2xl font-semibold leading-snug tracking-tight text-[#5a6450] sm:text-3xl">
            {studentName} 학생
            <br />
            지원 가능 대학 진단 레포트
          </h1>
          {showResume ? (
            <div className="flex w-full flex-col items-center gap-3">
              <p className="text-sm text-slate-500">
                이미 희망대학 분류를 제출하셨어요.
              </p>
              <Button
                type="button"
                size="lg"
                className="w-full max-w-[220px] gap-2"
                onClick={() => setStep('report')}
              >
                진단 결과 바로 보기
                <ArrowRight className="size-4" />
              </Button>
              <button
                type="button"
                onClick={() => setStep('greeting')}
                className="text-xs text-slate-400 underline underline-offset-2 transition-colors hover:text-slate-600"
              >
                다시 분류하고 싶어요
              </button>
            </div>
          ) : (
            <Button
              type="button"
              size="lg"
              className="mt-2 w-full max-w-[220px] gap-2"
              onClick={() => setStep('greeting')}
            >
              다음
              <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      </main>
    )
  }

  if (step === 'greeting') {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-white px-6 py-12">
        <div className="flex w-full max-w-xl flex-col gap-6">
          <div className="space-y-1 text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-[#8a9472]">
              원장 인사말
            </p>
            <h2 className="text-xl font-semibold tracking-tight text-[#5a6450] sm:text-2xl">
              {studentName} 학생과 학부모님께
            </h2>
          </div>
          <div className="rounded-xl border border-[#e3e6db] bg-[#f7f8f3] p-6 sm:p-8">
            <p className="whitespace-pre-line text-[15px] leading-relaxed text-slate-700">
              {PRINCIPAL_GREETING}
            </p>
          </div>
          <div className="flex justify-center">
            <Button
              type="button"
              size="lg"
              className="w-full max-w-[220px] gap-2"
              onClick={() => setStep('consult')}
            >
              다음
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      </main>
    )
  }

  if (step === 'consult') {
    return (
      <ConsultDirectionForm
        token={token}
        studentName={studentName}
        onSubmitted={() => setStep(hasClassification ? 'classifyIntro' : 'report')}
      />
    )
  }

  if (step === 'classifyIntro') {
    return (
      <ClassificationIntro
        studentName={studentName}
        totalCount={classificationItems.length}
        onStart={() => setStep('classify')}
      />
    )
  }

  if (step === 'classify') {
    return (
      <UniversityClassifier
        items={classificationItems}
        onComplete={(result) => {
          setWishes(result)
          setStep('summary')
        }}
      />
    )
  }

  if (step === 'summary') {
    return (
      <ClassificationSummary
        token={token}
        items={classificationItems}
        wishes={wishes}
        onBack={() => setStep('classify')}
        onSubmitted={() => setStep('report')}
      />
    )
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-3xl space-y-6">{children}</div>
    </main>
  )
}
