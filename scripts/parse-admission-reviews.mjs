#!/usr/bin/env node
/**
 * 합격 복기 PDF 파서 (dry-run).
 *
 * `university/Success review/` 의 PDF를 pdftotext로 읽어 메타데이터/본문을 추출하고,
 * 결과를 scripts/output/reviews.json 으로 떨군다. DB/스토리지는 건드리지 않는다.
 *
 * 실행:  node scripts/parse-admission-reviews.mjs
 *
 * 추출 항목: university_id(슬러그 매핑) / admission_year(학년도 보정) / posted_at /
 *            admission_track(수시·정시) / stage(면접·글쓰기·실기·1·2차) / student_name /
 *            title / body / 이미지 개수.
 */

import { execFileSync } from 'node:child_process'
import { readdirSync, mkdirSync, writeFileSync, statSync } from 'node:fs'
import path from 'node:path'

const SRC_DIR = path.resolve('university/Success review')
const OUT_DIR = path.resolve('scripts/output')

// universities.ts 프리셋 슬러그 ← 카페 표기 별칭. (긴 별칭 우선 매칭)
const UNIVERSITY_ALIASES = [
  ['karts', ['한국예술종합학교', '한예종', '예종']],
  ['chungang', ['중앙대학교', '중앙대']],
  ['sungkyunkwan', ['성균관대학교', '성균관대', '성대']],
  ['kyunghee', ['경희대학교', '경희대']],
  ['dongguk', ['동국대학교', '동국대']],
  ['kookmin', ['국민대학교', '국민대', '궁민대']],
  ['soongsil', ['숭실대학교', '숭실대']],
  ['sejong', ['세종대학교', '세종대']],
  ['sangmyung', ['상명대학교', '상명대']],
  ['seokyeong', ['서경대학교', '서경대']],
  ['myongji', ['명지대학교', '명지대', '명지']],
  ['dankook', ['단국대학교', '단국대', '당국대', '당국때']],
  ['gyeonggi', ['경기대학교', '경기대']],
  ['sungkyul', ['성결대학교', '성결대']],
  ['suwon', ['수원대학교', '수원대']],
  ['daejin', ['대진대학교', '대진대']],
  ['pyeongtaek', ['평택대학교', '평택대']],
  ['yongin', ['용인대학교', '용인대']],
  ['joongbu', ['중부대학교', '중부대']],
  ['inha', ['인하대학교', '인하대']],
  ['cheongju', ['청주대학교', '청주대']],
  ['hoseo', ['호서대학교', '호서대']],
  ['soonchunhyang', ['순천향대학교', '순천향대']],
  ['mokwon', ['목원대학교', '목원대']],
  ['dongseo', ['동서대학교', '동서대']],
  ['kyungsung', ['경성대학교', '경성대']],
  ['baekje', ['백제예술대학교', '백제예대']],
  ['dima', ['동아방송예술대학교', '동아방송예대', '동방예대', '동아방송', '동방예술대']],
  ['seoularts', ['서울예술대학교', '서울예대', '서울예술대']],
  ['seoil', ['서일대학교', '서일대']],
  ['baekseok-arts', ['백석예술대학교', '백석예대', '백석예술대', '백석']],
]

// 미매핑이지만 표기를 남겨둘 대학(프리셋에 없음).
const UNMAPPED_ALIASES = [
  ['추계예술대학교', ['추계예술대학교', '추계예대']],
  ['상명대학교(천안)', ['상명대 천안']],
]

// 별칭을 길이 내림차순으로 펼친다(부분일치 충돌 방지).
const ALIAS_LOOKUP = []
for (const [slug, aliases] of UNIVERSITY_ALIASES) {
  for (const a of aliases) ALIAS_LOOKUP.push({ slug, label: null, alias: a })
}
for (const [label, aliases] of UNMAPPED_ALIASES) {
  for (const a of aliases) ALIAS_LOOKUP.push({ slug: null, label, alias: a })
}
ALIAS_LOOKUP.sort((a, b) => b.alias.length - a.alias.length)

const STAGE_KEYWORDS = ['1차', '2차', '면접', '글쓰기', '작문', '실기', '영상 비평', '이미지 분석']

const NOISE_EXACT = new Set([
  '1:1 채팅',
  '구독',
  'URL 복사',
  '클린봇',
  '댓글알림',
  '등록',
  '댓글을 남겨보세요',
])

// 본문에 섞여 들어오는 카페 공지/안내 문구(부분 일치로 제거).
const NOISE_INCLUDES = ['공개설정 탭에서', '네이버 검색설정', '글쓰기전 필독', '체.크.해.제']

