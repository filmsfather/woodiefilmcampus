#!/usr/bin/env node
/**
 * 에세이 보드 누락분 백필 스크립트.
 *
 * 에세이 워크북(type='essay') 과제에 제출된 PDF 제출물 중 essay_posts 레코드가
 * 없는 건을 찾아 essay_posts / essay_post_assets 를 생성한다.
 *
 * 배경: submitPdfSubmission 의 workbook 타입 판별이 학생 RLS 때문에 null 로 떨어져,
 * 2026-06-18 백필 이후의 에세이 제출물에 essay_posts 가 생성되지 않았다. 코드 수정 후
 * 신규 제출은 정상 생성되지만, 그 사이 누락된 기존 제출물은 본 스크립트로 복구한다.
 *
 * 환경: .env.local 의 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 사용.
 *
 * 실행:
 *   node scripts/backfill-essay-posts.mjs --dry   # 생성될 건수만 출력(실제 생성 X)
 *   node scripts/backfill-essay-posts.mjs         # 실제 백필 수행
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'

const DRY = process.argv.includes('--dry')

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

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
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

  // 1. 에세이 워크북 식별
  const { data: essayWorkbooks, error: wbErr } = await supabase
    .from('workbooks')
    .select('id')
    .eq('type', 'essay')
  if (wbErr) {
    console.error(`워크북 조회 실패: ${wbErr.message}`)
    process.exit(1)
  }
  const essayWorkbookIds = (essayWorkbooks ?? []).map((w) => w.id)
  if (essayWorkbookIds.length === 0) {
    console.log('에세이 워크북이 없습니다. 종료.')
    return
  }

  // 2. 에세이 워크북을 쓰는 과제 식별
  const assignmentWorkbook = new Map() // assignment_id -> workbook_id
  for (const ids of chunk(essayWorkbookIds, 100)) {
    const { data, error } = await supabase
      .from('assignments')
      .select('id, workbook_id')
      .in('workbook_id', ids)
    if (error) {
      console.error(`과제 조회 실패: ${error.message}`)
      process.exit(1)
    }
    for (const row of data ?? []) assignmentWorkbook.set(row.id, row.workbook_id)
  }
  const assignmentIds = Array.from(assignmentWorkbook.keys())
  if (assignmentIds.length === 0) {
    console.log('에세이 워크북을 쓰는 과제가 없습니다. 종료.')
    return
  }

  // 3. 해당 과제의 student_tasks
  const studentTaskMeta = new Map() // student_task_id -> {student_id, class_id, assignment_id}
  for (const ids of chunk(assignmentIds, 100)) {
    const { data, error } = await supabase
      .from('student_tasks')
      .select('id, student_id, class_id, assignment_id')
      .in('assignment_id', ids)
    if (error) {
      console.error(`student_tasks 조회 실패: ${error.message}`)
      process.exit(1)
    }
    for (const row of data ?? []) {
      studentTaskMeta.set(row.id, {
        studentId: row.student_id,
        classId: row.class_id,
        assignmentId: row.assignment_id,
      })
    }
  }
  const studentTaskIds = Array.from(studentTaskMeta.keys())
  if (studentTaskIds.length === 0) {
    console.log('대상 student_tasks 가 없습니다. 종료.')
    return
  }

  // 4. PDF 제출물 (item_id is null) 수집
  const submissions = [] // {id, student_task_id, media_asset_id, created_at, updated_at}
  for (const ids of chunk(studentTaskIds, 100)) {
    const { data, error } = await supabase
      .from('task_submissions')
      .select('id, student_task_id, media_asset_id, created_at, updated_at')
      .in('student_task_id', ids)
      .is('item_id', null)
    if (error) {
      console.error(`task_submissions 조회 실패: ${error.message}`)
      process.exit(1)
    }
    for (const row of data ?? []) submissions.push(row)
  }
  if (submissions.length === 0) {
    console.log('대상 제출물이 없습니다. 종료.')
    return
  }

  // 5. 이미 essay_posts 가 있는 submission 제외
  const submissionIds = submissions.map((s) => s.id)
  const existingPostSubs = new Set()
  for (const ids of chunk(submissionIds, 100)) {
    const { data, error } = await supabase
      .from('essay_posts')
      .select('task_submission_id')
      .in('task_submission_id', ids)
    if (error) {
      console.error(`essay_posts 조회 실패: ${error.message}`)
      process.exit(1)
    }
    for (const row of data ?? []) existingPostSubs.add(row.task_submission_id)
  }

  const missing = submissions.filter((s) => !existingPostSubs.has(s.id))

  console.log(`에세이 워크북 ${essayWorkbookIds.length}개 / 과제 ${assignmentIds.length}개 / student_tasks ${studentTaskIds.length}개`)
  console.log(`PDF 제출물 ${submissions.length}건 중 essay_post 누락 ${missing.length}건`)

  if (missing.length === 0) {
    console.log('누락 건이 없습니다. 대표자산 복구만 진행합니다.')
    const repaired = await repairNullMediaPosts(supabase)
    console.log(`\n완료: 0건 생성, ${repaired}건 대표자산 복구.`)
    return
  }

  // 6. 누락 제출물의 첨부(task_submission_assets) 로드
  const missingIds = missing.map((s) => s.id)
  const assetsBySubmission = new Map() // submission_id -> [{media_asset_id, order_index}]
  for (const ids of chunk(missingIds, 100)) {
    const { data, error } = await supabase
      .from('task_submission_assets')
      .select('submission_id, media_asset_id, order_index')
      .in('submission_id', ids)
      .order('order_index', { ascending: true })
    if (error) {
      console.error(`task_submission_assets 조회 실패: ${error.message}`)
      process.exit(1)
    }
    for (const row of data ?? []) {
      if (!assetsBySubmission.has(row.submission_id)) assetsBySubmission.set(row.submission_id, [])
      assetsBySubmission.get(row.submission_id).push({
        mediaAssetId: row.media_asset_id,
        order: typeof row.order_index === 'number' ? row.order_index : 0,
      })
    }
  }

  if (DRY) {
    let withMedia = 0
    for (const s of missing) {
      const atts = (assetsBySubmission.get(s.id) ?? []).filter((a) => a.mediaAssetId)
      const primary = atts[0]?.mediaAssetId ?? s.media_asset_id
      if (primary) withMedia += 1
    }
    console.log(`[DRY] media 확보 가능 ${withMedia}건 생성 예정. --dry 없이 실행하면 실제 생성합니다.`)
    return
  }

  // 7. 생성
  let created = 0
  let skipped = 0
  for (const s of missing) {
    const meta = studentTaskMeta.get(s.student_task_id)
    if (!meta) {
      skipped += 1
      continue
    }

    let atts = (assetsBySubmission.get(s.id) ?? [])
      .filter((a) => a.mediaAssetId)
      .sort((a, b) => a.order - b.order)
    if (atts.length === 0 && s.media_asset_id) {
      atts = [{ mediaAssetId: s.media_asset_id, order: 0 }]
    }
    const primary = atts[0]?.mediaAssetId ?? s.media_asset_id
    if (!primary) {
      skipped += 1
      continue
    }

    const submittedAt = s.updated_at ?? s.created_at ?? new Date().toISOString()
    const workbookId = assignmentWorkbook.get(meta.assignmentId) ?? null

    const { data: postRow, error: postErr } = await supabase
      .from('essay_posts')
      .insert({
        task_submission_id: s.id,
        student_task_id: s.student_task_id,
        student_id: meta.studentId,
        assignment_id: meta.assignmentId,
        class_id: meta.classId,
        workbook_id: workbookId,
        media_asset_id: primary,
        submitted_at: submittedAt,
        hidden_by_student: false,
        is_deleted: false,
      })
      .select('id')
      .single()

    if (postErr || !postRow?.id) {
      console.error(`! essay_post 생성 실패 (submission ${s.id}): ${postErr?.message ?? 'unknown'}`)
      skipped += 1
      continue
    }

    const assetPayload = atts.map((a, idx) => ({
      post_id: postRow.id,
      media_asset_id: a.mediaAssetId,
      order_index: idx,
      created_by: meta.studentId,
    }))
    if (assetPayload.length > 0) {
      const { error: assetErr } = await supabase
        .from('essay_post_assets')
        .upsert(assetPayload, { onConflict: 'post_id,media_asset_id', ignoreDuplicates: true })
      if (assetErr) {
        console.error(`! essay_post_assets 생성 실패 (post ${postRow.id}): ${assetErr.message}`)
      }
    }

    created += 1
  }

  // 8. 복구 패스: media_asset_id 가 null 인 essay_posts (대표자산 트리거로 비워진 케이스) 복구
  const repaired = await repairNullMediaPosts(supabase)

  console.log(`\n완료: ${created}건 생성, ${skipped}건 건너뜀, ${repaired}건 대표자산 복구.`)
}

// media_asset_id 가 null 인 essay_posts 를 원본 제출물의 자산으로 다시 채운다.
async function repairNullMediaPosts(supabase) {
  const { data: nullPosts, error: nullErr } = await supabase
    .from('essay_posts')
    .select('id, task_submission_id, student_id')
    .is('media_asset_id', null)
    .eq('is_deleted', false)
  if (nullErr) {
    console.error(`null-media essay_posts 조회 실패: ${nullErr.message}`)
    return 0
  }

  let repaired = 0
  for (const post of nullPosts ?? []) {
    // 원본 제출물의 첨부 우선, 없으면 submission.media_asset_id
    const { data: tsa } = await supabase
      .from('task_submission_assets')
      .select('media_asset_id, order_index')
      .eq('submission_id', post.task_submission_id)
      .order('order_index', { ascending: true })
    let atts = (tsa ?? [])
      .filter((a) => a.media_asset_id)
      .map((a, i) => ({ mediaAssetId: a.media_asset_id, order: typeof a.order_index === 'number' ? a.order_index : i }))
    if (atts.length === 0) {
      const { data: sub } = await supabase
        .from('task_submissions')
        .select('media_asset_id')
        .eq('id', post.task_submission_id)
        .maybeSingle()
      if (sub?.media_asset_id) atts = [{ mediaAssetId: sub.media_asset_id, order: 0 }]
    }
    const primary = atts[0]?.mediaAssetId ?? null
    if (!primary) continue

    // essay_post_assets 재생성 (트리거가 대표 자산을 설정)
    await supabase.from('essay_post_assets').delete().eq('post_id', post.id)
    const payload = atts.map((a, idx) => ({
      post_id: post.id,
      media_asset_id: a.mediaAssetId,
      order_index: idx,
      created_by: post.student_id,
    }))
    if (payload.length > 0) {
      await supabase
        .from('essay_post_assets')
        .upsert(payload, { onConflict: 'post_id,media_asset_id', ignoreDuplicates: true })
    }
    // 안전망: 트리거 결과와 무관하게 대표 자산을 명시적으로 보정
    await supabase.from('essay_posts').update({ media_asset_id: primary }).eq('id', post.id)
    repaired += 1
  }
  return repaired
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
