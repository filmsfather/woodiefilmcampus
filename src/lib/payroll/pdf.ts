import { jsPDF } from "jspdf"
import html2canvas from "html2canvas-pro"

import type { PayrollCalculationBreakdown, TeacherPayrollProfile } from "./types"

interface PayrollPdfEntry {
  name: string
  payrollProfile: TeacherPayrollProfile
  breakdown: PayrollCalculationBreakdown
}

const DEDUCTION_COLUMNS = [
  { key: "국민연금", shortLabel: "국민연금" },
  { key: "건강보험", shortLabel: "건강보험" },
  { key: "장기요양보험", shortLabel: "장기요양" },
  { key: "고용보험", shortLabel: "고용보험" },
  { key: "프리랜서 원천징수", shortLabel: "원천징수(3.3%)" },
] as const

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 }).format(value)
}

function formatHours(hours: number): string {
  return `${hours}시간`
}

function findDeductionAmount(
  details: Array<{ label: string; amount: number }>,
  key: string
): number | null {
  const match = details.find((d) => d.label.startsWith(key))
  return match ? match.amount : null
}

function buildTableHtml(monthLabel: string, entries: PayrollPdfEntry[]): string {
  const hasAnyInsurance = entries.some((e) => e.payrollProfile.insuranceEnrolled)
  const hasAnyFreelancer = entries.some(
    (e) => e.payrollProfile.contractType === "freelancer"
  )

  const activeDeductionCols = DEDUCTION_COLUMNS.filter((col) => {
    if (col.key === "프리랜서 원천징수") return hasAnyFreelancer
    return hasAnyInsurance
  })

  const totals = {
    totalWorkHours: 0,
    baseSalaryTotal: 0,
    grossPay: 0,
    deductions: new Map<string, number>(),
    deductionsTotal: 0,
    netPay: 0,
  }

  for (const col of activeDeductionCols) {
    totals.deductions.set(col.key, 0)
  }

  for (const entry of entries) {
    totals.totalWorkHours += entry.breakdown.totalWorkHours
    totals.baseSalaryTotal += entry.breakdown.baseSalaryTotal
    totals.grossPay += entry.breakdown.grossPay
    totals.deductionsTotal += entry.breakdown.deductionsTotal
    totals.netPay += entry.breakdown.netPay
    for (const col of activeDeductionCols) {
      const amt = findDeductionAmount(entry.breakdown.deductionDetails, col.key)
      if (amt !== null) {
        totals.deductions.set(col.key, (totals.deductions.get(col.key) ?? 0) + amt)
      }
    }
  }

  const thStyle = `
    padding: 8px 10px;
    font-size: 11px;
    font-weight: 600;
    color: #334155;
    text-align: right;
    white-space: nowrap;
    border-bottom: 2px solid #cbd5e1;
  `
  const thLeftStyle = `${thStyle} text-align: left;`
  const tdStyle = `
    padding: 7px 10px;
    font-size: 11px;
    color: #1e293b;
    text-align: right;
    white-space: nowrap;
    border-bottom: 1px solid #e2e8f0;
  `
  const tdLeftStyle = `${tdStyle} text-align: left;`
  const tdTotalStyle = `
    padding: 8px 10px;
    font-size: 11px;
    font-weight: 700;
    color: #0f172a;
    text-align: right;
    white-space: nowrap;
    border-top: 2px solid #94a3b8;
    background: #f8fafc;
  `
  const tdTotalLeftStyle = `${tdTotalStyle} text-align: left;`
  const badgeBase = `
    display: inline-block;
    font-size: 9px;
    padding: 1px 6px;
    border-radius: 4px;
    margin-left: 6px;
    font-weight: 500;
    vertical-align: middle;
  `
  const insuranceBadge = `${badgeBase} background: #dbeafe; color: #1d4ed8;`
  const freelancerBadge = `${badgeBase} background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1;`

  const deductionHeaders = activeDeductionCols
    .map((col) => `<th style="${thStyle}">${col.shortLabel}</th>`)
    .join("")

  const rows = entries
    .map((entry) => {
      const badge = entry.payrollProfile.insuranceEnrolled
        ? `<span style="${insuranceBadge}">4대보험</span>`
        : `<span style="${freelancerBadge}">3.3%</span>`

      const deductionCells = activeDeductionCols
        .map((col) => {
          const amt = findDeductionAmount(entry.breakdown.deductionDetails, col.key)
          return `<td style="${tdStyle}">${amt !== null ? formatCurrency(amt) : "-"}</td>`
        })
        .join("")

      return `
        <tr>
          <td style="${tdLeftStyle}">${entry.name}${badge}</td>
          <td style="${tdStyle}">${formatHours(entry.breakdown.totalWorkHours)}</td>
          <td style="${tdStyle}">${formatCurrency(entry.breakdown.baseSalaryTotal)}</td>
          <td style="${tdStyle}">${formatCurrency(entry.breakdown.grossPay)}</td>
          ${deductionCells}
          <td style="${tdStyle}">${formatCurrency(entry.breakdown.deductionsTotal)}</td>
          <td style="${tdStyle} font-weight: 600;">${formatCurrency(entry.breakdown.netPay)}</td>
        </tr>
      `
    })
    .join("")

  const totalDeductionCells = activeDeductionCols
    .map((col) => {
      const amt = totals.deductions.get(col.key) ?? 0
      return `<td style="${tdTotalStyle}">${formatCurrency(amt)}</td>`
    })
    .join("")

  return `
    <div style="font-family: -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; padding: 32px; background: white; width: max-content;">
      <h2 style="margin: 0 0 4px 0; font-size: 18px; font-weight: 700; color: #0f172a;">정산 요약</h2>
      <p style="margin: 0 0 16px 0; font-size: 12px; color: #64748b;">${monthLabel}</p>
      <table style="border-collapse: collapse; width: 100%;">
        <thead>
          <tr>
            <th style="${thLeftStyle}">이름</th>
            <th style="${thStyle}">근무시간</th>
            <th style="${thStyle}">기본급</th>
            <th style="${thStyle}">총지급액</th>
            ${deductionHeaders}
            <th style="${thStyle}">공제 합계</th>
            <th style="${thStyle}">실지급금</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr>
            <td style="${tdTotalLeftStyle}">총계</td>
            <td style="${tdTotalStyle}">${formatHours(totals.totalWorkHours)}</td>
            <td style="${tdTotalStyle}">${formatCurrency(totals.baseSalaryTotal)}</td>
            <td style="${tdTotalStyle}">${formatCurrency(totals.grossPay)}</td>
            ${totalDeductionCells}
            <td style="${tdTotalStyle}">${formatCurrency(totals.deductionsTotal)}</td>
            <td style="${tdTotalStyle}">${formatCurrency(totals.netPay)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `
}

