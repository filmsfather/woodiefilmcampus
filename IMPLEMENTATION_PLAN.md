# 구현 계획 (Woodie Film Campus)

## 목적
- PRD 요구사항을 충족하는 워크북 생성·출제·학습·점검 플로우를 구축한다.
- 교사/학생/Admin 역할별 권한과 데이터 일관성을 유지하면서 중단 후 재개 가능한 학습 경험을 제공한다.
- 향후 예약 기능 등에서도 재사용 가능한 시간 표준화, 스토리지, 인쇄 요청 흐름의 기반을 마련한다.

## 공통 고려사항
- **시간 표준화(DateUtil)**: `src/lib/date-util.ts`에 중앙 유틸을 구현한다.
  - `initServerClock()`(SSR/Edge에서 호출) → `nowUTC()`와 동일한 UTC 기준 제공.
  - `initClientClock(serverNow)` → 브라우저-서버 오프셋 캐시, `nowUTC()`, `isSameUtcDay()`, `formatForDisplay(locale, tz)` 제공.
  - 모든 마감일/복습/예약 계산은 UTC 기준 timestamptz를 저장·비교하고, 표시만 로컬로 변환.
- **스토리지 구조**: Supabase Storage 버킷 `workbook-assets`(문항 이미지/PDF)와 `submissions`(학생 제출) 분리.
  - 키 패턴: `workbooks/{workbook_id}/items/{item_id}/{asset_id}` 등. 메타데이터 테이블에 원본/썸네일/파일크기 저장.
  - 업로드 후 `media_assets` 테이블에 레코드 생성해 참조 무결성 관리.
- **권한 & RLS**: 기존 `profiles`, `classes`, `class_teachers`, `class_students` 스키마를 활용하고, 신규 테이블에도 교사/학생 기반 정책을 정의.
  - 교사: 자신이 생성/담당하는 워크북·과제·학생 제출에 접근.
  - 학생: 배정된 `student_tasks`와 자신의 제출물만 접근.
- **에러/감사 로그**: 주요 액션(출제, 제출, 인쇄요청 상태 변경)에 Supabase Edge Function 로그 또는 DB trigger 기록을 추가해 추후 감사 가능하게 함.

## Phase 0 — 준비 및 범위 명확화
- `src` 앱 구조, 인증 흐름, Supabase 클라이언트 초기화 코드 검토.
- 역할별 사용자 플로우를 시퀀스 다이어그램으로 정리(내부 문서 또는 FigJam).
- DateUtil과 스토리지 UX 시나리오에 대한 팀 합의 확보.

## Phase 1 — 데이터 모델링 & 백엔드 기반
- 새로운 테이블 및 관계 설계(초안):
  - `workbooks(id, teacher_id, title, subject, week_label, type, tags[], created_at, updated_at)`
  - `workbook_items(id, workbook_id, order, prompt, media_asset_ids[], answer_type, explanation, srs_settings)`
  - `workbook_item_choices(id, item_id, label, content, is_correct)` — SRS 다중 정답 지원.
  - `assignments(id, workbook_id, assigned_by, due_at, target_scope, created_at)`
  - `assignment_targets(id, assignment_id, class_id, student_id)` — 반/개인 배정.
  - `student_tasks(id, assignment_id, student_id, status, completion_at, progress_meta)`
  - `student_task_items(id, student_task_id, item_id, streak, next_review_at, last_result, completed_at)` — SRS 진행 기록.
  - `task_submissions(id, student_task_id, item_id, type, content, media_asset_id, score, feedback, evaluated_by, evaluated_at)`
  - `print_requests(id, assignment_id, student_task_id, teacher_id, desired_date, period, copies, color_mode, status)`
  - `media_assets(id, owner_id, scope, path, bucket, mime_type, size, metadata, created_at)`
- 뷰 & 함수:
  - 완료율 계산 뷰 `student_task_completion_view` → 교사용 대시보드에서 활용.
  - `rpc(mark_student_task_item)` — SRS 정답 처리 시 streak/next_review_at 자동 갱신.
  - `rpc(get_server_time)` — 클라이언트 오프셋 계산용.
- RLS 정책 정의: 교사/학생 권한별 SELECT/INSERT/UPDATE 제어, Admin 범위 조정.
- Supabase 마이그레이션 스크립트 작성(`supabase/migrations/...`), 로컬 실행으로 검증.

