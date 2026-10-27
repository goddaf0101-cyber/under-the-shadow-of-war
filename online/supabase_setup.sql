-- ใต้เงาสงคราม · ตารางอันดับออนไลน์ (Supabase)
-- วิธีใช้: Supabase > SQL Editor > New query > วางทั้งไฟล์ > Run (รันครั้งเดียว)
-- ผู้เล่นทุกคน "อ่าน" อันดับได้ และ "เพิ่ม" รอบที่เล่นได้เท่านั้น แก้หรือลบไม่ได้ (เจ้าของโปรเจกต์ลบได้จากหน้า Table Editor)

create table if not exists public.runs (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  client_id     uuid        not null,                       -- รหัสสุ่มของเบราว์เซอร์ ใช้ไฮไลต์แถว "คุณ" (ไม่ใช่ข้อมูลส่วนตัว)
  nickname      text        not null check (char_length(btrim(nickname)) between 1 and 20),
  char_name     text        not null check (char_length(char_name) between 1 and 40),
  occupation    text        not null check (char_length(occupation) <= 60),
  province      text        not null check (char_length(province) <= 40),
  days          integer     not null check (days between 0 and 3000),
  cause         text        not null check (char_length(cause) <= 60),
  events        integer     not null check (events >= 0),   -- จำนวนเหตุการณ์ที่เลือกจริงในรอบนั้น
  play_seconds  integer     not null check (play_seconds >= 0),
  game_version  text        not null default '',
  -- ตรวจขั้นต้น: วันละราว 3 เหตุการณ์ และต้องใช้เวลาเล่นจริงอย่างน้อย 2 วินาทีต่อเหตุการณ์
  constraint runs_plausible check (events >= days * 2 and play_seconds >= events * 2)
);

create index if not exists runs_days_idx on public.runs (days desc, created_at asc);

alter table public.runs enable row level security;

drop policy if exists "anyone reads runs" on public.runs;
create policy "anyone reads runs" on public.runs for select to anon, authenticated using (true);

drop policy if exists "anyone adds a run" on public.runs;
create policy "anyone adds a run" on public.runs for insert to anon, authenticated with check (true);

-- กันส่งถี่: เบราว์เซอร์เดียวส่งได้ไม่เกิน 1 รอบต่อ 20 วินาที
create or replace function public.runs_rate_limit() returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.runs where client_id = new.client_id and created_at > now() - interval '20 seconds') then
    raise exception 'too many submissions';
  end if;
  return new;
end $$;
drop trigger if exists runs_rate_limit on public.runs;
create trigger runs_rate_limit before insert on public.runs for each row execute function public.runs_rate_limit();
