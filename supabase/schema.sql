-- =====================================================================
-- DC Perform : base de données
-- À coller en une fois dans Supabase > SQL Editor > New query > Run.
-- Le script peut être relancé sans casser les données existantes.
-- =====================================================================

-- ---------- Tables ----------------------------------------------------

-- Qui a le droit de créer un compte (le coach ajoute l'e-mail du joueur).
create table if not exists public.invitations (
  email       text primary key,
  role        text not null default 'athlete' check (role in ('coach', 'athlete')),
  full_name   text,
  created_at  timestamptz not null default now()
);

-- Un profil par compte. Le rôle vient de l'invitation.
create table if not exists public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  email            text not null,
  full_name        text,
  role             text not null default 'pending' check (role in ('coach', 'athlete', 'pending')),
  sport            text,
  position         text,
  custom_question  text,          -- ex. « Ton genou aujourd'hui »
  created_at       timestamptz not null default now()
);

-- Bibliothèque d'exercices.
create table if not exists public.exercises (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  category     text,
  video_url    text,
  cues         text,                -- consignes clés
  home_alt     text,                -- équivalent maison (nom d'exercice)
  created_at   timestamptz not null default now()
);

-- Un cycle = un bloc de semaines pour un athlète.
create table if not exists public.cycles (
  id           uuid primary key default gen_random_uuid(),
  athlete_id   uuid not null references public.profiles (id) on delete cascade,
  name         text not null,
  goal         text,
  start_date   date not null,
  weeks        int not null default 4,
  week_focus   jsonb not null default '[]'::jsonb,   -- ["Reprise · RPE 7", ...]
  notes        text,
  created_at   timestamptz not null default now()
);

-- Une séance prévue.
create table if not exists public.sessions (
  id             uuid primary key default gen_random_uuid(),
  cycle_id       uuid references public.cycles (id) on delete cascade,
  athlete_id     uuid not null references public.profiles (id) on delete cascade,
  week           int,
  planned_date   date not null,
  code           text,                 -- « A », « B », « C »
  title          text not null,
  focus          text,
  minutes_gym    int,
  minutes_home   int,
  gear_gym       text[] not null default '{}',
  gear_home      text[] not null default '{}',
  content_gym    jsonb not null default '[]'::jsonb,  -- liste de blocs
  content_home   jsonb,                               -- null = pas de version maison
  nutri_tip      text,
  target_rpe     int,
  version        text not null default 'salle' check (version in ('salle', 'maison')),
  status         text not null default 'planned' check (status in ('planned', 'done', 'skipped')),
  done_at        timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists sessions_athlete_date on public.sessions (athlete_id, planned_date);

-- Avant la séance : 3 touches.
create table if not exists public.checkins (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid references public.sessions (id) on delete cascade,
  athlete_id   uuid not null references public.profiles (id) on delete cascade,
  form         int not null check (form between 1 and 5),
  sleep        text not null check (sleep in ('bien', 'moyen', 'mal')),
  pain_before  boolean not null default false,
  created_at   timestamptz not null default now()
);

-- Après la séance.
create table if not exists public.feedbacks (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid references public.sessions (id) on delete cascade,
  athlete_id     uuid not null references public.profiles (id) on delete cascade,
  started_at     timestamptz,
  duration_min   int not null check (duration_min between 1 and 300),
  rpe            int not null check (rpe between 1 and 10),
  custom_answer  int check (custom_answer between 0 and 10),
  pains          jsonb not null default '[]'::jsonb,   -- [{zone, side, level}]
  comment        text,
  version        text check (version in ('salle', 'maison')),
  load           int generated always as (rpe * duration_min) stored,
  created_at     timestamptz not null default now()
);
create index if not exists feedbacks_athlete_date on public.feedbacks (athlete_id, created_at);

-- Bilan du dimanche.
create table if not exists public.weekly_reports (
  id               uuid primary key default gen_random_uuid(),
  athlete_id       uuid not null references public.profiles (id) on delete cascade,
  week_start       date not null,
  basket_sessions  int not null default 0 check (basket_sessions between 0 and 14),
  match_minutes    int not null default 0 check (match_minutes between 0 and 300),
  created_at       timestamptz not null default now(),
  unique (athlete_id, week_start)
);

-- ---------- Fonctions utiles -----------------------------------------

create or replace function public.is_coach()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'coach');
$$;

create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('coach', 'athlete'));
$$;

-- À chaque nouveau compte : on crée son profil avec le rôle prévu par l'invitation.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare inv public.invitations%rowtype;
begin
  select * into inv from public.invitations where lower(email) = lower(new.email);
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(inv.full_name, new.raw_user_meta_data ->> 'full_name'),
    coalesce(inv.role, 'pending')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Si le coach invite quelqu'un qui a déjà un compte « en attente », on l'active.
