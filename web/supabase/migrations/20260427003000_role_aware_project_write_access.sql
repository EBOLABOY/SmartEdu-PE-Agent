create or replace function public.is_org_writer(target_organization_id uuid)
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
      and role in ('owner', 'admin', 'teacher')
  );
$$;

create or replace function public.is_project_writer(target_project_id uuid)
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
      and p.archived_at is null
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin', 'teacher')
  );
$$;

create or replace function public.require_project_writer(target_project_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target_organization_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select p.organization_id
    into target_organization_id
  from public.projects p
  where p.id = target_project_id
    and p.archived_at is null;

  if target_organization_id is null then
    raise exception 'project not found';
  end if;

  if not public.is_org_writer(target_organization_id) then
    raise exception 'project write access denied';
  end if;

  return target_organization_id;
end;
$$;

create or replace function public.can_insert_org_member(
  target_organization_id uuid,
  inserted_role public.member_role
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = target_organization_id
      and m.user_id = auth.uid()
      and (
        (m.role = 'owner' and inserted_role in ('owner', 'admin', 'teacher', 'viewer'))
        or (m.role = 'admin' and inserted_role in ('admin', 'teacher', 'viewer'))
      )
  );
$$;

drop policy if exists "projects_insert_member" on public.projects;
create policy "projects_insert_writer" on public.projects
for insert with check (owner_id = auth.uid() and public.is_org_writer(organization_id));

drop policy if exists "projects_update_member" on public.projects;
create policy "projects_update_writer" on public.projects
for update using (public.is_project_writer(id))
with check (public.is_org_writer(organization_id));

drop policy if exists "conversations_project_member_all" on public.conversations;
create policy "conversations_project_member_select" on public.conversations
for select using (public.is_project_member(project_id));
create policy "conversations_project_writer_insert" on public.conversations
for insert with check (created_by = auth.uid() and public.is_project_writer(project_id));
create policy "conversations_project_writer_update" on public.conversations
for update using (public.is_project_writer(project_id))
with check (public.is_project_writer(project_id));
create policy "conversations_project_writer_delete" on public.conversations
for delete using (public.is_project_writer(project_id));

drop policy if exists "messages_project_member_all" on public.messages;
create policy "messages_project_member_select" on public.messages
for select using (public.is_project_member(project_id));
create policy "messages_project_writer_insert" on public.messages
for insert with check (created_by = auth.uid() and public.is_project_writer(project_id));
create policy "messages_project_writer_update" on public.messages
for update using (public.is_project_writer(project_id))
with check (public.is_project_writer(project_id));
create policy "messages_project_writer_delete" on public.messages
for delete using (public.is_project_writer(project_id));

drop policy if exists "export_files_project_member_insert" on public.export_files;
create policy "export_files_project_writer_insert" on public.export_files
for insert with check (
  created_by = auth.uid()
  and public.is_project_writer(project_id)
);

drop policy if exists "organization_members_insert_owner" on public.organization_members;
create policy "organization_members_insert_role_guarded" on public.organization_members
for insert with check (
  (
    user_id = auth.uid()
    and role = 'owner'
    and exists (
      select 1
      from public.organizations o
      where o.id = organization_id
        and o.created_by = auth.uid()
    )
  )
  or public.can_insert_org_member(organization_id, role)
);

drop policy if exists "organization_invitations_select_member" on public.organization_invitations;
create policy "organization_invitations_select_admin" on public.organization_invitations
for select using (public.is_org_admin(organization_id));

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
  target_organization_id uuid;
  next_version_number integer;
  new_version_id uuid;
begin
  target_organization_id := public.require_project_writer(target_project_id);

  insert into public.artifacts (project_id, stage, title)
  values (target_project_id, artifact_stage, artifact_title)
  on conflict (project_id, stage) do update
    set title = excluded.title,
        updated_at = now()
  returning id into target_artifact_id;

  perform 1
  from public.artifacts
  where id = target_artifact_id
  for update;

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

  if artifact_stage = 'lesson' then
    update public.artifacts
    set current_version_id = null,
        updated_at = now()
    where project_id = target_project_id
      and stage = 'html'
      and current_version_id is not null;
  end if;

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
  values (
    target_organization_id,
    target_project_id,
    auth.uid(),
    'artifact.version_created',
    'artifact_version',
    new_version_id,
    artifact_request_id,
    jsonb_build_object(
      'stage', artifact_stage,
      'version_number', next_version_number,
      'invalidated_stage', case when artifact_stage = 'lesson' then 'html' else null end
    )
  );

  return new_version_id;
end;
$$;

create or replace function public.restore_artifact_version(
  target_project_id uuid,
  target_version_id uuid,
  restore_request_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_artifact_id uuid;
  target_stage public.artifact_stage;
  target_version_number integer;
  previous_current_version_id uuid;
  invalidated_html_version_id uuid;
  target_organization_id uuid;
begin
  target_organization_id := public.require_project_writer(target_project_id);

  select
    av.artifact_id,
    av.stage,
    av.version_number
  into
    target_artifact_id,
    target_stage,
    target_version_number
  from public.artifact_versions av
  where av.id = target_version_id
    and av.project_id = target_project_id;

  if target_artifact_id is null then
    raise exception 'artifact version not found';
  end if;

  select a.current_version_id
    into previous_current_version_id
  from public.artifacts a
  where a.id = target_artifact_id
    and a.project_id = target_project_id
  for update;

  if not found then
    raise exception 'artifact not found';
  end if;

  if previous_current_version_id = target_version_id then
    return target_version_id;
  end if;

  update public.artifacts
  set current_version_id = target_version_id,
      updated_at = now()
  where id = target_artifact_id;

  if target_stage = 'lesson' then
    select current_version_id
      into invalidated_html_version_id
    from public.artifacts
    where project_id = target_project_id
      and stage = 'html'
    for update;

    update public.artifacts
    set current_version_id = null,
        updated_at = now()
    where project_id = target_project_id
      and stage = 'html'
      and current_version_id is not null;
  end if;

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
  values (
    target_organization_id,
    target_project_id,
    auth.uid(),
    'artifact.restored',
    'artifact_version',
    target_version_id,
    restore_request_id,
    jsonb_build_object(
      'artifact_id', target_artifact_id,
      'stage', target_stage,
      'restored_version_id', target_version_id,
      'restored_version_number', target_version_number,
      'previous_current_version_id', previous_current_version_id,
      'invalidated_stage', case when target_stage = 'lesson' then 'html' else null end,
      'invalidated_previous_current_version_id', invalidated_html_version_id
    )
  );

  return target_version_id;
end;
$$;
