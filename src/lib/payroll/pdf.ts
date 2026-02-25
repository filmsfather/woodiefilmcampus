import { jsPDF } from "jspdf"
import html2canvas from "html2canvas-pro"

import type { PayrollCalculationBreakdown, TeacherPayrollProfile } from "./types"

interface PayrollPdfEntry {
  name: string
  payrollProfile: TeacherPayrollProfile
  breakdown: PayrollCalculationBreakdown
}

const DEDUCTION_COLUMNS = [
  { key: "건강보험", shortLabel: "건강보험" },
  { key: "국민연금", shortLabel: "국민연금" },
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

export async function generatePayrollPdf(
  monthLabel: string,
  entries: PayrollPdfEntry[]
): Promise<void> {
  const container = document.createElement("div")
  container.style.position = "fixed"
  container.style.left = "-9999px"
  container.style.top = "0"
  container.innerHTML = buildTableHtml(monthLabel, entries)
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

    const safeName = monthLabel.replace(/\s+/g, "_")
    doc.save(`정산요약_${safeName}.pdf`)
  } finally {
    document.body.removeChild(container)
  }
}
