# 리포지토리 가이드라인

## 프로젝트 구조 및 모듈 구성
- 배포 대상 Next.js 15 애플리케이션은 `woodiefilmcampus/` 디렉터리에 있고, 루트 `package.json`은 shadcn 컴포넌트 생성을 위한 스크립트만 제공합니다.
- `woodiefilmcampus/src/app`은 App Router 경로를, `src/components/ui`는 shadcn 기본 컴포넌트를, 역할별 UI는 `src/components/{domain}`에 배치합니다.
- 공용 로직은 `src/lib`, TypeScript 타입은 `src/types`, 정적 자산은 `woodiefilmcampus/public`에 두고, shadcn 블록을 추가할 때는 `components.json`을 최신 상태로 유지하세요.

## 빌드, 테스트, 로컬 개발 명령어
- 최초에는 `cd woodiefilmcampus && npm install`을 실행해 의존성을 설치하고 shadcn 동기화 후에도 다시 실행하세요.
- `npm run dev`는 Turbopack 개발 서버를, `npm run build`는 프로덕션 번들을, `npm run start`는 빌드 산출물을 로컬에서 제공합니다.
- 현재 자동화된 점검은 `npm run lint`가 유일하므로 경고를 모두 해결한 뒤 PR을 올리세요.

## 코딩 스타일 및 네이밍 규칙
- TypeScript는 2칸 들여쓰기, 이중따옴표, ESLint 자동 고침(`eslint.config.mjs`)을 기본으로 사용하고 IDE에서 린팅을 활성화하세요.
- UI 컴포넌트 파일은 케밥 케이스(`button.tsx`, `navigation-menu.tsx`)로 저장하고, 컴포넌트는 PascalCase로 export합니다.
- Tailwind 클래스는 레이아웃 → 간격 → 색상 순으로 정리하고, `class-variance-authority`로 변형을 재사용하며 공통 헬퍼는 `src/lib`로 끌어올리세요.

## 테스트 가이드라인
- 별도의 테스트 러너는 아직 도입되지 않았습니다. 현재는 `npm run lint`와 주요 플로우(`/demo`, 인증)` 수동 점검이 최소 요구사항입니다.
- 테스트를 추가할 때는 React Testing Library를 선호하고, 사용자 여정은 Playwright로 작성하며 파일명은 `*.test.tsx` 형식을 따르세요.
- Supabase 인증 미들웨어(`src/middleware.ts`)와 핵심 대시보드를 우선 검증하고, 새 스크립트는 `package.json`에 기록하세요.

## 커밋 및 PR 가이드라인
- git 히스토리가 거의 없으므로 간결한 명령형 제목을 사용하고 범위가 뚜렷하면 Conventional Commit 접두사(`feat:`, `fix:` 등)를 붙이세요.
- 머지 전 스쿼시를 권장하며 PR 본문에는 사용자 영향, 관련 이슈·노션 링크, 필요 시 스크린샷 또는 캡처를 포함합니다.
- 수동 검증 결과(개발 서버 기동, 린트 통과)와 환경 변수 변경 사항을 체크리스트로 공유하세요.

## 보안 및 구성 팁
- Supabase 자격 증명은 `.env.local`에 보관하고(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) 저장소에는 커밋하지 마세요.
- 에지 미들웨어가 인증 쿠키를 재발급하므로 변경 후 비로그인/로그인 모두에서 내비게이션을 다시 확인하세요.
- `components.json`을 수정할 때는 추가된 shadcn 컴포넌트를 검토해 불필요한 번들 증가를 막으세요.
