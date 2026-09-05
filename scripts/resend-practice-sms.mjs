#!/usr/bin/env node
/**
 * 1:1 모의실기 예약 안내 문자 - 미발송 건 추적/재발송 스크립트.
 *
 * 특정 날짜(KST)에 생성/취소된 practice_bookings 와 같은 날 솔라피에서 실제 발송된
 * 문자 목록을 대조해 "보냈어야 하는데 안 나간" (예약, 번호) 쌍을 찾는다.
 * 기본은 조회만(dry-run) 하고, --send 를 붙여야 실제로 발송한다.
 *
 * 문안은 src/lib/solapi.ts 의 sendPracticeBookingConfirmationSMS / CancellationSMS 와 동일하다.
 *
 * 환경: .env.local 의 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY /
 *       SOLAPI_API_KEY / SOLAPI_API_SECRET / SOLAPI_SENDER_NUMBER 사용.
 *
 * 실행 (대학 프리셋 .ts 를 직접 import 하므로 Node 23+ 필요, 모듈 타입 경고는 --no-warnings 로 숨김):
 *   node --no-warnings scripts/resend-practice-sms.mjs         # 어제(KST) 기준 미발송 건 출력
 *   node scripts/resend-practice-sms.mjs --date=2026-09-04     # 날짜 지정
 *   node scripts/resend-practice-sms.mjs --kind=confirm        # confirm | cancel | all(기본)
 *   node scripts/resend-practice-sms.mjs --all                 # 발송 확인된 건까지 전부 표로 출력
 *   node scripts/resend-practice-sms.mjs --send                # 미발송 건 실제 발송
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { getUniversityPreset } from '../src/lib/university-policy/presets/universities.ts'

const SEND = process.argv.includes('--send')
const SHOW_ALL = process.argv.includes('--all')
const kindArg = process.argv.find((a) => a.startsWith('--kind='))
const KIND = kindArg ? kindArg.split('=')[1] : 'all'
const dateArg = process.argv.find((a) => a.startsWith('--date='))

const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const CONFIRM_HEADER = '[우디쌤의 영화입시 모의실기 예약 안내]'
const CANCEL_HEADER = '[우디쌤의 영화입시 모의실기 예약 취소 안내]'

const PRACTICE_TYPE_SMS_LABELS = { writing: '작법형', interview: '면접형' }
const PRACTICE_FLOW_SMS_LABELS = {
  writing: '등원 → 문제 응시(원고지 작성) → 사진 업로드 제출 → 1:1 피드백',
  interview: '등원 → 문제 응시(답안 작성) → 제출 → 5분 면접 및 1:1 피드백',
}

function loadEnv() {
  try {
    for (const line of readFileSync(path.resolve('.env.local'), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  } catch {
    /* .env.local 없으면 환경변수 그대로 사용 */
  }
}

function resolveTargetDate() {
  if (dateArg) {
    const value = dateArg.split('=')[1]
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      console.error('--date 는 YYYY-MM-DD 형식이어야 합니다.')
      process.exit(1)
    }
    return value
  }
  const nowKst = new Date(Date.now() + KST_OFFSET_MS)
  nowKst.setUTCDate(nowKst.getUTCDate() - 1)
  return nowKst.toISOString().slice(0, 10)
}

/** KST 날짜 -> [UTC 시작, UTC 끝) ISO */
function kstDayRange(dateIso) {
  const start = new Date(Date.parse(`${dateIso}T00:00:00Z`) - KST_OFFSET_MS)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}

function normalizePhone(value) {
  if (!value) return null
  const digits = String(value).replace(/\D/g, '')
  return digits.length < 9 ? null : digits
}

function maskPhone(digits) {
  if (!digits || digits.length < 7) return digits ?? '-'
  return `${digits.slice(0, 3)}-${'*'.repeat(digits.length - 7)}-${digits.slice(-4)}`
}

function firstOf(value) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

function formatPracticeDateTime(iso) {
  const base = new Date(iso)
  const dateLabel = new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    timeZone: 'Asia/Seoul',
  }).format(base)
  const timeLabel = new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Seoul',
  }).format(base)
  return `${dateLabel} ${timeLabel}`
}

function resolveUniversityName(id) {
  return getUniversityPreset(id)?.name ?? id ?? '알 수 없는 대학'
}

function buildConfirmText({ studentName, universityName, practiceType, timeLimitMinutes, opensAt, startsAt, roomNo }) {
  const displayName = studentName.trim() || '학생'
  const roomLabel = roomNo != null ? ` (${roomNo}고사장)` : ''
  return [
    CONFIRM_HEADER,
    `${displayName} 학생의 1:1 모의실기 예약이 확정되었습니다.`,
    `• 대학/유형: ${universityName} · ${PRACTICE_TYPE_SMS_LABELS[practiceType]} (제한시간 ${timeLimitMinutes}분)`,
    `• 응시 시작: ${formatPracticeDateTime(opensAt)} — 10분 전까지 등원해주세요`,
    `• 1:1 피드백: ${formatPracticeDateTime(startsAt)}${roomLabel}`,
    `진행 순서: ${PRACTICE_FLOW_SMS_LABELS[practiceType]}`,
    '변경·취소는 담임 선생님께 문의해주세요.',
  ].join('\n')
}

