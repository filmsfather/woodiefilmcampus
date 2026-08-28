#!/usr/bin/env node
/**
 * 합격 복기 PDF를 대학별 폴더로 정리해 zip으로 내보낸다.
 *
 * scripts/output/reviews.json 의 메타데이터로 원본 PDF를 분류·리네임한다:
 *   학생복기/<대학 약칭>/<학년도>_<학생라벨>[_<단계>].pdf
 *
 * 학생 이름은 대학 폴더 단위로 학생A, 학생B … 로 익명화하고,
 * 실명 대조표는 zip 밖(university/exports)에만 CSV로 남긴다.
 *
 * 실행:
 *   node scripts/export-admission-reviews.mjs --dry   # 파일 목록만 출력
 *   node scripts/export-admission-reviews.mjs         # 복사 + zip 생성
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { crc32, deflateRawSync } from 'node:zlib'

const DRY = process.argv.includes('--dry')
const SRC_DIR = path.resolve('university/Success review')
const REVIEWS = path.resolve('scripts/output/reviews.json')
const EXPORT_DIR = path.resolve('university/exports')
const ROOT_NAME = '학생복기'
const OUT_DIR = path.join(EXPORT_DIR, ROOT_NAME)
const ZIP_PATH = path.join(EXPORT_DIR, `${ROOT_NAME}.zip`)
const MAP_PATH = path.join(EXPORT_DIR, `${ROOT_NAME}_매핑.csv`)

/** macOS 파일명은 NFD로 저장되어 있어 비교·출력 전 NFC로 맞춘다. */
const nfc = (value) => (value ?? '').normalize('NFC')

