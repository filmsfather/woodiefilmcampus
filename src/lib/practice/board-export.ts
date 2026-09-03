import { formatPracticeRoomLabel, formatSlotDateLabel, getPracticeTimeline } from '@/lib/practice/shared'
import {
  PRACTICE_ATTEMPT_STATUS_LABELS,
  PRACTICE_TYPE_LABELS,
  type PracticeDayBoard,
  type PracticeSlotView,
} from '@/types/practice'

// 예약 보드(시간 × 선생님)를 엑셀/PDF로 내보내기 위한 공용 모델.
// 화면 컴포넌트와 분리해 두 포맷이 같은 데이터를 쓰도록 한다.

interface BoardExportTeacher {
  id: string
  name: string
  roomNo: number | null
}

type BoardExportCell =
  | { kind: 'empty' }
  | { kind: 'closed' }
  | { kind: 'break' }
  | { kind: 'open'; online: boolean }
  | {
      kind: 'booked'
      online: boolean
      studentName: string
      className: string | null
      universityName: string
      practiceTypeLabel: string
      limitMinutes: number | null
      arrivalLabel: string | null
      examStartLabel: string | null
      examEndLabel: string | null
      statusLabel: string
    }

interface BoardExportRow {
  time: string
  cells: BoardExportCell[]
}

interface BoardFlatRow {
  time: string
  /** 정렬용 실기 시작 시각(ISO). 문제 미배정이면 null. */
  opensAt: string | null
  teacherName: string
  roomLabel: string
  studentName: string
  className: string
  universityName: string
  practiceTypeLabel: string
  limitMinutes: number | ''
  arrivalLabel: string
  examStartLabel: string
  examEndLabel: string
  statusLabel: string
  audienceLabel: string
}

interface BoardExportModel {
  slotDate: string
  dateLabel: string
  teachers: BoardExportTeacher[]
  rows: BoardExportRow[]
  flatRows: BoardFlatRow[]
  slotCount: number
  bookedCount: number
}

function describeBookingStatus(slot: PracticeSlotView): string {
  const booking = slot.booking
  if (!booking) return ''
  if (booking.hasFeedback) return '피드백 완료'
  if (booking.attemptStatus) return PRACTICE_ATTEMPT_STATUS_LABELS[booking.attemptStatus]
  return '대기'
}

function toCell(slot: PracticeSlotView | undefined): BoardExportCell {
  if (!slot) return { kind: 'empty' }
  if (slot.status === 'closed') return { kind: 'closed' }
  if (slot.status === 'break') return { kind: 'break' }

  const booking = slot.booking
  const online = slot.audience === 'online'
  if (!booking) return { kind: 'open', online }

  const timeline = getPracticeTimeline(booking.opensAt, booking.deadlineAt)
  return {
    kind: 'booked',
    online,
    studentName: booking.studentName,
    className: booking.className,
    universityName: booking.universityName,
    practiceTypeLabel: PRACTICE_TYPE_LABELS[booking.practiceType],
    limitMinutes: timeline?.limitMinutes ?? null,
    arrivalLabel: timeline?.arrivalLabel ?? null,
    examStartLabel: timeline?.examStartLabel ?? null,
    examEndLabel: timeline?.examEndLabel ?? null,
    statusLabel: describeBookingStatus(slot),
  }
}