function buildCancelText({ studentName, universityName, practiceType, startsAt }) {
  const displayName = studentName.trim() || '학생'
  return [
    CANCEL_HEADER,
    `${displayName} 학생의 1:1 모의실기 예약이 취소되었습니다.`,
    `• 취소된 예약: ${universityName} · ${PRACTICE_TYPE_SMS_LABELS[practiceType]}`,
    `• 일시: ${formatPracticeDateTime(startsAt)}`,
    '재예약이나 문의는 담임 선생님께 부탁드립니다.',
  ].join('\n')
}

const BOOKING_SELECT = `id, student_id, university_id, practice_type, status, booking_type, created_at, canceled_at,
  practice_slots(starts_at, room_no),
  practice_attempts(opens_at, deadline_at),
  profiles:profiles!practice_bookings_student_id_fkey(name, student_phone, parent_phone)`

async function fetchBookings(supabase, startIso, endIso) {
  const targets = []

  if (KIND === 'all' || KIND === 'confirm') {
    const { data, error } = await supabase
      .from('practice_bookings')
      .select(BOOKING_SELECT)
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .order('created_at', { ascending: true })
    if (error) throw new Error(`예약 조회 실패: ${error.message}`)
    for (const row of data ?? []) {
      // 같은 날 취소된 건은 확정 문자를 다시 보내지 않는다(취소 문자 쪽에서 별도 처리).
      if (row.status === 'canceled') continue
      targets.push({ kind: 'confirm', row, at: row.created_at })
    }
  }

  if (KIND === 'all' || KIND === 'cancel') {
    const { data, error } = await supabase
      .from('practice_bookings')
      .select(BOOKING_SELECT)
      .gte('canceled_at', startIso)
      .lt('canceled_at', endIso)
      .order('canceled_at', { ascending: true })
    if (error) throw new Error(`취소 예약 조회 실패: ${error.message}`)
    for (const row of data ?? []) {
      targets.push({ kind: 'cancel', row, at: row.canceled_at })
    }
  }

  return targets
}

async function fetchSolapiMessages(service, startIso, endIso) {
  const messages = []
  let startKey
  for (let page = 0; page < 50; page += 1) {
    const res = await service.getMessages({
      startDate: startIso,
      endDate: endIso,
      dateType: 'CREATED',
      limit: 500,
      ...(startKey ? { startKey } : {}),
    })
    const list = Object.values(res.messageList ?? {})
    messages.push(...list)
    if (!res.nextKey || list.length === 0) break
    startKey = res.nextKey
  }
  const mapped = messages.map((m) => ({
    to: normalizePhone(Array.isArray(m.to) ? m.to[0] : m.to),
    text: m.text ?? '',
    statusCode: m.statusCode ?? '',
    status: m.status ?? '',
    groupId: m.groupId ?? null,
    dateCreated: m.dateCreated ?? '',
    groupFailedReason: null,
  }))

  // 일일 발송량 초과 등으로 막힌 문자는 메시지 상태는 2000(접수)으로 남고 그룹만 FAILED 가 된다.
  // 접수 상태에 머문 문자는 그룹을 조회해 실제 실패 여부를 확인한다.
  // 그룹 단건 조회는 곧바로 TooManyRequests 에 걸리므로 날짜 범위로 그룹 목록을 한 번에 받아온다.
  const pendingGroups = new Set(mapped.filter((m) => m.statusCode === '2000' && m.groupId).map((m) => m.groupId))
  const groupStatus = new Map()
  if (pendingGroups.size > 0) {
    let groupKey
    for (let page = 0; page < 50; page += 1) {
      const res = await service.getGroups({
        startDate: startIso,
        endDate: endIso,
        limit: 500,
        ...(groupKey ? { startKey: groupKey } : {}),
      })
      const groups = Object.values(res.groupList ?? {})
      for (const group of groups) {
        const lastLog = Array.isArray(group.log) ? group.log[group.log.length - 1]?.message : null
        groupStatus.set(group.groupId, { status: group.status, reason: lastLog ?? null })
      }
      if (!res.nextKey || groups.length === 0) break
      groupKey = res.nextKey
    }

    const tally = {}
    let missingGroups = 0
    for (const groupId of pendingGroups) {
      const info = groupStatus.get(groupId)
      if (!info) {
        missingGroups += 1
        continue
      }
      tally[info.status] = (tally[info.status] ?? 0) + 1
    }
    console.log(
      `접수(2000) 상태 문자 그룹 ${pendingGroups.size}건 확인:`,
      tally,
      missingGroups > 0 ? `(그룹 정보를 못 찾은 건 ${missingGroups}건 → 발송된 것으로 간주)` : ''
    )
  }
  for (const m of mapped) {
    if (m.statusCode !== '2000' || !m.groupId) continue
    const info = groupStatus.get(m.groupId)
    if (info?.status === 'FAILED') {
      m.groupFailedReason = info.reason ?? '그룹 실패'
    }
  }

  return mapped
}

