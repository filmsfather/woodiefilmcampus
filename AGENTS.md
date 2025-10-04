# Repository Guidelines

## Project Structure & Module Organization
- The deployable Next.js 15 app lives in `woodiefilmcampus/`; the root-level `package.json` only drives the shadcn component generator.
- `woodiefilmcampus/src/app` hosts App Router routes, `src/components/ui` contains shadcn primitives, and feature-specific UI resides under `src/components/{domain}`.
- Shared logic belongs in `src/lib`, shared TS contracts in `src/types`, and static assets in `woodiefilmcampus/public`; update `components.json` when adding shadcn blocks.

## Build, Test, and Development Commands
- `cd woodiefilmcampus && npm install` bootstraps dependencies; rerun after syncing shadcn components.
- `npm run dev` starts Turbopack dev server, `npm run build` compiles production assets, and `npm run start` serves the build locally.
- `npm run lint` runs the repo’s single automated gate today—fix warnings before opening a PR.

## Coding Style & Naming Conventions
- Write TypeScript with 2-space indentation, double quotes, and ESLint autofix (`eslint.config.mjs`); enable editor linting for immediate feedback.
- Keep UI component filenames kebab-cased (`button.tsx`, `navigation-menu.tsx`) and export PascalCase components; colocate styles via Tailwind utility classes.
- Group Tailwind classes by layout → spacing → color, reuse variants through `class-variance-authority`, and surface helper functions via `src/lib`.

## Testing Guidelines

## Auth & Approval Flow Notes
- Supabase `profiles` now stores student/parent contact fields plus a `status` column; new accounts stay `pending` and are redirected to `/pending-approval` until approved.
- Managers and principals handle approvals/removals from `/dashboard/manager`; the server actions require the `SUPABASE_SERVICE_ROLE_KEY` environment variable.
- After updating the schema rerun `supabase/setup.sql` so the `public.can_manage_profiles` helper and revised RLS policies exist in Supabase.

- A dedicated test runner is not wired up yet; treat `npm run lint` plus manual validation of key flows (login, role dashboards, auth) as the current minimum.
- When introducing tests, prefer React Testing Library for components and Playwright for flows, naming files `*.test.tsx` under `src/__tests__` or next to the module.
- Target coverage for Supabase auth handling (`src/middleware.ts`) and critical dashboards first, and document new scripts in `package.json`.

## Commit & Pull Request Guidelines
- History is sparse ("Initial commit from Create Next App"); use short, imperative summaries and adopt Conventional Commit prefixes (`feat:`, `fix:`) when it clarifies scope.
- Squash before merging, frame PR descriptions around the user impact, and link issues or Notion docs when relevant.
- Include screenshots or brief screen captures for UI changes, list manual checks (dev build, lint), and call out required environment variable updates.

## Security & Configuration Tips
- Store Supabase credentials in `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) and never commit secrets.
- The edge middleware caches auth cookies; after touching it, verify both anonymous and authenticated navigation in dev.
- Audit third-party shadcn imports when updating `components.json` to keep unused components out of the bundle.

## Recent Feature Additions
- Manager dashboard now links to `/dashboard/manager/classes`, a full CRUD surface for class creation, teacher/student assignments, and search/filtering powered by server actions and Zod validation.
- Supabase schema (`supabase/setup.sql`) introduces `class_teachers`, `class_students`, and the `public.can_manage_profiles` helper with updated RLS policies—rerun the script after pulling to sync these changes.
- Shared manager authorization logic lives in `src/lib/authz.ts`, and action state helpers/validation schemas (`src/app/dashboard/manager/classes/action-state.ts`, `src/lib/validation/class.ts`) keep server/client flows aligned.