export function buildBoardExportModel(board: PracticeDayBoard): BoardExportModel {
  const roomByTeacher = new Map<string, number | null>()
  for (const slot of board.slots) {
    if (!roomByTeacher.has(slot.teacherId) || roomByTeacher.get(slot.teacherId) === null) {
      roomByTeacher.set(slot.teacherId, slot.roomNo)
    }
  }

  const teachers: BoardExportTeacher[] = board.teachers.map((teacher) => ({
    id: teacher.id,
    name: teacher.name,
    roomNo: roomByTeacher.get(teacher.id) ?? null,
  }))

  const slotMap = new Map<string, PracticeSlotView>()
  for (const slot of board.slots) {
    slotMap.set(`${slot.teacherId}|${slot.startTime}`, slot)
  }

  const rows: BoardExportRow[] = board.timeLabels.map((time) => ({
    time,
    cells: teachers.map((teacher) => toCell(slotMap.get(`${teacher.id}|${time}`))),
  }))

  const flatRows: BoardFlatRow[] = []
  for (const time of board.timeLabels) {
    for (const teacher of teachers) {
      const slot = slotMap.get(`${teacher.id}|${time}`)
      const cell = toCell(slot)
      if (cell.kind !== 'booked' || !slot) continue
      flatRows.push({
        time,
        opensAt: slot.booking?.opensAt ?? null,
        teacherName: teacher.name,
        roomLabel: formatPracticeRoomLabel(slot.roomNo),
        studentName: cell.studentName,
        className: cell.className ?? '',
        universityName: cell.universityName,
        practiceTypeLabel: cell.practiceTypeLabel,
        limitMinutes: cell.limitMinutes ?? '',
        arrivalLabel: cell.arrivalLabel ?? '',
        examStartLabel: cell.examStartLabel ?? '',
        examEndLabel: cell.examEndLabel ?? '',
        statusLabel: cell.statusLabel,
        audienceLabel: cell.online ? '온라인반' : '일반',
      })
    }
  }

  return {
    slotDate: board.slotDate,
    dateLabel: formatSlotDateLabel(board.slotDate),
    teachers,
    rows,
    flatRows,
    slotCount: board.slots.length,
    bookedCount: board.slots.filter((slot) => slot.booking).length,
  }
}

/** 출석체크용 정렬: 등원(=실기 시작) 시각 오름차순, 미정은 맨 뒤, 같은 시각은 이름순. */
function buildAttendanceRows(model: BoardExportModel): BoardFlatRow[] {
  return [...model.flatRows].sort((a, b) => {
    const aTime = a.opensAt ? Date.parse(a.opensAt) : Number.POSITIVE_INFINITY
    const bTime = b.opensAt ? Date.parse(b.opensAt) : Number.POSITIVE_INFINITY
    if (aTime !== bTime) return aTime - bTime
    return a.studentName.localeCompare(b.studentName, 'ko')
  })
}

function teacherHeaderLabel(teacher: BoardExportTeacher): string {
  return teacher.roomNo ? `${teacher.name} (${formatPracticeRoomLabel(teacher.roomNo)})` : teacher.name
}

/** 표 셀에 들어갈 여러 줄 텍스트. 엑셀은 줄바꿈, PDF는 <br>로 바꿔 쓴다. */
function cellLines(cell: BoardExportCell): string[] {
  switch (cell.kind) {
    case 'empty':
      return []
    case 'closed':
      return ['닫힘']
    case 'break':
      return ['쉬는 시간']
    case 'open':
      return [cell.online ? '빈 슬롯 (온라인반)' : '빈 슬롯']
    case 'booked': {
      const lines = [
        cell.className ? `${cell.studentName} (${cell.className})` : cell.studentName,
        `${cell.universityName} · ${cell.practiceTypeLabel}${cell.online ? ' · 온라인' : ''}`,
      ]
      if (cell.limitMinutes !== null && cell.arrivalLabel) {
        lines.push(`실기 ${cell.limitMinutes}분 · 등원 ${cell.arrivalLabel}`)
      }
      if (cell.statusLabel) {
        lines.push(cell.statusLabel)
      }
      return lines
    }
  }
}

function fileStem(model: BoardExportModel): string {
  return `모의실기_예약현황_${model.slotDate}`
}

// 엑셀 ---------------------------------------------------------------------------------

