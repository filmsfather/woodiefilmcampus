'use client'

import type { ReactNode } from 'react'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, Check, ClipboardCheck, Loader2, MessageSquare, Minus, Play, RefreshCw, Send, ShieldCheck } from 'lucide-react'

import { Search } from 'lucide-react'

import AnalysisRunButton from '@/components/dashboard/university-policy/AnalysisRunButton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { StudentWorkflowRow } from '@/lib/university-report/workflow'
import {
  backfillMissingEvaluationsAction,
  prepareFinalConfirmationFormAction,
  principalConfirmFinalAction,
  publishBulkReportAction,
  runBulkAnalysisAction,
  sendConsultOpinionRequestSmsAction,
  sendFinalConfirmationRequestSmsAction,
  type BulkResult,
} from '@/app/dashboard/principal/university-reports/workflow/actions'

const STAGES = [
  { key: 'stage1Submitted', short: '1', label: '성적표 제출' },
  { key: 'stage2Analyzed', short: '2', label: '성적 분석' },
  { key: 'stage3ConsultSubmitted', short: '3', label: '컨설팅 방향' },
  { key: 'stage4Recommended', short: '4', label: '원장 추천' },
  { key: 'stage5NewOpinion', short: '5', label: '새 의견', attention: true },
  { key: 'stage6Confirmed', short: '6', label: '대학 확정' },
  { key: 'stage7FinalConfirmed', short: '7', label: '최종 확정' },
] as const

interface WorkflowTableProps {
  rows: StudentWorkflowRow[]
  emptyMessage: string
}