/**
 * 솔라피는 EUC-KR 로 표현되지 않는 기호("•", "—" 등)를 제거해 저장하므로,
 * 문안 대조는 한글·영숫자·기본 구두점만 남기고 공백을 정리한 형태로 비교한다.
 */
function canonicalText(text) {
  return text
    .replace(/[^\p{Script=Hangul}\p{L}\p{N}:().·/→\-\n]/gu, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim()
}

/**
 * 솔라피 상태코드: 2000 접수 / 3000 이통사 전달 / 4000 수신 완료. 그 외 4xxx 는 실패.
 * 2000 이라도 그룹이 FAILED(일일 발송량 초과 등)면 실제로는 나가지 않은 것이다.
 */
function isDelivered(message) {
  if (message.groupFailedReason) return false
  const code = message.statusCode
  return code.startsWith('2') || code.startsWith('3') || code === '4000'
}

function failureLabel(message) {
  if (message.groupFailedReason) return message.groupFailedReason
  return `상태코드 ${message.statusCode}`
}

function pad(value, width) {
  const str = String(value ?? '')
  const len = [...str].reduce((acc, ch) => acc + (/[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF\u3000-\u303F\uFF00-\uFFEF]/.test(ch) ? 2 : 1), 0)
  return str + ' '.repeat(Math.max(0, width - len))
}

async function main() {
  loadEnv()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const apiKey = process.env.SOLAPI_API_KEY
  const apiSecret = process.env.SOLAPI_API_SECRET
  const sender = normalizePhone(process.env.SOLAPI_SENDER_NUMBER)
  if (!url || !key || !apiKey || !apiSecret || !sender) {
    console.error('환경변수(SUPABASE_*, SOLAPI_*)가 부족합니다.')
    process.exit(1)
  }

  const [{ createClient }, { SolapiMessageService }] = await Promise.all([
    import('@supabase/supabase-js'),
    import('solapi'),
  ])
  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const service = new SolapiMessageService(apiKey, apiSecret)

  const dateIso = resolveTargetDate()
  const { startIso, endIso } = kstDayRange(dateIso)
  console.log(`\n대상 날짜(KST): ${dateIso}  (${startIso} ~ ${endIso})`)
  console.log(`모드: ${SEND ? '실제 발송' : '조회만(dry-run)'}  / 종류: ${KIND}\n`)

  const [targets, sent] = await Promise.all([
    fetchBookings(supabase, startIso, endIso),
    fetchSolapiMessages(service, startIso, endIso),
  ])

  const practiceSent = sent
    .filter((m) => m.text.includes(CONFIRM_HEADER) || m.text.includes(CANCEL_HEADER))
    .map((m) => ({ ...m, canonical: canonicalText(m.text), used: false }))
  console.log(`예약 이벤트: ${targets.length}건  /  솔라피 당일 문자: ${sent.length}건 (모의실기 안내 ${practiceSent.length}건)\n`)

  const nowMs = Date.now()
  const rows = []

  for (const { kind, row, at } of targets) {
    const profile = firstOf(row.profiles)
    const slot = firstOf(row.practice_slots)
    const attempt = firstOf(row.practice_attempts)
    const studentName = profile?.name?.trim() || '학생'
    const universityName = resolveUniversityName(row.university_id)

    const payload =
      kind === 'confirm' && slot && attempt
        ? {
            studentName,
            universityName,
            practiceType: row.practice_type,
            timeLimitMinutes: Math.max(
              0,
              Math.round((Date.parse(attempt.deadline_at) - Date.parse(attempt.opens_at)) / 60_000)
            ),
            opensAt: attempt.opens_at,
            startsAt: slot.starts_at,
            roomNo: slot.room_no,
          }
        : kind === 'cancel' && slot
          ? { studentName, universityName, practiceType: row.practice_type, startsAt: slot.starts_at }
          : null

    // 같은 학생이 하루에 여러 건 예약하면 이름만으로는 구분이 안 되므로,
    // 실제 발송 문안과 동일하게 재구성한 텍스트로 정확히 대조하고 한 번 매칭된 문자는 재사용하지 않는다.
    const expectedText = payload
      ? canonicalText(kind === 'confirm' ? buildConfirmText(payload) : buildCancelText(payload))
      : null

    const recipients = [
      ['학생', normalizePhone(profile?.student_phone)],
      ['학부모', normalizePhone(profile?.parent_phone)],
    ]
    const seen = new Set()

    for (const [label, phone] of recipients) {
      if (!phone || seen.has(phone)) continue
      seen.add(phone)

      const candidates = expectedText
        ? practiceSent.filter((m) => !m.used && m.to === phone && m.canonical === expectedText)
        : []
      const deliveredMatch = candidates.find((m) => isDelivered(m))
      const match = deliveredMatch ?? candidates[0] ?? null
      if (match) match.used = true

      let reason = null
      if (kind === 'confirm' && (!slot || !attempt)) reason = '슬롯/응시 정보 없음'
      else if (kind === 'cancel' && !slot) reason = '슬롯 정보 없음'
      else if (kind === 'confirm' && attempt && Date.parse(attempt.opens_at) <= nowMs) reason = '응시 시각 지남'

      rows.push({
        kind,
        at,
        bookingId: row.id,
        studentName,
        label,
        phone,
        university: universityName,
        practiceType: row.practice_type,
        startsAt: slot?.starts_at ?? null,
        status: deliveredMatch ? 'sent' : match ? 'failed' : 'missing',
        failedCodes: match && !deliveredMatch ? [failureLabel(match)] : [],
        skipReason: reason,
        payload,
      })
    }
  }

  const statusLabel = (r) => {
    if (r.status === 'sent') return '발송됨'
    if (r.status === 'failed') return '실패'
    return '미발송'
  }
  const noteLabel = (r) => r.skipReason ?? (r.status === 'failed' ? r.failedCodes.join(', ') : '')

  console.log(
    `${pad('시각(KST)', 12)}${pad('종류', 6)}${pad('학생', 10)}${pad('대상', 6)}${pad('번호', 16)}${pad('상태', 12)}${pad('피드백 시각', 16)}${pad('대학/유형', 24)}비고`
  )
  console.log('-'.repeat(120))
  const visibleRows = SHOW_ALL ? rows : rows.filter((r) => r.status !== 'sent')
  for (const r of visibleRows) {
    const atLabel = new Intl.DateTimeFormat('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Seoul',
    }).format(new Date(r.at))
    console.log(
      `${pad(atLabel, 12)}${pad(r.kind === 'confirm' ? '확정' : '취소', 6)}${pad(r.studentName, 10)}${pad(r.label, 6)}${pad(maskPhone(r.phone), 16)}${pad(statusLabel(r), 12)}${pad(r.startsAt ? formatPracticeDateTime(r.startsAt) : '-', 16)}${pad(`${r.university} · ${PRACTICE_TYPE_SMS_LABELS[r.practiceType]}`, 24)}${noteLabel(r)}`
    )
  }

  const pending = rows.filter((r) => r.status !== 'sent' && !r.skipReason && r.payload)
  const skipped = rows.filter((r) => r.status !== 'sent' && (r.skipReason || !r.payload))
  const sentCount = rows.filter((r) => r.status === 'sent').length

  const unmatched = practiceSent.filter((m) => !m.used)

  console.log('\n요약')
  console.log(`  발송 확인: ${sentCount}건`)
  console.log(`  예약과 매칭되지 않은 솔라피 문자: ${unmatched.length}건 (많으면 문안 대조가 어긋난 것)`)
  console.log(`  재발송 대상: ${pending.length}건`)
  if (skipped.length > 0) console.log(`  재발송 제외(비고 참고): ${skipped.length}건`)

  if (!SEND) {
    if (pending.length > 0) {
      console.log('\n실제 발송하려면 --send 를 붙여 다시 실행하세요.')
    }
    return
  }

  if (pending.length === 0) {
    console.log('\n재발송할 건이 없습니다.')
    return
  }

  console.log(`\n${pending.length}건 발송을 시작합니다...\n`)
  let ok = 0
  let fail = 0
  for (const r of pending) {
    const text = r.kind === 'confirm' ? buildConfirmText(r.payload) : buildCancelText(r.payload)
    try {
      await service.send({ to: r.phone, from: sender, text })
      // 단건 API 연속 호출로 TooManyRequests 에 걸리지 않도록 살짝 간격을 둔다.
      await new Promise((resolve) => setTimeout(resolve, 150))
      ok += 1
      console.log(`  OK   ${r.studentName} ${r.label} ${maskPhone(r.phone)} (${r.kind})`)
    } catch (error) {
      fail += 1
      const message = error?.message ?? String(error)
      console.log(`  FAIL ${r.studentName} ${r.label} ${maskPhone(r.phone)} (${r.kind}) → ${message}`)
    }
  }
  console.log(`\n발송 완료: 성공 ${ok}건 / 실패 ${fail}건`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