async function renderHtmlToPdf(html: string, filename: string): Promise<void> {
  const container = document.createElement("div")
  container.style.position = "fixed"
  container.style.left = "-9999px"
  container.style.top = "0"
  container.innerHTML = html
  document.body.appendChild(container)

  try {
    const canvas = await html2canvas(container.firstElementChild as HTMLElement, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    })

    const imgWidth = canvas.width
    const imgHeight = canvas.height

    const pdfWidth = imgWidth * 0.264583
    const pdfHeight = imgHeight * 0.264583

    const doc = new jsPDF({
      orientation: pdfWidth > pdfHeight ? "landscape" : "portrait",
      unit: "mm",
      format: [pdfWidth + 20, pdfHeight + 20],
    })

    doc.addImage(canvas.toDataURL("image/png"), "PNG", 10, 10, pdfWidth, pdfHeight)
    doc.save(filename)
  } finally {
    document.body.removeChild(container)
  }
}

export async function generatePayrollPdf(
  monthLabel: string,
  entries: PayrollPdfEntry[]
): Promise<void> {
  const sorted = [...entries].sort((a, b) => {
    const baseDiff = b.breakdown.baseSalaryTotal - a.breakdown.baseSalaryTotal
    if (baseDiff !== 0) return baseDiff
    return b.payrollProfile.hourlyRate - a.payrollProfile.hourlyRate
  })
  const html = buildTableHtml(monthLabel, sorted)
  const safeName = monthLabel.replace(/\s+/g, "_")
  await renderHtmlToPdf(html, `정산요약_${safeName}.pdf`)
}

