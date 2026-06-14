/**
 * 성적증명서 PDF의 비밀번호(암호화) 처리 유틸리티.
 * - isPdfEncrypted: trailer의 /Encrypt 존재 여부로 가볍게 암호화 여부를 판별.
 * - decryptPdfBase64: 사용자가 제출한 비밀번호로 mupdf를 이용해 암호를 해제하고
 *   비암호화 PDF의 base64를 반환한다.
 */

import * as mupdf from 'mupdf'

/**
 * PDF가 비밀번호/보안으로 암호화되어 있는지 가볍게 판별한다.
 * 암호화 PDF는 trailer에 /Encrypt 항목을 두므로 바이트에 존재 여부만 확인한다.
 * (성적증명서 본문에 "/Encrypt" 문자열이 들어갈 일은 사실상 없어 오탐 위험이 낮다.)
 */
export function isPdfEncrypted(pdfBase64: string): boolean {
  const buffer = Buffer.from(pdfBase64, 'base64')
  return buffer.includes('/Encrypt')
}

export type DecryptPdfResult =
  | { ok: true; pdfBase64: string }
  | { ok: false; reason: 'not_encrypted' | 'wrong_password' | 'failed' }

/**
 * 비밀번호로 보호된 PDF를 해제하여 비암호화 PDF의 base64를 반환한다.
 * - 비밀번호가 필요 없는 PDF면 reason='not_encrypted'.
 * - 비밀번호가 틀리면 reason='wrong_password'.
 * - 그 외 처리 실패는 reason='failed'.
 */
export function decryptPdfBase64(pdfBase64: string, password: string): DecryptPdfResult {
  const data = Buffer.from(pdfBase64, 'base64')

  let doc: mupdf.Document | null = null
  try {
    doc = mupdf.Document.openDocument(data, 'application/pdf')

    if (!doc.needsPassword()) {
      return { ok: false, reason: 'not_encrypted' }
    }

    // authenticatePassword: 0=실패, 그 외(2=사용자, 4=소유자)는 성공.
    const auth = doc.authenticatePassword(password)
    if (auth === 0) {
      return { ok: false, reason: 'wrong_password' }
    }

    const pdf = doc.asPDF()
    if (!pdf) {
      return { ok: false, reason: 'failed' }
    }

    // decrypt: 암호화를 제거한 PDF로 저장. garbage/compress로 용량도 정리.
    const buffer = pdf.saveToBuffer('decrypt,garbage,compress=yes')
    const bytes = buffer.asUint8Array()
    return { ok: true, pdfBase64: Buffer.from(bytes).toString('base64') }
  } catch (error) {
    console.error('[pdf-security] decrypt error', error)
    return { ok: false, reason: 'failed' }
  } finally {
    doc?.destroy()
  }
}
