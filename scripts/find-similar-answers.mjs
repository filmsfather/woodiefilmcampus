#!/usr/bin/env node
/**
 * 학생 서술형 답안 중 주어진 텍스트와 유사한 것을 찾는 조회 스크립트(읽기 전용).
 *
 * 검색 대상:
 *   - exam_answers.content                (시험 응시 답안)
 *   - exam_review_items.answer_content    (오답노트 문항 답안)
 *   - exam_review_item_assets.caption     (오답노트 이미지 해설)
 *   - task_submissions.content            (과제 서술형 제출)
 *   - writing_attempts.ocr_text           (모의 작문 OCR 결과)
 *
 * 유사도는 공백/기호를 제거한 문자 3-gram 자카드 계수로 계산하므로
 * pg_trgm 확장 없이도 동작한다.
 *
 * 환경: .env.local 의 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 사용.
 *
 * 실행:
 *   node scripts/find-similar-answers.mjs --file=/tmp/target.txt
 *   node scripts/find-similar-answers.mjs --file=/tmp/target.txt --min=0.05 --limit=30
 *   node scripts/find-similar-answers.mjs --text="스파게티 웨스턴 ..." --full
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'

function arg(name, fallback = null) {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`))
  return found ? found.slice(name.length + 3) : fallback
}

const FILE = arg('file')
const TEXT = arg('text')
const MIN_SCORE = Number(arg('min', '0.05'))
const LIMIT = Number(arg('limit', '20'))
/** 이보다 짧은 후보는 포함율이 과대평가되므로 자카드 점수만 사용한다 */
const MIN_CHARS = Number(arg('min-chars', '80'))
const FULL = process.argv.includes('--full')
const PAGE_SIZE = 1000