function pdfToText(file) {
  return execFileSync('pdftotext', ['-enc', 'UTF-8', '-nopgbrk', file, '-'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
}

function countMeaningfulImages(file) {
  // pdfimages -list: page num type width height color comp bpc enc interp object ID ...
  let out = ''
  try {
    out = execFileSync('pdfimages', ['-list', file], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  } catch {
    return { raw: 0, meaningful: 0 }
  }
  const lines = out.split('\n').slice(2) // skip header rows
  let raw = 0
  let meaningful = 0
  for (const line of lines) {
    const cols = line.trim().split(/\s+/)
    if (cols.length < 5) continue
    const w = Number.parseInt(cols[3], 10)
    const h = Number.parseInt(cols[4], 10)
    if (!Number.isFinite(w) || !Number.isFinite(h)) continue
    raw += 1
    // 카페 UI 아이콘/프로필/클린봇 등 작은 이미지는 제외(본문 첨부만 카운트).
    if (w >= 200 && h >= 200) meaningful += 1
  }
  return { raw, meaningful }
}

function matchUniversity(text) {
  for (const { slug, label, alias } of ALIAS_LOOKUP) {
    if (text.includes(alias)) {
      return { slug, label: label ?? null, alias }
    }
  }
  return null
}

function detectTrack(text) {
  if (text.includes('정시')) return '정시'
  if (text.includes('수시')) return '수시'
  return null
}

function detectStage(text) {
  const found = []
  for (const kw of STAGE_KEYWORDS) {
    if (text.includes(kw) && !found.includes(kw)) found.push(kw)
  }
  return found.length > 0 ? found.join('·') : null
}

/** 게시일 → 학년도 보정. 가을(9~12월) 수시는 다음 해 학번. 초봄(1~3월) 정시는 그 해 학번. */
function deriveAdmissionYear(year, month) {
  if (year == null) return { year: null, confidence: 'none' }
  if (month >= 9) return { year: year + 1, confidence: 'high' }
  if (month <= 3) return { year, confidence: 'high' }
  return { year: year + 1, confidence: 'low' } // 4~8월 게시는 애매 → 다가오는 학년도로 가정
}

// 작성자/멤버 등급 꼬리표.
const AUTHOR_SUFFIXES = ['구독', '새싹멤버', '열매멤버', '가지', '카페매니저', '카페지기', '1:1 채팅']

// 학생 이름이 아닌 작성자(매니저 등)는 학생명에서 제외.
const NON_STUDENT_AUTHORS = new Set(['원장쌤', '원장', '매니저', '운영자', '관리자'])

// 파일명에서 이름이 아닌 단어들(이름 추출 시 제외).
const NAME_STOPWORDS = new Set([
  '복기', '면접', '글쓰기', '작문', '실기', '합격', '합격복기', '수시', '정시', '최종', '최종본',
  '예비', '차석', '으뜸', '눈물', '일순', '시험', '영상', '비평', '이미지', '분석', '특별전형',
  '복이', '볶이', '정시복기', '면접복기', '예대', '방송영상과', '연출', '전공', '편입', '글쓰기전',
  '복기문', '최종본', '합격자', '자료', '복기본', '구성', '이야기', '예술경영', '방송', '영화',
  '눈물의', '징크스대로',
])

/** "김현지2", "김태완TW" 처럼 한글 이름 뒤 영문/숫자 꼬리표를 정리. */
function normalizeName(name) {
  if (!name) return null
  const m = name.match(/^([가-힣]{2,4})[A-Za-z0-9]+$/)
  return m ? m[1] : name
}

function stripFileName(base) {
  return base
    .replace(/\.(pdf|hwp|hwpx)$/i, '')
    .replace(/_?\s*네이버 카페$/i, '')
    .trim()
}

/** 파일명에서 학생 이름(2~4자 한글) 추출. 대학 별칭/불용어는 제외. */
function extractNameFromFileName(fileLabel) {
  const isUniAlias = (t) => ALIAS_LOOKUP.some((a) => a.alias.includes(t) || t.includes(a.alias))
  const valid = (t) => /^[가-힣]{2,4}$/.test(t) && !NAME_STOPWORDS.has(t) && !isUniAlias(t)
  // 1) "_이름" 또는 "- 이름" 같은 꼬리 패턴.
  const tail = fileLabel.match(/[_\-]\s*([가-힣]{2,4})\s*$/)
  if (tail && valid(tail[1])) return tail[1]
  // 2) 토큰 단위로 첫 유효 이름.
  for (const token of fileLabel.replace(/[()\d.~!]/g, ' ').split(/[\s_\-]+/)) {
    if (valid(token)) return token
  }
  return null
}

/** 파일명에서 4자리 연도 추출(2010~2099). */
function extractYearFromFileName(fileLabel) {
  const m = fileLabel.match(/\b(20[1-4]\d)\b/)
  return m ? Number.parseInt(m[1], 10) : null
}

function cleanBodyLines(lines) {
  const cleaned = []
  for (const raw of lines) {
    const line = raw.replace(/\t/g, ' ').trim()
    if (!line) {
      if (cleaned.length && cleaned[cleaned.length - 1] !== '') cleaned.push('')
      continue
    }
    if (/^--\s*\d+\s*of\s*\d+\s*--$/.test(line)) continue
    if (NOISE_EXACT.has(line)) continue
    if (NOISE_INCLUDES.some((n) => line.includes(n))) continue
    cleaned.push(line)
  }
  while (cleaned.length && cleaned[0] === '') cleaned.shift()
  while (cleaned.length && cleaned[cleaned.length - 1] === '') cleaned.pop()
  return cleaned.join('\n')
}

const DATE_RE = /(\d{4})\.(\d{2})\.(\d{2})\.\s+(\d{2}):(\d{2})/

/**
 * 카페 글 본문/메타 추출. 두 가지 export 레이아웃을 모두 처리한다.
 *   A) 졸업생 / 날짜 / 합격자 복기 자료 / 제목[대학] / 작성자 구독 / 댓글 URL복사 / 본문
 *   B) 합격자 복기 자료 / 제목(대학 포함) / 작성자 등급 / 구독 / 날짜 / 댓글 URL복사 / 본문
 */
function parseArticle(rawLines) {
  const warnings = []
  const L = rawLines.map((s) => s.replace(/\t/g, ' ').trim())
  const nextNonEmpty = (from) => {
    for (let i = from; i < L.length; i += 1) if (L[i]) return i
    return -1
  }

  // 게시일
  let postedAt = null
  let postedYear = null
  let postedMonth = null
  let dateIdx = L.findIndex((l) => DATE_RE.test(l))
  if (dateIdx >= 0) {
    const [, y, m, d, hh, mm] = L[dateIdx].match(DATE_RE)
    postedYear = Number.parseInt(y, 10)
    postedMonth = Number.parseInt(m, 10)
    postedAt = `${y}-${m}-${d}T${hh}:${mm}:00+09:00`
  } else {
    warnings.push('no_date')
  }

  // 제목/작성자: '합격자 복기 자료' 카테고리 줄 다음 비어있지 않은 줄이 제목.
  const catIdx = L.findIndex((l) => /복기 자료$/.test(l))
  let title = null
  let tagInner = null
  let studentName = null
  let authorIdx = -1
  if (catIdx >= 0) {
    const titleIdx = nextNonEmpty(catIdx + 1)
    if (titleIdx >= 0) {
      const tl = L[titleIdx]
      const tag = tl.match(/\[([^\]]+)\]/)
      tagInner = tag ? tag[1].replace(/\s+/g, '') : null
      // 태그는 제목 앞/뒤 어디든 올 수 있으므로 통째로 제거.
      title = (tag ? tl.replace(/\[[^\]]+\]/, '') : tl).trim() || null
      authorIdx = nextNonEmpty(titleIdx + 1)
      if (authorIdx >= 0) {
        let token = L[authorIdx].split(/\s+/)[0]
        if (token && !AUTHOR_SUFFIXES.includes(token) && !NOISE_EXACT.has(token)) {
          studentName = token
        }
      }
    }
  }
  if (!studentName) warnings.push('no_student_name')

  // 본문 시작: 메타 블록(날짜/댓글URL/작성자) 이후.
  const commentUrlIdx = L.findIndex((l) => l.includes('URL 복사'))
  const startIdx = Math.max(dateIdx, commentUrlIdx, authorIdx)
  // 본문 끝: 댓글 영역 마커.
  let endIdx = L.length
  for (let i = Math.max(startIdx + 1, 0); i < L.length; i += 1) {
    if (/^댓글알림/.test(L[i]) || L[i].includes('클린봇') || L[i] === '댓글을 남겨보세요') {
      endIdx = i
      break
    }
  }
  const body = cleanBodyLines(rawLines.slice(Math.max(startIdx + 1, 0), endIdx))
  if (!body) warnings.push('empty_body')

  const structured = catIdx >= 0 || dateIdx >= 0
  return { postedAt, postedYear, postedMonth, title, tagInner, studentName, body, structured, warnings }
}

function parseFile(file) {
  const base = path.basename(file)
  const text = pdfToText(file)
  const rawLines = text.split('\n')

  const parsed = parseArticle(rawLines)
  const fileLabel = stripFileName(base)
  const warnings = [...parsed.warnings]

  if (!parsed.structured || !parsed.title) {
    // 카페 구조가 없는 파일(변환 hwp 등): 파일명을 제목으로, 전체를 본문으로.
    if (!parsed.title) parsed.title = fileLabel
    if (!parsed.body) parsed.body = cleanBodyLines(rawLines)
    if (!warnings.includes('unstructured')) warnings.push('unstructured')
  }

  // 제목에 남은 "_ 네이버 카페" 꼬리 제거.
  if (parsed.title) {
    parsed.title = parsed.title.replace(/\s*_?\s*네이버 카페\s*$/i, '').replace(/\s*_\s*$/, '').trim()
  }

  // 작성자가 매니저면 학생명에서 제외.
  if (parsed.studentName && NON_STUDENT_AUTHORS.has(parsed.studentName)) {
    parsed.studentName = null
  }
  parsed.studentName = normalizeName(parsed.studentName)
  // 학생명 폴백: 파일명에서 추출.
  if (!parsed.studentName) {
    const fromFile = extractNameFromFileName(fileLabel)
    if (fromFile) {
      parsed.studentName = fromFile
      warnings.push('student_name_from_filename')
    }
  }

  // 대학: 파일명 우선(가장 신뢰도 높음) → 태그 → 제목.
  const uni =
    matchUniversity(fileLabel) ||
    (parsed.tagInner && matchUniversity(parsed.tagInner)) ||
    (parsed.title && matchUniversity(parsed.title)) ||
    null

  const haystack = `${parsed.title ?? ''} ${fileLabel}`
  const track = detectTrack(haystack)
  const stage = detectStage(haystack)
  let year = deriveAdmissionYear(parsed.postedYear, parsed.postedMonth)
  // 연도 폴백: 게시일이 없으면 파일명의 4자리 연도 사용.
  if (year.year == null) {
    const fy = extractYearFromFileName(fileLabel)
    if (fy != null) year = { year: fy, confidence: 'filename' }
  }
  const images = countMeaningfulImages(file)

  if (!uni) warnings.push('university_unmapped')
  if (uni && !uni.slug) warnings.push('university_no_preset')

  return {
    source_file: base,
    title: parsed.title,
    university_id: uni?.slug ?? null,
    university_label: uni?.label ?? uni?.alias ?? parsed.tagInner ?? null,
    admission_year: year.year,
    year_confidence: year.confidence,
    posted_at: parsed.postedAt,
    admission_track: track,
    stage,
    student_name: parsed.studentName,
    body_chars: parsed.body.length,
    body_preview: parsed.body.slice(0, 160),
    body: parsed.body,
    images_raw: images.raw,
    images_meaningful: images.meaningful,
    warnings,
  }
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const files = readdirSync(SRC_DIR)
    .filter((f) => /\.pdf$/i.test(f))
    .filter((f) => statSync(path.join(SRC_DIR, f)).isFile())
    .sort()

  const results = []
  const errors = []
  for (const f of files) {
    const full = path.join(SRC_DIR, f)
    if (/이미 삭제된 글/.test(f)) {
      errors.push({ source_file: f, reason: 'deleted_post_skip' })
      continue
    }
    try {
      results.push(parseFile(full))
    } catch (e) {
      errors.push({ source_file: f, reason: String(e?.message ?? e) })
    }
  }

  // 통계
  const stats = {
    total_pdf: files.length,
    parsed: results.length,
    errors: errors.length,
    university_mapped: results.filter((r) => r.university_id).length,
    university_unmapped: results.filter((r) => !r.university_id).length,
    has_year: results.filter((r) => r.admission_year != null).length,
    low_year_confidence: results.filter((r) => r.year_confidence === 'low').length,
    has_student_name: results.filter((r) => r.student_name).length,
    with_images: results.filter((r) => r.images_meaningful > 0).length,
    empty_body: results.filter((r) => r.warnings.includes('empty_body')).length,
  }

  // 대학별 분포
  const byUniversity = {}
  for (const r of results) {
    const key = r.university_id ?? `(미매핑)${r.university_label ?? ''}`
    byUniversity[key] = (byUniversity[key] ?? 0) + 1
  }

  writeFileSync(path.join(OUT_DIR, 'reviews.json'), JSON.stringify(results, null, 2))
  writeFileSync(
    path.join(OUT_DIR, 'reviews.summary.json'),
    JSON.stringify({ stats, byUniversity, errors }, null, 2)
  )

  console.log(JSON.stringify({ stats, byUniversity, errors }, null, 2))
  console.log(`\n→ scripts/output/reviews.json (${results.length}건)`)
}

main()