export async function exportPracticeBoardToXlsx(board: PracticeDayBoard): Promise<void> {
  const XLSX = await import('xlsx')
  const model = buildBoardExportModel(board)

  const gridHeader = ['시간', ...model.teachers.map(teacherHeaderLabel)]
  const gridBody = model.rows.map((row) => [row.time, ...row.cells.map((cell) => cellLines(cell).join('\n'))])
  const gridSheet = XLSX.utils.aoa_to_sheet([
    [`${model.dateLabel} 모의실기 예약 현황`],
    [`슬롯 ${model.slotCount}개 · 예약 ${model.bookedCount}건`],
    [],
    gridHeader,
    ...gridBody,
  ])
  gridSheet['!cols'] = [{ wch: 8 }, ...model.teachers.map(() => ({ wch: 30 }))]
  // 셀 안 줄바꿈 수만큼 행 높이를 잡아 엑셀에서 바로 여러 줄이 보이게 한다. (앞 4행은 제목/요약/공백/헤더)
  gridSheet['!rows'] = [
    { hpt: 20 },
    { hpt: 16 },
    { hpt: 8 },
    { hpt: 18 },
    ...gridBody.map((row) => {
      const maxLines = Math.max(1, ...row.slice(1).map((value) => String(value).split('\n').length))
      return { hpt: 15 * maxLines + 4 }
    }),
  ]

  const listHeader = [
    '날짜',
    '시간',
    '선생님',
    '고사장',
    '학생',
    '반',
    '대학',
    '유형',
    '실기시간(분)',
    '등원시간',
    '응시 시작',
    '응시 마감',
    '상태',
    '대상',
  ]
  const listBody = model.flatRows.map((row) => [
    model.slotDate,
    row.time,
    row.teacherName,
    row.roomLabel,
    row.studentName,
    row.className,
    row.universityName,
    row.practiceTypeLabel,
    row.limitMinutes,
    row.arrivalLabel,
    row.examStartLabel,
    row.examEndLabel,
    row.statusLabel,
    row.audienceLabel,
  ])
  const listSheet = XLSX.utils.aoa_to_sheet([listHeader, ...listBody])
  listSheet['!cols'] = [
    { wch: 12 },
    { wch: 7 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 12 },
    { wch: 16 },
    { wch: 8 },
    { wch: 11 },
    { wch: 9 },
    { wch: 9 },
    { wch: 9 },
    { wch: 11 },
    { wch: 8 },
  ]

  const attendanceHeader = [
    '등원',
    '학생',
    '반',
    '대학',
    '유형',
    '실기 시작',
    '실기 마감',
    '실기시간(분)',
    '1:1 피드백',
    '선생님',
    '고사장',
    '출석',
    '비고',
  ]
  const attendanceBody = buildAttendanceRows(model).map((row) => [
    row.arrivalLabel || '미정',
    row.studentName,
    row.className,
    row.universityName,
    row.practiceTypeLabel,
    row.examStartLabel,
    row.examEndLabel,
    row.limitMinutes,
    row.time,
    row.teacherName,
    row.roomLabel,
    '',
    '',
  ])
  const attendanceSheet = XLSX.utils.aoa_to_sheet([
    [`${model.dateLabel} 출석체크 (등원시간순)`],
    [`예약 ${model.bookedCount}건 · 등원은 실기 시작 10분 전 기준`],
    [],
    attendanceHeader,
    ...attendanceBody,
  ])
  attendanceSheet['!cols'] = [
    { wch: 7 },
    { wch: 10 },
    { wch: 12 },
    { wch: 16 },
    { wch: 8 },
    { wch: 9 },
    { wch: 9 },
    { wch: 11 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 6 },
    { wch: 20 },
  ]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, gridSheet, '예약 보드')
  XLSX.utils.book_append_sheet(workbook, attendanceSheet, '출석체크')
  XLSX.utils.book_append_sheet(workbook, listSheet, '예약 목록')
  XLSX.writeFile(workbook, `${fileStem(model)}.xlsx`)
}

// PDF ----------------------------------------------------------------------------------
// jsPDF 기본 폰트는 한글을 지원하지 않아 HTML을 화면 밖에 렌더링한 뒤
// 캔버스로 찍어 A4 페이지에 나눠 담는다. (payroll/pdf.ts, interview-sheet-pdf.ts와 동일 방식)
// 시간표는 가로(landscape), 출석체크표는 세로(portrait)로 한 파일에 이어 붙인다.

