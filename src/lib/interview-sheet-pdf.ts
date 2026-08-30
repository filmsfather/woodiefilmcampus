import { jsPDF } from "jspdf"
import html2canvas from "html2canvas-pro"

import type {
  InterviewSheetDetail,
  InterviewSheetItem,
  InterviewSheetItemSource,
} from "@/types/interview-sheet"

const PAGE_WIDTH_MM = 210
const PAGE_HEIGHT_MM = 297
const MARGIN_MM = 12
/** A4 비율에 맞춘 화면 밖 렌더링 폭 (px) */
const RENDER_WIDTH_PX = 794

const SOURCE_LABELS: Record<InterviewSheetItemSource, string> = {
  template: "기본 질문",
  student: "학생 질문",
  teacher: "선생님 질문",
}

const FONT_FAMILY = "-apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif"

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(iso))
}

function buildAssetListHtml(item: InterviewSheetItem): string {
  if (item.assets.length === 0) {
    return ""
  }

  const rows = item.assets
    .map((asset) => {
      const label =
        asset.kind === "link"
          ? `${escapeHtml(asset.title || asset.externalUrl || "링크")}${
              asset.externalUrl && asset.title ? ` (${escapeHtml(asset.externalUrl)})` : ""
            }`
          : escapeHtml(asset.title || (asset.mimeType?.startsWith("image/") ? "이미지 파일" : "PDF 파일"))
      const kindLabel = asset.kind === "link" ? "링크" : "파일"
      return `
        <li style="font-size: 11px; color: #475569; line-height: 1.7; word-break: break-all;">
          [${kindLabel}] ${label}
        </li>`
    })
    .join("")

  return `
    <div style="margin-top: 10px;">
      <p style="margin: 0 0 4px 0; font-size: 10px; font-weight: 600; color: #94a3b8;">첨부</p>
      <ul style="margin: 0; padding-left: 16px;">${rows}</ul>
    </div>
  `
}

function buildItemHtml(item: InterviewSheetItem, index: number): string {
  const answerHtml = item.answer?.trim()
    ? `<p style="margin: 0; font-size: 12px; color: #1e293b; line-height: 1.8; white-space: pre-wrap; word-break: break-word;">${escapeHtml(item.answer)}</p>`
    : `<p style="margin: 0; font-size: 12px; color: #94a3b8;">아직 답변이 작성되지 않았습니다.</p>`

  const feedbackHtml = item.teacherFeedback?.trim()
    ? `
      <div style="margin-top: 10px; padding: 10px 12px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px;">
        <p style="margin: 0 0 4px 0; font-size: 10px; font-weight: 600; color: #b45309;">
          선생님 피드백${item.feedbackByName ? ` · ${escapeHtml(item.feedbackByName)}` : ""}
        </p>
        <p style="margin: 0; font-size: 12px; color: #1e293b; line-height: 1.8; white-space: pre-wrap; word-break: break-word;">${escapeHtml(item.teacherFeedback)}</p>
      </div>`
    : ""

  return `
    <div data-pdf-block style="margin-bottom: 14px; padding: 14px 16px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <span style="font-size: 12px; font-weight: 700; color: #0f172a;">질문 ${index + 1}</span>
        <span style="font-size: 10px; color: #64748b; padding: 1px 8px; border: 1px solid #cbd5e1; border-radius: 9999px;">${SOURCE_LABELS[item.source]}</span>
      </div>
      <p style="margin: 0 0 10px 0; font-size: 13px; font-weight: 600; color: #0f172a; line-height: 1.7; white-space: pre-wrap; word-break: break-word;">${escapeHtml(item.prompt)}</p>
      <div style="padding: 10px 12px; background: #f8fafc; border-radius: 6px;">
        <p style="margin: 0 0 4px 0; font-size: 10px; font-weight: 600; color: #94a3b8;">답변</p>
        ${answerHtml}
      </div>
      ${feedbackHtml}
      ${buildAssetListHtml(item)}
    </div>
  `
}