function loadEnv() {
  try {
    for (const line of readFileSync(path.resolve('.env.local'), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
    }
  } catch {
    /* .env.local 없으면 환경변수 그대로 사용 */
  }
}

function normalize(text) {
  return text
    .replace(/\s+/g, '')
    .replace(/[.,!?'"“”‘’()[\]{}<>·:;~\-—/\\|]/g, '')
    .toLowerCase()
}

function trigrams(normalized) {
  const set = new Set()
  for (let i = 0; i + 3 <= normalized.length; i += 1) {
    set.add(normalized.slice(i, i + 3))
  }
  return set
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  for (const gram of small) {
    if (large.has(gram)) intersection += 1
  }
  return intersection / (a.size + b.size - intersection)
}

/** 포함 비율: 후보 텍스트가 원문의 일부를 얼마나 그대로 담고 있는지 */
function containment(targetGrams, candidateGrams) {
  if (candidateGrams.size === 0) return 0
  let intersection = 0
  for (const gram of candidateGrams) {
    if (targetGrams.has(gram)) intersection += 1
  }
  return intersection / candidateGrams.size
}

async function fetchAll(supabase, table, columns) {
  const rows = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + PAGE_SIZE - 1)

    if (error) {
      console.warn(`  · ${table} 조회 실패: ${error.message}`)
      return rows
    }
    if (!data?.length) break
    rows.push(...data)
    if (data.length < PAGE_SIZE) break
  }
  return rows
}

async function main() {
  if (!FILE && !TEXT) {
    console.error('--file=<경로> 또는 --text="..." 중 하나가 필요합니다.')
    process.exit(1)
  }

  const target = (FILE ? readFileSync(path.resolve(FILE), 'utf8') : TEXT).trim()
  if (target.length < 20) {
    console.error('비교할 원문이 너무 짧습니다.')
    process.exit(1)
  }

  loadEnv()
  const { createClient } = await import('@supabase/supabase-js')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('환경변수(NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)가 없습니다.')
    process.exit(1)
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  console.log('데이터 수집 중...')

  const [
    profiles,
    examAnswers,
    examAttempts,
    examQuestions,
    reviewItems,
    reviewTasks,
    reviewAssets,
    taskSubmissions,
    studentTasks,
    writingAttempts,
  ] = await Promise.all([
    fetchAll(supabase, 'profiles', 'id, name, email, role'),
    fetchAll(supabase, 'exam_answers', 'id, attempt_id, question_id, content, updated_at'),
    fetchAll(supabase, 'exam_attempts', 'id, session_id, student_id, result, submitted_at'),
    fetchAll(supabase, 'exam_questions', 'id, exam_id, order_index, prompt'),
    fetchAll(
      supabase,
      'exam_review_items',
      'id, review_task_id, order_index, prompt, answer_content, updated_at'
    ),
    fetchAll(supabase, 'exam_review_tasks', 'id, attempt_id, status'),
    fetchAll(supabase, 'exam_review_item_assets', 'id, item_id, caption'),
    fetchAll(
      supabase,
      'task_submissions',
      'id, student_task_id, submission_type, content, updated_at'
    ),
    fetchAll(supabase, 'student_tasks', 'id, student_id, assignment_id'),
    fetchAll(supabase, 'writing_attempts', 'id, session_id, student_id, ocr_text, updated_at'),
  ])

  const profileMap = new Map(profiles.map((row) => [row.id, row]))
  const attemptMap = new Map(examAttempts.map((row) => [row.id, row]))
  const questionMap = new Map(examQuestions.map((row) => [row.id, row]))
  const reviewTaskMap = new Map(reviewTasks.map((row) => [row.id, row]))
  const reviewItemMap = new Map(reviewItems.map((row) => [row.id, row]))
  const studentTaskMap = new Map(studentTasks.map((row) => [row.id, row]))

  const who = (studentId) => {
    const profile = profileMap.get(studentId)
    return profile ? `${profile.name ?? '(이름없음)'} <${profile.email}>` : '(알 수 없음)'
  }

  const candidates = []

  for (const row of examAnswers) {
    if (!row.content?.trim()) continue
    const attempt = attemptMap.get(row.attempt_id)
    const question = questionMap.get(row.question_id)
    candidates.push({
      source: 'exam_answers.content',
      id: row.id,
      student: who(attempt?.student_id),
      body: row.content,
      updatedAt: row.updated_at,
      context: `session=${attempt?.session_id ?? '?'} result=${attempt?.result ?? '?'} 문항#${
        (question?.order_index ?? 0) + 1
      }`,
    })
  }

  for (const row of reviewItems) {
    if (!row.answer_content?.trim()) continue
    const task = reviewTaskMap.get(row.review_task_id)
    const attempt = task ? attemptMap.get(task.attempt_id) : null
    candidates.push({
      source: 'exam_review_items.answer_content',
      id: row.id,
      student: who(attempt?.student_id),
      body: row.answer_content,
      updatedAt: row.updated_at,
      context: `task=${row.review_task_id} 문항#${(row.order_index ?? 0) + 1}`,
    })
  }

  for (const row of reviewAssets) {
    if (!row.caption?.trim()) continue
    const item = reviewItemMap.get(row.item_id)
    const task = item ? reviewTaskMap.get(item.review_task_id) : null
    const attempt = task ? attemptMap.get(task.attempt_id) : null
    candidates.push({
      source: 'exam_review_item_assets.caption',
      id: row.id,
      student: who(attempt?.student_id),
      body: row.caption,
      updatedAt: item?.updated_at ?? null,
      context: `item=${row.item_id}`,
    })
  }

  for (const row of taskSubmissions) {
    if (!row.content?.trim()) continue
    const studentTask = studentTaskMap.get(row.student_task_id)
    candidates.push({
      source: `task_submissions.content(${row.submission_type})`,
      id: row.id,
      student: who(studentTask?.student_id),
      body: row.content,
      updatedAt: row.updated_at,
      context: `student_task=${row.student_task_id}`,
    })
  }

  for (const row of writingAttempts) {
    if (!row.ocr_text?.trim()) continue
    candidates.push({
      source: 'writing_attempts.ocr_text',
      id: row.id,
      student: who(row.student_id),
      body: row.ocr_text,
      updatedAt: row.updated_at,
      context: `session=${row.session_id}`,
    })
  }

  const targetGrams = trigrams(normalize(target))
  const scored = candidates
    .map((candidate) => {
      const normalized = normalize(candidate.body)
      const grams = trigrams(normalized)
      const long = normalized.length >= MIN_CHARS
      return {
        ...candidate,
        score: jaccard(targetGrams, grams),
        containment: long ? containment(targetGrams, grams) : 0,
        length: normalized.length,
      }
    })
    .map((row) => ({ ...row, rank: Math.max(row.score, row.containment) }))
    .filter((row) => row.rank >= MIN_SCORE)
    .sort((a, b) => b.rank - a.rank)

  console.log(`\n후보 텍스트 ${candidates.length}건 중 임계값(${MIN_SCORE}) 이상 ${scored.length}건\n`)

  if (scored.length === 0) {
    console.log('유사한 답안이 없습니다. --min 값을 낮춰 다시 시도해 보세요.')
    return
  }

  for (const [index, row] of scored.slice(0, LIMIT).entries()) {
    console.log('─'.repeat(90))
    console.log(
      `${String(index + 1).padStart(2)}. 유사도 ${row.score.toFixed(3)} / 포함율 ${row.containment.toFixed(
        3
      )} / 길이 ${row.length}자`
    )
    console.log(`    출처: ${row.source}  (id=${row.id})`)
    console.log(`    학생: ${row.student}`)
    console.log(`    맥락: ${row.context}`)
    console.log(`    수정: ${row.updatedAt ?? '-'}`)
    console.log(`    본문: ${FULL ? row.body : row.body.replace(/\s+/g, ' ').slice(0, 300)}`)
  }
  console.log('─'.repeat(90))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