interface PayrollStatementInput {
  teacherName: string
  monthLabel: string
  payrollProfile: TeacherPayrollProfile
  breakdown: PayrollCalculationBreakdown
  paidAt: string
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(date)
}

function buildStatementHtml(input: PayrollStatementInput): string {
  const { teacherName, monthLabel, payrollProfile, breakdown, paidAt } = input

  const contractLabel =
    payrollProfile.contractType === "employee"
      ? "근로자"
      : payrollProfile.contractType === "freelancer"
        ? "프리랜서"
        : "기타"

  const insuranceLabel = payrollProfile.insuranceEnrolled ? "4대보험 가입" : "미가입"

  const font = "-apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif"

  const sectionTitle = `
    font-size: 13px;
    font-weight: 700;
    color: #0f172a;
    margin: 0 0 8px 0;
    padding-bottom: 4px;
    border-bottom: 2px solid #334155;
  `

  const thStyle = `
    padding: 7px 12px;
    font-size: 11px;
    font-weight: 600;
    color: #334155;
    text-align: left;
    border-bottom: 1px solid #cbd5e1;
    background: #f8fafc;
  `
  const thRightStyle = `${thStyle} text-align: right;`

  const tdStyle = `
    padding: 6px 12px;
    font-size: 11px;
    color: #1e293b;
    text-align: left;
    border-bottom: 1px solid #e2e8f0;
  `
  const tdRightStyle = `${tdStyle} text-align: right;`

  const totalRowBg = "background: #f1f5f9;"
  const totalFontStyle = "font-weight: 700; color: #0f172a;"

  const earningRows: Array<{ label: string; amount: number }> = []

  if (breakdown.hourlyTotal > 0) {
    earningRows.push({
      label: `근무급 (${formatHours(breakdown.totalWorkHours)} × ${formatCurrency(payrollProfile.hourlyRate)})`,
      amount: breakdown.hourlyTotal,
    })
  }
  if (breakdown.weeklyHolidayAllowance > 0) {
    earningRows.push({
      label: `주휴수당 (${formatHours(breakdown.totalWorkHours)} × ${formatCurrency(payrollProfile.weeklyHolidayRate)})`,
      amount: breakdown.weeklyHolidayAllowance,
    })
  }
  if (breakdown.baseSalaryTotal > 0) {
    earningRows.push({ label: "기본급", amount: breakdown.baseSalaryTotal })
  }
  for (const adj of breakdown.adjustments) {
    if (!adj.isDeduction && adj.amount !== 0) {
      earningRows.push({ label: adj.label, amount: adj.amount })
    }
  }

  const earningRowsHtml = earningRows
    .map(
      (row) => `
      <tr>
        <td style="${tdStyle}">${row.label}</td>
        <td style="${tdRightStyle}">${formatCurrency(row.amount)}</td>
      </tr>`
    )
    .join("")

  const deductionRows = breakdown.deductionDetails.map((d) => ({
    label: d.label,
    amount: d.amount,
  }))
  for (const adj of breakdown.adjustments) {
    if (adj.isDeduction && adj.amount !== 0) {
      deductionRows.push({ label: adj.label, amount: adj.amount })
    }
  }

  const deductionRowsHtml =
    deductionRows.length > 0
      ? deductionRows
          .map(
            (row) => `
      <tr>
        <td style="${tdStyle}">${row.label}</td>
        <td style="${tdRightStyle}">- ${formatCurrency(row.amount)}</td>
      </tr>`
          )
          .join("")
      : `<tr><td style="${tdStyle}" colspan="2">공제 항목 없음</td></tr>`

  const today = formatDate(new Date().toISOString())

  const infoCell = `
    padding: 5px 0;
    font-size: 11px;
  `
  const infoLabel = `${infoCell} color: #64748b; width: 80px;`
  const infoValue = `${infoCell} color: #0f172a; font-weight: 600;`

  return `
    <div style="font-family: ${font}; padding: 40px 48px; background: white; width: 560px; box-sizing: border-box;">
      <div style="text-align: center; margin-bottom: 28px;">
        <p style="margin: 0 0 2px 0; font-size: 12px; color: #64748b;">우디필름 영화학원</p>
        <h1 style="margin: 0 0 4px 0; font-size: 22px; font-weight: 800; color: #0f172a; letter-spacing: 4px;">지급명세서</h1>
        <p style="margin: 0; font-size: 11px; color: #64748b;">${monthLabel}</p>
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <tr>
          <td style="${infoLabel}">성명</td>
          <td style="${infoValue}">${teacherName}</td>
          <td style="${infoLabel}">계약 형태</td>
          <td style="${infoValue}">${contractLabel}</td>
        </tr>
        <tr>
          <td style="${infoLabel}">보험 구분</td>
          <td style="${infoValue}">${insuranceLabel}</td>
          <td style="${infoLabel}">지급일</td>
          <td style="${infoValue}">${formatDate(paidAt)}</td>
        </tr>
      </table>

      <h3 style="${sectionTitle}">지급 항목</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr>
            <th style="${thStyle}">항목</th>
            <th style="${thRightStyle}">금액</th>
          </tr>
        </thead>
        <tbody>
          ${earningRowsHtml}
          <tr style="${totalRowBg}">
            <td style="${tdStyle} ${totalFontStyle}">총지급액</td>
            <td style="${tdRightStyle} ${totalFontStyle}">${formatCurrency(breakdown.grossPay)}</td>
          </tr>
        </tbody>
      </table>

      <h3 style="${sectionTitle}">공제 항목</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr>
            <th style="${thStyle}">항목</th>
            <th style="${thRightStyle}">금액</th>
          </tr>
        </thead>
        <tbody>
          ${deductionRowsHtml}
          <tr style="${totalRowBg}">
            <td style="${tdStyle} ${totalFontStyle}">공제 합계</td>
            <td style="${tdRightStyle} ${totalFontStyle}">- ${formatCurrency(breakdown.deductionsTotal)}</td>
          </tr>
        </tbody>
      </table>

      <div style="margin-top: 24px; padding: 16px 20px; background: #f8fafc; border: 2px solid #334155; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 14px; font-weight: 700; color: #0f172a;">실지급액</span>
        <span style="font-size: 20px; font-weight: 800; color: #0f172a;">${formatCurrency(breakdown.netPay)}</span>
      </div>

      <div style="margin-top: 36px; display: flex; justify-content: flex-end; align-items: flex-end; gap: 20px;">
        <div style="text-align: right; font-size: 11px; color: #334155; line-height: 1.8;">
          <p style="margin: 0;">발행일: ${today}</p>
          <p style="margin: 0;">사업장: 우디필름 영화학원</p>
          <p style="margin: 0;">대표자: 김우신</p>
        </div>
        <div style="display: flex; flex-direction: column; align-items: center; gap: 2px; flex-shrink: 0;">
          <span style="font-size: 9px; color: #94a3b8;">(인)</span>
          <div style="width: 60px; height: 60px; border: 1px dashed #cbd5e1; border-radius: 4px;"></div>
        </div>
      </div>

      <p style="margin-top: 24px; font-size: 9px; color: #94a3b8; text-align: center;">
        본 명세서는 ${monthLabel} 승인된 근무일지를 기반으로 산출되었습니다.
      </p>
    </div>
  `
}

export async function generatePayrollStatementPdf(input: PayrollStatementInput): Promise<void> {
  const html = buildStatementHtml(input)
  const safeName = `${input.teacherName}_${input.monthLabel}`.replace(/\s+/g, "_")
  await renderHtmlToPdf(html, `지급명세서_${safeName}.pdf`)
}