type PdfOrientation = 'landscape' | 'portrait'

const PDF_MARGIN_MM = 10
const PDF_FONT_FAMILY = "-apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif"

/** A4 방향별 페이지 크기(mm)와 화면 밖 렌더링 폭(px, 96dpi 기준 A4 폭). */
const PDF_PAGE_SPECS: Record<PdfOrientation, { widthMm: number; heightMm: number; renderWidthPx: number }> = {
  landscape: { widthMm: 297, heightMm: 210, renderWidthPx: 1123 },
  portrait: { widthMm: 210, heightMm: 297, renderWidthPx: 794 },
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function cellHtml(cell: BoardExportCell): string {
  const base = 'padding: 5px 6px; border: 1px solid #cbd5e1; vertical-align: top; font-size: 10px; line-height: 1.45;'
  switch (cell.kind) {
    case 'empty':
      return `<td style="${base}"></td>`
    case 'closed':
      return `<td style="${base} color: #94a3b8; background: #f8fafc;">닫힘</td>`
    case 'break':
      return `<td style="${base} color: #b45309; background: #fffbeb;">쉬는 시간</td>`
    case 'open':
      return `<td style="${base} color: #94a3b8;">${cell.online ? '빈 슬롯 (온라인반)' : '빈 슬롯'}</td>`
    case 'booked': {
      const name = cell.className
        ? `${escapeHtml(cell.studentName)} <span style="color: #64748b; font-weight: 400;">(${escapeHtml(cell.className)})</span>`
        : escapeHtml(cell.studentName)
      const timeline =
        cell.limitMinutes !== null && cell.arrivalLabel
          ? `<div style="color: #0f172a;">실기 <b>${cell.limitMinutes}분</b> · 등원 <b>${cell.arrivalLabel}</b></div>`
          : ''
      return `<td style="${base} background: #ecfdf5;">
        <div style="font-weight: 700; color: #0f172a;">${name}</div>
        <div style="color: #334155;">${escapeHtml(cell.universityName)} · ${cell.practiceTypeLabel}${cell.online ? ' · 온라인' : ''}</div>
        ${timeline}
        ${cell.statusLabel ? `<div style="color: #64748b;">${escapeHtml(cell.statusLabel)}</div>` : ''}
      </td>`
    }
  }
}

function buildBoardPdfHtml(model: BoardExportModel): string {
  const th = 'padding: 6px; border: 1px solid #cbd5e1; background: #f1f5f9; font-size: 10px; font-weight: 700; color: #0f172a; text-align: left;'
  const timeTd = 'padding: 5px 6px; border: 1px solid #cbd5e1; font-size: 10px; font-weight: 700; color: #334155; white-space: nowrap; vertical-align: top;'

  const headerRow = `<tr data-pdf-block>
    <th style="${th} width: 44px;">시간</th>
    ${model.teachers.map((teacher) => `<th style="${th}">${escapeHtml(teacherHeaderLabel(teacher))}</th>`).join('')}
  </tr>`

  const bodyRows = model.rows
    .map(
      (row) => `<tr data-pdf-block>
        <td style="${timeTd}">${row.time}</td>
        ${row.cells.map(cellHtml).join('')}
      </tr>`
    )
    .join('')

  return `
    <div style="font-family: ${PDF_FONT_FAMILY}; background: #ffffff; box-sizing: border-box; padding: 2px;">
      <div data-pdf-block style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 2px solid #0f172a;">
        <h1 style="margin: 0; font-size: 16px; font-weight: 800; color: #0f172a;">${escapeHtml(model.dateLabel)} 모의실기 예약 현황</h1>
        <span style="font-size: 10px; color: #64748b;">슬롯 ${model.slotCount}개 · 예약 ${model.bookedCount}건 · 등원은 실기 시작 10분 전 기준</span>
      </div>
      <table style="width: 100%; border-collapse: collapse; table-layout: fixed;">
        <thead>${headerRow}</thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
  `
}

/** 등원시간순 출석체크표. 등원 시각이 바뀌는 행에 굵은 윗선을 넣어 같은 시각 학생을 묶어 보인다. */
function buildAttendancePdfHtml(model: BoardExportModel): string {
  const rows = buildAttendanceRows(model)
  const th = 'padding: 6px 5px; border: 1px solid #cbd5e1; background: #f1f5f9; font-size: 10px; font-weight: 700; color: #0f172a; text-align: left; white-space: nowrap;'
  const td = 'padding: 6px 5px; border: 1px solid #cbd5e1; font-size: 10.5px; color: #1e293b; vertical-align: middle; line-height: 1.4;'
  const checkbox = '<div style="width: 13px; height: 13px; margin: 0 auto; border: 1.5px solid #334155; border-radius: 2px;"></div>'

  const bodyRows =
    rows.length === 0
      ? `<tr data-pdf-block><td colspan="9" style="${td} text-align: center; color: #94a3b8; padding: 20px;">예약된 학생이 없습니다.</td></tr>`
      : rows
          .map((row, index) => {
            const arrival = row.arrivalLabel || '미정'
            const isGroupStart = index === 0 || (rows[index - 1]?.arrivalLabel || '미정') !== arrival
            const rowStyle = isGroupStart && index > 0 ? 'border-top: 2px solid #334155;' : ''
            const arrivalCell = isGroupStart
              ? `<b style="font-size: 12px; color: #0f172a;">${arrival}</b>`
              : `<span style="color: #94a3b8;">${arrival}</span>`
            const examLabel =
              row.examStartLabel && row.examEndLabel
                ? `${row.examStartLabel} ~ ${row.examEndLabel}${row.limitMinutes !== '' ? ` <span style="color: #64748b;">(${row.limitMinutes}분)</span>` : ''}`
                : '<span style="color: #94a3b8;">미정</span>'
            return `<tr data-pdf-block style="${rowStyle}">
              <td style="${td} text-align: center; white-space: nowrap; width: 48px;">${arrivalCell}</td>
              <td style="${td} font-weight: 700; color: #0f172a; white-space: nowrap;">${escapeHtml(row.studentName)}</td>
              <td style="${td} color: #64748b;">${escapeHtml(row.className)}</td>
              <td style="${td}">${escapeHtml(row.universityName)} · ${row.practiceTypeLabel}</td>
              <td style="${td} white-space: nowrap;">${examLabel}</td>
              <td style="${td} text-align: center; white-space: nowrap;">${row.time}</td>
              <td style="${td} white-space: nowrap;">${escapeHtml(row.teacherName)}<br /><span style="color: #64748b; font-size: 9.5px;">${escapeHtml(row.roomLabel)}</span></td>
              <td style="${td} width: 34px;">${checkbox}</td>
              <td style="${td} width: 90px;"></td>
            </tr>`
          })
          .join('')

  return `
    <div style="font-family: ${PDF_FONT_FAMILY}; background: #ffffff; box-sizing: border-box; padding: 2px;">
      <div data-pdf-block style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 2px solid #0f172a;">
        <h1 style="margin: 0; font-size: 16px; font-weight: 800; color: #0f172a;">${escapeHtml(model.dateLabel)} 출석체크 <span style="font-size: 11px; font-weight: 600; color: #64748b;">등원시간순</span></h1>
        <span style="font-size: 10px; color: #64748b;">예약 ${model.bookedCount}건 · 등원은 실기 시작 10분 전 기준</span>
      </div>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr data-pdf-block>
            <th style="${th} text-align: center;">등원</th>
            <th style="${th}">학생</th>
            <th style="${th}">반</th>
            <th style="${th}">대학 · 유형</th>
            <th style="${th}">실기 시간</th>
            <th style="${th} text-align: center;">1:1 피드백</th>
            <th style="${th}">선생님</th>
            <th style="${th} text-align: center;">출석</th>
            <th style="${th}">비고</th>
          </tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
  `
}

/** 캔버스를 페이지 단위로 자를 위치. 가능한 한 행 경계에서 자르고, 한 행이 페이지보다 길면 강제로 자른다. */
function computeCutPositions(canvasHeight: number, pageContentHeightPx: number, blockBottoms: number[]): number[] {
  const cuts: number[] = []
  let pageStart = 0

  while (pageStart < canvasHeight - 1) {
    const limit = pageStart + pageContentHeightPx
    if (limit >= canvasHeight) {
      cuts.push(canvasHeight)
      break
    }
    const fitting = blockBottoms.filter((bottom) => bottom > pageStart + 1 && bottom <= limit)
    const cut = fitting.length > 0 ? Math.max(...fitting) : limit
    cuts.push(cut)
    pageStart = cut
  }

  return cuts
}

type JsPdfDoc = InstanceType<(typeof import('jspdf'))['jsPDF']>
type Html2Canvas = (typeof import('html2canvas-pro'))['default']

/**
 * HTML 한 덩어리를 지정 방향의 A4 페이지들로 잘라 문서 뒤에 이어 붙인다.
 * `isFirstSection`이면 jsPDF가 만들어 둔 첫 페이지를 그대로 쓰고, 아니면 새 페이지부터 시작한다.
 */
async function appendHtmlPages(
  doc: JsPdfDoc,
  html2canvas: Html2Canvas,
  html: string,
  orientation: PdfOrientation,
  isFirstSection: boolean
): Promise<void> {
  const spec = PDF_PAGE_SPECS[orientation]

  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '-10000px'
  container.style.top = '0'
  container.style.width = `${spec.renderWidthPx}px`
  container.innerHTML = html
  document.body.appendChild(container)

  try {
    const content = container.firstElementChild as HTMLElement
    const canvas = await html2canvas(content, { scale: 2, useCORS: true, backgroundColor: '#ffffff' })

    const contentRect = content.getBoundingClientRect()
    const canvasPxPerCssPx = canvas.height / contentRect.height
    const blockBottoms = Array.from(content.querySelectorAll<HTMLElement>('[data-pdf-block]')).map(
      (el) => (el.getBoundingClientRect().bottom - contentRect.top) * canvasPxPerCssPx
    )

    const contentWidthMm = spec.widthMm - PDF_MARGIN_MM * 2
    const pxPerMm = canvas.width / contentWidthMm
    const pageContentHeightPx = (spec.heightMm - PDF_MARGIN_MM * 2) * pxPerMm
    const cuts = computeCutPositions(canvas.height, pageContentHeightPx, blockBottoms)

    let sliceStart = 0
    cuts.forEach((cut, pageIndex) => {
      const sliceHeight = Math.ceil(cut - sliceStart)
      if (sliceHeight <= 0) return

      const pageCanvas = document.createElement('canvas')
      pageCanvas.width = canvas.width
      pageCanvas.height = sliceHeight
      const ctx = pageCanvas.getContext('2d')
      if (!ctx) {
        throw new Error('캔버스 컨텍스트를 생성할 수 없습니다.')
      }
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
      ctx.drawImage(canvas, 0, sliceStart, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight)

      if (!(isFirstSection && pageIndex === 0)) {
        doc.addPage('a4', orientation)
      }
      doc.addImage(
        pageCanvas.toDataURL('image/png'),
        'PNG',
        PDF_MARGIN_MM,
        PDF_MARGIN_MM,
        contentWidthMm,
        sliceHeight / pxPerMm
      )
      sliceStart = cut
    })
  } finally {
    document.body.removeChild(container)
  }
}

export async function exportPracticeBoardToPdf(board: PracticeDayBoard): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')])
  const model = buildBoardExportModel(board)

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  await appendHtmlPages(doc, html2canvas, buildBoardPdfHtml(model), 'landscape', true)
  await appendHtmlPages(doc, html2canvas, buildAttendancePdfHtml(model), 'portrait', false)

  doc.save(`${fileStem(model)}.pdf`)
}
