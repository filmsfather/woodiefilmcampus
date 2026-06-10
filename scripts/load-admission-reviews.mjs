#!/usr/bin/env node
/**
 * 합격 복기 적재 스크립트.
 *
 * scripts/output/reviews.json 을 읽어서:
 *   1) PDF에서 본문 이미지(>=200x200)를 추출해 Storage 'admission-reviews' 버킷에 업로드
 *   2) admission_reviews / admission_review_images 에 insert
 *
 * 전제:  supabase/migrations/108_admission_reviews.sql 를 먼저 적용해 둘 것.
 * 환경:  .env.local 의 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 사용.
 *
 * 실행:
 *   node scripts/load-admission-reviews.mjs --dry     # 이미지 추출만 검증(DB/업로드 X)
 *   node scripts/load-admission-reviews.mjs           # 실제 적재(이미 있는 source_file은 건너뜀)
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const DRY = process.argv.includes('--dry')
const SRC_DIR = path.resolve('university/Success review')
const REVIEWS = path.resolve('scripts/output/reviews.json')
const BUCKET = 'admission-reviews'
const MIN_DIM = 200

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

const EXT_CONTENT_TYPE = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  ppm: 'image/x-portable-pixmap',
  pbm: 'image/x-portable-bitmap',
}

/** pdfimages -list 로 이미지 번호 → {type,width,height} 맵을 만든다. */
function listImages(pdf) {
  let out = ''
  try {
    out = execFileSync('pdfimages', ['-list', pdf], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  } catch {
    return new Map()
  }
  const map = new Map()
  for (const line of out.split('\n').slice(2)) {
    const c = line.trim().split(/\s+/)
    if (c.length < 5) continue
    const num = Number.parseInt(c[1], 10)
    const type = c[2]
    const w = Number.parseInt(c[3], 10)
    const h = Number.parseInt(c[4], 10)
    if (!Number.isFinite(num)) continue
    map.set(num, { type, w, h })
  }
  return map
}

/** PDF에서 본문 이미지(충분히 큰 것)만 추출. [{buffer, ext, w, h}] 반환. */
function extractImages(pdf) {
  const meta = listImages(pdf)
  const keepNums = new Set(
    [...meta.entries()]
      .filter(([, v]) => v.type === 'image' && v.w >= MIN_DIM && v.h >= MIN_DIM)
      .map(([num]) => num)
  )
  if (keepNums.size === 0) return []

  const tmp = mkdtempSync(path.join(os.tmpdir(), 'arv-'))
  try {
    execFileSync('pdfimages', ['-all', pdf, path.join(tmp, 'img')], { maxBuffer: 64 * 1024 * 1024 })
    const files = readdirSync(tmp).sort()
    const out = []
    const seen = new Set()
    for (const f of files) {
      const m = f.match(/img-(\d+)\.(\w+)$/)
      if (!m) continue
      const num = Number.parseInt(m[1], 10)
      if (!keepNums.has(num)) continue
      const buffer = readFileSync(path.join(tmp, f))
      const hash = createHash('md5').update(buffer).digest('hex')
      if (seen.has(hash)) continue // 여러 페이지에 반복된 동일 이미지 제거
      seen.add(hash)
      const info = meta.get(num)
      out.push({ buffer, ext: m[2].toLowerCase(), w: info?.w ?? null, h: info?.h ?? null })
    }
    return out
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

async function main() {
  const reviews = JSON.parse(readFileSync(REVIEWS, 'utf8'))

  if (DRY) {
    let totalImgs = 0
    let withImgs = 0
    for (const r of reviews) {
      if (r.images_meaningful === 0) continue
      const imgs = extractImages(path.join(SRC_DIR, r.source_file))
      if (imgs.length > 0) {
        withImgs += 1
        totalImgs += imgs.length
        console.log(`• ${r.source_file.normalize('NFC')} → ${imgs.length}장 (${imgs.map((i) => `${i.w}x${i.h}.${i.ext}`).join(', ')})`)
      }
    }
    console.log(`\n[DRY] 이미지 보유 글 ${withImgs}건 / 총 ${totalImgs}장 추출 가능. (DB/업로드는 건너뜀)`)
    return
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

  let inserted = 0
  let skipped = 0
  let uploadedImgs = 0
  let failed = 0

  for (const r of reviews) {
    const sourceFile = r.source_file
    // 멱등성: 동일 source_file 존재 시 건너뜀.
    const { data: exist } = await supabase
      .from('admission_reviews')
      .select('id')
      .eq('source_file', sourceFile)
      .maybeSingle()
    if (exist) {
      skipped += 1
      continue
    }

    const { data: row, error: insErr } = await supabase
      .from('admission_reviews')
      .insert({
        university_id: r.university_id,
        university_label: r.university_label,
        admission_year: r.admission_year,
        posted_at: r.posted_at,
        admission_track: r.admission_track,
        stage: r.stage,
        student_name: r.student_name,
        title: r.title,
        body: r.body,
        source_file: sourceFile,
      })
      .select('id')
      .single()

    if (insErr || !row) {
      console.error(`✗ insert 실패: ${sourceFile.normalize('NFC')} → ${insErr?.message}`)
      failed += 1
      continue
    }

    const reviewId = row.id
    const imgs = r.images_meaningful > 0 ? extractImages(path.join(SRC_DIR, sourceFile)) : []
    let order = 0
    for (const img of imgs) {
      const ext = EXT_CONTENT_TYPE[img.ext] ? img.ext : 'png'
      const storagePath = `${reviewId}/img-${String(order).padStart(3, '0')}.${ext}`
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, img.buffer, {
          contentType: EXT_CONTENT_TYPE[ext] ?? 'application/octet-stream',
          upsert: true,
        })
      if (upErr) {
        console.error(`  ! 이미지 업로드 실패: ${storagePath} → ${upErr.message}`)
        continue
      }
      await supabase.from('admission_review_images').insert({
        review_id: reviewId,
        storage_path: storagePath,
        sort_order: order,
        width: img.w,
        height: img.h,
      })
      uploadedImgs += 1
      order += 1
    }

    inserted += 1
    if (inserted % 25 === 0) console.log(`... ${inserted}건 적재`)
  }

  console.log(
    `\n완료: 신규 ${inserted}건 / 건너뜀 ${skipped}건 / 실패 ${failed}건 / 이미지 ${uploadedImgs}장 업로드`
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