export default function WorkflowTable({ rows, emptyMessage }: WorkflowTableProps) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null)
  const [search, setSearch] = useState('')

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return rows
    return rows.filter((row) => {
      const name = row.name?.toLowerCase() ?? ''
      const email = row.email?.toLowerCase() ?? ''
      const className = row.className?.toLowerCase() ?? ''
      return name.includes(keyword) || email.includes(keyword) || className.includes(keyword)
    })
  }, [rows, search])

  const rowIds = useMemo(() => filteredRows.map((r) => r.studentId), [filteredRows])
  const selectedIds = useMemo(
    () => rowIds.filter((id) => selected.has(id)),
    [rowIds, selected]
  )
  const allSelected = rowIds.length > 0 && selectedIds.length === rowIds.length

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSelected((prev) => {
      if (prev.size >= rowIds.length && rowIds.every((id) => prev.has(id))) {
        return new Set()
      }
      return new Set(rowIds)
    })
  }

  const runBulk = (
    fn: (payload: { studentIds: string[] }) => Promise<BulkResult>,
    label: string
  ) => {
    if (selectedIds.length === 0) return
    setFeedback(null)
    startTransition(async () => {
      const result = await fn({ studentIds: selectedIds })
      if ('error' in result) {
        setFeedback({ kind: 'err', message: result.error })
        return
      }
      const errorSuffix = result.errors.length > 0 ? ` · ${result.errors[0]}` : ''
      setFeedback({
        kind: result.failed > 0 ? 'err' : 'ok',
        message: `${label}: 성공 ${result.ok}명 / 실패 ${result.failed}명${errorSuffix}`,
      })
      setSelected(new Set())
      router.refresh()
    })
  }

  const runConsultSms = () => {
    if (selectedIds.length === 0) return
    if (
      !window.confirm(
        `선택한 ${selectedIds.length}명에게 "희망 대학 선택·의견 작성" 요청 문자를 발송합니다.\n발행된 공유 링크와 연락처가 있는 학생·학부모에게만 발송됩니다.\n진행할까요?`
      )
    ) {
      return
    }
    runBulk(sendConsultOpinionRequestSmsAction, '컨설팅 의견 요청 문자')
  }

  const runFinalConfirmationSms = () => {
    if (selectedIds.length === 0) return
    if (
      !window.confirm(
        `선택한 ${selectedIds.length}명에게 "지원 대학 최종 확정" 폼 링크 문자를 발송합니다.\n연락처가 있는 학생·학부모에게만 발송됩니다.\n진행할까요?`
      )
    ) {
      return
    }
    runBulk(sendFinalConfirmationRequestSmsAction, '최종 확정 요청 문자')
  }

  const runPrincipalConfirm = () => {
    if (selectedIds.length === 0) return
    if (
      !window.confirm(
        `선택한 ${selectedIds.length}명을 원장 권한으로 최종 확정합니다.\n컨설팅 추천 대학 기준으로 확정되며, 학생·학부모에게 수정 가능한 확정 링크 안내 문자가 발송됩니다.\n이미 확정한 학생은 건너뜁니다. 진행할까요?`
      )
    ) {
      return
    }
    runBulk(principalConfirmFinalAction, '원장 임의 확정')
  }

  const runBackfill = () => {
    if (
      !window.confirm(
        '발행됐지만 분석 결과(평가)가 비어 있는 학생의 데이터를 복구합니다.\n복구된 학생에게는 기존 공유 링크로 "희망 대학 재선택(컨설팅 참고용)" 안내 문자가 발송됩니다.\n진행할까요?'
      )
    ) {
      return
    }
    setFeedback(null)
    startTransition(async () => {
      const result = await backfillMissingEvaluationsAction()
      if ('error' in result) {
        setFeedback({ kind: 'err', message: result.error })
        return
      }
      const errorSuffix = result.errors.length > 0 ? ` · ${result.errors[0]}` : ''
      setFeedback({
        kind: result.failed > 0 ? 'err' : 'ok',
        message: `분석 결과 복구: 대상 ${result.candidates}명 / 성공 ${result.ok}명 / 실패 ${result.failed}명 / 안내 문자 ${result.notified}건${errorSuffix}`,
      })
      setSelected(new Set())
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <StageLegend />

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3">
        <span className="text-sm font-medium text-slate-700">
          {selectedIds.length > 0 ? `${selectedIds.length}명 선택됨` : '일괄 작업'}
        </span>
        <span className="hidden text-xs text-slate-400 sm:inline">
          학생을 선택한 뒤 일괄로 처리할 수 있습니다.
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-2"
            disabled={isPending || selectedIds.length === 0}
            onClick={() => runBulk(runBulkAnalysisAction, '일괄 분석')}
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            선택 분석 실행
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-2"
            disabled={isPending || selectedIds.length === 0}
            onClick={() => runBulk(publishBulkReportAction, '일괄 발행')}
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            선택 발행
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-2 border-sky-300 text-sky-700 hover:bg-sky-50"
            disabled={isPending || selectedIds.length === 0}
            onClick={runConsultSms}
          >
            {isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <MessageSquare className="size-4" />
            )}
            컨설팅 의견 요청 문자
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
            disabled={isPending || selectedIds.length === 0}
            onClick={runFinalConfirmationSms}
          >
            {isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ClipboardCheck className="size-4" />
            )}
            최종 확정 요청 문자
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-2 border-violet-300 text-violet-700 hover:bg-violet-50"
            disabled={isPending || selectedIds.length === 0}
            onClick={runPrincipalConfirm}
          >
            {isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ShieldCheck className="size-4" />
            )}
            선택 임의 확정
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50"
            disabled={isPending}
            onClick={runBackfill}
          >
            {isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            분석 결과 복구
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="학생 이름·이메일·반 검색"
          className="pl-9"
          aria-label="학생 검색"
        />
      </div>

      {feedback ? (
        <p className={`text-xs ${feedback.kind === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>
          {feedback.message}
        </p>
      ) : null}

      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-0">
          {filteredRows.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              {rows.length === 0 ? emptyMessage : '검색 결과가 없습니다.'}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              <div className="grid grid-cols-[auto_1.6fr_minmax(0,2fr)_auto] items-center gap-3 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-500 sm:grid-cols-[auto_1.6fr_0.9fr_minmax(0,2fr)_auto] sm:px-6">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="전체 선택"
                  className="size-4 cursor-pointer rounded border-slate-300"
                />
                <div>학생</div>
                <div className="hidden sm:block">반</div>
                <div className="text-center">진행 단계</div>
                <div className="text-right">작업</div>
              </div>
              {filteredRows.map((row) => (
                <StudentRow
                  key={row.studentId}
                  row={row}
                  checked={selected.has(row.studentId)}
                  onToggle={() => toggle(row.studentId)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StageLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
      <span className="font-medium text-slate-500">단계</span>
      {STAGES.map((stage) => (
        <span key={stage.key} className="flex items-center gap-1.5">
          <span className="flex size-4 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-500">
            {stage.short}
          </span>
          {stage.label}
        </span>
      ))}
      <span className="ml-auto flex items-center gap-3 text-[11px] text-slate-400">
        <span className="flex items-center gap-1">
          <Check className="size-3.5 text-emerald-500" /> 완료
        </span>
        <span className="flex items-center gap-1">
          <Minus className="size-3.5 text-slate-300" /> 미완료
        </span>
        <span className="flex items-center gap-1">
          <AlertTriangle className="size-3.5 text-amber-500" /> 확인 필요
        </span>
      </span>
    </div>
  )
}

function StageDot({ stage, done }: { stage: (typeof STAGES)[number]; done: boolean }) {
  const isAttention = 'attention' in stage && stage.attention
  let className: string
  let icon: ReactNode

  if (isAttention) {
    className = done ? 'bg-amber-100 text-amber-600' : 'bg-slate-50 text-slate-300'
    icon = done ? <AlertTriangle className="size-3.5" /> : <Minus className="size-3.5" />
  } else if (done) {
    className = 'bg-emerald-100 text-emerald-600'
    icon = <Check className="size-3.5" />
  } else {
    className = 'bg-slate-50 text-slate-300'
    icon = <Minus className="size-3.5" />
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <span className={`flex size-7 items-center justify-center rounded-full ${className}`}>
        {icon}
      </span>
      <span className="text-[10px] text-slate-400">{stage.short}</span>
    </div>
  )
}

function StudentRow({
  row,
  checked,
  onToggle,
}: {
  row: StudentWorkflowRow
  checked: boolean
  onToggle: () => void
}) {
  const detailHref = `/dashboard/principal/university-reports/${row.studentId}`
  return (
    <div className="grid grid-cols-[auto_1.6fr_minmax(0,2fr)_auto] items-center gap-3 px-4 py-3 text-sm text-slate-700 transition hover:bg-slate-50 sm:grid-cols-[auto_1.6fr_0.9fr_minmax(0,2fr)_auto] sm:px-6">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        aria-label={`${row.name ?? row.email} 선택`}
        className="size-4 cursor-pointer rounded border-slate-300"
      />
      <div>
        <Link href={detailHref} className="font-medium text-slate-900 hover:underline">
          {row.name ?? row.email}
        </Link>
        <p className="text-xs text-slate-500">{row.email}</p>
        {row.isGed ? (
          <Badge className="mt-1.5 bg-emerald-100 text-emerald-700">검정고시</Badge>
        ) : null}
      </div>
      <div className="hidden text-xs text-slate-600 sm:block">{row.className ?? '-'}</div>
      <div className="flex items-start justify-center gap-2 sm:gap-3">
        <StageDot stage={STAGES[0]} done={row.stage1Submitted} />
        <StageDot stage={STAGES[1]} done={row.stage2Analyzed} />
        <StageDot stage={STAGES[2]} done={row.stage3ConsultSubmitted} />
        <StageDot stage={STAGES[3]} done={row.stage4Recommended} />
        <StageDot stage={STAGES[4]} done={row.stage5NewOpinion} />
        <StageDot stage={STAGES[5]} done={row.stage6Confirmed} />
        <StageDot stage={STAGES[6]} done={row.stage7FinalConfirmed} />
      </div>
      <div className="flex justify-end">
        <StudentRowAction row={row} detailHref={detailHref} />
      </div>
    </div>
  )
}

/**
 * 학생의 현재 처리해야 할 단계에 맞는 작업 버튼.
 * 우선순위: 새 의견 확인 → 성적표 업로드 → 분석 실행 → 발행/공유 → 원장 추천 → (확정 대기/완료).
 */
function StudentRowAction({ row, detailHref }: { row: StudentWorkflowRow; detailHref: string }) {
  const reportHref = `${detailHref}/report`

  if (row.stage5NewOpinion) {
    return (
      <Button
        asChild
        size="sm"
        variant="outline"
        className="border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
      >
        <Link href={reportHref}>의견 확인</Link>
      </Button>
    )
  }

  if (!row.stage1Submitted) {
    return (
      <Button asChild size="sm" variant="outline">
        <Link href={detailHref}>성적표 업로드</Link>
      </Button>
    )
  }

  if (!row.stage2Analyzed) {
    return <AnalysisRunButton studentId={row.studentId} size="sm" />
  }

  if (!row.stage3ConsultSubmitted) {
    return (
      <Button asChild size="sm" variant="outline">
        <Link href={reportHref}>발행·공유 링크</Link>
      </Button>
    )
  }

  if (!row.stage4Recommended) {
    return (
      <Button asChild size="sm">
        <Link href={reportHref}>원장 추천</Link>
      </Button>
    )
  }

  if (!row.stage6Confirmed) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400">학생 확정 대기</span>
        <Button asChild size="sm" variant="outline">
          <Link href={reportHref}>리포트 보기</Link>
        </Button>
        <PrincipalConfirmButton row={row} />
      </div>
    )
  }

  if (!row.stage7FinalConfirmed) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400">최종 확정 대기</span>
        <PrincipalConfirmButton row={row} />
      </div>
    )
  }

  return (
    <Button
      asChild
      size="sm"
      variant="outline"
      className="gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
    >
      <Link href="/dashboard/principal/university-reports/wishlists">
        <Check className="size-3.5" /> 최종 확정 완료
      </Link>
    </Button>
  )
}

/**
 * 원장이 학생의 최종 확정 폼(/confirm/[token])으로 직접 들어가는 개별 버튼.
 * 폼에서 지원 대학과 수업 희망 요일을 원장이 직접 수정·확정할 수 있으며,
 * 원장이 제출하면 confirmed_source='principal'로 기록되고 학생·학부모에게
 * 수정 가능한 확정 링크 안내 문자가 발송된다.
 */
function PrincipalConfirmButton({ row }: { row: StudentWorkflowRow }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleClick = () => {
    setError(null)
    startTransition(async () => {
      const result = await prepareFinalConfirmationFormAction({ studentId: row.studentId })
      if ('error' in result) {
        setError(result.error)
        return
      }
      router.push(`/confirm/${result.token}`)
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="gap-1 border-violet-300 text-violet-700 hover:bg-violet-50"
        disabled={isPending}
        onClick={handleClick}
      >
        {isPending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <ShieldCheck className="size-3.5" />
        )}
        원장 확정
      </Button>
      {error ? <span className="text-[11px] text-red-600">{error}</span> : null}
    </div>
  )
}