## Phase 2 — 워크북 생성(교사)
- UI: `src/app/dashboard/workbooks/new` 페이지 생성, 다단계 폼(기본 정보 → 문항 구성 → 미리보기 → 저장).
- 폼 기술: React Hook Form + Zod 스키마, 문항별 동적 필드 컴포넌트.
- 문항 타입별 구성 요소:
  - SRS: 질문, 옵션(다중 정답 체크), 해설, 난이도/복습 옵션.
  - PDF 제출형: PDF 파일 업로드 필드.
  - 서술형/영화감상/인터넷강의: 텍스트 필드, 감상 필터 선택 UI.
- 업로드: Supabase Storage multipart 업로드 → 성공 시 `media_assets`에 기록.
- API: `POST /api/workbooks`(server action 또는 Route Handler)에서 트랜잭션 처리.
- 저장 후 워크북 목록 페이지에 신규 카드 표시, 태그/주차 필터 기본 구현.

## Phase 3 — 과제 출제(Assign)
- UI: `src/app/dashboard/assignments/new` — 반/학생 선택, 워크북 필터(과목/주차/제목), 마감일 DateUtil 사용.
- 기능:
  - 대상 선택 시 실시간 카운트 표시, 중복 배정 방지.
  - 마감일 캘린더는 서버 오프셋 적용.
  - 제출: `POST /api/assignments` → assignments + assignment_targets + student_tasks 생성.
- 노티: 성공 시 교사에게 확인 토스트, 향후 알림 발송 훅을 위한 placeholder(큐 테이블 등) 마련.

## Phase 4 — 학생 과제 수행
- “내 과제” 페이지: 마감순 정렬, 필터(이번주/지난주/전체). DateUtil로 현재 시각 기준 계산.
- 유형별 상세 화면:
  - SRS: `student_task_items` 순회, `next_review_at <= now`인 문항만 노출, streak 관리 RPC 연동, 중단 후 재개 시 마지막 상태 유지.
  - PDF 제출형: 파일 업로드 → `task_submissions` 업데이트, 제출 상태 표시.
  - 서술형/영화감상/인터넷강의: 리치 텍스트·요약 입력, 감상노트 N개 제한 로직.
- 완료 처리: 모든 필수 제출 완료 시 `student_tasks.status = 'completed'` 및 `completion_at` 갱신.
- 접근 제어: 로그인 학생이 아닌 경우 접근 차단, RLS 기반 보안 점검.

## Phase 5 — 교사 점검 & 인쇄 요청
- All Classes 대시보드:
  - 필터(반/과목/유형/마감기간), 테이블에 학생별 완료율·미완료 과제 수 표시.
  - 학생 행 클릭 → 모달 또는 상세 페이지에서 제출 상태 조회.
- My Assignments:
  - 좌측 반 리스트(최근 출제순), 선택 시 우측 카드(제목/유형/마감/완료율/미완료 n명).
  - “미완료 n명” 클릭 → 테이블(학생명, 상태, 제출물 링크, DateUtil 적용).
  - 검색(제목·학생 이름) 및 마감 임박순 정렬.
- 유형별 점검 탭:
  - SRS: streak=3 여부로 완료/미완료 표시.
  - PDF: 업로드 여부 + 인쇄요청 CTA.
  - 서술형: 답안, 등급 선택, 텍스트 피드백 저장.
  - 감상/인터넷강의: 제출물 링크/요약 확인.
- 인쇄 요청 플로우:
  - 요청 생성 모달(희망일/교시/부수/흑백·컬러).
  - 상태 전환 버튼(requested → done/canceled), `print_requests` 업데이트.
  - 향후 Admin 인쇄 큐 페이지와 연동할 API 스켈레톤 마련.

## Phase 6 — 품질 확보 및 배포 준비
- 테스트: 주요 서버 액션/Edge RPC에 대한 Vitest 단위 테스트, Playwright로 핵심 플로우(워크북 생성 → 출제 → 학생 제출 → 교사 점검) 시나리오 작성.
- 접근성 점검: 컴포넌트 aria-label, 키보드 네비게이션 확인.
- 성능: 워크북/과제 목록에 대한 Supabase 쿼리 최적화(필요 시 pagination, index 확인).
- 문서화: DateUtil 사용 가이드, 스토리지 구조, RLS 정책 요약을 `docs/` 또는 Notion에 정리.
- 배포 체크리스트: `.env` 키, Supabase migration 적용 순서, Storage 버킷 권한, Edge Function 배포.

## 부록 — 후속 고려 사항
- 예약 기능: DateUtil과 동일한 오프셋 관리로 예약 시작/종료 로직을 재사용.
- 알림 시스템: assignment 생성 시 webhook/notification queue로 확장할 수 있도록 이벤트 발행 포인트 마련.
- 분석 지표: 향후 학생 학습 리포트 작성을 위해 `student_task_items` 로그 테이블(정답 여부, 소요시간)을 추가하는 방안 검토.