/** 파일명에 쓸 수 없는 문자 정리. 가운뎃점은 하이픈으로 눕힌다. */
function sanitize(value) {
  return nfc(value)
    .replace(/·/g, '-')
    .replace(/[/\\:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * zip 아카이브를 직접 작성한다.
 *
 * macOS 기본 zip/ditto 는 엔트리에 UTF-8 이름 플래그(0x800)를 세우지 않아,
 * 한글 파일명이 Windows 탐색기에서 깨진다. 그래서 포맷을 직접 쓴다.
 *
 * entries: [{ name, data }] — name 은 '/' 구분자의 아카이브 내 경로(디렉터리는 '/'로 끝냄).
 */
function buildZip(entries) {
  const UTF8_FLAG = 0x0800
  const now = new Date()
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()

  const locals = []
  const centrals = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const isDir = entry.name.endsWith('/')
    const raw = isDir ? Buffer.alloc(0) : entry.data
    // PDF 는 이미 압축돼 있어 이득이 크지 않지만 내부 비압축 스트림에서 10~40% 줄어든다.
    const body = isDir ? Buffer.alloc(0) : deflateRawSync(raw, { level: 6 })
    const method = isDir ? 0 : 8
    const sum = isDir ? 0 : crc32(raw)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(UTF8_FLAG, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(dosTime, 10)
    local.writeUInt16LE(dosDate, 12)
    local.writeUInt32LE(sum, 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(name.length, 26)
    locals.push(local, name, body)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(0x031e, 4) // version made by: unix / zip 3.0
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(UTF8_FLAG, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt16LE(dosTime, 12)
    central.writeUInt16LE(dosDate, 14)
    central.writeUInt32LE(sum, 16)
    central.writeUInt32LE(body.length, 20)
    central.writeUInt32LE(raw.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(isDir ? 0x41ed0010 : 0x81a40000, 38) // 외부 속성: drwxr-xr-x / -rw-r--r--
    central.writeUInt32LE(offset, 42)
    centrals.push(central, name)

    offset += local.length + name.length + body.length
  }

  const centralBuf = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralBuf.length, 12)
  end.writeUInt32LE(offset, 16)

  return Buffer.concat([...locals, centralBuf, end])
}

/** 0 → A, 25 → Z, 26 → AA (스프레드시트 컬럼식). */
function letterFor(index) {
  let n = index
  let out = ''
  do {
    out = String.fromCharCode(65 + (n % 26)) + out
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return out
}

/**
 * university_id → 폴더명.
 * 원본 라벨이 '서경대'/'서경대학교'처럼 흔들리므로 최빈 라벨(동률이면 짧은 쪽)을 대표로 삼는다.
 */
function buildUniversityNames(reviews) {
  const tally = new Map()
  for (const r of reviews) {
    const key = r.university_id ?? `label:${nfc(r.university_label)}`
    const counts = tally.get(key) ?? new Map()
    const label = nfc(r.university_label) || key
    counts.set(label, (counts.get(label) ?? 0) + 1)
    tally.set(key, counts)
  }

  const names = new Map()
  for (const [key, counts] of tally) {
    const best = [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].length - b[0].length
    )[0][0]
    names.set(key, sanitize(best) || '기타')
  }
  return names
}

function main() {
  const reviews = JSON.parse(readFileSync(REVIEWS, 'utf8')).filter((r) =>
    r.source_file?.toLowerCase().endsWith('.pdf')
  )
  const universityNames = buildUniversityNames(reviews)

  const groups = new Map()
  for (const r of reviews) {
    const key = r.university_id ?? `label:${nfc(r.university_label)}`
    const list = groups.get(key) ?? []
    list.push(r)
    groups.set(key, list)
  }

  const plan = []
  const mapping = []

  for (const [key, rows] of groups) {
    const folder = universityNames.get(key)

    // 게시일 순으로 정렬해야 학생 라벨(A, B, …)이 실행마다 동일하게 나온다.
    rows.sort(
      (a, b) =>
        (a.posted_at ?? '9999').localeCompare(b.posted_at ?? '9999') ||
        nfc(a.source_file).localeCompare(nfc(b.source_file))
    )

    const labels = new Map()
    const used = new Set()

    for (const r of rows) {
      const name = nfc(r.student_name)
      let studentLabel = '학생미상'
      if (name) {
        if (!labels.has(name)) labels.set(name, `학생${letterFor(labels.size)}`)
        studentLabel = labels.get(name)
      }

      const parts = [r.admission_year != null ? String(r.admission_year) : '연도미상', studentLabel]
      const stage = sanitize(r.stage).replace(/ /g, '') // '이미지 분석' → '이미지분석'
      if (stage) parts.push(stage)

      let base = parts.join('_')
      if (used.has(base)) {
        let seq = 2
        while (used.has(`${base}-${seq}`)) seq += 1
        base = `${base}-${seq}`
      }
      used.add(base)

      const target = path.join(folder, `${base}.pdf`)
      plan.push({ source: r.source_file, target })
      mapping.push({
        대학: folder,
        새파일명: `${base}.pdf`,
        학생라벨: studentLabel,
        실제학생명: name || '',
        학년도: r.admission_year ?? '',
        단계: stage,
        제목: nfc(r.title),
        원본파일명: nfc(r.source_file),
      })
    }
  }

  const missing = plan.filter((p) => !existsSync(path.join(SRC_DIR, p.source)))
  if (missing.length > 0) {
    console.error(`원본 PDF ${missing.length}건을 찾을 수 없습니다.`)
    for (const m of missing.slice(0, 10)) console.error(`  - ${nfc(m.source)}`)
    process.exit(1)
  }

  if (DRY) {
    let current = ''
    for (const p of [...plan].sort((a, b) => a.target.localeCompare(b.target))) {
      const folder = path.dirname(p.target)
      if (folder !== current) {
        current = folder
        console.log(`\n${folder}/`)
      }
      console.log(`  ${path.basename(p.target)}`)
    }
    console.log(`\n[DRY] 대학 ${groups.size}개 폴더 / PDF ${plan.length}건. (복사·zip은 건너뜀)`)
    return
  }

  rmSync(OUT_DIR, { recursive: true, force: true })
  rmSync(ZIP_PATH, { force: true })
  mkdirSync(OUT_DIR, { recursive: true })

  for (const p of plan) {
    const dest = path.join(OUT_DIR, p.target)
    mkdirSync(path.dirname(dest), { recursive: true })
    copyFileSync(path.join(SRC_DIR, p.source), dest)
  }

  const csvCell = (value) => `"${String(value).replace(/"/g, '""')}"`
  const headers = Object.keys(mapping[0])
  const csv = [
    headers.join(','),
    ...mapping.map((row) => headers.map((h) => csvCell(row[h])).join(',')),
  ].join('\n')
  writeFileSync(MAP_PATH, `\uFEFF${csv}`, 'utf8') // BOM: 엑셀 한글 깨짐 방지

  const entries = [{ name: `${ROOT_NAME}/` }]
  for (const folder of [...new Set(plan.map((p) => path.dirname(p.target)))].sort()) {
    entries.push({ name: `${ROOT_NAME}/${folder}/` })
  }
  for (const p of [...plan].sort((a, b) => a.target.localeCompare(b.target))) {
    entries.push({
      name: `${ROOT_NAME}/${p.target.split(path.sep).join('/')}`,
      data: readFileSync(path.join(OUT_DIR, p.target)),
    })
  }
  writeFileSync(ZIP_PATH, buildZip(entries))

  console.log(`대학 ${groups.size}개 폴더 / PDF ${plan.length}건 정리 완료.`)
  console.log(`  zip   : ${ZIP_PATH}`)
  console.log(`  매핑  : ${MAP_PATH} (zip 미포함)`)
}

main()
