-- 온라인반 모의실기 면접형: 자체 화상 면접실 + 서버 녹화.
--   Zoom 대신 LiveKit 방(room)을 응시 단위로 열고, 선생님·학생이 브라우저에서 만난다.
--   녹화는 브라우저가 아니라 LiveKit Egress(서버)가 담당하며 완료되면 webhook으로
--   practice-recordings 버킷의 파일을 media_assets에 등록해 video_media_asset_id에 연결한다.
--
--   room_status       none  → 아직 면접실을 열지 않음
--                     open  → 선생님이 열었고 입장 가능
--                     ended → 선생님이 종료(또는 방이 닫힘)
--   recording_status  none | recording | processing | ready | failed
--                     recording  = egress 진행 중
--                     processing = 방은 닫혔고 파일 마무리/업로드 대기
--                     ready      = video_media_asset_id 연결 완료
--                     failed     = egress 실패(선생님이 다시 열어 재녹화 가능)

begin;

alter table public.practice_attempts
  add column if not exists room_status text not null default 'none'
    check (room_status in ('none', 'open', 'ended')),
  add column if not exists room_opened_at timestamptz,
  add column if not exists room_ended_at timestamptz,
  add column if not exists room_opened_by uuid references public.profiles(id) on delete set null,
  add column if not exists room_egress_id text,
  add column if not exists recording_status text not null default 'none'
    check (recording_status in ('none', 'recording', 'processing', 'ready', 'failed'));

comment on column public.practice_attempts.room_status is
  '온라인 화상 면접실 상태. none=미개설, open=입장 가능, ended=종료.';
comment on column public.practice_attempts.room_egress_id is
  '현재(또는 마지막) LiveKit egress id. webhook에서 응시를 찾는 키.';
comment on column public.practice_attempts.recording_status is
  '서버 녹화 상태. recording→processing→ready. 실패 시 failed.';

create index if not exists practice_attempts_room_egress_idx
  on public.practice_attempts (room_egress_id)
  where room_egress_id is not null;

commit;
