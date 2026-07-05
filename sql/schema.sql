-- ============================================================
-- 山 Shan — Supabase schema
-- Run once in Supabase → SQL Editor. Creates tables, storage
-- bucket for physique photos, and row-level security.
--
-- SINGLE-USER MODEL: this project is yours alone. We use
-- Supabase Auth with one account (you). RLS ties every row to
-- auth.uid() so only your logged-in session can read/write.
-- ============================================================

-- ---------- settings (one row: program config + editable habits) ----------
create table if not exists settings (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  program_start date not null default current_date,   -- day 1; drives rep-wave + 6-week transitions
  bodyweight_lb numeric,                              -- last known, for rank math fallback
  habits        jsonb not null default                -- editable checklist (label + target)
    '[{"key":"cal","label":"Ate 2600 calories"},
      {"key":"protein","label":"170g protein"},
      {"key":"sleep","label":"Slept 8 hours"},
      {"key":"creatine","label":"Took creatine"},
      {"key":"read","label":"Read 5 minutes"},
      {"key":"puzzle","label":"5 minutes of puzzles"},
      {"key":"mandarin","label":"Spoke Mandarin 5 min"},
      {"key":"social","label":"Talked to one person"}]'::jsonb,
  updated_at    timestamptz not null default now()
);

-- ---------- daily_logs (one row per calendar day) ----------
create table if not exists daily_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  log_date      date not null,
  bodyweight_lb numeric,
  habits_done   jsonb not null default '{}'::jsonb,   -- { "cal": true, "sleep": false, ... }
  photo_path    text,                                 -- storage object path in 'physique' bucket
  notes         text,
  created_at    timestamptz not null default now(),
  unique (user_id, log_date)
);

-- ---------- workout_logs (one row per exercise per day) ----------
create table if not exists workout_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  log_date      date not null,
  day_type      text not null,                        -- 'push_a','pull_a','legs_a','push_b','pull_b','legs_b'
  exercise      text not null,                        -- canonical exercise key
  rep_bracket   text not null,                        -- '10-12' | '7-9' | '4-6'
  sets          jsonb not null default '[]'::jsonb,   -- [{ "weight":135, "reps":8 }, ...]
  pain          boolean not null default false,
  pain_note     text,
  fun           smallint check (fun between 1 and 5),
  est_1rm       numeric,                              -- conservative est (lower of Epley/Brzycki), 4-6 sets only
  created_at    timestamptz not null default now(),
  unique (user_id, log_date, exercise)
);

-- ---------- ranks (per rank-bearing lift: current + peak) ----------
create table if not exists ranks (
  user_id       uuid not null references auth.users(id) on delete cascade,
  exercise      text not null,                        -- 'bench','squat','rdl','db_shoulder_press'
  current_tier  smallint not null default 0,          -- 0..24 index into the 25-step ladder
  current_1rm   numeric,
  current_ratio numeric,                              -- 1rm / bodyweight at time of rank
  peak_tier     smallint not null default 0,
  peak_1rm      numeric,
  peak_date     date,
  updated_at    timestamptz not null default now(),
  primary key (user_id, exercise)
);

-- ---------- rank history (for analytics trend of rank over time) ----------
create table if not exists rank_history (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  exercise    text not null,
  log_date    date not null,
  tier        smallint not null,
  est_1rm     numeric,
  ratio       numeric,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- Row-level security — each user sees only their own rows
-- ============================================================
alter table settings     enable row level security;
alter table daily_logs   enable row level security;
alter table workout_logs enable row level security;
alter table ranks        enable row level security;
alter table rank_history enable row level security;

do $$
declare t text;
begin
  foreach t in array array['settings','daily_logs','workout_logs','ranks','rank_history']
  loop
    execute format('drop policy if exists own_all on %I;', t);
    execute format(
      'create policy own_all on %I for all
         using (user_id = auth.uid())
         with check (user_id = auth.uid());', t);
  end loop;
end $$;

-- ============================================================
-- Storage bucket for physique photos (private)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('physique','physique', false)
on conflict (id) do nothing;

drop policy if exists physique_own on storage.objects;
create policy physique_own on storage.objects for all
  using (bucket_id = 'physique' and owner = auth.uid())
  with check (bucket_id = 'physique' and owner = auth.uid());

-- Done. Your project is ready.
