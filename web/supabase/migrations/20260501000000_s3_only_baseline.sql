create extension if not exists pgcrypto;
create extension if not exists vector with schema extensions;

create type public.member_role as enum ('owner', 'admin', 'teacher', 'viewer');
create type public.audit_action as enum (
  'project.created',
  'artifact.exported',
  'generation.failed',
  'organization.invitation_created',
  'organization.invitation_revoked',
  'organization.invitation_resent',
  'organization.invitation_accepted',
  'organization.member_role_updated',
  'organization.member_removed'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  school_name text,
  teacher_name text,
  teaching_grade text,
  teaching_level text,
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

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (position('@' in email) > 1),
  role public.member_role not null default 'teacher',
  token_hash text not null unique,
  invited_by uuid references auth.users(id) on delete set null,
  accepted_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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
  created_by uuid references auth.users(id) on delete set null,
  provider text not null check (provider in ('s3-compatible')),
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
  embedding extensions.vector(1536),
  created_at timestamptz not null default now()
);

create index organization_members_user_id_idx on public.organization_members(user_id);
create index organization_invitations_org_status_idx on public.organization_invitations (organization_id, status, created_at desc);
create unique index organization_invitations_pending_email_idx
on public.organization_invitations (organization_id, lower(email))
where status = 'pending';
create index projects_organization_id_idx on public.projects(organization_id);
create index conversations_project_id_idx on public.conversations(project_id);
create index audit_events_project_id_created_at_idx on public.audit_events(project_id, created_at desc);
create index audit_events_organization_id_created_at_idx on public.audit_events (organization_id, created_at desc);
create index standard_entries_corpus_id_idx on public.standard_entries(corpus_id);
create unique index standard_entries_corpus_external_id_idx
on public.standard_entries(corpus_id, external_id)
where external_id is not null;
create index standard_entries_embedding_idx
on public.standard_entries
using hnsw (embedding extensions.vector_cosine_ops)
where embedding is not null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_set_updated_at before update on public.organizations
for each row execute function public.set_updated_at();

create trigger projects_set_updated_at before update on public.projects
for each row execute function public.set_updated_at();

create trigger organization_invitations_set_updated_at before update on public.organization_invitations
for each row execute function public.set_updated_at();

create or replace function public.ensure_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.ensure_profile();

create or replace function public.create_default_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  organization_id uuid;
begin
  insert into public.organizations (name, created_by)
  values ('个人工作区', new.id)
  returning id into organization_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (organization_id, new.id, 'owner');

  return new;
end;
$$;

create trigger on_auth_user_create_workspace
after insert on auth.users
for each row execute function public.create_default_workspace();

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

create or replace function public.is_org_admin(target_organization_id uuid)
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
      and role in ('owner', 'admin')
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
    join public.organization_members om on om.organization_id = p.organization_id
    where p.id = target_project_id
      and om.user_id = auth.uid()
  );
$$;

create or replace function public.can_write_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    join public.organization_members om on om.organization_id = p.organization_id
    where p.id = target_project_id
      and om.user_id = auth.uid()
      and om.role in ('owner', 'admin', 'teacher')
  );
$$;

