-- Serotonin — Supabase Database Schema
-- Paste this entire file into the Supabase SQL Editor and click Run.
-- See README.md for full setup instructions.

create extension if not exists "pgcrypto";

-- Profiles (extends auth.users)
create table profiles (
  id            uuid references auth.users(id) on delete cascade primary key,
  created_at    timestamptz default now(),
  name          text,
  title         text,
  department    text,
  avatar_url    text,
  role          text default 'analyst',
  prefs         jsonb default '{}'::jsonb
);

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Questionnaires
create table questionnaires (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  created_by      uuid references profiles(id) on delete set null,
  vendor_name     text not null,
  status          text default 'draft',
  metadata        jsonb default '{}'
);

-- Questions
create table questions (
  id                uuid primary key default gen_random_uuid(),
  questionnaire_id  uuid references questionnaires(id) on delete cascade,
  question_text     text not null,
  answer_text       text,
  confidence        numeric default 0,
  source_citation   text,
  status            text default 'pending',
  sort_order        integer default 0
);

-- Documents
create table documents (
  id                uuid primary key default gen_random_uuid(),
  questionnaire_id  uuid references questionnaires(id) on delete cascade,
  name              text not null,
  storage_path      text,
  file_size         bigint,
  uploaded_at       timestamptz default now(),
  uploaded_by       uuid references profiles(id) on delete set null
);

-- Notifications
create table notifications (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz default now(),
  user_id     uuid references profiles(id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text,
  read        boolean default false
);

-- Audit log
create table audit_log (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz default now(),
  user_id       uuid references profiles(id) on delete set null,
  action        text not null,
  entity_type   text,
  entity_id     uuid,
  metadata      jsonb default '{}'
);

-- Row Level Security
alter table profiles       enable row level security;
alter table questionnaires enable row level security;
alter table questions      enable row level security;
alter table documents      enable row level security;
alter table notifications  enable row level security;
alter table audit_log      enable row level security;

create policy "Own profile"         on profiles       for all using (id = auth.uid());
create policy "Own questionnaires"  on questionnaires for all using (created_by = auth.uid());
create policy "Own questions"       on questions      for all using (questionnaire_id in (select id from questionnaires where created_by = auth.uid()));
create policy "Own documents"       on documents      for all using (questionnaire_id in (select id from questionnaires where created_by = auth.uid()));
create policy "Own notifications"   on notifications  for all using (user_id = auth.uid());
create policy "Own audit log"       on audit_log      for all using (user_id = auth.uid());

-- Storage
insert into storage.buckets (id, name, public) values ('questionnaire-files', 'questionnaire-files', false);
create policy "Authenticated uploads" on storage.objects for insert with check (auth.role() = 'authenticated');
create policy "Own files"             on storage.objects for select using (auth.uid()::text = (storage.foldername(name))[1]);