create or replace function public.apply_invitation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles
     set role = new.role,
         full_name = coalesce(public.profiles.full_name, new.full_name)
   where lower(email) = lower(new.email) and role = 'pending';
  return new;
end;
$$;

drop trigger if exists on_invitation_created on public.invitations;
create trigger on_invitation_created after insert on public.invitations
  for each row execute function public.apply_invitation();

-- Un retour enregistré = la séance passe en « faite ».
create or replace function public.mark_session_done()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.session_id is not null then
    update public.sessions
       set status = 'done', done_at = new.created_at, version = coalesce(new.version, version)
     where id = new.session_id and athlete_id = new.athlete_id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_feedback_created on public.feedbacks;
create trigger on_feedback_created after insert on public.feedbacks
  for each row execute function public.mark_session_done();

-- Le joueur peut seulement choisir salle/maison ou dire « pas cette semaine ».
create or replace function public.athlete_update_session(p_session uuid, p_version text, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_version is not null and p_version not in ('salle', 'maison') then
    raise exception 'version invalide';
  end if;
  if p_status is not null and p_status not in ('planned', 'skipped') then
    raise exception 'statut invalide';
  end if;
  update public.sessions
     set version = coalesce(p_version, version),
         status  = coalesce(p_status, status)
   where id = p_session and athlete_id = auth.uid() and status <> 'done';
end;
$$;

-- ---------- Sécurité : chacun ne voit que ce qui le concerne -----------

alter table public.invitations    enable row level security;
alter table public.profiles       enable row level security;
alter table public.exercises      enable row level security;
alter table public.cycles         enable row level security;
alter table public.sessions       enable row level security;
alter table public.checkins       enable row level security;
alter table public.feedbacks      enable row level security;
alter table public.weekly_reports enable row level security;

drop policy if exists inv_coach on public.invitations;
create policy inv_coach on public.invitations for all using (public.is_coach()) with check (public.is_coach());

drop policy if exists prof_read on public.profiles;
create policy prof_read on public.profiles for select using (id = auth.uid() or public.is_coach());
drop policy if exists prof_coach_write on public.profiles;
create policy prof_coach_write on public.profiles for update using (public.is_coach()) with check (public.is_coach());
drop policy if exists prof_coach_delete on public.profiles;
create policy prof_coach_delete on public.profiles for delete using (public.is_coach());

drop policy if exists ex_read on public.exercises;
create policy ex_read on public.exercises for select using (public.is_member());
drop policy if exists ex_write on public.exercises;
create policy ex_write on public.exercises for all using (public.is_coach()) with check (public.is_coach());

drop policy if exists cyc_read on public.cycles;
create policy cyc_read on public.cycles for select using (athlete_id = auth.uid() or public.is_coach());
drop policy if exists cyc_write on public.cycles;
create policy cyc_write on public.cycles for all using (public.is_coach()) with check (public.is_coach());

drop policy if exists ses_read on public.sessions;
create policy ses_read on public.sessions for select using (athlete_id = auth.uid() or public.is_coach());
drop policy if exists ses_write on public.sessions;
create policy ses_write on public.sessions for all using (public.is_coach()) with check (public.is_coach());

drop policy if exists chk_read on public.checkins;
create policy chk_read on public.checkins for select using (athlete_id = auth.uid() or public.is_coach());
drop policy if exists chk_insert on public.checkins;
create policy chk_insert on public.checkins for insert with check (athlete_id = auth.uid() and public.is_member());
drop policy if exists chk_coach on public.checkins;
create policy chk_coach on public.checkins for delete using (public.is_coach());

drop policy if exists fb_read on public.feedbacks;
create policy fb_read on public.feedbacks for select using (athlete_id = auth.uid() or public.is_coach());
drop policy if exists fb_insert on public.feedbacks;
create policy fb_insert on public.feedbacks for insert with check (athlete_id = auth.uid() and public.is_member());
drop policy if exists fb_coach on public.feedbacks;
create policy fb_coach on public.feedbacks for delete using (public.is_coach());

drop policy if exists wk_read on public.weekly_reports;
create policy wk_read on public.weekly_reports for select using (athlete_id = auth.uid() or public.is_coach());
drop policy if exists wk_insert on public.weekly_reports;
create policy wk_insert on public.weekly_reports for insert with check (athlete_id = auth.uid() and public.is_member());
drop policy if exists wk_update on public.weekly_reports;
create policy wk_update on public.weekly_reports for update using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());

grant execute on function public.athlete_update_session(uuid, text, text) to authenticated;