create or replace function public.require_project_writer(target_project_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_organization_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select organization_id into target_organization_id
  from public.projects
  where id = target_project_id;

  if target_organization_id is null then
    raise exception 'project not found';
  end if;

  if not public.can_write_project(target_project_id) then
    raise exception 'project write access denied';
  end if;

  return target_organization_id;
end;
$$;

create or replace function public.create_personal_workspace(workspace_name text default '个人工作区')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  organization_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  insert into public.organizations (name, created_by)
  values (coalesce(nullif(trim(workspace_name), ''), '个人工作区'), auth.uid())
  returning id into organization_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (organization_id, auth.uid(), 'owner')
  on conflict (organization_id, user_id) do nothing;

  return organization_id;
end;
$$;

create or replace function public.standard_entry_search_text(
  title text,
  module text,
  grade_bands text[],
  section_path text[],
  keywords text[],
  summary text,
  requirements text[],
  teaching_implications text[],
  citation text
)
returns text
language sql
immutable
as $$
  select trim(
    concat_ws(
      ' ',
      coalesce(title, ''),
      coalesce(module, ''),
      array_to_string(coalesce(grade_bands, array[]::text[]), ' '),
      array_to_string(coalesce(section_path, array[]::text[]), ' '),
      array_to_string(coalesce(keywords, array[]::text[]), ' '),
      coalesce(summary, ''),
      array_to_string(coalesce(requirements, array[]::text[]), ' '),
      array_to_string(coalesce(teaching_implications, array[]::text[]), ' '),
      coalesce(citation, '')
    )
  );
$$;

create or replace function public.standard_entry_search_document(
  title text,
  module text,
  grade_bands text[],
  section_path text[],
  keywords text[],
  summary text,
  requirements text[],
  teaching_implications text[],
  citation text
)
returns tsvector
language sql
immutable
as $$
  select
    setweight(to_tsvector('simple', coalesce(title, '')), 'A')
    || setweight(to_tsvector('simple', coalesce(module, '')), 'B')
    || setweight(to_tsvector('simple', array_to_string(coalesce(grade_bands, array[]::text[]), ' ')), 'A')
    || setweight(to_tsvector('simple', array_to_string(coalesce(section_path, array[]::text[]), ' ')), 'B')
    || setweight(to_tsvector('simple', array_to_string(coalesce(keywords, array[]::text[]), ' ')), 'A')
    || setweight(to_tsvector('simple', coalesce(summary, '')), 'C')
    || setweight(to_tsvector('simple', array_to_string(coalesce(requirements, array[]::text[]), ' ')), 'B')
    || setweight(to_tsvector('simple', array_to_string(coalesce(teaching_implications, array[]::text[]), ' ')), 'C')
    || setweight(to_tsvector('simple', coalesce(citation, '')), 'D');
$$;

create index standard_entries_search_document_idx
on public.standard_entries
using gin (
  public.standard_entry_search_document(
    title,
    module,
    grade_bands,
    section_path,
    keywords,
    summary,
    requirements,
    teaching_implications,
    citation
  )
);

create or replace function public.match_standard_entries(
  query_embedding extensions.vector(1536),
  match_limit int default 6,
  similarity_threshold float default 0.3,
  target_market text default 'cn-compulsory-2022'
)
returns table (
  id uuid,
  corpus_id uuid,
  display_name text,
  issuer text,
  official_version text,
  source_url text,
  availability text,
  title text,
  module text,
  grade_bands text[],
  section_path text[],
  keywords text[],
  summary text,
  requirements text[],
  teaching_implications text[],
  citation text,
  similarity float
)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  return query
  select
    e.id,
    c.id as corpus_id,
    c.display_name,
    c.issuer,
    c.official_version,
    c.source_url,
    c.availability,
    e.title,
    e.module,
    e.grade_bands,
    e.section_path,
    e.keywords,
    e.summary,
    e.requirements,
    e.teaching_implications,
    e.citation,
    1 - (e.embedding <=> query_embedding) as similarity
  from public.standard_entries e
  join public.standards_corpora c on c.id = e.corpus_id
  where c.market = target_market
    and e.embedding is not null
    and 1 - (e.embedding <=> query_embedding) > similarity_threshold
  order by e.embedding <=> query_embedding
  limit match_limit;
end;
$$;

create or replace function public.match_standard_entries_hybrid(
  query_text text,
  query_embedding extensions.vector(1536),
  match_limit int default 6,
  target_market text default 'cn-compulsory-2022',
  vector_match_limit int default 24,
  lexical_match_limit int default 24,
  rrf_k int default 60
)
returns table (
  id uuid,
  title text,
  module text,
  grade_bands text[],
  section_path text[],
  keywords text[],
  summary text,
  requirements text[],
  teaching_implications text[],
  citation text,
  similarity float
)
language sql
security definer
set search_path = public, extensions
as $$
  with normalized_query as (
    select nullif(regexp_replace(coalesce(query_text, ''), '\s+', ' ', 'g'), '') as raw_query
  ),
  vector_candidates as (
    select
      e.id,
      1 - (e.embedding <=> query_embedding) as similarity,
      row_number() over (order by e.embedding <=> query_embedding, e.id) as vector_rank
    from public.standard_entries e
    join public.standards_corpora c on c.id = e.corpus_id
    where c.market = target_market
      and e.embedding is not null
    order by e.embedding <=> query_embedding, e.id
    limit greatest(match_limit, vector_match_limit)
  ),
  lexical_query as (
    select
      raw_query,
      plainto_tsquery('simple', raw_query) as ts_query
    from normalized_query
    where raw_query is not null
  ),
  lexical_candidates as (
    select
      e.id,
      ts_rank_cd(
        public.standard_entry_search_document(
          e.title,
          e.module,
          e.grade_bands,
          e.section_path,
          e.keywords,
          e.summary,
          e.requirements,
          e.teaching_implications,
          e.citation
        ),
        lq.ts_query
      ) as lexical_score,
      row_number() over (
        order by
          ts_rank_cd(
            public.standard_entry_search_document(
              e.title,
              e.module,
              e.grade_bands,
              e.section_path,
              e.keywords,
              e.summary,
              e.requirements,
              e.teaching_implications,
              e.citation
            ),
            lq.ts_query
          ) desc,
          e.id
      ) as lexical_rank
    from public.standard_entries e
    join public.standards_corpora c on c.id = e.corpus_id
    cross join lexical_query lq
    where c.market = target_market
      and public.standard_entry_search_document(
        e.title,
        e.module,
        e.grade_bands,
        e.section_path,
        e.keywords,
        e.summary,
        e.requirements,
        e.teaching_implications,
        e.citation
      ) @@ lq.ts_query
    order by lexical_score desc, e.id
    limit greatest(match_limit, lexical_match_limit)
  ),
  candidate_ids as (
    select id from vector_candidates
    union
    select id from lexical_candidates
  ),
  fused_candidates as (
    select
      e.id,
      e.title,
      e.module,
      e.grade_bands,
      e.section_path,
      e.keywords,
      e.summary,
      e.requirements,
      e.teaching_implications,
      e.citation,
      coalesce(v.similarity, 0)::float as similarity,
      coalesce(l.lexical_score, 0)::float as lexical_score,
      case
        when nq.raw_query is not null
          and position(
            lower(nq.raw_query) in lower(
              public.standard_entry_search_text(
                e.title,
                e.module,
                e.grade_bands,
                e.section_path,
                e.keywords,
                e.summary,
                e.requirements,
                e.teaching_implications,
                e.citation
              )
            )
          ) > 0
        then 1.0 / (rrf_k + 1)
        else 0
      end as exact_match_bonus,
      (
        case
          when v.vector_rank is null then 0
          else 1.0 / (rrf_k + v.vector_rank)
        end
        +
        case
          when l.lexical_rank is null then 0
          else 1.0 / (rrf_k + l.lexical_rank)
        end
      ) as fused_score
    from candidate_ids ids
    join public.standard_entries e on e.id = ids.id
    left join vector_candidates v on v.id = e.id
    left join lexical_candidates l on l.id = e.id
    cross join normalized_query nq
  )
  select
    id,
    title,
    module,
    grade_bands,
    section_path,
    keywords,
    summary,
    requirements,
    teaching_implications,
    citation,
    similarity
  from fused_candidates
  order by
    (fused_score + exact_match_bonus) desc,
    exact_match_bonus desc,
    lexical_score desc,
    similarity desc,
    title asc
  limit greatest(match_limit, 1);
$$;

revoke all on function public.match_standard_entries(extensions.vector(1536), int, float, text) from public;
grant execute on function public.match_standard_entries(extensions.vector(1536), int, float, text) to authenticated;
revoke all on function public.match_standard_entries_hybrid(text, extensions.vector(1536), int, text, int, int, int) from public;
grant execute on function public.match_standard_entries_hybrid(text, extensions.vector(1536), int, text, int, int, int) to authenticated;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invitations enable row level security;
alter table public.projects enable row level security;
alter table public.conversations enable row level security;
alter table public.audit_events enable row level security;
alter table public.export_files enable row level security;
alter table public.standards_corpora enable row level security;
alter table public.standard_entries enable row level security;

create policy "profiles_select_own" on public.profiles
for select using (id = auth.uid());
create policy "profiles_update_own" on public.profiles
for update using (id = auth.uid())
with check (id = auth.uid());
create policy "profiles_select_shared_org_member" on public.profiles
for select using (
  id = auth.uid()
  or exists (
    select 1
    from public.organization_members viewer
    join public.organization_members target_member
      on target_member.organization_id = viewer.organization_id
    where viewer.user_id = auth.uid()
      and target_member.user_id = profiles.id
  )
);

create policy "organizations_member_select" on public.organizations
for select using (public.is_org_member(id));
create policy "organizations_owner_insert" on public.organizations
for insert with check (created_by = auth.uid());
create policy "organizations_admin_update" on public.organizations
for update using (public.is_org_admin(id))
with check (public.is_org_admin(id));

create policy "organization_members_select_member" on public.organization_members
for select using (public.is_org_member(organization_id));
create policy "organization_members_admin_insert" on public.organization_members
for insert with check (public.is_org_admin(organization_id));
create policy "organization_members_admin_update" on public.organization_members
for update using (public.is_org_admin(organization_id))
with check (public.is_org_admin(organization_id));
create policy "organization_members_admin_delete" on public.organization_members
for delete using (public.is_org_admin(organization_id));

create policy "organization_invitations_select_member" on public.organization_invitations
for select using (public.is_org_member(organization_id));
create policy "organization_invitations_insert_admin" on public.organization_invitations
for insert with check (
  invited_by = auth.uid()
  and public.is_org_admin(organization_id)
);
create policy "organization_invitations_update_admin" on public.organization_invitations
for update using (public.is_org_admin(organization_id))
with check (public.is_org_admin(organization_id));

create policy "projects_member_select" on public.projects
for select using (public.is_org_member(organization_id));
create policy "projects_writer_insert" on public.projects
for insert with check (
  owner_id = auth.uid()
  and exists (
    select 1
    from public.organization_members
    where organization_id = projects.organization_id
      and user_id = auth.uid()
      and role in ('owner', 'admin', 'teacher')
  )
);
create policy "projects_writer_update" on public.projects
for update using (public.can_write_project(id))
with check (public.can_write_project(id));

create policy "conversations_project_member_select" on public.conversations
for select using (public.is_project_member(project_id));
create policy "conversations_project_writer_insert" on public.conversations
for insert with check (
  created_by = auth.uid()
  and public.can_write_project(project_id)
);
create policy "conversations_project_writer_update" on public.conversations
for update using (public.can_write_project(project_id))
with check (public.can_write_project(project_id));

create policy "audit_events_project_member_select" on public.audit_events
for select using (
  (project_id is not null and public.is_project_member(project_id))
  or (organization_id is not null and public.is_org_member(organization_id))
);

create policy "export_files_project_member_select" on public.export_files
for select using (public.is_project_member(project_id));
create policy "export_files_project_writer_insert" on public.export_files
for insert with check (
  created_by = auth.uid()
  and public.can_write_project(project_id)
);

create policy "standards_corpora_select_authenticated" on public.standards_corpora
for select to authenticated using (true);
create policy "standard_entries_select_authenticated" on public.standard_entries
for select to authenticated using (true);

create or replace function public.create_organization_invitation(
  target_organization_id uuid,
  invitation_email text,
  invitation_role public.member_role,
  invitation_token_hash text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  created_invitation_id uuid;
  normalized_email text;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not public.is_org_admin(target_organization_id) then
    raise exception 'organization admin required';
  end if;

  if invitation_role = 'owner' then
    raise exception 'owner invitations are not allowed';
  end if;

  normalized_email := lower(trim(invitation_email));

  if position('@' in normalized_email) <= 1 then
    raise exception 'invalid invitation email';
  end if;

  insert into public.organization_invitations (
    email,
    invited_by,
    organization_id,
    role,
    token_hash
  )
  values (
    normalized_email,
    auth.uid(),
    target_organization_id,
    invitation_role,
    invitation_token_hash
  )
  returning id into created_invitation_id;

  insert into public.audit_events (
    organization_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    target_organization_id,
    auth.uid(),
    'organization.invitation_created',
    'organization_invitation',
    created_invitation_id,
    jsonb_build_object(
      'email', normalized_email,
      'role', invitation_role
    )
  );

  return created_invitation_id;
end;
$$;

create or replace function public.revoke_organization_invitation(target_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_invitation public.organization_invitations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select * into target_invitation
  from public.organization_invitations
  where id = target_invitation_id;

  if target_invitation.id is null then
    raise exception 'invitation not found';
  end if;

  if not public.is_org_admin(target_invitation.organization_id) then
    raise exception 'organization admin required';
  end if;

  if target_invitation.status <> 'pending' then
    raise exception 'only pending invitations can be revoked';
  end if;

  update public.organization_invitations
  set status = 'revoked'
  where id = target_invitation.id;

  insert into public.audit_events (
    organization_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    target_invitation.organization_id,
    auth.uid(),
    'organization.invitation_revoked',
    'organization_invitation',
    target_invitation.id,
    jsonb_build_object(
      'email', target_invitation.email,
      'role', target_invitation.role
    )
  );
end;
$$;

create or replace function public.resend_organization_invitation(
  target_invitation_id uuid,
  next_token_hash text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_invitation public.organization_invitations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select * into target_invitation
  from public.organization_invitations
  where id = target_invitation_id;

  if target_invitation.id is null then
    raise exception 'invitation not found';
  end if;

  if not public.is_org_admin(target_invitation.organization_id) then
    raise exception 'organization admin required';
  end if;

  if target_invitation.status not in ('pending', 'expired') then
    raise exception 'only pending or expired invitations can be resent';
  end if;

  update public.organization_invitations
  set
    accepted_at = null,
    accepted_by = null,
    expires_at = now() + interval '7 days',
    status = 'pending',
    token_hash = next_token_hash
  where id = target_invitation.id;

  insert into public.audit_events (
    organization_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    target_invitation.organization_id,
    auth.uid(),
    'organization.invitation_resent',
    'organization_invitation',
    target_invitation.id,
    jsonb_build_object(
      'email', target_invitation.email,
      'role', target_invitation.role
    )
  );
end;
$$;

create or replace function public.accept_organization_invitation(invitation_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_invitation public.organization_invitations%rowtype;
  current_email text;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  current_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  select * into target_invitation
  from public.organization_invitations
  where token_hash = encode(digest(invitation_token, 'sha256'), 'hex')
  limit 1;

  if target_invitation.id is null then
    raise exception 'invitation not found';
  end if;

  if target_invitation.status <> 'pending' then
    raise exception 'invitation is not pending';
  end if;

  if target_invitation.expires_at < now() then
    update public.organization_invitations
    set status = 'expired'
    where id = target_invitation.id;
    raise exception 'invitation expired';
  end if;

  if lower(target_invitation.email) <> current_email then
    raise exception 'invitation email does not match current user';
  end if;

  insert into public.organization_members (organization_id, user_id, role)
  values (target_invitation.organization_id, auth.uid(), target_invitation.role)
  on conflict (organization_id, user_id) do update
    set role = excluded.role;

  update public.organization_invitations
  set
    accepted_at = now(),
    accepted_by = auth.uid(),
    status = 'accepted'
  where id = target_invitation.id;

  insert into public.audit_events (
    organization_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    target_invitation.organization_id,
    auth.uid(),
    'organization.invitation_accepted',
    'organization_invitation',
    target_invitation.id,
    jsonb_build_object(
      'email', target_invitation.email,
      'role', target_invitation.role
    )
  );

  return target_invitation.organization_id;
end;
$$;

create or replace function public.update_organization_member_role(
  target_organization_id uuid,
  target_user_id uuid,
  next_role public.member_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role public.member_role;
  current_role public.member_role;
  owner_count integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select role into actor_role
  from public.organization_members
  where organization_id = target_organization_id
    and user_id = auth.uid();

  if actor_role not in ('owner', 'admin') then
    raise exception 'organization admin required';
  end if;

  select role into current_role
  from public.organization_members
  where organization_id = target_organization_id
    and user_id = target_user_id;

  if current_role is null then
    raise exception 'member not found';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'cannot change your own role';
  end if;

  if actor_role <> 'owner' and (current_role in ('owner', 'admin') or next_role in ('owner', 'admin')) then
    raise exception 'owner role required';
  end if;

  if current_role = 'owner' and next_role <> 'owner' then
    select count(*) into owner_count
    from public.organization_members
    where organization_id = target_organization_id
      and role = 'owner';

    if owner_count <= 1 then
      raise exception 'cannot demote the last owner';
    end if;
  end if;

  update public.organization_members
  set role = next_role
  where organization_id = target_organization_id
    and user_id = target_user_id;

  insert into public.audit_events (
    organization_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    target_organization_id,
    auth.uid(),
    'organization.member_role_updated',
    'organization_member',
    target_user_id,
    jsonb_build_object(
      'previous_role', current_role,
      'next_role', next_role,
      'target_user_id', target_user_id
    )
  );
end;
$$;

create or replace function public.remove_organization_member(
  target_organization_id uuid,
  target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role public.member_role;
  target_role public.member_role;
  owner_count integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select role into actor_role
  from public.organization_members
  where organization_id = target_organization_id
    and user_id = auth.uid();

  select role into target_role
  from public.organization_members
  where organization_id = target_organization_id
    and user_id = target_user_id;

  if target_role is null then
    raise exception 'member not found';
  end if;

  if target_user_id <> auth.uid() and actor_role not in ('owner', 'admin') then
    raise exception 'organization admin required';
  end if;

  if actor_role <> 'owner' and target_role in ('owner', 'admin') and target_user_id <> auth.uid() then
    raise exception 'owner role required';
  end if;

  if target_role = 'owner' then
    select count(*) into owner_count
    from public.organization_members
    where organization_id = target_organization_id
      and role = 'owner';

    if owner_count <= 1 then
      raise exception 'cannot remove the last owner';
    end if;
  end if;

  delete from public.organization_members
  where organization_id = target_organization_id
    and user_id = target_user_id;

  insert into public.audit_events (
    organization_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    target_organization_id,
    auth.uid(),
    'organization.member_removed',
    'organization_member',
    target_user_id,
    jsonb_build_object(
      'removed_role', target_role,
      'target_user_id', target_user_id
    )
  );
end;
$$;
