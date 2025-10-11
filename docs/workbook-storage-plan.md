# 워크북 유형별 자산 업로드 전략

## 1. 저장소 구조
- **Bucket**: `workbook-assets`
  - 권한: 인증 사용자만 업로드 가능, public read 금지. 다운로드는 signed URL 사용.
  - 폴더 구조
    - `pending/{teacherId}/{uuid}-{filename}` – 작성 중 임시 경로(저장 실패 시 즉시 삭제)
    - `workbooks/{workbookId}/items/{itemId}/{assetId}-{filename}` – 문항별 첨부 최종 경로
    - `workbooks/{workbookId}/pdf/{assetId}` – PDF 제출형 워크북 기본 파일
- **Table 연동**: `media_assets`
  - 업로드 완료 후 `media_assets`에 `owner_id`, `scope`(`workbook_item`, `workbook_pdf` 등), `bucket`, `path`, `mime_type`, `size` 기록.
  - `workbook_item_media` 테이블과 join하여 문항-자산 매핑 유지.

## 2. 유형별 요구사항
| 유형 | 업로드 자산 | 처리 방식 |
| --- | --- | --- |
| SRS | 문항 이미지(다중) | 각 문항별 최대 N장. 이미지 업로드 후 `workbook_item_media`에 position 저장. |
| PDF 제출형 | 기본 PDF 템플릿 1개 | 워크북 생성 시 필수 업로드 옵션. 제출 시 학생 PDF는 `submissions` 버킷으로 분리. |
| 서술형 | 기본 예시/가이드 이미지(선택) | 워크북 작성 시 선택사항. |
| 영화 감상형 | 참고 이미지/포스터(선택) | 문항 or 워크북 레벨 이미지. |
| 인터넷 강의형 | 썸네일 캐시(선택) | 유튜브 썸네일 URL 저장(서버 fetch) 또는 별도 업로드 없음. |

## 3. 업로드 플로우
1. 클라이언트에서 Supabase Storage `upload` 호출 전, 파일 확장자/사이즈 검증.
2. 임시 경로(`pending/...`)로 업로드 후, 서버 액션에서 성공적으로 저장되면 `workbooks/{id}/items/{itemId}/...`로 `move` 처리.
3. `media_assets` + `workbook_item_media` 레코드 생성 및 연결(position 포함).
4. 실패 시 업로드/이동된 파일과 DB 레코드를 서버에서 즉시 롤백 및 삭제.

## 4. 제한/검증
- 이미지: JPEG/PNG/WebP 최대 20MB, PDF: 최대 20MB.
- 서버 액션에서 `mime_type` 화이트리스트 확인 후 `media_assets` insert.
- `config` 컬럼에 자산 관련 메타데이터(대표 이미지 assetId 등) 저장 가능.

## 5. RLS/권한
- Storage 정책: `auth.uid() = owner_id` 또는 같은 교사에게 허용, RLS 정책(이미 `media_assets` 정책 존재)과 동일 기준 유지.
- 서드파티 접근 방지 위해 pre-signed URL(`supabase.storage.from(...).createSignedUrl`) 사용.

## 6. TODO
- `WorkbookWizard` 파일 업로드 UI + 서버 저장/롤백 연동 구현 완료.
- 상세 페이지에서 이미지/파일 썸네일/다운로드 표시 완료.
- 후속: 워크북 편집 화면에서도 첨부 자산 교체/삭제 지원, PDF 템플릿 업로드 UX 개선.
