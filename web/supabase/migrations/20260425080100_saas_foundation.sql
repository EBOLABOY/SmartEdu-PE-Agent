create extension if not exists pgcrypto;

create type public.member_role as enum ('owner', 'admin', 'teacher', 'viewer');
create type public.artifact_stage as enum ('lesson', 'html');
create type public.artifact_status as enum ('streaming', 'ready', 'error');
create type public.audit_action as enum (
  'project.created',
  'message.created',
  'artifact.version_created',
  'artifact.exported',
  'artifact.restored',
  'generation.failed'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  slug text unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'teacher',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete restrict,
  title text not null check (char_length(trim(title)) between 1 and 160),
  description text,
  market text not null default 'cn-compulsory-2022',
  metadata jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  role text not null check (role in ('system', 'user', 'assistant', 'tool')),
  content text not null default '',
  ui_message jsonb not null default '{}'::jsonb,
  request_id text,
  created_at timestamptz not null default now()
);

create table public.artifacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  stage public.artifact_stage not null,
  title text not null,
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, stage)
);

create table public.artifact_versions (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null references public.artifacts(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  source_message_id uuid references public.messages(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  stage public.artifact_stage not null,
  content_type text not null check (content_type in ('html', 'lesson-json')),
  content text not null,
  status public.artifact_status not null default 'ready',
  protocol_version text not null,
  workflow_trace jsonb not null default '{}'::jsonb,
  warning_text text,
  version_number integer not null,
  created_at timestamptz not null default now(),
  unique (artifact_id, version_number)
);

alter table public.artifacts
  add constraint artifacts_current_version_fk
  foreign key (current_version_id)
  references public.artifact_versions(id)
  deferrable initially deferred;

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action public.audit_action not null,
  entity_type text not null,
  entity_id uuid,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.export_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  artifact_version_id uuid references public.artifact_versions(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  provider text not null check (provider in ('supabase-storage', 'cloudflare-r2')),
  bucket text not null,
  object_key text not null,
  content_type text not null,
  byte_size bigint,
  checksum text,
  created_at timestamptz not null default now(),
  unique (provider, bucket, object_key)
);

create table public.standards_corpora (
  id uuid primary key default gen_random_uuid(),
  market text not null,
  display_name text not null,
  issuer text not null,
  official_version text not null,
  source_url text,
  availability text not null default 'ready' check (availability in ('ready', 'planned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (market, official_version)
);

create table public.standard_entries (
  id uuid primary key default gen_random_uuid(),
  corpus_id uuid not null references public.standards_corpora(id) on delete cascade,
  external_id text,
  title text not null,
  module text not null,
  grade_bands text[] not null default '{}',
  section_path text[] not null default '{}',
  keywords text[] not null default '{}',
  summary text not null,
  requirements text[] not null default '{}',
  teaching_implications text[] not null default '{}',
  citation text not null,
  created_at timestamptz not null default now()
);

create index organization_members_user_id_idx on public.organization_members(user_id);
create index projects_organization_id_idx on public.projects(organization_id);
create index conversations_project_id_idx on public.conversations(project_id);
create index messages_project_id_created_at_idx on public.messages(project_id, created_at);
create index artifacts_project_id_stage_idx on public.artifacts(project_id, stage);
create index artifact_versions_project_id_created_at_idx on public.artifact_versions(project_id, created_at desc);
create index audit_events_project_id_created_at_idx on public.audit_events(project_id, created_at desc);
create index standard_entries_corpus_id_idx on public.standard_entries(corpus_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

create trigger organizations_set_updated_at before update on public.organizations
for each row execute function public.set_updated_at();

create trigger projects_set_updated_at before update on public.projects
for each row execute function public.set_updated_at();

create trigger conversations_set_updated_at before update on public.conversations
for each row execute function public.set_updated_at();

create trigger artifacts_set_updated_at before update on public.artifacts
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_id = target_organization_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.is_project_member(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    join public.organization_members m on m.organization_id = p.organization_id
    where p.id = target_project_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.create_personal_workspace(workspace_name text default '个人工作区')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  insert into public.organizations (name, created_by)
  values (workspace_name, auth.uid())
  returning id into new_org_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (new_org_id, auth.uid(), 'owner');

  return new_org_id;
end;
$$;

create or replace function public.create_artifact_version(
  target_project_id uuid,
  artifact_stage public.artifact_stage,
  artifact_title text,
  artifact_content_type text,
  artifact_content text,
  artifact_status public.artifact_status,
  artifact_protocol_version text,
  artifact_workflow_trace jsonb default '{}'::jsonb,
  artifact_warning_text text default null,
  artifact_request_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_artifact_id uuid;
  next_version_number integer;
  new_version_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not public.is_project_member(target_project_id) then
    raise exception 'project access denied';
  end if;

  insert into public.artifacts (project_id, stage, title)
  values (target_project_id, artifact_stage, artifact_title)
  on conflict (project_id, stage) do update
    set title = excluded.title,
        updated_at = now()
  returning id into target_artifact_id;

  select coalesce(max(version_number), 0) + 1
    into next_version_number
  from public.artifact_versions
  where artifact_id = target_artifact_id;

  insert into public.artifact_versions (
    artifact_id,
    project_id,
    created_by,
    stage,
    content_type,
    content,
    status,
    protocol_version,
    workflow_trace,
    warning_text,
    version_number
  )
  values (
    target_artifact_id,
    target_project_id,
    auth.uid(),
    artifact_stage,
    artifact_content_type,
    artifact_content,
    artifact_status,
    artifact_protocol_version,
    artifact_workflow_trace,
    artifact_warning_text,
    next_version_number
  )
  returning id into new_version_id;

  update public.artifacts
  set current_version_id = new_version_id,
      updated_at = now()
  where id = target_artifact_id;

  insert into public.audit_events (
    organization_id,
    project_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    request_id,
    metadata
  )
  select
    p.organization_id,
    target_project_id,
    auth.uid(),
    'artifact.version_created',
    'artifact_version',
    new_version_id,
    artifact_request_id,
    jsonb_build_object('stage', artifact_stage, 'version_number', next_version_number)
  from public.projects p
  where p.id = target_project_id;

  return new_version_id;
end;
$$;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.projects enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.artifacts enable row level security;
alter table public.artifact_versions enable row level security;
alter table public.audit_events enable row level security;
alter table public.export_files enable row level security;
alter table public.standards_corpora enable row level security;
alter table public.standard_entries enable row level security;

create policy "profiles_select_own" on public.profiles
for select using (id = auth.uid());

create policy "profiles_update_own" on public.profiles
for update using (id = auth.uid()) with check (id = auth.uid());

create policy "organizations_select_member" on public.organizations
for select using (public.is_org_member(id));

create policy "organizations_insert_authenticated" on public.organizations
for insert with check (created_by = auth.uid());

create policy "organizations_update_admin" on public.organizations
for update using (
  exists (
    select 1 from public.organization_members
    where organization_id = id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  )
);

create policy "organization_members_select_member" on public.organization_members
for select using (public.is_org_member(organization_id));

create policy "organization_members_insert_owner" on public.organization_members
for insert with check (
  (
    user_id = auth.uid()
    and role = 'owner'
    and exists (
      select 1 from public.organizations o
      where o.id = organization_id
        and o.created_by = auth.uid()
    )
  )
  or exists (
    select 1 from public.organization_members m
    where m.organization_id = organization_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
  )
);

create policy "projects_select_member" on public.projects
for select using (public.is_org_member(organization_id));

create policy "projects_insert_member" on public.projects
for insert with check (owner_id = auth.uid() and public.is_org_member(organization_id));

create policy "projects_update_member" on public.projects
for update using (public.is_org_member(organization_id));

create policy "conversations_project_member_all" on public.conversations
for all using (public.is_project_member(project_id))
with check (created_by = auth.uid() and public.is_project_member(project_id));

create policy "messages_project_member_all" on public.messages
for all using (public.is_project_member(project_id))
with check (public.is_project_member(project_id));

create policy "artifacts_project_member_select" on public.artifacts
for select using (public.is_project_member(project_id));

create policy "artifact_versions_project_member_select" on public.artifact_versions
for select using (public.is_project_member(project_id));

create policy "audit_events_project_member_select" on public.audit_events
for select using (project_id is not null and public.is_project_member(project_id));

create policy "export_files_project_member_select" on public.export_files
for select using (public.is_project_member(project_id));

create policy "standards_corpora_read_authenticated" on public.standards_corpora
for select to authenticated using (true);

create policy "standard_entries_read_authenticated" on public.standard_entries
for select to authenticated using (true);
