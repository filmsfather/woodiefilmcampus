-- Woodie Film Campus 초기 스키마 구성 스크립트
-- Supabase SQL 에디터에서 전체 복사 후 실행하세요.
-- 필요한 경우 BEGIN/COMMIT 블록이 트랜잭션을 보장합니다.

begin;

-- 0. 필수 확장. (gen_random_uuid 등에서 사용)
create extension if not exists "pgcrypto";

-- 1. 역할(enum) 정의
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE public.user_role AS ENUM ('principal', 'manager', 'teacher', 'student');
  END IF;
END $$;

-- 2. 프로필 테이블 생성/정렬
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  role public.user_role NOT NULL DEFAULT 'student',
  name text,
  student_phone text,
  parent_phone text,
  academic_record text,
  class_id uuid,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 기존 profiles 테이블에 신규 컬럼이 없다면 추가
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'student_phone'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN student_phone text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'parent_phone'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN parent_phone text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'academic_record'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN academic_record text;
  END IF;
END $$;

-- 3. 반(classes) 테이블
CREATE TABLE IF NOT EXISTS public.classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  teacher_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 클래스 테이블은 이미 생성된 경우를 대비해 컬럼 기본값을 보정
ALTER TABLE public.classes
  ALTER COLUMN created_at SET DEFAULT timezone('utc'::text, now());
ALTER TABLE public.classes
  ALTER COLUMN updated_at SET DEFAULT timezone('utc'::text, now());

-- class_id 외래 키 지정 (profiles/class 연동)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_class_id_fkey'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_class_id_fkey
      FOREIGN KEY (class_id)
      REFERENCES public.classes(id)
      ON DELETE SET NULL
      DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
END $$;



-- 4. updated_at 자동 갱신 트리거 공유 함수
CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 연결 (존재하지 않을 때만 생성)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'profiles_set_updated_at'
  ) THEN
    CREATE TRIGGER profiles_set_updated_at
      BEFORE UPDATE ON public.profiles
      FOR EACH ROW
      EXECUTE FUNCTION public.set_current_timestamp_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'classes_set_updated_at'
  ) THEN
    CREATE TRIGGER classes_set_updated_at
      BEFORE UPDATE ON public.classes
      FOR EACH ROW
      EXECUTE FUNCTION public.set_current_timestamp_updated_at();
  END IF;
END $$;

-- 5. 신규 사용자 프로필 자동 생성
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, name, student_phone, parent_phone, academic_record)
  VALUES (
    NEW.id,
    NEW.email,
    'student',
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'name', ''), NEW.email),
    NULLIF(NEW.raw_user_meta_data->>'student_phone', ''),
    NULLIF(NEW.raw_user_meta_data->>'parent_phone', ''),
    NULLIF(NEW.raw_user_meta_data->>'academic_record', '')
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        name = COALESCE(EXCLUDED.name, public.profiles.name),
        student_phone = COALESCE(EXCLUDED.student_phone, public.profiles.student_phone),
        parent_phone = COALESCE(EXCLUDED.parent_phone, public.profiles.parent_phone),
        academic_record = COALESCE(EXCLUDED.academic_record, public.profiles.academic_record),
        updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- auth.users 삽입 시 트리거 연결
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;

-- 6. RLS 활성화
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

-- 7. RLS 정책
-- 본인 프로필만 읽고 수정 가능
DROP POLICY IF EXISTS "프로필_본인_조회" ON public.profiles;
CREATE POLICY "프로필_본인_조회"
  ON public.profiles
  FOR SELECT
  USING (id = auth.uid());

DROP POLICY IF EXISTS "프로필_본인_수정" ON public.profiles;
CREATE POLICY "프로필_본인_수정"
  ON public.profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- 모든 인증 사용자는 자신의 반 정보를 읽을 수 있음 (필요 시 확장)
DROP POLICY IF EXISTS "클래스_전체_열람" ON public.classes;
CREATE POLICY "클래스_전체_열람"
  ON public.classes
  FOR SELECT
  TO authenticated
  USING (TRUE);

-- 반 데이터 작성/수정은 서비스 롤 또는 향후 관리자 흐름용으로 별도 키 사용
-- (정책 미지정 상태 → 기본적으로 막혀 있음)

-- 8. 인덱스 및 정합성 관리
CREATE INDEX IF NOT EXISTS profiles_role_idx ON public.profiles(role);
CREATE INDEX IF NOT EXISTS classes_teacher_id_idx ON public.classes(teacher_id);

commit;

-- 추가 가이드 ---------------------------------------------------------------
-- 1) 특정 사용자를 원장/실장 등으로 승격하려면 아래 예시를 참조하세요.
--    update public.profiles set role = 'principal' where email = '원장계정@example.com';
-- 2) 기존 auth.users 자료와 동기화가 필요하면 handle_new_user()를 재실행합니다.
--    insert into public.profiles (id, email)
--    select id, email from auth.users
--    on conflict (id) do nothing;
-- ---------------------------------------------------------------------------