function buildSheetHtml(sheet: InterviewSheetDetail): string {
  const answeredCount = sheet.items.filter((item) => Boolean(item.answer?.trim())).length

  const itemsHtml =
    sheet.items.length > 0
      ? sheet.items.map((item, index) => buildItemHtml(item, index)).join("")
      : `<div data-pdf-block style="padding: 24px; text-align: center; font-size: 12px; color: #94a3b8; border: 1px dashed #cbd5e1; border-radius: 8px;">등록된 질문이 없습니다.</div>`

  return `
    <div style="font-family: ${FONT_FAMILY}; background: #ffffff; padding: 4px; box-sizing: border-box;">
      <div data-pdf-block style="margin-bottom: 20px; padding-bottom: 14px; border-bottom: 2px solid #0f172a;">
        <h1 style="margin: 0 0 6px 0; font-size: 20px; font-weight: 800; color: #0f172a;">${escapeHtml(sheet.studentName)} 학생 면접지</h1>
        <p style="margin: 0; font-size: 11px; color: #64748b;">
          질문 ${sheet.items.length}개 · 답변 완료 ${answeredCount}개 · ${formatDate(sheet.updatedAt)} 기준
        </p>
      </div>
      ${itemsHtml}
    </div>
  `
}

/**
 * 캔버스 전체를 A4 페이지 단위로 자를 위치를 계산한다.
 * 가능한 한 질문 블록 경계에서 자르고, 한 블록이 한 페이지보다 길면 강제로 자른다.
 */
function computeCutPositions(
  canvasHeight: number,
  pageContentHeightPx: number,
  blockBottoms: number[]
): number[] {
  const cuts: number[] = []
  let pageStart = 0

  while (pageStart < canvasHeight - 1) {
    const limit = pageStart + pageContentHeightPx
    if (limit >= canvasHeight) {
      cuts.push(canvasHeight)
      break
    }

    const fittingBottoms = blockBottoms.filter((bottom) => bottom > pageStart + 1 && bottom <= limit)
    const cut = fittingBottoms.length > 0 ? Math.max(...fittingBottoms) : limit
    cuts.push(cut)
    pageStart = cut
  }

  return cuts
}

export async function generateInterviewSheetPdf(sheet: InterviewSheetDetail): Promise<void> {
  const container = document.createElement("div")
  container.style.position = "fixed"
  container.style.left = "-10000px"
  container.style.top = "0"
  container.style.width = `${RENDER_WIDTH_PX}px`
  container.innerHTML = buildSheetHtml(sheet)
  document.body.appendChild(container)

  try {
    const content = container.firstElementChild as HTMLElement
    const canvas = await html2canvas(content, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    })

    const contentRect = content.getBoundingClientRect()
    const canvasPxPerCssPx = canvas.height / contentRect.height

    const blockBottoms = Array.from(content.querySelectorAll<HTMLElement>("[data-pdf-block]")).map(
      (el) => (el.getBoundingClientRect().bottom - contentRect.top) * canvasPxPerCssPx
    )

    const contentWidthMm = PAGE_WIDTH_MM - MARGIN_MM * 2
    const pxPerMm = canvas.width / contentWidthMm
    const pageContentHeightPx = (PAGE_HEIGHT_MM - MARGIN_MM * 2) * pxPerMm

    const cuts = computeCutPositions(canvas.height, pageContentHeightPx, blockBottoms)

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })

    let sliceStart = 0
    cuts.forEach((cut, pageIndex) => {
      const sliceHeight = Math.ceil(cut - sliceStart)
      if (sliceHeight <= 0) {
        return
      }

      const pageCanvas = document.createElement("canvas")
      pageCanvas.width = canvas.width
      pageCanvas.height = sliceHeight
      const ctx = pageCanvas.getContext("2d")
      if (!ctx) {
        throw new Error("캔버스 컨텍스트를 생성할 수 없습니다.")
      }
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
      ctx.drawImage(canvas, 0, sliceStart, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight)

      if (pageIndex > 0) {
        doc.addPage()
      }
      doc.addImage(
        pageCanvas.toDataURL("image/png"),
        "PNG",
        MARGIN_MM,
        MARGIN_MM,
        contentWidthMm,
        sliceHeight / pxPerMm
      )

      sliceStart = cut
    })

    const safeName = sheet.studentName.replace(/\s+/g, "_")
    doc.save(`면접지_${safeName}.pdf`)
  } finally {
    document.body.removeChild(container)
  }
}
