# Class Materials Multi-Attachment Migration

## Overview
- 수업자료(수업자료/학생 유인물) 업로드가 Supabase Storage 다중 첨부 기반으로 재설계됨
- 서버 액션/폼/상세/인쇄 요청/DB 스키마를 모두 개편
- 입시자료(guide/resource)는 후속 작업 예정

## Database
- `supabase/migrations/45_class_and_admission_post_assets.sql`
  - `class_material_post_assets`, `admission_material_post_assets` 테이블 추가 + RLS
  - 기존 `*_asset_id` 값을 새 테이블에 INSERT하여 데이터 이관
  - 마이그레이션 적용 후 기존 컬럼을 유지(1순위 첨부 sync 용) → 추후 제거 가능

## Shared Utilities
- `src/lib/storage-upload.ts`: 클라이언트 direct upload 헬퍼 (`uploadFileToStorageViaClient`, `buildPendingStoragePath`)
- `src/lib/storage/buckets.ts`, `src/lib/storage/limits.ts`: 버킷/용량 상수
- `src/lib/class-materials-shared.ts`: 과목/권한/타입을 클라이언트에서도 재사용

## Server Changes
- `src/app/dashboard/teacher/class-materials/actions.ts`
  - `parseUploadedClassMaterialAttachments` → 업로드 메타데이터(JSON) 검증
  - `finalizeClassMaterialAttachment` → pending → final path 이동 + media_assets/class_material_post_assets insert
  - `syncPrimaryClassMaterialAssets` → 1순위 첨부를 기존 컬럼(`class_material_asset_id`, `student_handout_asset_id`)과 동기화
  - 인쇄 요청은 첨부 ID를 받아 request items를 생성 (`selectedAttachmentIds`)
  - 삭제/롤백 시 Storage & media_assets 정리

## Client/UI Changes
- `ClassMaterialPostForm.tsx`
  - 첨부 섹션별 다중 업로드 UI (진행/삭제/용량 표시)
  - `currentUserId`를 받아 업로드 경로에 사용 → 신규/수정 페이지에서 넘겨줌
  - FormData에 `uploadedAttachments`, `removedAttachmentIds` JSON/리스트 포함
- `ClassMaterialPrintRequestForm.tsx`
  - 첨부 목록을 종류별로 보여주고 각 항목별 체크박스/미리보기 제공
- `class-materials/[subject]/[postId]/page.tsx`
  - 모든 첨부를 리스트로 렌더링 + download URL 제공

## Supabase 적용 절차
1. `supabase db push` 또는 Studio에서 `45_class_and_admission_post_assets.sql` 실행
2. 데이터 확인 후 필요 시 기존 `*_asset_id` 컬럼을 read-only로 유지 (자동 sync)

## 남은 TODO
- 입시자료 `admission_material_posts`도 동일한 패턴으로 개편
- 중단된 업로드(pending/* 경로) 정리 정책 마련
- `learning-journal` fetch 실패 로그 처리(빌드 시 API 호출 예외 처리 등)
- 대량 첨부 대비 재정렬 UI 등 UX 강화 검토
