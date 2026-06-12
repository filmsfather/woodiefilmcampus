#!/usr/bin/env node
/**
 * 지원가능대학 레포트 - 학생 1명 데이터 리셋 스크립트(테스트용).
 *
 * 지정한 이메일의 학생이 "제출한 서류"와 "선택한 대학(분류/협의/컨설팅/발행)"을
 * 모두 삭제해 처음부터 다시 테스트할 수 있도록 초기화한다.
 *
 * 삭제 대상:
 *   [서류]
 *     - university_report_snapshots  (→ assets/courses/evaluations/metric_cache 까지 cascade)
 *     - university_report_assets 가 가리키는 Storage(university-reports) 원본 PDF
 *     - university_report_eligibility (사전조사)
 *   [대학 선택]
 *     - university_report_university_wishes (1차 분류)
 *     - university_wishlists               (→ items/messages 까지 cascade)
 *     - university_report_consult_requests (컨설팅 방향)
 *     - university_report_publications     (발행)
 *
 * 환경: .env.local 의 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 사용.
 *
 * 실행:
 *   node scripts/reset-university-report.mjs --dry                       # 삭제될 건수만 출력(실삭제 X)
 *   node scripts/reset-university-report.mjs                             # 기본 student2@naver.com 리셋
 *   node scripts/reset-university-report.mjs --email=someone@naver.com   # 다른 이메일 리셋
 *   node scripts/reset-university-report.mjs --keep-eligibility          # 사전조사는 보존
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'

const DRY = process.argv.includes('--dry')
const KEEP_ELIGIBILITY = process.argv.includes('--keep-eligibility')
const emailArg = process.argv.find((a) => a.startsWith('--email='))
const EMAIL = (emailArg ? emailArg.split('=')[1] : 'student2@naver.com').trim()
const BUCKET = 'university-reports'

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

async function main() {
  loadEnv()
  const { createClient } = await import('@supabase/supabase-js')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('환경변수(NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)가 없습니다.')
    process.exit(1)
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  // 1. 학생 식별
  const { data: student, error: studentErr } = await supabase
    .from('profiles')
    .select('id, name, email, role')
    .eq('email', EMAIL)
    .maybeSingle()

  if (studentErr) {
    console.error(`학생 조회 실패: ${studentErr.message}`)
    process.exit(1)
  }
  if (!student) {
    console.error(`이메일에 해당하는 계정을 찾지 못했습니다: ${EMAIL}`)
    process.exit(1)
  }

  const studentId = student.id
  console.log(`대상 계정: ${student.name ?? '(이름없음)'} <${student.email}> [${student.role}] id=${studentId}`)
  console.log(DRY ? '── DRY RUN (실제 삭제하지 않음) ──\n' : '── 리셋 실행 ──\n')

  // 2. 스냅샷 및 연결된 Storage 자산 경로 수집
  const { data: snapshots } = await supabase
    .from('university_report_snapshots')
    .select('id')
    .eq('student_id', studentId)
  const snapshotIds = (snapshots ?? []).map((s) => s.id)

  let assetPaths = []
  if (snapshotIds.length > 0) {
    const { data: assets } = await supabase
      .from('university_report_assets')
      .select('path')
      .in('snapshot_id', snapshotIds)
    assetPaths = (assets ?? []).map((a) => a.path).filter(Boolean)
  }

  // 3. 건수 집계(보고용)
  const counts = {}
  const countTable = async (table, column = 'student_id') => {
    const { count } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq(column, studentId)
    counts[table] = count ?? 0
  }
  await Promise.all([
    countTable('university_report_snapshots'),
    countTable('university_report_publications'),
    countTable('university_report_consult_requests'),
    countTable('university_report_university_wishes'),
    countTable('university_wishlists'),
    countTable('university_report_eligibility'),
  ])

  console.log('현재 데이터 현황:')
  console.log(`  - 성적표 스냅샷(snapshots) : ${counts.university_report_snapshots}건 (Storage 파일 ${assetPaths.length}개)`)
  console.log(`  - 사전조사(eligibility)    : ${counts.university_report_eligibility}건${KEEP_ELIGIBILITY ? ' (보존)' : ''}`)
  console.log(`  - 1차 분류(wishes)         : ${counts.university_report_university_wishes}건`)
  console.log(`  - 희망대학 협의(wishlists) : ${counts.university_wishlists}건`)
  console.log(`  - 컨설팅 방향(consult)     : ${counts.university_report_consult_requests}건`)
  console.log(`  - 발행(publications)       : ${counts.university_report_publications}건`)
  console.log('')

  if (DRY) {
    console.log('[DRY] 위 데이터가 삭제됩니다. 실제 삭제하려면 --dry 없이 다시 실행하세요.')
    return
  }

  // 4. Storage 원본 PDF 삭제
  if (assetPaths.length > 0) {
    const { error: rmErr } = await supabase.storage.from(BUCKET).remove(assetPaths)
    if (rmErr) {
      console.error(`! Storage 삭제 실패(계속 진행): ${rmErr.message}`)
    } else {
      console.log(`✓ Storage 파일 ${assetPaths.length}개 삭제`)
    }
  }

  // 5. DB 삭제 (자식 → 부모 순서 무관: 모두 student_id 기준, cascade 활용)
  const deleteBy = async (table) => {
    const { error } = await supabase.from(table).delete().eq('student_id', studentId)
    if (error) {
      console.error(`! ${table} 삭제 실패: ${error.message}`)
    } else {
      console.log(`✓ ${table} 삭제 완료`)
    }
  }

  // 발행/컨설팅/분류/협의 먼저 정리(스냅샷 cascade 와 독립적으로도 안전하게)
  await deleteBy('university_report_publications')
  await deleteBy('university_report_consult_requests')
  await deleteBy('university_report_university_wishes')
  await deleteBy('university_wishlists') // → items / messages cascade
  // 스냅샷 삭제 → assets / courses / evaluations / metric_cache / (snapshot 연결 발행) cascade
  await deleteBy('university_report_snapshots')
  if (!KEEP_ELIGIBILITY) {
    await deleteBy('university_report_eligibility')
  }

  console.log('\n완료: 리셋이 끝났습니다. 처음부터 다시 테스트할 수 있습니다.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
