# Supabase 마이그레이션 적용 & 검증 체크리스트

## 1. 사전 준비
- 최신 main을 pull 하고 `node_modules` 상태를 확인한다.
- Supabase CLI가 설치돼 있는지(`supabase --version`) 확인한다.
- 로컬 개발 DB를 사용 중이라면 현재 세션의 중요 데이터를 백업한다.

## 2. 마이그레이션 실행
1. 신규 스키마 파일 확인
   - `supabase/migrations/workbook_schema.sql`을 Supabase SQL Editor 또는 CLI에서 실행할 준비를 한다.
2. 로컬 개발 환경 적용 (권장)
   ```bash
   supabase start           # 필요 시 로컬 DB 실행
   supabase db reset        # 전체 스키마 초기화 후 setup.sql + migrations 적용
   # 또는 기존 데이터 유지가 필요하면:
   supabase db query < supabase/migrations/workbook_schema.sql
   ```
3. 운영/스테이징 적용
   - Supabase 대시보드 > SQL Editor에서 파일 내용을 복사 후 실행.
   - 실행 로그에 오류가 없는지 확인한다.

## 3. 핵심 객체 검증
1. 테이블/뷰 존재 여부
   ```sql
   select table_name from information_schema.tables
   where table_schema = 'public'
     and table_name in (
       'workbooks','workbook_items','workbook_item_choices','workbook_item_media',
       'media_assets','assignments','assignment_targets','student_tasks',
       'student_task_items','task_submissions','print_requests'
     );

   select * from public.student_task_completion_view limit 5;
   ```
2. RPC 함수 동작
   ```sql
   select public.get_server_time();

   -- 샘플 student_task_item_id를 준비한 뒤 정답/오답 호출
   select public.mark_student_task_item('00000000-0000-0000-0000-000000000000', true);
   ```
   - `mark_student_task_item` 실행 후 `student_task_items.streak`, `next_review_at`, `student_tasks.status`가 기대대로 업데이트되는지 확인한다.

## 4. RLS 정책 확인
- Supabase 대시보드 > Table editor에서 정책 탭으로 이동해 신규 테이블에 정책이 적용됐는지 확인.
- `authenticated` 역할로 다음 쿼리를 테스트:
  - 교사 계정으로 워크북 생성/조회가 가능한지.
  - 학생 계정이 다른 학생의 `student_tasks`에 접근하지 못하는지.
  - 인쇄요청이 담당 교사/학생만 열람 가능한지.

## 5. 롤백 전략
- 문제 발생 시 `git checkout supabase/migrations/workbook_schema.sql`로 수정을 검토한 뒤 원인 해결 후 재적용.
- 심각한 오류면 `supabase db reset`으로 초기화하고 검증된 버전의 SQL만 재실행.

## 6. 후속 조치
- 마이그레이션 적용 후 `npm run lint`/`npm run build`로 앱이 새 스키마에 맞게 빌드되는지 확인.
- DateUtil 구현과 서버 측 업데이트가 끝난 뒤 통합 테스트(워크북 생성→출제→학생 수행→교사 점검)를 계획한 시나리오에 맞춰 실행한다.

