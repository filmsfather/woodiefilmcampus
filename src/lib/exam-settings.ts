// 시험 마감 정책 설정
// true면 마감시간(closes_at)이나 제한시간이 지나도 시험 시작/제출을 허용한다.
// 단, 관리자가 회차를 수동으로 '마감' 처리한 경우(status = 'closed')는 계속 차단된다.
export const ALLOW_LATE_SUBMISSION = true
